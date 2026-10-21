import type { Messages } from '../zh-Hans';

import { app } from './app';
import { chat } from './chat';
import { core } from './core';
import { welcome } from './welcome';

/** English. Must match the zh-Hans keys exactly (enforced by the Messages type). */
export const en: Messages = { core, chat, app, welcome };
