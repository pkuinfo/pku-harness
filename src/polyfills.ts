// Globals the AI SDK expects that Hermes doesn't ship (AI SDK Expo guide, "Polyfills").
import { TextDecoderStream, TextEncoderStream } from '@stardazed/streams-text-encoding';
import structuredClone from '@ungap/structured-clone';

const g = globalThis as Record<string, unknown>;
if (!('structuredClone' in g)) g.structuredClone = structuredClone;
if (!('TextEncoderStream' in g)) g.TextEncoderStream = TextEncoderStream;
if (!('TextDecoderStream' in g)) g.TextDecoderStream = TextDecoderStream;

export {};
