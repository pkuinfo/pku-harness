import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const native = fileURLToPath(new URL('../../../modules/phone-control/android/', import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(kt|aidl|xml)$/.test(entry.name) ? [path] : [];
  });
}

test('Copilot source, manifest and helper entry points do not call Mika packages', () => {
  const files = [...sources(join(native, 'src/main')), join(native, 'consumer-rules.pro')];
  expect(files.length).toBeGreaterThan(0);
  const foreign = files.filter((file) => readFileSync(file, 'utf8').includes('com.wangzan101.mika'));
  expect(foreign).toEqual([]);
});

test('the phone session core does not depend on Expo or Android implementation packages', () => {
  const core = sources(join(native, 'src/main/java/org/pkuinfo/harness/phone/core'));
  expect(core.length).toBeGreaterThan(0);
  for (const file of core) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/^import (android\.|expo\.|org\.pkuinfo\.harness\.phone\.(?!core\.))/m);
  }
});
