/** Build the approved identity from one path; --sync-related updates sibling website/profile assets. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { brand, logoSvg } from '../src/theme/brand';

const root = resolve(import.meta.dir, '..');
const output = resolve(root, 'assets/brand');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'LICENSE-Inter.txt'), readFileSync(resolve(root, 'node_modules/@expo-google-fonts/inter/LICENSE_FONT')));
const font = { loadSystemFonts: false, fontFiles: [resolve(root, 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf')] };
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const mark = (color: string) => `<path d="${brand.path}" fill="${color}" fill-rule="evenodd"/>`;
const label = (x: number, y: number, size: number, color: string, text = brand.name) => `<text x="${x}" y="${y}" font-family="Inter" font-weight="600" font-size="${size}" fill="${color}">${text}</text>`;
const exportAsset = (name: string, source: string) => {
  const renderer = new Resvg(source, { font });
  // Resolve text into outlines so wordmarks have no host-font dependency.
  writeFileSync(resolve(output, `${name}.svg`), renderer.toString().replace(/(<svg\b[^>]*>)/, '$1<title>PKU harness</title>'));
  writeFileSync(resolve(output, `${name}.png`), renderer.render().asPng());
};
for (const [name, color] of [['red', brand.primary], ['white', brand.white], ['black', brand.charcoal]] as const) {
  exportAsset(`mark-${name}`, logoSvg({ tile: false, color, size: 512 }));
  exportAsset(`lockup-${name}`, svg(720, 160, `<g transform="translate(4 0) scale(1.33)">${mark(color)}</g>${label(175, 103, 74, color)}`));
  exportAsset(`stacked-${name}`, svg(560, 360, `<g transform="translate(160 4) scale(2)">${mark(color)}</g>${label(67, 311, 60, color)}`));
}
exportAsset('icon', logoSvg());
const preview = svg(1200, 720, `<rect width="1200" height="720" rx="24" fill="${brand.ivory}"/>
${label(48, 58, 23, brand.charcoal, 'PKU harness / Little swallow')}
<g transform="translate(36 100) scale(2.65)">${mark(brand.primary)}</g>
<g transform="translate(410 150)">${mark(brand.primary)}</g>${label(545, 228, 64, brand.charcoal)}
<rect x="48" y="465" width="190" height="190" rx="44" fill="${brand.primary}"/>
<g transform="translate(48 465) scale(1.5833)">${mark(brand.white)}</g>
<rect x="285" y="465" width="867" height="190" rx="28" fill="${brand.charcoal}"/>
<g transform="translate(310 483) scale(1.3)">${mark(brand.white)}</g>${label(492, 580, 72, brand.white)}
${[16,24,32,48].map((size, i) => `<g transform="translate(${470+i*100} 340) scale(${size/120})">${mark(brand.primary)}</g>${label(470+i*100, 419, 14, brand.charcoal, `${size} px`)}`).join('')}`);
exportAsset('identity-preview', preview);

// Icon Composer uses the same white mark; remove the starter Expo artwork from its layer list.
const composer = resolve(root, 'assets/expo.icon');
writeFileSync(resolve(composer, 'Assets/swallow.svg'), logoSvg({ tile: false, mono: true, size: 1024 }));
const config = JSON.parse(readFileSync(resolve(composer, 'icon.json'), 'utf8'));
config.fill = { solid: 'srgb:0.54510,0.00000,0.07059,1.00000' };
config.groups = [{ layers: [{ 'image-name': 'swallow.svg', name: 'Little swallow' }], translucency: { enabled: false, value: 0 } }];
writeFileSync(resolve(composer, 'icon.json'), `${JSON.stringify(config, null, 2)}\n`);

if (process.argv.includes('--sync-related')) {
  const website = resolve(root, '../pkuharness-website');
  if (existsSync(resolve(website, 'package.json'))) {
    mkdirSync(resolve(website, 'public/brand'), { recursive: true });
    for (const name of ['icon', 'mark-red', 'mark-white', 'lockup-red', 'lockup-white', 'lockup-black']) {
      writeFileSync(resolve(website, `public/brand/${name}.svg`), readFileSync(resolve(output, `${name}.svg`)));
    }
    for (const target of ['public/icon.png', 'src/app/icon.png']) {
      writeFileSync(resolve(website, target), readFileSync(resolve(output, 'icon.png')));
    }
  }
  const profile = resolve(root, '../org-profile');
  if (existsSync(resolve(profile, 'profile/README.md'))) {
    writeFileSync(resolve(profile, 'avatar.svg'), logoSvg());
    writeFileSync(resolve(profile, 'avatar.png'), readFileSync(resolve(output, 'icon.png')));
    writeFileSync(resolve(profile, 'profile/avatar.svg'), logoSvg());
    writeFileSync(resolve(profile, 'profile/avatar.png'), readFileSync(resolve(output, 'icon.png')));
    for (const mode of ['light', 'dark']) {
      const path = resolve(profile, `profile/banner-${mode}.svg`);
      const old = readFileSync(path, 'utf8');
      const legacyStart = old.indexOf('<g transform="translate(120 120) scale(1.333)">');
      const start = legacyStart >= 0 ? legacyStart : old.indexOf('<svg x="120" y="120" ');
      const end = old.indexOf('  <text x="330"', start);
      if (start < 0 || end < 0) throw new Error(`Profile banner structure changed: ${path}`);
      const tile = logoSvg({ size: 160 }).replace('<svg ', '<svg x="120" y="120" ');
      const updated = old.slice(0, start) + tile + '\n' + old.slice(end);
      writeFileSync(path, updated);
      writeFileSync(resolve(profile, `profile/banner-${mode}.png`), new Resvg(updated, { font: { loadSystemFonts: true } }).render().asPng());
    }
  }
}
console.log('Brand SVG/PNG assets generated.');
