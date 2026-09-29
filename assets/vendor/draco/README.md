# Draco decoder 1.5.6

Copied verbatim from https://www.gstatic.com/draco/versioned/decoders/1.5.6/ — the
version A-Frame 1.5 / 8frame loads by default. Served from our own origin so the
Draco-compressed models (swimmers, mascots, tower, Stella) don't depend on gstatic.

Pointed at by `gltf-model="dracoDecoderPath: ./assets/vendor/draco/"` on the
`<a-scene>` and by `dracoDecoderLocation` for model-viewer (selfie).

Draco: https://github.com/google/draco — Apache License 2.0.
