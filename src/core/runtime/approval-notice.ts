import { AppState } from 'react-native';

import { dismissPresented, notifyNow } from '@/core/notify';
import { pluginName, toolTitle } from '@/core/runtime/localize';
import { t } from '@/i18n';

import { approvals, type Approval } from './approvals';
import { registry } from './registry';

const KIND = 'approval';
let started = false;
let shownFor: number | null = null;

function post(req: Approval) {
  if (shownFor === req.id || AppState.currentState === 'active') return;
  shownFor = req.id;
  const plugin = registry.get(req.entry.pluginId);
  const action = req.entry.def.grant && req.assessment?.target
    ? t('chat.approval.noticeGrant', { plugin: plugin ? pluginName(plugin) : req.entry.pluginId, app: req.assessment.target.label })
    : toolTitle(plugin, req.entry.name, req.entry.def.title);
  void dismissPresented(KIND)
    .then(() => notifyNow({ title: t('chat.approval.noticeTitle'), body: action, url: '/', data: { kind: KIND }, channel: 'alerts' }))
    .catch((e) => console.warn('[approval-notice] could not post', e));
}

/**
 * Called by Copilot's floating-controls mirror when it can't show a request (no phone session
 * running yet, or another session's): the notification is the only way the person sees it.
 */
export const noticeUnmirrored = (req: Approval) => post(req);

/**
 * An "ask first" request that waits while Harness is in the background would otherwise go unseen
 * until the user happens to reopen the app. This posts one notification per such request; tapping
 * it opens the app, where the prompt is waiting. It is cleared once the request is answered or the
 * app comes back. Requests `deferTo` claims (Copilot's, when the floating controls may show them)
 * are left to that mirror, which calls `noticeUnmirrored` when it can't. No timers: React Native
 * pauses them while the app is in the background.
 */
export function startApprovalNotice(deferTo: (req: Approval) => boolean = () => false) {
  if (started) return;
  started = true;
  const sync = () => {
    const req = approvals.current();
    const background = AppState.currentState !== 'active';
    if (req && background) {
      if (!deferTo(req)) post(req);
    } else if (shownFor !== null && (!req || !background || req.id !== shownFor)) {
      shownFor = null;
      void dismissPresented(KIND).catch(() => {});
    }
  };
  approvals.subscribe(sync);
  AppState.addEventListener('change', sync);
}
