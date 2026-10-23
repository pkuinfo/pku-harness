import type { MetaResponse } from '@pku-harness/cloud-protocol';
import { CloudError, type Channel, type CloudErrorCode, type CloudManifest, type CloudService, type CloudStatus, type PluginCloud } from '@pku-harness/sdk';

import type { ProviderMode } from './config';

/**
 * `ctx.cloud` / `props.cloud`: PKU Harness Cloud bound to one plugin (docs/CLOUD.md §2.1 rule 4,
 * §2.5). `HostServices` has no caller identity, so cloud access is a separate object per plugin
 * and every call is checked here, in order:
 *
 * 1. the plugin declares `cloud` in its manifest, and the service in `uses`;
 * 2. a provider is configured, and it offers the service (`/v1/meta`);
 * 3. the user allowed this plugin (`consent`). Interactive callers (screens, user taps) get the
 *    consent sheet; the agent and scheduled runs get `consent_required` with where to allow it;
 * 4. `e2e` plugins never send plaintext: store values and channel payloads are sealed by the
 *    host, and calls that would ship plaintext to the server (functions) are refused.
 *
 * Pure: the runtime (./runtime.ts) supplies the provider state and service implementations.
 */

export interface ProviderSnapshot {
  mode: ProviderMode;
  baseURL?: string;
  meta?: MetaResponse;
  online: boolean;
}

export interface ChannelsBackend {
  open(pluginId: string, opts: { ttlS: number; maxPeers?: number; page?: string; meta?: unknown }): Promise<Channel>;
  get(pluginId: string, id: string): Channel | undefined;
  list(pluginId: string): Channel[];
}

export type CloudMessage = 'notConfigured' | 'consentRequired' | 'undeclared' | 'unsupported' | 'plaintext' | 'later' | 'external';

export interface BindDeps {
  manifest(pluginId: string): CloudManifest | undefined;
  provider(): ProviderSnapshot;
  consent: { granted(pluginId: string): boolean; request(pluginId: string): Promise<boolean> };
  store(pluginId: string, manifest: CloudManifest): PluginCloud['store'];
  channels(): ChannelsBackend | undefined;
  /** Run a server function of this plugin (docs/CLOUD-FUNCTIONS.md); absent until the runtime has a client. */
  functions?(pluginId: string, name: string, input: unknown, signal?: AbortSignal): Promise<unknown>;
  /** Localised error text. */
  message(key: CloudMessage, vars: { plugin: string; service?: string }): string;
}

/** The bound client plus host-only extras the SDK doesn't type yet. */
export type BoundCloud = PluginCloud & {
  /** Show the consent sheet for this plugin; resolves true when allowed. */
  requestConsent(): Promise<boolean>;
};

const CODE: Record<CloudMessage, CloudErrorCode> = {
  notConfigured: 'not_configured',
  consentRequired: 'consent_required',
  undeclared: 'protocol',
  unsupported: 'not_configured',
  plaintext: 'protocol',
  later: 'not_configured',
  external: 'not_configured',
};

export function createPluginCloud(pluginId: string, deps: BindDeps, opts: { interactive: boolean }): BoundCloud {
  const fail = (key: CloudMessage, service?: string): never => {
    throw new CloudError(CODE[key], deps.message(key, { plugin: pluginId, service }));
  };

  /** Checks 1, 2 and 4's manifest part; no consent. Returns the manifest. */
  const check = (service: CloudService): CloudManifest => {
    const manifest = deps.manifest(pluginId);
    if (!manifest || !manifest.uses.includes(service)) return fail('undeclared', service);
    if (manifest.backend?.kind === 'external') return fail('external', service);
    const p = deps.provider();
    if (p.mode === 'off' || !p.baseURL) return fail('notConfigured', service);
    if (p.meta && !p.meta.services.includes(service)) return fail('unsupported', service);
    return manifest;
  };

  const guard = async (service: CloudService): Promise<CloudManifest> => {
    const manifest = check(service);
    if (!deps.consent.granted(pluginId)) {
      const allowed = opts.interactive ? await deps.consent.request(pluginId) : false;
      if (!allowed) return fail('consentRequired', service);
    }
    return manifest;
  };

  /** Synchronous variant for lookups: no prompt, nothing when not allowed. */
  const allowedSync = (service: CloudService) => {
    try {
      check(service);
    } catch {
      return false;
    }
    return deps.consent.granted(pluginId);
  };

  const status = (): CloudStatus => {
    const p = deps.provider();
    return { provider: p.mode, baseURL: p.baseURL, consented: deps.consent.granted(pluginId), online: p.online };
  };

  const store: PluginCloud['store'] = {
    get: async (key) => deps.store(pluginId, await guard('store')).get(key),
    put: async (key, value, o) => deps.store(pluginId, await guard('store')).put(key, value, o),
    delete: async (key) => deps.store(pluginId, await guard('store')).delete(key),
    list: async (prefix) => deps.store(pluginId, await guard('store')).list(prefix),
  };

  const backend = () => deps.channels() ?? fail('notConfigured', 'channels');

  return {
    get available() {
      const manifest = deps.manifest(pluginId);
      const p = deps.provider();
      if (!manifest || p.mode === 'off' || !p.baseURL || !p.online || !deps.consent.granted(pluginId)) return false;
      if (manifest.backend?.kind === 'external') return false;
      return !p.meta || manifest.uses.every((s) => p.meta!.services.includes(s));
    },
    status,
    store,
    channels: {
      open: async (o) => {
        await guard('channels');
        return backend().open(pluginId, o);
      },
      get: (id) => (allowedSync('channels') ? deps.channels()?.get(pluginId, id) : undefined),
      list: () => (allowedSync('channels') ? (deps.channels()?.list(pluginId) ?? []) : []),
    },
    push: {
      schedule: async () => {
        await guard('push');
        return fail('later', 'push');
      },
      cancel: async () => {
        await guard('push');
        return fail('later', 'push');
      },
    },
    functions: {
      invoke: async (name, input, o) => {
        const manifest = await guard('functions');
        // Server functions read their input in plaintext: an e2e plugin promised that never happens.
        if (manifest.e2e) return fail('plaintext', 'functions');
        if (!deps.functions) return fail('notConfigured', 'functions');
        return deps.functions(pluginId, name, input, o?.signal);
      },
    },
    requestConsent: async () => {
      if (deps.consent.granted(pluginId)) return true;
      if (!deps.manifest(pluginId)) return false;
      return deps.consent.request(pluginId);
    },
  };
}

// --- runtime slot ---------------------------------------------------------------------------

let runtimeDeps: BindDeps | null = null;

/** Installed once by the cloud runtime at boot (keeps this module free of native imports). */
export function setBindDeps(deps: BindDeps | null) {
  runtimeDeps = deps;
}

/**
 * The cloud client for a plugin, or undefined when it declares no `cloud` (or the runtime isn't
 * installed). `interactive`: a person is driving (screen, user tap), so a missing consent
 * opens the consent sheet instead of failing.
 */
export function cloudFor(pluginId: string, opts: { interactive: boolean } = { interactive: false }): BoundCloud | undefined {
  if (!runtimeDeps || !runtimeDeps.manifest(pluginId)) return undefined;
  return createPluginCloud(pluginId, runtimeDeps, opts);
}
