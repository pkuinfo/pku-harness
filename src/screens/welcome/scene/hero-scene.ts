import { curves } from '@/theme';

import { BLIT_FRAGMENT, MAIN, PRELUDE, VERTEX } from './glsl';
import { adaptRenderScale, bezier, initialRenderScale, lerp, ringBasis, ringInverse, ringPoint, rubberband, segment, settled, stepSpring, type Spring } from './motion';
import { heroPalettes, type HeroPalette } from './palette';
import type { HeroVariantSpec } from './variants';

/**
 * The welcome hero: one fragment shader per variant (scene/variants) on a raw expo-gl context,
 * and the loop that performs it. No three.js: the hero is a single full-screen triangle, so a
 * scene graph, env maps or transmission targets would only add cost and failure modes.
 *
 * The loop is explicit: it runs only while `setActive(true)` and there's something to do. After
 * a while without touches the scene clock eases to a stop and the loop ends (an idle screen
 * draws no frames, docs/DESIGN.md); a touch eases it back. Every GL call is guarded: a failed
 * compile or a lost context stops the loop and reports through `onError`, and the host falls
 * back to the 2D art.
 *
 * Cost: rendered at ≤ 2 px per dp into an offscreen target and upscaled (soft light doesn't
 * need more), half that on a software rasteriser, and stepped down again if frames run long.
 */

/** Minimal GL surface we need from expo-gl's context. */
export type GLContext = WebGL2RenderingContext & { endFrameEXP(): void; drawingBufferWidth: number; drawingBufferHeight: number; supportsWebGL2?: boolean };

export type SceneMode = 'intro' | 'celebrate';

const EASE_OUT = bezier(...curves.out);
const EASE_IN_OUT = bezier(...curves.inOut);

