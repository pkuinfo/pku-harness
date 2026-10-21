/**
 * Simplified Chinese — the source dictionary, split by area so each area's strings live in one
 * file (core: shared; chat; app; welcome). Copy rules (docs/DESIGN.md): short, no exclamation
 * marks, numbers as 12.4k / 1,234 字.
 */
import { app } from './app';
import { chat } from './chat';
import { core } from './core';
import { welcome } from './welcome';

export const zhHans = { core, chat, app, welcome };

/** Shape every locale must match (string leaves only). */
type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
export type Messages = DeepString<typeof zhHans>;
