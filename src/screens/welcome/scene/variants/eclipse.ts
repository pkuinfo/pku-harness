import type { HeroVariantSpec } from './types';

/**
 * 日冕 · Corona. Restraint: a quiet disc with a crisp hot rim and a long soft corona (after
 * GradFlow's Black Hole on 21st.dev). One side burns brighter and drifts round: the agent's
 * attention moving across your campus. Services ride a single faint orbit just outside.
 * On the light page the disc turns to paper and the corona to red ink bleeding behind it.
 */
const FRAGMENT = `
vec4 hero(vec2 uv) {
  vec4 o = vec4(0.0);
  float R = 0.44 * uScale;
  float r = length(uv);
  vec2 dir = uv / max(r, 1e-4);
  float t = uTime * 0.6 + uSwirl;

  // Whole multiples of the angle only, so the atan seam never shows.
  float a = atan(dir.y, dir.x);
  float wob = (0.006 * sin(a * 3.0 + t * 0.7) + 0.004 * sin(a * 5.0 - t * 0.5)) * (1.0 + uEnergy * 2.0);
  float d = r - R * (1.0 + wob);
  float away = max(d, 0.0);
  float focus = a - (t * 0.35 + 1.2) - uTilt.y * 1.6 + uTilt.x * 0.8;
  float arc = 0.5 + 0.5 * cos(focus);
  arc *= arc;
  // Filaments: slow solar wind, sampled on the circle (no seam).
  float fil = 0.82 + 0.3 * snoise3(vec3(dir * 2.4, t * 0.22 - away * 2.5));
  float outside = smoothstep(-uPx, uPx, d);
  float ign = uIgnite;
  float corona = exp(-away * (10.0 - 5.5 * arc) / uScale) * outside * fil * ign;
  float rim = exp(-abs(d) / (uPx * 2.2 + 0.006)) * ign;
  float flare = exp(-away * 3.4) * arc * outside * ign;
  float flash = uFlash * uFlash;

  // Orbit and services behind / in front of the disc.
  float backLine = 0.0;
  float frontLine = 0.0;
  {
    float z;
    float l = ringLine(uRingM[0], uRingZ[0], uv, z);
    if (z < 0.0) backLine += l * 0.6;
    else frontLine += l;
  }
  vec3 backPts = vec3(0.0);
  vec3 frontPts = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 p = uPts[i];
    if (p.w <= 0.0) continue;
    float dd = length(uv - p.xy);
    float s = p.w * (1.0 + p.z * 0.3);
    vec3 v = vec3(1.0 - smoothstep(s * 0.5, s, dd), (s * s * 2.0) / (dd * dd + s * s * 2.0) * 0.5, 0.0);
    if (p.z < 0.0) backPts += v * 0.6;
    else frontPts += v;
  }

  float cov = 1.0 - outside;
  if (uLight > 0.5) {
    over(o, uBright, corona * (0.32 + 0.4 * arc) * (1.0 + flash));
    over(o, uWarm, flare * 0.1);
    over(o, uInk, backLine * 0.28);
    over(o, uCore, backPts.x);
    // Paper disc, a breath darker at the rim on the hot side.
    float inner = exp(min(d, 0.0) * 16.0);
    vec3 disc = mix(uPaper, mix(uPaper, uBright, 0.14), inner * (0.4 + 0.6 * arc) * ign);
    over(o, disc, cov);
    over(o, uCore, rim * (0.45 + 0.55 * arc) * (1.0 + flash * 0.6));
    over(o, uInk, frontLine * 0.34);
    over(o, uBright, frontPts.y * 0.3);
    over(o, uCore, frontPts.x);
  } else {
    shine(o, uCore, corona * (0.55 + 0.6 * arc) * (1.0 + flash));
    shine(o, uBright, corona * corona * arc * 0.7);
    shine(o, uWarm, flare * 0.14);
    over(o, uInk, backLine * 0.2);
    shine(o, uGlow, backPts.x);
    // The disc: nearly black glass, lit from inside along the hot edge, a faint swirl in it.
    float inner = exp(min(d, 0.0) * 12.0);
    float sw = snoise3(untilt(vec3(uv / R, 0.6)) * 1.4 + vec3(0.0, 0.0, t * 0.15)) * 0.5 + 0.5;
    vec3 disc = uPaper * 0.6 + uDeep * (0.25 + 0.35 * sw) + uCore * inner * (0.2 + 0.7 * arc) * ign;
    over(o, disc, cov);
    shine(o, mix(uBright, uGlow, 0.4 + 0.6 * arc), rim * (0.4 + 0.75 * arc) * (1.0 + flash));
    over(o, uInk, frontLine * 0.26);
    shine(o, uBright, frontPts.y * 0.8);
    shine(o, uGlow, frontPts.x);
  }
  return o;
}
`;

export const eclipse: HeroVariantSpec = {
  name: 'eclipse',
  label: '日冕',
  fragment: FRAGMENT,
  orbits: [{ radius: 0.7, incline: 1.22, node: -0.18, count: 6, speed: -0.32, phase: 0.2, size: 0.022, revealFrom: 1.6 }],
};
