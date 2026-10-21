import type { HeroVariantSpec } from './types';

/**
 * 灵核 · Living orb (the recommended hero). The agent as a sphere of red liquid glass: a slow,
 * domain-warped plasma seen through the surface with a refraction offset, a hot inner light
 * that breathes, a studio reflection and a thin-film rim. Two faint orbits carry the campus
 * services as small beads, passing behind and in front of it.
 */
const FRAGMENT = `
vec4 hero(vec2 uv) {
  vec4 o = vec4(0.0);
  float R = 0.47 * uScale;
  float t = uTime * 0.22 + uSwirl * 0.35;

  // Breathing silhouette: a slow pulse and a little low-frequency wobble.
  float len = length(uv);
  vec2 dir = uv / max(len, 1e-4);
  // (Noise only near the silhouette: it's the costliest thing per pixel.)
  float wob = len < R * 1.25 ? snoise3(vec3(dir * 1.1, uTime * 0.3)) * (0.012 + 0.02 * uEnergy) : 0.0;
  float Rb = R * (1.0 + 0.012 * sin(uTime * 1.25) + wob);
  float r = len / Rb;
  float cov = 1.0 - smoothstep(1.0 - uPx * 1.5 / Rb, 1.0, r);

  // Ground: a soft red bounce under it on dark, a warm contact shadow on light.
  vec2 sp = (uv - vec2(0.0, -R * 1.2)) / vec2(R * 0.9, R * 0.17);
  float ground = exp(-dot(sp, sp) * 1.5);
  if (uLight > 0.5) over(o, uDeep, ground * 0.14 * uScale);
  else shine(o, uCore, ground * 0.22 * uIgnite);

  // Halo: the inner light escaping the glass.
  float away = max(r - 1.0, 0.0);
  float halo = exp(-away * 5.0) * (1.0 - cov) * (0.25 + 0.35 * uIgnite + 0.6 * uFlash);
  shine(o, uLight > 0.5 ? uBright : mix(uCore, uBright, 0.5), halo * (uLight > 0.5 ? 0.16 : 0.42));

  // Tap ripple.
  float rr = 1.05 + (1.0 - uFlash) * 0.85;
  float ripple = exp(-pow((r - rr) * 12.0, 2.0)) * uFlash * uFlash;
  shine(o, uLight > 0.5 ? uCore : uGlow, ripple * 0.35);

  // Orbits and services: split into behind / in front of the sphere.
  float backLine = 0.0;
  float frontLine = 0.0;
  for (int k = 0; k < 2; k++) {
    float z;
    float l = ringLine(uRingM[k], uRingZ[k], uv, z);
    float depth = smoothstep(-0.5, 0.5, z);
    if (z < 0.0) backLine += l * mix(0.35, 0.7, depth);
    else frontLine += l * mix(0.7, 1.0, depth);
  }
  vec3 backPts = vec3(0.0);
  vec3 frontPts = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 p = uPts[i];
    if (p.w <= 0.0) continue;
    float d = length(uv - p.xy);
    float s = p.w * (1.0 + p.z * 0.35);
    float core = 1.0 - smoothstep(s * 0.55, s, d);
    float glow = (s * s * 1.6) / (d * d + s * s * 1.6) * 0.5;
    vec3 v = vec3(core, glow, 0.0) * mix(0.55, 1.0, smoothstep(-0.6, 0.6, p.z));
    if (p.z < 0.0) backPts += v;
    else frontPts += v;
  }
  float lineA = uLight > 0.5 ? 0.26 : 0.17;
  over(o, uInk, backLine * lineA);
  if (uLight > 0.5) {
    over(o, uBright, backPts.y * 0.35);
    over(o, uCore, backPts.x);
  } else {
    shine(o, uBright, backPts.y * 0.8);
    shine(o, uGlow, backPts.x);
  }

  // The sphere.
  if (cov > 0.0) {
    vec2 p = uv / Rb;
    float z = sqrt(max(0.0, 1.0 - dot(p, p)));
    vec3 n = vec3(p, z);
    float fres = pow(1.0 - z, 2.2);
    vec3 rd = vec3(2.0 * z * n.xy, 2.0 * z * z - 1.0);

    // Look into the glass: a refracted point inside, in object space (turns with the tilt).
    // Low frequencies only: a few large, slow lobes read as liquid; fine noise reads as marble.
    vec3 refr = refract(vec3(0.0, 0.0, -1.0), n, 0.69);
    vec3 inner = untilt(n * 0.9 + refr * 0.5);
    float w1 = snoise3(inner * 0.85 + vec3(0.0, t, t * 0.5));
    float w2 = snoise3(inner * 1.25 + vec3(w1 * 0.9, w1 * 0.6, -t * 0.8));
    float plasma = 0.5 + 0.5 * w2;

    // The agent's light: a glow low in the glass, and the caustic a lit glass ball focuses
    // along its lower edge. Both breathe.
    float breathe = (0.82 + 0.18 * sin(uTime * 1.25 + 1.2)) * uIgnite * (1.0 + uFlash * 1.2);
    vec2 cp = p - vec2(0.04, -0.2);
    float core = exp(-dot(cp, cp) * 2.2);
    float caustic = exp(-pow((length(p - vec2(-0.08, 0.3)) - 1.0) * 5.5, 2.0)) * smoothstep(0.15, -0.55, p.y);
    vec3 inLight = mix(uBright, uGlow, 0.55) * (core * 0.7 + caustic * 0.8) * breathe;

    vec3 body = mix(uDeep, uCore, smoothstep(0.12, 0.8, plasma));
    body = mix(body, uBright, smoothstep(0.55, 0.95, plasma) * 0.6);
    float win = gloss(p);
    vec3 col;
    if (uLight > 0.5) {
      body = mix(body, uBright, 0.25) * mix(0.72, 1.0, z) + inLight * 0.8;
      // Grazing angles mirror the paper: the edge brightens toward it, as glass on paper does.
      col = body * (1.0 - fres * 0.75) + studio(rd) * film(z, 0.05) * (0.04 + 0.95 * fres);
      col += vec3(1.0) * win * 0.8;
      // A fine dark contour where the glass turns away.
      col = mix(col, uDeep, smoothstep(0.955, 1.0, r) * 0.55);
    } else {
      body = body * mix(0.5, 1.0, z) + inLight;
      col = body * (1.0 - fres * 0.5) + studio(rd) * film(z, 0.0) * (0.04 + 0.65 * fres);
      col += vec3(1.0) * win * 0.65;
      // Back-lit rim: light travelling round the inside of the glass.
      col += mix(uBright, uGlow, 0.3) * pow(1.0 - z, 3.5) * (0.35 + 0.35 * uIgnite);
    }
    over(o, col, cov);
  }

  over(o, uInk, frontLine * lineA * 1.2);
  if (uLight > 0.5) {
    over(o, uBright, frontPts.y * 0.4);
    over(o, uCore, frontPts.x);
  } else {
    shine(o, uBright, frontPts.y * 0.9);
    shine(o, uGlow, frontPts.x * 1.1);
  }
  return o;
}
`;

export const orb: HeroVariantSpec = {
  name: 'orb',
  label: '灵核',
  fragment: FRAGMENT,
  orbits: [
    { radius: 0.78, incline: 1.44, node: -0.12, count: 4, speed: -0.42, phase: 0.4, size: 0.022, revealFrom: 2.4 },
    { radius: 0.64, incline: 1.4, node: 0.22, count: 3, speed: 0.3, phase: 1.9, size: 0.017, revealFrom: -0.6 },
  ],
};
