import { useEffect } from 'react';
import PhoneControl from '../../../modules/phone-control';
import { sessionStore } from '../agent/session/chat-store';
import { registry } from '../runtime/registry';
import { toolTitle } from '../runtime/localize';
import { phoneActivity } from './overlay-activity';

/** Native controls continue reporting the owning chat even after switching chats or apps. */
export function useOverlayActivity() {
  useEffect(() => {
    const native = PhoneControl;
    if (!native) return;
    let disposed = false;
    let inFlight = false;
    let dirty = false;
    let previous = '';
    const sync = async () => {
      if (disposed) return;
      if (inFlight) { dirty = true; return; }
      inFlight = true;
      try {
        do {
          dirty = false;
          const state = await native.readiness();
          if (disposed) return;
          const activity = state.sessionId ? phoneActivity(sessionStore.list().flatMap((meta) => {
            const chat = sessionStore.get(meta.id);
            return chat ? [chat] : [];
          }), state.sessionId) : null;
          const entry = activity?.toolId ? registry.tool(activity.toolId) : undefined;
          const title = entry ? toolTitle(registry.get(entry.pluginId), entry.name, entry.def.title).slice(0, 160) : '';
          const value = activity && state.sessionId ? { sessionId: state.sessionId, phase: activity.phase, title } : null;
          const key = JSON.stringify(value);
          if (key !== previous) { await native.overlayStatus(value); previous = key; }
        } while (dirty && !disposed);
      } catch { /* Status is best effort; it must never interrupt an agent operation. */ }
      finally { inFlight = false; }
    };
    const unsubscribe = sessionStore.subscribe(() => void sync());
    const timer = setInterval(() => void sync(), 1000); // Also discovers sessions started by native controls.
    void sync();
    return () => { disposed = true; clearInterval(timer); unsubscribe(); };
  }, []);
}
