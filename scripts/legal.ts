/**
 * Bundles docs/legal/*.md (the Terms of Service and Privacy Policy, also published on the
 * website) into src/core/legal/documents.generated.ts so the app can show them offline.
 * Run after editing them: `bun scripts/legal.ts`. A test fails when the bundle is stale.
 */
import { renderLegal } from '../src/core/legal/render';

await Bun.write(new URL('../src/core/legal/documents.generated.ts', import.meta.url), await renderLegal());
