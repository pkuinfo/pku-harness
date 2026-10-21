/**
 * Motion maths for the 3D brand scene (pure, unit-tested in motion.test.ts). The scene runs its
 * own frame loop, so it can't use Reanimated's springs; these mirror them: Apple-style springs
 * (response + damping ratio) and the app's cubic-bezier curves (src/theme/motion.ts `curves`).
 */

export type Spring = { x: number; v: number };
export type SpringConfig = { response: number; dampingRatio: number };

/**
 * Advance a damped spring toward `target` by `dt` seconds (semi-implicit Euler, sub-stepped so
 * a long frame stays stable). `response` is the period in seconds, as in SwiftUI's springs.
 */
export function stepSpring(s: Spring, target: number, dt: number, cfg: SpringConfig): Spring {
  const k = (2 * Math.PI / cfg.response) ** 2;
  const c = (4 * Math.PI * cfg.dampingRatio) / cfg.response;
  let { x, v } = s;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
  }
  return { x, v };
}

/** True once a spring is visually at rest. */
export const settled = (s: Spring, target: number, eps = 1e-3) => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;

/** CSS-style cubic-bezier(x1, y1, x2, y2) easing: solves x(t) for t, returns y. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton first, bisection if the slope is too flat.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** 0→1 progress of a segment [start, start + duration] at time t (seconds), clamped. */
export const segment = (t: number, start: number, duration: number) => Math.min(1, Math.max(0, (t - start) / duration));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number) {
  const tau = Math.PI * 2;
  let r = a % tau;
  if (r <= -Math.PI) r += tau;
  if (r > Math.PI) r -= tau;
  return r;
}

/**
 * Remaining travel from `at` to `home` going in the direction of `dir` (-1 clockwise, +1
 * counter-clockwise), always in [0, 2π): the bead never reverses to get home.
 */
export function forwardDistance(at: number, home: number, dir: -1 | 1) {
  const tau = Math.PI * 2;
  const d = dir * (home - at);
  return ((d % tau) + tau) % tau;
}

/** Rubber-band past a limit (Apple's formula): resistance grows the further you pull. */
export function rubberband(value: number, limit: number, c = 0.55) {
  const a = Math.abs(value);
  if (a <= limit) return value;
  const over = a - limit;
  return Math.sign(value) * (limit + (over * limit * c) / (limit + c * over));
}

// ── Orbits (the campus services circling the agent) ────────────────────────────────────────

export type Vec3 = { x: number; y: number; z: number };

/** Rotate about X by `rx`, then about Y by `ry` (the drag tilt: vertical drag → rx). */
export function rotateXY(v: Vec3, rx: number, ry: number): Vec3 {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  return { x: v.x * cy + z1 * sy, y: y1, z: -v.x * sy + z1 * cy };
}

/**
 * A ring around the origin: a circle of `radius` in the screen plane, laid back by `incline`
 * (rad about X, so it reads as an ellipse like Saturn's ring), turned by `node` (rad about the
 * view axis), then tilted with the scene. Returns the two scaled basis vectors: a point on the
 * ring at angle θ is `u cos θ + v sin θ`.
 */
export function ringBasis(o: { radius: number; incline: number; node: number }, rx: number, ry: number): { u: Vec3; v: Vec3 } {
  const cn = Math.cos(o.node);
  const sn = Math.sin(o.node);
  const ci = Math.cos(o.incline);
  const si = Math.sin(o.incline);
  // Base axes (1,0,0) and (0, cos i, -sin i), turned about Z by node: the top of the ring
  // recedes, so its near half passes below (and in front of) the centre.
  const u0 = { x: cn, y: sn, z: 0 };
  const v0 = { x: -sn * ci, y: cn * ci, z: -si };
  const u = rotateXY(u0, rx, ry);
  const v = rotateXY(v0, rx, ry);
  const r = o.radius;
  return { u: { x: u.x * r, y: u.y * r, z: u.z * r }, v: { x: v.x * r, y: v.y * r, z: v.z * r } };
}

export function ringPoint(b: { u: Vec3; v: Vec3 }, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: b.u.x * c + b.v.x * s, y: b.u.y * c + b.v.y * s, z: b.u.z * c + b.v.z * s };
}

/**
 * Inverse of the ring's screen projection (orthographic): the 2×2 matrix that maps a screen
 * point back to the unit circle, row-major [a, b, c, d]. The shader measures distance to the
 * ellipse with it. Null when the ring is seen edge-on (nothing to draw).
 */
export function ringInverse(b: { u: Vec3; v: Vec3 }): [number, number, number, number] | null {
  const det = b.u.x * b.v.y - b.v.x * b.u.y;
  if (Math.abs(det) < 1e-4) return null;
  return [b.v.y / det, -b.v.x / det, -b.u.y / det, b.u.x / det];
}

// ── Render quality ─────────────────────────────────────────────────────────────────────────

/**
 * Starting render scale for a shader hero: never above 2 device px per dp (sharper is invisible
 * on soft light, and costs fragments), and half that on a software rasteriser.
 */
export function initialRenderScale(pixelRatio: number, software: boolean) {
  const cap = Math.min(1, 2 / Math.max(1, pixelRatio));
  return software ? Math.min(cap, 0.5) : cap;
}

/**
 * Step the render scale down when frames run long (mean frame time in seconds over a sample
 * window). Returns the same scale when the budget is met or the floor is reached.
 */
export function adaptRenderScale(scale: number, meanFrame: number, budget = 1 / 45, floor = 0.4) {
  if (meanFrame <= budget || scale <= floor) return scale;
  return Math.max(floor, scale * 0.72);
}
