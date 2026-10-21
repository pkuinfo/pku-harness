/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BLIT_FRAGMENT, MAIN, PRELUDE, VERTEX } from '../glsl';
import { DEFAULT_HERO, heroVariants, parseHeroVariant } from './index';

describe('hero variants', () => {
  test('preview param parsing falls back to the default', () => {
    expect(parseHeroVariant('silk')).toBe('silk');
    expect(parseHeroVariant(['eclipse'])).toBe('eclipse');
    expect(parseHeroVariant('toString')).toBe(DEFAULT_HERO);
    expect(parseHeroVariant('nope')).toBe(DEFAULT_HERO);
    expect(parseHeroVariant(undefined)).toBe(DEFAULT_HERO);
  });

  test('specs stay within the shader limits', () => {
    for (const v of Object.values(heroVariants)) {
      expect(v.orbits.length).toBeLessThanOrEqual(2);
      expect(v.orbits.reduce((n, o) => n + o.count, 0)).toBeLessThanOrEqual(8);
      expect(v.fragment).toContain('vec4 hero(vec2 uv)');
    }
  });

  // Compiles every shader as GLSL ES 1.00 when glslangValidator is installed (Arch: glslang),
  // so a typo fails here instead of as a silent 2D fallback on the device.
  const glslang = spawnSync('glslangValidator', ['--version']).status === 0;
  test.skipIf(!glslang)('shaders compile as GLSL ES 1.00', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hero-glsl-'));
    const files: Record<string, string> = { 'hero.vert': VERTEX, 'blit.frag': BLIT_FRAGMENT };
    for (const [name, v] of Object.entries(heroVariants)) files[`${name}.frag`] = PRELUDE + v.fragment + MAIN;
    for (const [file, src] of Object.entries(files)) {
      const path = join(dir, file);
      writeFileSync(path, `#version 100\n${src}`);
      const r = spawnSync('glslangValidator', [path], { encoding: 'utf8' });
      expect({ file, ok: r.status === 0, log: r.status === 0 ? '' : r.stdout }).toEqual({ file, ok: true, log: '' });
    }
  });
});
