/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { adaptRenderScale, bezier, forwardDistance, initialRenderScale, ringBasis, ringInverse, ringPoint, rotateXY, rubberband, segment, settled, stepSpring, wrapAngle, type Spring } from './motion';

describe('spring', () => {
  test('critically damped spring reaches the target without overshoot', () => {
    let s: Spring = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      s = stepSpring(s, 1, 1 / 60, { response: 0.5, dampingRatio: 1 });
      max = Math.max(max, s.x);
    }
    expect(settled(s, 1)).toBe(true);
    expect(max).toBeLessThanOrEqual(1.0005);
  });

  test('under-damped spring overshoots, and a long frame stays stable', () => {
    let s: Spring = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 60; i++) {
      s = stepSpring(s, 1, 1 / 60, { response: 0.4, dampingRatio: 0.5 });
      max = Math.max(max, s.x);
    }
    expect(max).toBeGreaterThan(1.05);
    const big = stepSpring({ x: 0, v: 0 }, 1, 0.5, { response: 0.2, dampingRatio: 1 });
    expect(Number.isFinite(big.x)).toBe(true);
    expect(Math.abs(big.x - 1)).toBeLessThan(0.05);
  });
});

describe('easing', () => {
  test('bezier ends and monotonic ease-out', () => {
    const e = bezier(0.23, 1, 0.32, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeGreaterThan(0.85);
    let prev = 0;
    for (let x = 0; x <= 1; x += 0.05) {
      const y = e(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    // Linear control points reproduce linear timing.
    expect(bezier(0.25, 0.25, 0.75, 0.75)(0.3)).toBeCloseTo(0.3, 4);
  });

  test('segment clamps', () => {
    expect(segment(0, 1, 2)).toBe(0);
    expect(segment(2, 1, 2)).toBe(0.5);
    expect(segment(9, 1, 2)).toBe(1);
  });
});

describe('angles', () => {
  test('forward distance never goes backwards', () => {
    expect(forwardDistance(1, 0.5, -1)).toBeCloseTo(0.5);
    expect(forwardDistance(0.5, 1, -1)).toBeCloseTo(Math.PI * 2 - 0.5);
    expect(forwardDistance(0.5, 1, 1)).toBeCloseTo(0.5);
    expect(forwardDistance(-20, -20, -1)).toBeCloseTo(0);
  });
  test('wrapAngle', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });
  test('rubberband resists past the limit', () => {
    expect(rubberband(0.2, 0.5)).toBe(0.2);
    const r = rubberband(2, 0.5);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(1);
    expect(rubberband(-2, 0.5)).toBeCloseTo(-r);
  });
});

describe('orbits', () => {
  const o = { radius: 0.8, incline: 1.3, node: 0.3 };

  test('rotation keeps length', () => {
    const v = rotateXY({ x: 0.3, y: -0.4, z: 0.5 }, 0.7, -1.1);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(Math.hypot(0.3, 0.4, 0.5), 6);
  });

  test('ring points sit on the radius, and the near half passes below the centre', () => {
    const b = ringBasis(o, 0.16, 0);
    for (let a = 0; a < Math.PI * 2; a += 0.37) {
      const p = ringPoint(b, a);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(o.radius, 6);
    }
    const flat = ringBasis({ ...o, node: 0 }, 0.16, 0);
    const near = ringPoint(flat, -Math.PI / 2);
    expect(near.z).toBeGreaterThan(0);
    expect(near.y).toBeLessThan(0);
  });

  test('inverse projection maps the projected ring back to the unit circle', () => {
    const b = ringBasis(o, 0.2, -0.4);
    const m = ringInverse(b)!;
    expect(m).not.toBeNull();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const p = ringPoint(b, a);
      const qx = m[0] * p.x + m[1] * p.y;
      const qy = m[2] * p.x + m[3] * p.y;
      expect(Math.hypot(qx, qy)).toBeCloseTo(1, 5);
      expect(Math.atan2(qy, qx)).toBeCloseTo(wrapAngle(a), 5);
    }
  });

  test('an edge-on ring has no inverse (nothing to draw)', () => {
    expect(ringInverse(ringBasis({ radius: 1, incline: Math.PI / 2, node: 0 }, 0, 0))).toBeNull();
  });
});

describe('render scale', () => {
  test('caps at 2 px per dp, halves on software GL', () => {
    expect(initialRenderScale(1, false)).toBe(1);
    expect(initialRenderScale(2, false)).toBe(1);
    expect(initialRenderScale(3, false)).toBeCloseTo(2 / 3);
    expect(initialRenderScale(2.625, true)).toBe(0.5);
  });
  test('steps down only when over budget, never below the floor', () => {
    expect(adaptRenderScale(1, 1 / 60)).toBe(1);
    expect(adaptRenderScale(1, 1 / 20)).toBeCloseTo(0.72);
    expect(adaptRenderScale(0.42, 1 / 10)).toBe(0.4);
    expect(adaptRenderScale(0.4, 1 / 10)).toBe(0.4);
  });
});
