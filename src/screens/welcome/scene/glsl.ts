/**
 * Shared GLSL (ES 1.00, so it compiles on WebGL 1 and 2 contexts alike) for the hero variants.
 * A variant supplies `vec4 hero(vec2 uv)` returning premultiplied colour; uv is centred, the
 * shorter side spans [-1, 1].
 *
 * Techniques, and where they come from (see the research notes in the PR / report):
 * - inverse-distance "lights" and per-theme compositing (React Bits Orb): glows add light on a
 *   dark page and become tinted coverage on a light one, so neither theme washes out;
 * - glass faked with fresnel + a studio environment made in code (a key "window" and a warm rim
 *   card, the way product renders are lit) instead of env maps / transmission, which expo-gl
 *   can't do reliably;
 * - thin-film tint at grazing angles (three.js MeshPhysicalMaterial iridescence, cheapened to a
 *   cosine palette pulled toward the brand);
 * - domain-warped simplex noise seen through the surface with a refraction offset (parallax);
 * - film grain / dither so the soft gradients never band (GradFlow shaders on 21st.dev).
 */

export const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uPx;      // one pixel in uv units
uniform float uTime;    // scene clock (slows to a stop when idle)
uniform float uSwirl;   // accumulated extra motion (taps, celebration)
uniform float uLight;   // 1 on the light theme
uniform float uScale;   // intro scale
uniform float uIgnite;  // 0 → 1: the agent's light coming on
uniform float uFlash;   // 1 → 0 after a tap / landing
uniform float uEnergy;  // 0..1 how fast things are moving above rest
uniform float uReveal;  // 0 → 1: orbit lines drawing on
uniform vec2 uTilt;     // drag tilt + sway (rad)
uniform vec3 uDeep;
uniform vec3 uCore;
uniform vec3 uBright;
uniform vec3 uGlow;
uniform vec3 uWarm;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec4 uRingM[2];  // inverse ring projection (row-major 2x2)
uniform vec4 uRingZ[2];  // (u.z, v.z, reveal start angle, alpha)
uniform vec4 uPts[8];    // service points: (x, y, z, size); size 0 = hidden

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

// Simplex-style 3D noise (as in React Bits' Orb), range about [-1, 1].
float snoise3(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - K2);
  vec3 d2 = d0 - (i2 - K1);
  vec3 d3 = d0 - 0.5;
  vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
  return dot(vec4(31.316), n);
}

mat2 rot2(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

// Object-space rotation for the drag tilt (inverse of the view tilt).
vec3 untilt(vec3 v) {
  float cx = cos(-uTilt.x);
  float sx = sin(-uTilt.x);
  float cy = cos(-uTilt.y);
  float sy = sin(-uTilt.y);
  v = vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
  return vec3(v.x, v.y * cx - v.z * sx, v.y * sx + v.z * cx);
}

float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }

// Premultiplied "over".
void over(inout vec4 dst, vec3 c, float a) {
  a = clamp(a, 0.0, 1.0);
  dst.rgb = c * a + dst.rgb * (1.0 - a);
  dst.a = a + dst.a * (1.0 - a);
}

// Light: adds on a dark page, tinted coverage on a light one (where adding would vanish).
void shine(inout vec4 dst, vec3 c, float e) {
  if (uLight < 0.5) {
    dst.rgb += c * e;
  } else {
    over(dst, c, e);
  }
}

// The key light's highlight, placed on the sphere's face (p = position on the unit disc):
// a soft rounded window with a hotter centre, upper-left. Done in face space rather than by
// reflecting a shape: a reflected rectangle smears into a thin crescent on a sphere.
float gloss(vec2 p) {
  vec2 q = rot2(0.62) * (p - vec2(-0.36, 0.45)) / vec2(0.3, 0.155);
  float l = length(q);
  return (1.0 - smoothstep(0.55, 1.0, l)) * 0.6 + (1.0 - smoothstep(0.0, 0.55, l)) * 0.4;
}

