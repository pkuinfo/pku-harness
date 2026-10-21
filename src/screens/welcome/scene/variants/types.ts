export type HeroVariantName = 'orb' | 'eclipse' | 'silk';

/** One orbit of campus services around the agent. Angles in radians, sizes in uv units. */
export type OrbitSpec = {
  radius: number;
  /** Lay-back about X (π/2 = edge-on). */
  incline: number;
  /** Turn about the view axis. */
  node: number;
  /** Service beads on it (≤ 8 across all orbits). */
  count: number;
  /** Cruise speed, rad/s (sign = direction). */
  speed: number;
  phase: number;
  size: number;
  /** Ring angle where the line starts drawing on in the intro. */
  revealFrom: number;
};

export type HeroVariantSpec = {
  name: HeroVariantName;
  /** Short Chinese name, for dev logs. */
  label: string;
  /** GLSL defining `vec4 hero(vec2 uv)` (premultiplied), on top of glsl.ts PRELUDE. */
  fragment: string;
  /** Up to two orbits. */
  orbits: OrbitSpec[];
};
