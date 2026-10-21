/**
 * Orbit geometry for the 2D art (SVG, y down): an ellipse of radii rx, ry turned by `deg`. The
 * far half is the upper one (the orbit is seen from slightly above, as in the 3D hero), so art
 * draws it before the orb and the near half after.
 */

/** Path for one half of the ellipse, in its own (unrotated) frame centred on 0,0. */
export function ellipseHalf(rx: number, ry: number, near: boolean) {
  return near ? `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0` : `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0`;
}

/** Point on the orbit at `angle` (rad) around centre cx, cy; `near` when on the front half. */
export function orbitXY(cx: number, cy: number, rx: number, ry: number, deg: number, angle: number) {
  'worklet';
  const lx = rx * Math.cos(angle);
  const ly = ry * Math.sin(angle);
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c, near: ly > 0, depth: Math.sin(angle) };
}
