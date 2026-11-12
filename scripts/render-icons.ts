// Render the brand mark (src/theme/brand.ts) into the PNG assets app.json points at.
// Usage: bun scripts/render-icons.ts   (needs the @resvg/resvg-js dev dependency)
import { Resvg } from '@resvg/resvg-js';

import { brand, logoSvg } from '../src/theme/brand';

const out = (name: string, svg: string, size: number) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  Bun.write(`assets/images/${name}`, png);
  console.log(`assets/images/${name}`, size);
};

// iOS / store icon: full tile.
out('icon.png', logoSvg({ tile: true }), 1024);
// Android adaptive icon: mark on transparent (safe zone = inner 66%), tile colour as background.
out('android-icon-foreground.png', logoSvg({ tile: false, inset: 14, color: brand.white }), 1024);
out('android-icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${brand.primary}"/></svg>`, 1024);
out('android-icon-monochrome.png', logoSvg({ tile: false, mono: true, inset: 14 }), 1024);
// Splash: tile at a modest size on the dark canvas.
out('splash-icon.png', logoSvg({ tile: true }), 512);
out('favicon.png', logoSvg({ tile: true }), 96);
