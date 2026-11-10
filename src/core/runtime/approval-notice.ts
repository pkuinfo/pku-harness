import { AppState } from 'react-native';

import { dismissPresented, notifyNow } from '@/core/notify';
import { pluginName, toolTitle } from '@/core/runtime/localize';
import { t } from '@/i18n';

import { approvals } from './approvals';
import { registry } from './registry';

const KIND = 'approval';
let started = false;
let shownFor: number | null = null;
let pending: number | null = null;
const MIRROR_GRACE_MS = 1500;

function post(req: NonNullable<ReturnType<typeof approvals.current>>) {
  shownFor = req.id;
  const plugin = registry.get(req.entry.pluginId);
  const action = req.entry.def.grant && req.assessment?.target
    ? t('chat.approval.noticeGrant', { plugin: plugin ? pluginName(plugin) : req.entry.pluginId, app: req.assessment.target.label })
    : toolTitle(plugin, req.entry.name, req.entry.def.title);
  void dismissPresented(KIND)
    .then(() => notifyNow({ title: t('chat.approval.noticeTitle'), body: action, url: '/', data: { kind: KIND }, channel: 'alerts' }))
    .catch(() => {});
}

/**
 * An "ask first" request that waits while Harness is in the background would otherwise go unseen
 * until the user happens to reopen the app (Copilot's floating controls show only requests of a
 * running phone session). This posts one notification per such request; tapping it opens the app,
 * where the prompt is waiting. It is cleared once the request is answered or the app comes back.
 * `mirrored` says whether the floating controls already show the request.
 */
export function startApprovalNotice(mirrored: (id: number) => boolean = () => false) {
  if (started) return;
  started = true;
  const sync = () => {
    const req = approvals.current();
    const background = AppState.currentState !== 'active';
    if (req && background && !mirrored(req.id)) {
      if (shownFor === req.id || pending === req.id) return;
      // Let the floating controls take it first (their mirror reads the phone state asynchronously).
      pending = req.id;
      setTimeout(() => {
        pending = null;
        const still = approvals.current();
        if (still?.id !== req.id || AppState.currentState === 'active' || mirrored(req.id) || shownFor === req.id) return;
        post(req);
      }, MIRROR_GRACE_MS);
    } else if (shownFor !== null && (!req || !background || req.id !== shownFor)) {
      shownFor = null;
      void dismissPresented(KIND).catch(() => {});
    }
  };
  approvals.subscribe(sync);
  AppState.addEventListener('change', sync);
}
