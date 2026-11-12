import { AudioModule } from 'expo-audio';
import type { EventSubscription } from 'expo-modules-core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AgentOrbit } from '@/components/agent-orbit';
import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import { speechConfig } from '@/core/speech/config';
import { startDictation, type Dictation } from '@/core/speech/dictation';
import { t, useT } from '@/i18n';
import { typography, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';
import VoiceCapture from '../../../../modules/voice-capture';

import { MAX_LINES } from './logic';
import { composerToast } from './toast';
import { clock, MAX_VOICE_MS, pushLevel, WAVE_BARS } from './voice-logic';

export type VoicePhase = 'idle' | 'recording' | 'transcribing';

const SILENT = 0.08;

/**
 * Dictation (Claude-style): the mic streams to the user's own speech service, the words appear
 * while they talk, ✓ puts the transcript in the draft for editing, ✕ throws it away.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [levels, setLevels] = useState<number[]>(() => pushLevel([], SILENT));
  const [durationMs, setDurationMs] = useState(0);
  const [live, setLive] = useState('');
  const state = useRef<VoicePhase>('idle');
  const session = useRef<{ dictation: Dictation | null; queue: { data: string; level: number }[]; sub: EventSubscription | null; errorSub: EventSubscription | null; timer: ReturnType<typeof setInterval> | null } | null>(null);

  const enter = useCallback((next: VoicePhase) => {
    state.current = next;
    setPhase(next);
  }, []);

  const stopCapture = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
    s.sub?.remove();
    s.sub = null;
    s.errorSub?.remove();
    s.errorSub = null;
    await VoiceCapture?.stop().catch(() => {});
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      void stopCapture();
      session.current?.dictation?.cancel();
      session.current = null;
      enter('idle');
      composerToast.show(t('chat.voice.failed', { reason: e instanceof Error ? e.message : String(e) }), 'warn');
    },
    [enter, stopCapture],
  );

  const finish = useCallback(async () => {
    const s = session.current;
    if (state.current !== 'recording' || !s) return;
    await stopCapture();
    haptics.tap();
    enter('transcribing');
    try {
      // The connection may still be opening on a very short dictation.
      while (!s.dictation && session.current === s) await new Promise((r) => setTimeout(r, 50));
      if (session.current !== s || !s.dictation) return;
      const text = await s.dictation.finish();
      if (session.current !== s) return;
      if (text.trim()) onText(text);
      else composerToast.show(t('chat.voice.nothingHeard'), 'warn');
      session.current = null;
      enter('idle');
    } catch (e) {
      if (session.current === s) fail(e);
    }
  }, [enter, fail, onText, stopCapture]);

  const start = useCallback(async () => {
    if (state.current !== 'idle') return;
    await speechConfig.load();
    if (!speechConfig.snapshot().ready) {
      router.push('/voice-settings');
      return;
    }
    if (!VoiceCapture) {
      composerToast.show(t('chat.voice.needsUpdate'), 'warn');
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      composerToast.show(t('chat.voice.micDenied'), 'warn');
      return;
    }
    const s: NonNullable<typeof session.current> = { dictation: null, queue: [], sub: null, errorSub: null, timer: null };
    session.current = s;
    setLive('');
    setLevels(pushLevel([], SILENT));
    setDurationMs(0);
    enter('recording');
    haptics.tap();
    // Capture starts at once; audio waits in `queue` until the service is connected.
    s.sub = VoiceCapture.addListener('onChunk', ({ data, level }) => {
      setLevels((l) => pushLevel(l, SILENT + (1 - SILENT) * level));
      if (s.dictation) s.dictation.push(data, level);
      else s.queue.push({ data, level });
    });
    // The microphone failing (taken by a call, say) ends the dictation with its reason.
    s.errorSub = VoiceCapture.addListener('onError', ({ message }) => {
      if (session.current === s) fail(new Error(message));
    });
    const began = Date.now();
    s.timer = setInterval(() => {
      const ms = Date.now() - began;
      setDurationMs(ms);
      if (ms >= MAX_VOICE_MS) void finish();
    }, 200);
    try {
      await VoiceCapture.start();
      const dictation = await startDictation((text) => {
        if (session.current === s) setLive(text);
      });
      if (session.current !== s) return dictation.cancel();
      s.dictation = dictation;
      for (const chunk of s.queue.splice(0)) dictation.push(chunk.data, chunk.level);
    } catch (e) {
      if (session.current === s) fail(e);
    }
  }, [enter, fail, finish]);

  const cancel = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    await stopCapture();
    s.dictation?.cancel();
    enter('idle');
    haptics.select();
  }, [enter, stopCapture]);

  // Leaving the chat mid-dictation drops it.
  useEffect(
    () => () => {
      const s = session.current;
      session.current = null;
      if (s?.timer) clearInterval(s.timer);
      s?.sub?.remove();
      s?.errorSub?.remove();
      s?.dictation?.cancel();
      void VoiceCapture?.stop().catch(() => {});
    },
    [],
  );

  return { phase, levels, durationMs, live, start, cancel, finish };
}

const LINE = typography.callout.lineHeight;

/** The composer while dictating: the words so far, then ✕ · live waveform · time · ✓. */
export function VoiceBar({ phase, levels, durationMs, live, onCancel, onDone }: { phase: Exclude<VoicePhase, 'idle'>; levels: number[]; durationMs: number; live: string; onCancel: () => void; onDone: () => void }) {
  const c = useTheme();
  const t = useT();
  const recording = phase === 'recording';
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Follows the newest words while the view is at the bottom.
  const pinned = useRef(true);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} className="gap-1 px-2 pb-1.5 pt-2.5">
      {/* Grows with the words like the text input does, up to the same height, then scrolls and
          stays on the newest words (unless the user scrolled up to read back). */}
      <ScrollView
        ref={scroll}
        style={{ maxHeight: LINE * MAX_LINES }}
        className="px-2"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          pinned.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - LINE;
        }}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (pinned.current) scroll.current?.scrollToEnd({ animated: false });
        }}>
        <Text variant="callout" tone={live ? 'default' : 'faint'} className="min-h-6" accessibilityLiveRegion="polite">
          {live || t(recording ? 'chat.voice.listening' : 'chat.voice.transcribing')}
        </Text>
      </ScrollView>
      <View className="h-12 flex-row items-center gap-2">
        <IconButton icon="close" label={t(recording ? 'chat.voice.discard' : 'chat.voice.cancel')} variant="ghost" size={36} onPress={onCancel} />
        {recording ? (
          <View className="h-10 flex-1 flex-row items-center justify-center gap-[3px] overflow-hidden" accessibilityLabel={t('chat.voice.recordingA11y')}>
            {levels.slice(-WAVE_BARS).map((level, i) => (
              <View key={i} className="w-[3px] rounded-full" style={{ height: Math.max(3, level * 36), backgroundColor: c.text, opacity: 0.35 + 0.65 * (i / WAVE_BARS) }} />
            ))}
          </View>
        ) : (
          <View className="flex-1 flex-row items-center justify-center gap-2">
            <AgentOrbit state="writing" size={16} />
            <Text variant="caption" tone="muted">
              {t('chat.voice.finishing')}
            </Text>
          </View>
        )}
        {recording ? (
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {clock(durationMs)}
          </Text>
        ) : null}
        <IconButton icon="check" label={t('chat.voice.done')} variant="primary" size={36} disabled={!recording} onPress={onDone} />
      </View>
    </Animated.View>
  );
}
