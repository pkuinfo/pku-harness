import { expect, test } from 'bun:test';
import { assertToolPermission, authorizeTool, ToolPermissionDenied } from './tool-authorization';

const state = () => ({ enabled: true, modes: { read: 'auto', write: 'auto', public: 'ask', money: 'off' } as const });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('revoking a category during classification prevents a prompt or dispatch', async () => {
  let settings = state();
  const classification = deferred<unknown>();
  let prompts = 0;
  const authorization = authorizeTool({ base: 'write', actor: 'agent', state: () => settings,
    classify: () => classification.promise, ask: async () => { prompts++; return true; } });
  settings = { ...settings, enabled: false };
  classification.resolve('public');
  await expect(authorization).rejects.toMatchObject({ reason: 'disabled' });
  expect(prompts).toBe(0);
});

test('a previous approval cannot override permissions revoked while the prompt was open', async () => {
  let settings: { enabled: boolean; modes: Record<'read' | 'write' | 'public' | 'money', 'auto' | 'ask' | 'off'> } = state();
  const decision = deferred<boolean>();
  const prompted = deferred<void>();
  const authorization = authorizeTool({ base: 'write', actor: 'agent', state: () => settings,
    classify: async () => 'public', ask: () => { prompted.resolve(); return decision.promise; } });
  await prompted.promise;
  settings = { ...settings, modes: { ...settings.modes, public: 'off' } };
  decision.resolve(true);
  await expect(authorization).rejects.toMatchObject({ reason: 'blocked' });
});

test('two ask categories produce one prompt bound to the observed target', async () => {
  const settings = { ...state(), modes: { ...state().modes, write: 'ask' as const } };
  const assessment = { effect: 'public', target: { label: 'Send', context: 'chat.app' } } as const;
  let prompts = 0;
  const result = await authorizeTool({ base: 'write', actor: 'agent', state: () => settings,
    classify: async () => assessment, ask: async (effect, observed) => {
      prompts++; expect(effect).toBe('public'); expect(observed).toEqual(assessment); return true;
    } });
  expect(result.approved).toBe(true);
  expect(prompts).toBe(1);
});

test('scheduler and direct user calls retain their existing restrictions', async () => {
  const settings = state();
  expect(() => assertToolPermission(settings, 'read', 'public', 'scheduler', true)).toThrow(ToolPermissionDenied);
  expect(() => assertToolPermission(settings, 'write', 'money', 'user', true)).toThrow(ToolPermissionDenied);
  expect(() => assertToolPermission(settings, 'write', 'public', 'user', true)).not.toThrow();
  expect(() => assertToolPermission(settings, 'write', 'public', 'agent', false)).toThrow(ToolPermissionDenied);
});

test('turning ask on at the final dispatch boundary requires fresh approval', () => {
  expect(() => assertToolPermission(state(), 'write', 'public', 'agent', false)).toThrow(ToolPermissionDenied);
  expect(() => assertToolPermission({ ...state(), enabled: false }, 'write', 'write', 'agent', true)).toThrow(ToolPermissionDenied);
});

test('a grant tool asks the agent every time, even when its effect is set to auto', async () => {
  let prompts = 0;
  const ask = (answer: boolean | 'always') => async () => { prompts++; return answer; };
  const once = await authorizeTool({ base: 'write', actor: 'agent', grant: true, state, ask: ask(true) });
  expect(once).toMatchObject({ approved: true, grant: 'once' });
  const always = await authorizeTool({ base: 'write', actor: 'agent', grant: true, state, ask: ask('always') });
  expect(always.grant).toBe('always');
  expect(prompts).toBe(2);
  await expect(authorizeTool({ base: 'write', actor: 'agent', grant: true, state, ask: ask(false) })).rejects.toMatchObject({ reason: 'declined' });
  // The same tool without grant runs on 'auto' with no prompt and no grant.
  const plain = await authorizeTool({ base: 'write', actor: 'agent', state, ask: ask(true) });
  expect(plain.grant).toBeUndefined();
  expect(prompts).toBe(3);
});

test('a grant cannot be taken by the scheduler, skipped at dispatch, or used when blocked', async () => {
  await expect(authorizeTool({ base: 'read', actor: 'scheduler', grant: true, state, ask: async () => true })).rejects.toMatchObject({ reason: 'scheduledAsk' });
  expect(() => assertToolPermission(state(), 'write', 'write', 'agent', false, true)).toThrow(ToolPermissionDenied);
  const blocked = () => ({ ...state(), modes: { ...state().modes, write: 'off' as const } });
  await expect(authorizeTool({ base: 'write', actor: 'agent', grant: true, state: blocked, ask: async () => true })).rejects.toMatchObject({ reason: 'blocked' });
  // A person calling the tool from a screen needs no prompt and gets no grant answer.
  expect((await authorizeTool({ base: 'write', actor: 'user', grant: true, state, ask: async () => true })).grant).toBeUndefined();
});

test('an alwaysAsk tool asks the agent every time but is not a grant', async () => {
  let prompts = 0;
  const ask = (answer: boolean | 'always') => async () => { prompts++; return answer; };
  const allowed = await authorizeTool({ base: 'write', actor: 'agent', alwaysAsk: true, state, ask: ask('always') });
  expect(allowed).toMatchObject({ approved: true });
  expect(allowed.grant).toBeUndefined();
  await authorizeTool({ base: 'write', actor: 'agent', alwaysAsk: true, state, ask: ask(true) });
  expect(prompts).toBe(2);
  await expect(authorizeTool({ base: 'write', actor: 'agent', alwaysAsk: true, state, ask: ask(false) })).rejects.toMatchObject({ reason: 'declined' });
  await expect(authorizeTool({ base: 'write', actor: 'scheduler', alwaysAsk: true, state, ask: ask(true) })).rejects.toMatchObject({ reason: 'scheduledWrite' });
  expect(() => assertToolPermission(state(), 'write', 'write', 'agent', false, true)).toThrow(ToolPermissionDenied);
});
