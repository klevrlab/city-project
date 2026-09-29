/**
 * Shared MobileNet + embedding similarity pipeline for shark painting detection.
 * Used by classic camera pages and 8th Wall (xrweb) pages once a Video element is available.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    threshold: 0.55,
    cacheKey: 'shark-embeddings-v5',
    embeddingsUrl: './data/shark-embeddings-browser.json',
    rollingN: 5
  };

  function l2Normalize(vec) {
    var sum = 0;
    for (var i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
    var norm = Math.sqrt(sum);
    if (norm === 0) return vec;
    var out = new Float32Array(vec.length);
    for (var j = 0; j < vec.length; j++) out[j] = vec[j] / norm;
    return out;
  }

  function cosineSimilarity(a, b) {
    var dot = 0;
    for (var i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  function friendlyName(filename) {
    var m = filename.match(/shark(\d+)/i);
    return m ? 'Shark ' + parseInt(m[1], 10) : filename.replace(/\.[^.]+$/, '');
  }

  function bestMatch(state, embedding) {
    var sharkScores = {};
    for (var i = 0; i < state.enrolled.length; i++) {
      var item = state.enrolled[i];
      var score = cosineSimilarity(embedding, item.embedding);
      var sharkId = friendlyName(item.name);
      if (!sharkScores[sharkId] || score > sharkScores[sharkId].score) {
        sharkScores[sharkId] = { name: item.name, score: score };
      }
    }
    var best = { name: null, score: -1 };
    var key;
    for (key in sharkScores) {
      if (Object.prototype.hasOwnProperty.call(sharkScores, key)) {
        if (sharkScores[key].score > best.score) best = sharkScores[key];
      }
    }
    return best;
  }

  function rollingScore(state, currentMatch) {
    state.recentScores.push({ name: currentMatch.name, score: currentMatch.score });
    if (state.recentScores.length > state.ROLLING_N) state.recentScores.shift();

    var counts = {};
    var topName = null;
    var topCount = 0;
    for (var r = 0; r < state.recentScores.length; r++) {
      var entry = state.recentScores[r];
      if (!entry.name) continue;
      counts[entry.name] = (counts[entry.name] || 0) + 1;
      if (counts[entry.name] > topCount) {
        topCount = counts[entry.name];
        topName = entry.name;
      }
    }
    var sum = 0;
    var n = 0;
    for (var s = 0; s < state.recentScores.length; s++) {
      if (state.recentScores[s].name === topName) {
        sum += state.recentScores[s].score;
        n++;
      }
    }
    return { name: topName, score: n > 0 ? sum / n : 0, confidence: topCount / state.ROLLING_N };
  }

  function buildSharkGroups(state) {
    state.sharkGroups = {};
    for (var i = 0; i < state.enrolled.length; i++) {
      var item = state.enrolled[i];
      var id = friendlyName(item.name);
      if (!state.sharkGroups[id]) state.sharkGroups[id] = [];
      state.sharkGroups[id].push(item);
    }
  }

  function applyEmbeddings(state, data) {
    state.enrolled = data.map(function (item) {
      return { name: item.name, embedding: new Float32Array(item.embedding) };
    });
    buildSharkGroups(state);
    if (global.console) console.log(Object.keys(state.sharkGroups).length + ' sharks loaded');
  }

  function cropAndEmbed(model, imgEl, sx, sy, sw, sh) {
    var canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    canvas.getContext('2d').drawImage(imgEl, sx, sy, sw, sh, 0, 0, 224, 224);
    return global.tf.tidy(function () {
      var t = global.tf.browser.fromPixels(canvas);
      return model.infer(t, true);
    });
  }

  function silentComputeEmbeddings(state, model, options) {
    var imageListUrl = options.imageListUrl;
    if (!imageListUrl) return Promise.resolve(false);
    return fetch(imageListUrl)
      .then(function (resp) { return resp.ok ? resp.json() : null; })
      .then(function (imageList) {
        if (!imageList || !imageList.length) return false;
        return silentComputeFromList(state, model, imageList, options);
      });
  }

  function silentComputeFromList(state, model, imageList, options) {
    var results = [];
    var cacheKey = options.cacheKey || DEFAULTS.cacheKey;
    return imageList.reduce(function (chain, imgPath) {
      return chain.then(function () {
        var fileName = imgPath.split('/').pop();
        var img = new Image();
        img.crossOrigin = 'anonymous';
        return new Promise(function (resolve) {
          img.onload = function () { resolve(); };
          img.onerror = function () { resolve(); };
          img.src = './' + imgPath;
        }).then(function () {
          if (!img.naturalWidth) return;
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          var m = Math.min(w, h);
          var cx = (w - m) / 2;
          var cy = (h - m) / 2;
          var crops = [[cx, cy, m, m], [0, 0, m, m], [w - m, 0, m, m], [0, h - m, m, m], [w - m, h - m, m, m]];
          return crops.reduce(function (inner, c) {
            return inner.then(function () {
              var emb = cropAndEmbed(model, img, c[0], c[1], c[2], c[3]);
              return emb.data().then(function (d) {
                emb.dispose();
                results.push({ name: fileName, embedding: Array.from(l2Normalize(new Float32Array(d))) });
              });
            });
          }, Promise.resolve());
        });
      });
    }, Promise.resolve()).then(function () {
      if (results.length === 0) return false;
      try { localStorage.setItem(cacheKey, JSON.stringify(results)); } catch (e) { }
      applyEmbeddings(state, results);
      return true;
    });
  }

  function loadEmbeddings(state, model, options) {
    options = options || {};
    var url = options.embeddingsUrl != null ? options.embeddingsUrl : DEFAULTS.embeddingsUrl;
    var cacheKey = options.cacheKey != null ? options.cacheKey : DEFAULTS.cacheKey;
    var imageListUrl = options.imageListUrl || null;
    var onStatus = options.onStatus;

    function fromCacheOrSilent() {
      try {
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
          var parsed = JSON.parse(cached);
          if (parsed && parsed.length) {
            applyEmbeddings(state, parsed);
            return Promise.resolve(true);
          }
        }
      } catch (e) { }
      if (imageListUrl && model) {
        if (onStatus) onStatus('Building embeddings…');
        return silentComputeEmbeddings(state, model, { imageListUrl: imageListUrl, cacheKey: cacheKey });
      }
      return Promise.resolve(false);
    }

    return fetch(url, { method: 'GET' })
      .then(function (resp) {
        if (resp.ok) return resp.json();
        return null;
      })
      .then(function (data) {
        if (data && data.length) {
          applyEmbeddings(state, data);
          return true;
        }
        return fromCacheOrSilent();
      })
      .catch(function () { return fromCacheOrSilent(); })
      .then(function (ok) {
        if (ok === true) return;
        throw new Error('Unable to load shark data');
      });
  }

  /**
   * The same MobileNet v2 (alpha 1.0) files TF Hub serves, from our own origin.
   * TF Hub now reaches them through two redirects per file (Kaggle, then signed
   * Cloud Storage URLs); scanning is the core of the walk and shouldn't depend
   * on that chain staying up. TF Hub remains the fallback.
   *
   * inputRange must stay [0, 1]: that's the Hub model's range, but given a
   * modelUrl the package assumes [-1, 1], which would shift every embedding
   * away from the enrolled ones and quietly stop all matches.
   */
  var LOCAL_MODEL_URL = './assets/models/mobilenet_v2_100_224/model.json';

  function loadModel(onStatus) {
    if (onStatus) onStatus('Preparing camera...');
    return global.tf.ready().then(function () {
      return global.mobilenet.load({
        version: 2, alpha: 1.0, modelUrl: LOCAL_MODEL_URL, inputRange: [0, 1]
      }).catch(function (err) {
        console.warn('[shark-embedding-detector] local MobileNet failed, trying TF Hub', err);
        return global.mobilenet.load({ version: 2, alpha: 1.0 });
      });
    });
  }

  function getFrameEmbedding(model, videoEl, debugCanvasEl) {
    var vw = videoEl.videoWidth;
    var vh = videoEl.videoHeight;
    if (!vw || !vh) {
      return Promise.resolve(null);
    }
    var minDim = Math.min(vw, vh);
    var sx = (vw - minDim) / 2;
    var sy = (vh - minDim) / 2;
    if (!debugCanvasEl.width) debugCanvasEl.width = 224;
    if (!debugCanvasEl.height) debugCanvasEl.height = 224;
    var ctx = debugCanvasEl.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, sx, sy, minDim, minDim, 0, 0, 224, 224);
    var emb = global.tf.tidy(function () {
      var t = global.tf.browser.fromPixels(debugCanvasEl);
      return model.infer(t, true);
    });
    return emb.data().then(function (data) {
      emb.dispose();
      return l2Normalize(new Float32Array(data));
    });
  }

  function createEmbeddingState(rollingN) {
    return {
      enrolled: [],
      sharkGroups: {},
      recentScores: [],
      ROLLING_N: rollingN != null ? rollingN : DEFAULTS.rollingN
    };
  }

  global.SharkEmbeddingDetector = {
    DEFAULTS: DEFAULTS,
    l2Normalize: l2Normalize,
    cosineSimilarity: cosineSimilarity,
    friendlyName: friendlyName,
    bestMatch: bestMatch,
    rollingScore: rollingScore,
    buildSharkGroups: buildSharkGroups,
    applyEmbeddings: applyEmbeddings,
    loadEmbeddings: loadEmbeddings,
    loadModel: loadModel,
    getFrameEmbedding: getFrameEmbedding,
    createEmbeddingState: createEmbeddingState
  };
})(typeof window !== 'undefined' ? window : globalThis);
