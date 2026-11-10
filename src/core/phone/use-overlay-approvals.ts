import { useEffect } from 'react';
import { AppState } from 'react-native';
import PhoneControl from '../../../modules/phone-control';
import { approvals } from '../runtime/approvals';
import { registry } from '../runtime/registry';
import { pluginName, toolTitle } from '../runtime/localize';
import { t } from '@/i18n';
import { OverlayWriter } from './overlay-writer';
import { stopPhoneRun } from './service';

const writer = new OverlayWriter();
let started = false;

/**
 * The phone session an approval belongs to: its sessionId argument. A grant (copilot.requestApp)
 * may omit it; it then widens whichever session is running, so it shows on that session's controls.
 */
let runningSession: string | null = null;
function overlaySession(req: ReturnType<typeof approvals.current>): string | null {
  const input = req?.input as Record<string, unknown> | undefined;
  if (typeof input?.sessionId === 'string') return input.sessionId;
  return req?.entry.def.grant ? runningSession : null;
}

/**
 * Mirror the existing approval queue into native controls while Harness is backgrounded. Runs for
 * the life of the JS runtime, not of a screen: Back destroys the activity and unmounts React while
 * the agent keeps working, and its approvals must still reach the floating controls.
 */
export function startOverlayApprovals() {
  const native = PhoneControl;
  if (!native || started) return;
  started = true;
  const owner = writer.attach(() => native.overlayApproval(null));
  const mirror = async (current: () => boolean) => {
    const req = approvals.current();
    const input = req?.input as Record<string, unknown> | undefined;
    const state = await native.readiness();
    if (!current()) return;
    runningSession = state.sessionId;
    const sessionId = overlaySession(req);
    const eligible = AppState.currentState !== 'active' && req?.entry.pluginId === 'copilot'
      && !!sessionId && sessionId === state.sessionId;
    const plugin = req ? registry.get(req.entry.pluginId) : undefined;
    // A grant (copilot.requestApp) names the app it adds. The floating controls have only
    // Allow / Deny, so Allow there means once; Always allow is offered in the app.
    const grant = req?.entry.def.grant ? req.assessment?.target : undefined;
    const detail = grant ? [grant.context, t('chat.approval.grantOverlayDetail')].filter(Boolean).join('\n')
      : [req?.assessment?.target?.label, req?.assessment?.target?.context,
        ...Object.entries(input ?? {}).filter(([key]) => !['sessionId', 'snapshotId', 'ref'].includes(key))
          .map(([key, value]) => `${key}: ${String(value).slice(0, 300)}`)].filter(Boolean).join('\n');
    const title = !req ? '' : grant
      ? t('chat.approval.grantOverlayTitle', { plugin: plugin ? pluginName(plugin) : req.entry.pluginId, app: grant.label })
      : toolTitle(plugin, req.entry.name, req.entry.def.title);
    await native.overlayApproval(eligible ? { id: req.id, sessionId: sessionId!, title, detail } : null);
  };
  const sync = () => { void owner.update(mirror); };
  // Retry missed writes/clears without superseding a slower in-flight read or native call.
  setInterval(() => { void owner.retry(mirror); }, 2000);
  native.addListener('onControlStopped', ({ sessionId }) => stopPhoneRun(sessionId));
  native.addListener('onOverlayAnswer', (event) => {
    const req = approvals.current();
    if (req?.id === event.id && req.entry.pluginId === 'copilot' && overlaySession(req) === event.sessionId) {
      void approvals.answer(req.id, event.allowed);
    }
  });
  approvals.subscribe(sync);
  AppState.addEventListener('change', sync);
  sync();
}

/** Starts the mirror from the root layout; it outlives the component. */
export function useOverlayApprovals() {
  useEffect(() => startOverlayApprovals(), []);
}
