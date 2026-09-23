// Retro camera filter: pixel-grid snap + palette quantize + ordered dither + optional scanlines.
// Mirrors src/render/ditherMath.ts — keep the two in sync.
import { PALETTE } from '../palette';

export const RETRO_PALETTE_SIZE = PALETTE.length;

export const RETRO_FRAG = `
#pragma phaserTemplate(shaderName)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBlock;
uniform float uSpread;
uniform float uQuantize;
uniform float uScanlines;
uniform float uHardAlpha;
uniform vec3 uPalette[${RETRO_PALETTE_SIZE}];
varying vec2 outTexCoord;
#pragma phaserTemplate(fragmentHeader)

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 px = outTexCoord * uResolution;
  vec2 cell = floor(px / uBlock);
  // sample the first texel of the block (block centres fall between texels for even sizes)
  vec2 uv = (cell * uBlock + 0.5) / uResolution;
  vec4 src = texture2D(uMainSampler, uv);
  if (uQuantize < 0.5 || src.a < 0.004) {
    gl_FragColor = src;
    return;
  }
  vec3 c = clamp(src.rgb / src.a, 0.0, 1.0);
  // UI cameras composite over the world: binary alpha keeps panels and text on-palette
  float alpha = uHardAlpha > 0.5 ? step(0.5, src.a) : src.a;
  if (alpha < 0.004) { gl_FragColor = vec4(0.0); return; }
  float d1 = 1e9;
  float d2 = 1e9;
  vec3 c1 = c;
  vec3 c2 = c;
  for (int i = 0; i < ${RETRO_PALETTE_SIZE}; i++) {
    vec3 p = uPalette[i];
    vec3 dv = c - p;
    float d = dot(dv * dv, vec3(0.30, 0.59, 0.11));
    if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = p; }
    else if (d < d2) { d2 = d; c2 = p; }
  }
  float s1 = sqrt(d1);
  float s2 = sqrt(d2);
  float p2 = s1 / max(s1 + s2, 0.000001);
  vec3 outc = (p2 * uSpread > bayer4(cell)) ? c2 : c1;
  if (uScanlines > 0.0 && mod(floor(px.y), 2.0) < 1.0) outc *= 1.0 - 0.3 * uScanlines;
  gl_FragColor = vec4(outc * alpha, alpha);
}
`;
