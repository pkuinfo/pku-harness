import type { OngoingHandle, OngoingOptions } from '@pku-harness/sdk';
import { Platform } from 'react-native';
import notifee, { AndroidForegroundServiceType, AndroidImportance, AndroidVisibility, EventType, type Event } from 'react-native-notify-kit';

import { t } from '@/i18n';

/**
 * `services.ongoing` (docs/CLOUD.md §1.3, §3.2): an Android foreground service of type
 * `dataSync` with an ongoing notification ("正在共享付款码 · 剩 28:12 · 停止"), so a live share
 * keeps its socket while the app is in the background. Declared in app.json through the
 * notify-kit config plugin (adds FOREGROUND_SERVICE_DATA_SYNC). Android 15 caps dataSync at 6 h a
 * day, plenty for shares.
 *
 * notify-kit runs one foreground service with one registered runner (src/core/scheduler/
 * background.ts). That runner hands ongoing notifications to `ongoingRunner`, which stays pending
 * until the activity stops; the scheduler's own short runs skip their service while one is active.
 * One ongoing activity at a time: starting another ends the previous one.
 */

export const ONGOING_PREFIX = 'ongoing:';
const CHANNEL = 'ongoing';
const STOP_ACTION = 'ongoing-stop';

type Active = { id: string; opts: OngoingOptions; title: string; body?: string; timer: ReturnType<typeof setTimeout> | null; release: (() => void) | null };

let active: Active | null = null;
let seq = 0;
let channelReady: Promise<string> | null = null;
let foregroundWired = false;

export const isOngoingActive = () => active !== null;
export const isOngoingEvent = (e: Event) => !!e.detail.notification?.id?.startsWith(ONGOING_PREFIX);

function ensureChannel() {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('app.cloud.ongoing.channel'),
    description: t('app.cloud.ongoing.channelDescription'),
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PUBLIC,
    vibration: false,
  });
  return channelReady;
}

async function display(a: Active) {
  await ensureChannel();
  await notifee.displayNotification({
    id: a.id,
    title: a.title,
    body: a.body,
    android: {
      channelId: CHANNEL,
      importance: AndroidImportance.LOW,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      ongoing: true,
      onlyAlertOnce: true,
      // Countdown to the end of the activity.
      ...(a.opts.until ? { showChronometer: true, chronometerDirection: 'down' as const, timestamp: a.opts.until } : null),
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: a.opts.stopLabel ?? t('app.cloud.ongoing.stop'), pressAction: { id: STOP_ACTION } }],
    },
  });
}

/** Called by the single foreground-service runner for ongoing notifications: pending until stopped. */
export function ongoingRunner(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!active) return resolve();
    active.release = resolve;
  });
}

function end(a: Active, notify: boolean) {
  if (active !== a) return;
  active = null;
  if (a.timer) clearTimeout(a.timer);
  a.release?.();
  void notifee.stopForegroundService().catch(() => {});
  void notifee.cancelNotification(a.id).catch(() => {});
  if (notify) {
    try {
      a.opts.onStop?.();
    } catch (e) {
      console.warn('ongoing onStop failed', e);
    }
  }
}

/** Stop-button presses, the type timeout, the run limit (foreground and background events). */
export function handleOngoingEvent(e: Event): boolean {
  if (!isOngoingEvent(e) || !active || e.detail.notification?.id !== active.id) return false;
  const stop = (e.type === EventType.ACTION_PRESS && e.detail.pressAction?.id === STOP_ACTION) || e.type === EventType.FG_TIMEOUT || e.type === EventType.FG_RUN_LIMIT_REACHED;
  if (stop) end(active, true);
  return stop;
}

function wireForegroundEvents() {
  if (foregroundWired) return;
  foregroundWired = true;
  notifee.onForegroundEvent((e) => void handleOngoingEvent(e));
}

export function startOngoing(opts: OngoingOptions): OngoingHandle {
  if (Platform.OS !== 'android') throw new Error('ongoing activities need Android');
  if (active) end(active, true);
  wireForegroundEvents();
  const a: Active = { id: `${ONGOING_PREFIX}${++seq}`, opts, title: opts.title, body: opts.body, timer: null, release: null };
  active = a;
  if (opts.until) a.timer = setTimeout(() => end(a, true), Math.max(0, opts.until - Date.now()));
  display(a).catch((e) => {
    console.warn('ongoing foreground service failed to start', e);
    end(a, true);
  });
  return {
    update(p) {
      if (active !== a) return;
      if (p.title !== undefined) a.title = p.title;
      if (p.body !== undefined) a.body = p.body;
      display(a).catch(() => {});
    },
    stop() {
      end(a, false);
    },
  };
}

/** `HostServices.ongoing`, present on Android only (capability 'ongoing'). */
export const ongoingService = Platform.OS === 'android' ? { start: startOngoing } : undefined;
