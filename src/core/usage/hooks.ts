import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { chatStore, sessionStore } from '@/core/agent/session/chat-store';
import { sessions } from '@/core/agent/session/sessions';
import { useContextBudgetSetting } from '@/core/agent/context/compaction';
import { contextBreakdown, type ContextBreakdown } from '@/core/agent/context/tokens';
import { registry } from '@/core/runtime/registry';

import { usageEvents } from './index';
import { buildReport, REPORT_WINDOW_MS, sessionCache, toolRanking, type SessionCache, type ToolRange, type ToolStat, type UsageReport } from './aggregate';
import { pricingOf } from './pricing';
import { loadRows, loadSessionChatRows, loadToolRows } from './store';
import type { UsageStep } from './types';

function subscribeAll(l: () => void) {
  const a = sessions.subscribe(l);
  const b = usageEvents.subscribe(l);
  const c = registry.subscribe(l);
  return () => {
    a();
    b();
    c();
  };
}

/**
 * A cheap fingerprint of what the breakdown depends on. Streaming tokens don't change it (message
 * and history counts move only per turn/step), so the estimate never runs per token.
 */
function signature(sessionId?: string) {
  const sid = sessionId ?? sessions.activeId();
  const s = sessionStore.get(sid) ?? (sid === sessions.activeId() ? chatStore.get() : undefined);
  const meta = sessions.get(sid);
  return `${sid}|${s?.history.length ?? 0}|${s?.messages.length ?? 0}|${s?.status ?? ''}|${meta?.providerId ?? ''}/${meta?.model ?? ''}|${usageEvents.version()}|${registry.tools().length}`;
}

/** The context breakdown of a session (default: active), recomputed only when it can change. */
export function useContextBreakdown(sessionId?: string): ContextBreakdown {
  const sig = useSyncExternalStore(subscribeAll, () => signature(sessionId));
  const userBudget = useContextBudgetSetting();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` and `userBudget` fingerprint the inputs.
  return useMemo(() => contextBreakdown(sessionId), [sig, sessionId, userBudget]);
}

export type UsageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: UsageReport; rows: UsageStep[]; toolRows: UsageStep[]; now: number };

/** Usage report for the screen: loads on focus and refreshes (debounced) when new rows land. */
export function useUsageReport() {
  const [state, setState] = useState<UsageState>({ status: 'loading' });
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const now = Date.now();
      const [rows, toolRows] = await Promise.all([loadRows(now - REPORT_WINDOW_MS), loadToolRows()]);
      if (alive.current) setState({ status: 'ready', report: buildReport(rows, now, pricingOf), rows, toolRows, now });
    } catch (e) {
      if (alive.current) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = usageEvents.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 600);
    });
    return () => {
      alive.current = false;
      off();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  return { state, reload: load };
}

/** Tool ranking for a range from the loaded rows. */
export function useToolRanking(state: UsageState, range: ToolRange): ToolStat[] {
  return useMemo(() => {
    if (state.status !== 'ready') return [];
    return toolRanking(range === 'all' ? state.toolRows : state.rows, state.now, range);
  }, [state, range]);
}

/** Prompt-cache hit rate of one session (latest chat request + whole session); refreshes on new rows. */
export function useSessionCache(sessionId: string): SessionCache | null {
  const [state, setState] = useState<{ id: string; cache: SessionCache } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadSessionChatRows(sessionId)
        .then((rows) => {
          if (alive) setState({ id: sessionId, cache: sessionCache(rows, sessionId) });
        })
        .catch(() => {});
    load();
    const off = usageEvents.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [sessionId]);
  return state?.id === sessionId ? state.cache : null;
}
