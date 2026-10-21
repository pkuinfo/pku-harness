import type { HeroVariantSpec } from './types';

/**
 * 绸 · Silk. Panes of red silk-glass folding over each other in a round window (the folded
 * glass of GradFlow's Glass Fold on 21st.dev, React Bits' Silk sheen): each pane has one lit
 * crease that thins out behind it, and panes screen over one another so overlaps brighten.
 * A calm glass pearl, the agent, floats where the streams cross; the services ride one orbit.
 */
const FRAGMENT = `
vec4 hero(vec2 uv) {
  vec4 o = vec4(0.0);
  float len = length(uv);
  float win = (1.0 - smoothstep(0.55, 0.97, len / uScale)) * uIgnite;
  float t = uTime * 0.42 + uSwirl * 0.6;
  vec2 q = rot2(0.62 + uTilt.y * 0.7) * uv * 1.35;
  q.y += uTilt.x * 0.5;

  if (uLight > 0.5) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float bend = mod(fi, 2.0) * 2.0 - 1.0;
      float crease = (fi - 2.0) * 0.36 + 0.24 * sin(q.x * (1.1 + 0.13 * fi) + fi * 1.9 + t * (0.3 + 0.06 * fi)) + 0.1 * bend * q.x * q.x;
      float s = q.y - crease;
      float pane = smoothstep(-uPx, uPx, s);
      float back = max(s, 0.0);
      float body = exp(-back * 2.0);
      float fresnel = exp(-back * 9.0);
      float rim = exp(-back * 70.0);
      vec3 tint = mix(uCore, uBright, clamp(fresnel * 0.7 + 0.12 * sin(fi * 2.1 + q.x + t * 0.2), 0.0, 1.0));
      over(o, tint, pane * (body * 0.26 + fresnel * 0.32) * win);
      over(o, uGlow, pane * rim * 0.75 * win);
    }
  } else {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float bend = mod(fi, 2.0) * 2.0 - 1.0;
      float crease = (fi - 2.0) * 0.36 + 0.24 * sin(q.x * (1.1 + 0.13 * fi) + fi * 1.9 + t * (0.3 + 0.06 * fi)) + 0.1 * bend * q.x * q.x;
      float s = q.y - crease;
      float pane = smoothstep(-uPx, uPx, s);
      float back = max(s, 0.0);
      float body = exp(-back * 1.7);
      float fresnel = exp(-back * 8.0);
      float rim = exp(-back * 80.0);
      float inner = exp(-pow((back - 0.045) / 0.014, 2.0));
      float bloom = exp(-abs(s) * 20.0);
      vec3 tint = mix(uCore, uGlow, clamp(fresnel * 0.55 + 0.06 + 0.12 * sin(fi * 2.1 + q.x * 0.8 + t * 0.2), 0.0, 1.0));
      vec3 light = tint * pane * (body * 0.4 + fresnel * 0.38) + uGlow * (pane * (rim * 0.55 + inner * 0.1) + bloom * 0.08);
      col += light * (1.0 - col);
    }
    o.rgb += col * win;
  }

  // Services on their orbit (drawn flat over the silk; it has no depth to hide behind).
  {
    float z;
    float l = ringLine(uRingM[0], uRingZ[0], uv, z);
    over(o, uLight > 0.5 ? uCore : uGlow, l * (uLight > 0.5 ? 0.3 : 0.22) * mix(0.5, 1.0, smoothstep(-0.4, 0.4, z)));
  }
  for (int i = 0; i < 8; i++) {
    vec4 p = uPts[i];
    if (p.w <= 0.0) continue;
    float d = length(uv - p.xy);
    float s = p.w * (1.0 + p.z * 0.3);
    float core = 1.0 - smoothstep(s * 0.5, s, d);
    float glow = (s * s * 2.0) / (d * d + s * s * 2.0) * 0.45;
    if (uLight > 0.5) {
      over(o, uBright, glow * 0.4);
      over(o, uCore, core);
    } else {
      shine(o, uBright, glow);
      shine(o, uGlow, core);
    }
  }

  // The pearl: a soft shadow/glow under it, then the glass.
  vec2 c = vec2(0.0, 0.02 * sin(uTime * 0.9));
  float R = 0.2 * uScale * (1.0 + 0.1 * uFlash);
  float halo = exp(-max(length(uv - c) / R - 1.0, 0.0) * 3.2);
  shine(o, uLight > 0.5 ? uBright : uGlow, halo * (0.14 + 0.3 * uFlash) * uIgnite);
  vec4 pe = pearl(uv, c, R);
  o = pe + o * (1.0 - pe.a);
  return o;
}
`;

export const silk: HeroVariantSpec = {
  name: 'silk',
  label: '绸',
  fragment: FRAGMENT,
  orbits: [{ radius: 0.42, incline: 1.05, node: 0.5, count: 5, speed: -0.5, phase: 0.8, size: 0.02, revealFrom: 0.5 }],
};