/** With no touch for this long, the clock eases to a stop and the loop ends. */
const IDLE_S = 14;
const TILT_LIMIT = 0.55;
const DRAG_SPRING = { response: 0.45, dampingRatio: 0.8 };
const POSE_SPRING = { response: 1.05, dampingRatio: 1 };
const BOOST_SPRING = { response: 1.4, dampingRatio: 1 };
const CLOCK_SPRING = { response: 1.6, dampingRatio: 1 };
/** Resting view: a little from above, so the orbits read as rings. */
const REST = { rotX: 0.16, rotY: 0 };
/** Intro beats (s): light comes on, orbits draw on, services arrive one by one, "connected". */
const INTRO = { igniteAt: 0.05, igniteFor: 1.0, revealAt: 0.3, revealFor: 1.05, pointsAt: 0.7, pointStep: 0.08, pointFor: 0.45, connectedAt: 1.35 };
/** Where the still (reduced motion) frame is posed. */
const STILL_T = 2.6;
const MAX_POINTS = 8;

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class HeroScene {
  private program: WebGLProgram;
  private blit: WebGLProgram | null = null;
  private buffer: WebGLBuffer;
  private u: Uniforms = {};
  private bu: Uniforms = {};
  private target: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number } | null = null;
  private scale: number;
  private palette: HeroPalette;
  private light: boolean;

  private raf: number | null = null;
  private last = 0;
  private active = false;
  private dead = false;
  /** Real seconds of performance (frozen while paused, so the intro never skips). */
  private t = 0;
  /** Scene clock: advances at `clock.x` speed, so idling slows everything to a stop. */
  private phase = 0;
  private clock: Spring = { x: 1, v: 0 };
  private clockTarget = 1;
  private idleFor = 0;
  private swirl = 0;
  private boost: Spring = { x: 0, v: 0 };
  private orbitAngle = 0;
  private flashAt = -10;
  private pose = { x: { x: 0, v: 0 } as Spring, s: { x: 1, v: 0 } as Spring };
  private tilt = { x: { x: 0, v: 0 } as Spring, y: { x: 0, v: 0 } as Spring };
  private dragging: { x: number; y: number } | null = null;
  private samples: number[] = [];
  private adapted = 0;

  private ringM = new Float32Array(8);
  private ringZ = new Float32Array(8);
  private pts = new Float32Array(MAX_POINTS * 4);

  constructor(
    private gl: GLContext,
    private opts: { spec: HeroVariantSpec; mode: SceneMode; still: boolean; light: boolean; pixelRatio: number; onError: (e: unknown) => void },
  ) {
    this.light = opts.light;
    this.palette = heroPalettes[opts.light ? 'light' : 'dark'];
    this.program = this.link(VERTEX, PRELUDE + opts.spec.fragment + MAIN);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('no GL buffer');
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One triangle that covers the viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let software = false;
    try {
      const name = String(gl.getParameter(gl.RENDERER) ?? '');
      software = /swiftshader|llvmpipe|software/i.test(name);
    } catch {
      software = false;
    }
    this.scale = initialRenderScale(opts.pixelRatio, software);
    this.makeTarget();

    // Starting pose: small and turned for the intro; at rest otherwise.
    const intro = opts.mode === 'intro' && !opts.still;
    this.pose.x.x = intro ? 0.5 : 0;
    this.pose.s.x = intro ? 0.8 : 1;
    if (opts.mode === 'celebrate' && !opts.still) {
      // The finish: the services take a fast lap and the light flashes, then all settle.
      this.boost = { x: 7, v: 0 };
      this.flashAt = 0.05;
    }
    if (opts.still) {
      this.t = STILL_T;
      this.phase = STILL_T;
      this.orbitAngle = STILL_T;
    }
  }

  /** Render the first frame (throws if the context can't draw, so the host can fall back). */
  start() {
    this.renderFrame();
    if (!this.opts.still) this.schedule();
  }

  setActive(active: boolean) {
    if (this.dead || this.active === active) return;
    this.active = active;
    if (active) this.schedule();
    else this.cancel();
  }

  /** Theme switch: new palette, and one fresh frame even if the loop is resting. */
  setTheme(light: boolean) {
    if (this.dead || light === this.light) return;
    this.light = light;
    this.palette = heroPalettes[light ? 'light' : 'dark'];
    if (this.raf == null) this.safeRender();
  }

  /** A touch: reset the idle timer and bring the clock back up. */
  wake() {
    this.idleFor = 0;
    this.clockTarget = 1;
    this.schedule();
  }

  /** Tap: a flash, a ripple, and the services take a quick extra lap. */
  boostOnce() {
    this.wake();
    if (this.opts.mode === 'intro' && this.t < INTRO.connectedAt) return;
    this.boost = { x: this.boost.x + 6, v: 0 };
    this.flashAt = this.t;
  }

  drag(dx: number, dy: number) {
    this.wake();
    this.dragging = { x: dx, y: dy };
  }

  release(vx: number, vy: number) {
    if (!this.dragging) return;
    // Hand the finger's velocity to the springs (px/s → rad/s at the drag's scale).
    this.tilt.y.v = vx * 0.004;
    this.tilt.x.v = vy * 0.004;
    this.dragging = null;
    this.schedule();
  }

  dispose() {
    this.dead = true;
    this.cancel();
    const gl = this.gl;
    try {
      this.dropTarget();
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
      if (this.blit) gl.deleteProgram(this.blit);
    } catch {
      // The context may already be gone (surface destroyed); nothing left to free on our side.
    }
  }

  // ── GL plumbing ──────────────────────────────────────────────────────────────────────────

  private compile(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error('no GL shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`shader compile failed: ${log ?? ''}`);
    }
    return s;
  }

  private link(vs: string, fs: string) {
    const gl = this.gl;
    const p = gl.createProgram();
    if (!p) throw new Error('no GL program');
    const v = this.compile(gl.VERTEX_SHADER, vs);
    const f = this.compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`program link failed: ${log ?? ''}`);
    }
    return p;
  }

  /** Offscreen target at the render scale (none at full scale, or if the driver refuses one). */
  private makeTarget() {
    const gl = this.gl;
    this.dropTarget();
    if (this.scale > 0.98) return;
    const w = Math.max(16, Math.round(gl.drawingBufferWidth * this.scale));
    const h = Math.max(16, Math.round(gl.drawingBufferHeight * this.scale));
    try {
      if (!this.blit) this.blit = this.link(VERTEX, BLIT_FRAGMENT);
      const tex = gl.createTexture();
      const fb = gl.createFramebuffer();
      if (!tex || !fb) throw new Error('no target');
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteFramebuffer(fb);
        gl.deleteTexture(tex);
        throw new Error('incomplete target');
      }
      this.target = { fb, tex, w, h };
    } catch {
      // Draw straight to the surface instead: sharper, just more fragments.
      this.target = null;
      this.scale = 1;
    }
  }

  private dropTarget() {
    if (!this.target) return;
    this.gl.deleteFramebuffer(this.target.fb);
    this.gl.deleteTexture(this.target.tex);
    this.target = null;
  }

  private loc(cache: Uniforms, program: WebGLProgram, name: string) {
    if (!(name in cache)) cache[name] = this.gl.getUniformLocation(program, name);
    return cache[name];
  }

  // ── Loop ─────────────────────────────────────────────────────────────────────────────────

  private schedule() {
    if (this.dead || !this.active || this.opts.still || this.raf != null) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private cancel() {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private safeRender() {
    try {
      this.renderFrame();
    } catch (e) {
      this.dead = true;
      this.opts.onError(e);
    }
  }

  private frame = (now: number) => {
    this.raf = null;
    if (this.dead || !this.active) return;
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
    // Cap the step so a stalled frame never makes the scene jump.
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.t += dt;
    let more = true;
    try {
      more = this.update(dt);
      this.renderFrame();
    } catch (e) {
      this.dead = true;
      this.opts.onError(e);
      return;
    }
    this.measure(raw);
    if (more) this.raf = requestAnimationFrame(this.frame);
  };

  /** Watch frame times once things are moving; step the render scale down if over budget. */
  private measure(raw: number) {
    if (this.adapted >= 2 || this.t < 0.4 || raw <= 0 || raw > 0.25) return;
    this.samples.push(raw);
    if (this.samples.length < 30) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    const next = adaptRenderScale(this.scale, mean);
    if (next !== this.scale) {
      this.scale = next;
      this.adapted++;
      if (__DEV__) console.log(`[welcome] hero render scale → ${next.toFixed(2)} (mean frame ${(mean * 1000).toFixed(1)} ms)`);
      this.makeTarget();
    } else {
      this.adapted = 2;
    }
  }

  /** Advance the simulation; false once everything is at rest. */
  private update(dt: number): boolean {
    const t = this.t;
    const introDone = this.opts.mode !== 'intro' || t > INTRO.connectedAt;

    if (introDone && !this.dragging) {
      this.idleFor += dt;
      if (this.idleFor > IDLE_S) this.clockTarget = 0;
    }
    this.clock = stepSpring(this.clock, this.clockTarget, dt, CLOCK_SPRING);
    const speed = Math.max(0, this.clock.x);
    this.phase += dt * speed;

    this.pose.x = stepSpring(this.pose.x, 0, dt, POSE_SPRING);
    this.pose.s = stepSpring(this.pose.s, 1, dt, POSE_SPRING);
    if (this.dragging) {
      this.tilt.y = { x: rubberband(this.dragging.x * 0.006, TILT_LIMIT), v: 0 };
      this.tilt.x = { x: rubberband(this.dragging.y * 0.006, TILT_LIMIT), v: 0 };
    } else {
      this.tilt.x = stepSpring(this.tilt.x, 0, dt, DRAG_SPRING);
      this.tilt.y = stepSpring(this.tilt.y, 0, dt, DRAG_SPRING);
    }
    this.boost = stepSpring(this.boost, 0, dt, BOOST_SPRING);
    // Extra motion from taps: services speed round, the material swirls with them.
    this.orbitAngle += dt * (speed + this.boost.x);
    this.swirl += dt * this.boost.x * 0.25;

    if (this.clockTarget === 0) {
      const still =
        settled(this.clock, 0, 2e-3) && settled(this.pose.x, 0) && settled(this.pose.s, 1) && settled(this.tilt.x, 0) && settled(this.tilt.y, 0) && settled(this.boost, 0, 1e-2) && !this.dragging && t - this.flashAt > 1.2;
      return !still;
    }
    return true;
  }

  private renderFrame() {
    const gl = this.gl;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const target = this.target;
    const w = target ? target.w : W;
    const h = target ? target.h : H;

    const intro = this.opts.mode === 'intro' && !this.opts.still;
    const t = this.t;
    const ignite = intro ? EASE_OUT(segment(t, INTRO.igniteAt, INTRO.igniteFor)) : 1;
    const reveal = intro ? EASE_OUT(segment(t, INTRO.revealAt, INTRO.revealFor)) : 1;
    if (intro && this.flashAt < INTRO.connectedAt - 0.01 && t >= INTRO.connectedAt) this.flashAt = INTRO.connectedAt;
    const since = t - this.flashAt;
    const flash = since >= 0 && since < 1.2 ? Math.pow(1 - since / 1.2, 2) : 0;
    const energy = Math.min(1, Math.abs(this.boost.x) / 6);

    // Ambient sway on the scene clock (so it freezes when idle), fading in after the intro.
    const swayIn = intro ? EASE_IN_OUT(segment(t, 1.4, 1.6)) : 1;
    const rx = REST.rotX + this.pose.x.x + this.tilt.x.x + Math.sin(this.phase * 0.32 + 1) * 0.05 * swayIn;
    const ry = REST.rotY + this.tilt.y.x + Math.sin(this.phase * 0.45) * 0.12 * swayIn;

    // Orbits → ring projections and service points.
    const orbits = this.opts.spec.orbits;
    this.ringM.fill(0);
    this.ringZ.fill(0);
    this.pts.fill(0);
    let pi = 0;
    for (let k = 0; k < Math.min(2, orbits.length); k++) {
      const o = orbits[k];
      const b = ringBasis(o, rx, ry);
      const inv = ringInverse(b);
      if (inv) {
        this.ringM.set(inv, k * 4);
        this.ringZ.set([b.u.z, b.v.z, o.revealFrom, 1], k * 4);
      }
      for (let j = 0; j < o.count && pi < MAX_POINTS; j++, pi++) {
        const a = o.phase + (j * Math.PI * 2) / o.count + this.orbitAngle * o.speed;
        const p = ringPoint(b, a);
        const appear = intro ? EASE_OUT(segment(t, INTRO.pointsAt + pi * INTRO.pointStep, INTRO.pointFor)) : 1;
        // Points fly in from further out as they arrive.
        const out = lerp(1.35, 1, appear);
        this.pts.set([p.x * out, p.y * out, p.z, o.size * appear * (1 + flash * 0.25)], pi * 4);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    const P = this.program;
    const u = this.u;
    const pal = this.palette;
    const v3 = (c: readonly number[]) => new Float32Array(c);
    gl.uniform2f(this.loc(u, P, 'uRes'), w, h);
    gl.uniform1f(this.loc(u, P, 'uPx'), 2 / Math.min(w, h));
    gl.uniform1f(this.loc(u, P, 'uTime'), this.phase);
    gl.uniform1f(this.loc(u, P, 'uSwirl'), this.swirl);
    gl.uniform1f(this.loc(u, P, 'uLight'), this.light ? 1 : 0);
    gl.uniform1f(this.loc(u, P, 'uScale'), this.pose.s.x);
    gl.uniform1f(this.loc(u, P, 'uIgnite'), ignite);
    gl.uniform1f(this.loc(u, P, 'uFlash'), flash);
    gl.uniform1f(this.loc(u, P, 'uEnergy'), energy);
    gl.uniform1f(this.loc(u, P, 'uReveal'), reveal);
    gl.uniform2f(this.loc(u, P, 'uTilt'), rx - REST.rotX, ry - REST.rotY);
    gl.uniform3fv(this.loc(u, P, 'uDeep'), v3(pal.deep));
    gl.uniform3fv(this.loc(u, P, 'uCore'), v3(pal.core));
    gl.uniform3fv(this.loc(u, P, 'uBright'), v3(pal.bright));
    gl.uniform3fv(this.loc(u, P, 'uGlow'), v3(pal.glow));
    gl.uniform3fv(this.loc(u, P, 'uWarm'), v3(pal.warm));
    gl.uniform3fv(this.loc(u, P, 'uInk'), v3(pal.ink));
    gl.uniform3fv(this.loc(u, P, 'uPaper'), v3(pal.paper));
    gl.uniform4fv(this.loc(u, P, 'uRingM[0]'), this.ringM);
    gl.uniform4fv(this.loc(u, P, 'uRingZ[0]'), this.ringZ);
    gl.uniform4fv(this.loc(u, P, 'uPts[0]'), this.pts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (target && this.blit) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.blit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.tex);
      gl.uniform1i(this.loc(this.bu, this.blit, 'uTex'), 0);
      gl.uniform2f(this.loc(this.bu, this.blit, 'uRes'), W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.flush();
    this.gl.endFrameEXP();
  }
}