// Studio environment for reflections at grazing angles: a horizon gradient between the page
// colour and the deep red, plus a warm card lower-right.
vec3 studio(vec3 r) {
  float sky = smoothstep(-0.6, 0.9, r.y);
  vec3 col = uLight > 0.5 ? mix(uDeep * 0.5, uPaper, sky) : mix(uDeep * 0.25, uGlow * 0.14, sky * sky);
  vec2 k = (r.xy - vec2(0.78, -0.5)) / vec2(0.22, 0.32);
  float card = 1.0 - smoothstep(0.4, 1.0, length(k));
  col += mix(uWarm, uGlow, 0.5) * card * 0.35;
  return col;
}

// Thin-film tint at grazing angles, kept close to the brand (red → amber → rose).
vec3 film(float facing, float shift) {
  float d = (1.0 - facing) * 1.4 + shift;
  vec3 rainbow = 0.55 + 0.45 * cos(TAU * (d + vec3(0.0, 0.18, 0.36)));
  return mix(vec3(1.0), mix(rainbow, uGlow, 0.45), 0.6);
}

// Distance (uv) to a projected ring and the ring's depth/angle at the nearest point.
float ringLine(vec4 m, vec4 rz, vec2 uv, out float z) {
  vec2 q = vec2(dot(m.xy, uv), dot(m.zw, uv));
  float lq = max(length(q), 1e-4);
  vec2 g = vec2(m.x * q.x + m.z * q.y, m.y * q.x + m.w * q.y) / lq;
  float d = abs(lq - 1.0) / max(length(g), 1e-4);
  vec2 cs = q / lq;
  z = dot(rz.xy, cs);
  float a = fract((atan(cs.y, cs.x) - rz.z) / TAU);
  float rv = uReveal * 1.04;
  float drawn = 1.0 - smoothstep(rv - 0.04, rv, a);
  float line = 1.0 - smoothstep(uPx * 0.5, uPx * 1.6, d);
  return line * drawn * rz.w;
}

// A small glass pearl (the agent, where it's a supporting element).
vec4 pearl(vec2 uv, vec2 c, float R) {
  vec2 p = (uv - c) / R;
  float r2 = dot(p, p);
  float cov = 1.0 - smoothstep(1.0 - uPx * 1.5 / R, 1.0, sqrt(r2));
  if (cov <= 0.0) return vec4(0.0);
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 n = vec3(p, z);
  vec3 rd = vec3(2.0 * z * n.xy, 2.0 * z * z - 1.0);
  float fres = pow(1.0 - z, 2.4);
  float core = exp(-r2 * 2.4) * (0.6 + 0.4 * uIgnite) * (1.0 + uFlash);
  vec3 body = mix(uDeep, uCore, 0.35 + 0.65 * z);
  body = mix(body, uBright, smoothstep(0.2, -0.8, p.y) * 0.5);
  body += uGlow * core * 0.85;
  vec3 col = body * (1.0 - fres * 0.55) + studio(rd) * film(z, 0.0) * (0.06 + 0.85 * fres);
  col += vec3(1.0) * gloss(p) * 0.85;
  if (uLight < 0.5) col += uBright * pow(1.0 - z, 5.0) * 0.6;
  return vec4(col * cov, cov);
}
`;

export const MAIN = `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));
  vec4 c = hero(uv);
  c.rgb = clamp(c.rgb, 0.0, 1.0);
  // Everything decays before the edge of the view, so no glow is ever cut square.
  c *= 1.0 - smoothstep(0.8, 1.0, length(uv));
  // On the dark page light carries its own alpha (React Bits' extractAlpha), so glows stay
  // valid premultiplied colour over any compositor.
  if (uLight < 0.5) c.a = max(c.a, maxc(c.rgb));
  c.a = clamp(c.a, 0.0, 1.0);
  // Film grain + dither: soft gradients band on 8-bit surfaces without it.
  float g = hash12(gl_FragCoord.xy + fract(uTime * 0.37) * 97.0) - 0.5;
  c.rgb += g * (2.2 / 255.0 + mix(0.022, 0.01, uLight) * c.a);
  c.rgb = clamp(c.rgb, 0.0, c.a);
  gl_FragColor = c;
}
`;

export const BLIT_FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uRes;
void main() { gl_FragColor = texture2D(uTex, gl_FragCoord.xy / uRes); }
`;
