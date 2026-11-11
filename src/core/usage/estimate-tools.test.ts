import { describe, expect, test } from 'bun:test';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';

import { estimateTools } from './estimate';

const input = z.object({ query: z.string().describe('What to look for in the campus card history'), limit: z.number().int().optional() });

// Estimates are cached per tool name + description, so each case uses its own name.
describe('estimateTools', () => {
  test('counts the input schema of a cached SDK wrapper, not just name and description', () => {
    const bare = estimateTools({ findBare: tool({ description: 'Find', inputSchema: zodSchema(z.object({})) }) });
    const wrapped = estimateTools({ findWrapped: tool({ description: 'Find', inputSchema: zodSchema(input) }) });
    expect(wrapped).toBeGreaterThan(bare + 10);
  });

  test('a raw zod schema counts its fields too', () => {
    expect(estimateTools({ rawFull: tool({ description: 'A', inputSchema: input }) })).toBeGreaterThan(estimateTools({ rawEmpty: tool({ description: 'A', inputSchema: z.object({}) }) }) + 10);
  });
});
