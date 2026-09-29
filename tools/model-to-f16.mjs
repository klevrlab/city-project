// Re-store a TF.js graph model's float32 weights as float16 — half the download;
// TF.js decodes them back to float32 on load, so the model runs unchanged.
//
//   node tools/model-to-f16.mjs assets/models/mobilenet_v2_100_224 assets/models/mobilenet_v2_100_224_f16
//
// Needs Node 24+ (native Float16Array, correct rounding). Write to a NEW directory
// name: phones cache model.json and the shards separately for ~10 min, and a mix of
// old and new files would load garbage weights. Prints overflow / flush-to-zero
// counts — overflow must be 0.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const [src, dst] = process.argv.slice(2);
const model = JSON.parse(readFileSync(join(src, 'model.json'), 'utf8'));
const SHARD = 4 * 1024 * 1024;
let overflow = 0, flushed = 0, total = 0, maxAbs = 0;
const outChunks = [];
const newManifest = [];

for (const group of model.weightsManifest) {
  const buf = Buffer.concat(group.paths.map((p) => readFileSync(join(src, p))));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let offset = 0;
  const weights = [];
  for (const w of group.weights) {
    const n = w.shape.reduce((a, b) => a * b, 1);
    if (w.dtype !== 'float32' || w.quantization) throw new Error('unexpected weight ' + w.name);
    const f32 = new Float32Array(ab, offset, n);
    offset += n * 4;
    const f16 = new Float16Array(f32);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(f32[i]);
      if (a > maxAbs) maxAbs = a;
      if (!isFinite(f16[i]) && isFinite(f32[i])) overflow++;
      if (f16[i] === 0 && f32[i] !== 0) flushed++;
    }
    total += n;
    outChunks.push(Buffer.from(f16.buffer, f16.byteOffset, f16.byteLength));
    weights.push({ ...w, quantization: { dtype: 'float16', original_dtype: 'float32' } });
  }
  if (offset !== buf.byteLength) throw new Error(`group size mismatch ${offset} vs ${buf.byteLength}`);
  const all = Buffer.concat(outChunks.splice(0));
  const paths = [];
  const count = Math.ceil(all.length / SHARD);
  for (let i = 0; i < count; i++) {
    const name = `group1-shard${i + 1}of${count}.bin`;
    paths.push(name);
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(dst, name), all.subarray(i * SHARD, Math.min(all.length, (i + 1) * SHARD)));
  }
  newManifest.push({ paths, weights });
}
model.weightsManifest = newManifest;
writeFileSync(join(dst, 'model.json'), JSON.stringify(model));
console.log(JSON.stringify({ weights: total, maxAbs, overflowToInf: overflow, flushedToZero: flushed }));
