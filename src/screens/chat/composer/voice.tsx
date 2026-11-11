import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AgentOrbit } from '@/components/agent-orbit';
import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import { speechConfig, transcribe } from '@/core/speech/config';
import { t, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { composerToast } from './toast';
import { clock, levelOf, MAX_VOICE_MS, pushLevel, WAVE_BARS } from './voice-logic';

/** Speech, not music: 16 kHz mono AAC (~0.25 MB a minute), with levels for the waveform. */
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: true };
/** Shorter than this is a slip of the finger: discarded without a request. */
const MIN_MS = 600;

export type VoicePhase = 'idle' | 'recording' | 'transcribing';

const discard = (uri: string | null) => {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // already gone
  }
};

/**
 * Dictation (Claude-style): the mic records, ✓ sends the recording to the user's own
 * speech-to-text service, and the text lands in the draft for editing. ✕ discards it.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const recorder = useAudioRecorder(OPTIONS);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [levels, setLevels] = useState<number[]>(() => pushLevel([], 0.08));
  const [durationMs, setDurationMs] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors `phase` for callbacks that run after awaits (always written outside render).
  const live = useRef<VoicePhase>('idle');
  const enter = useCallback((next: VoicePhase) => {
    live.current = next;
    setPhase(next);
  }, []);
  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  const stopRecording = useCallback(async () => {
    stopTicker();
    const duration = recorder.getStatus().durationMillis;
    await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    return { uri: recorder.uri, duration };
  }, [recorder]);

  const finish = useCallback(async () => {
    if (live.current !== 'recording') return;
    const { uri, duration } = await stopRecording();
    if (!uri || duration < MIN_MS) {
      enter('idle');
      discard(uri);
      return;
    }
    haptics.tap();
    enter('transcribing');
    const ac = new AbortController();
    abort.current = ac;
    try {
      const text = await transcribe({ uri, durationMs: duration }, ac.signal);
      if (!ac.signal.aborted) {
        if (text) onText(text);
        else composerToast.show(t('chat.voice.nothingHeard'), 'warn');
      }
    } catch (e) {
      if (!ac.signal.aborted) composerToast.show(t('chat.voice.failed', { reason: e instanceof Error ? e.message : String(e) }), 'warn');
    } finally {
      abort.current = null;
      discard(uri);
      enter('idle');
    }
  }, [enter, onText, stopRecording]);

  const start = useCallback(async () => {
    if (live.current !== 'idle') return;
    await speechConfig.load();
    if (!speechConfig.snapshot().ready) {
      router.push('/voice-settings');
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      composerToast.show(t('chat.voice.micDenied'), 'warn');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setLevels(pushLevel([], 0.08));
      setDurationMs(0);
      enter('recording');
      haptics.tap();
      // The waveform and the clock follow the recorder; the longest recording transcribes by itself.
      ticker.current = setInterval(() => {
        const s = recorder.getStatus();
        setLevels((l) => pushLevel(l, levelOf(s.metering)));
        setDurationMs(s.durationMillis);
        if (s.durationMillis >= MAX_VOICE_MS) void finish();
      }, 80);
    } catch (e) {
      composerToast.show(t('chat.voice.failed', { reason: e instanceof Error ? e.message : String(e) }), 'warn');
    }
  }, [enter, finish, recorder]);

  const cancel = useCallback(async () => {
    if (live.current === 'transcribing') {
      abort.current?.abort();
      return;
    }
    if (live.current !== 'recording') return;
    enter('idle');
    const { uri } = await stopRecording();
    discard(uri);
    haptics.select();
  }, [enter, stopRecording]);

  // Leaving the chat mid-recording discards it.
  useEffect(
    () => () => {
      stopTicker();
      abort.current?.abort();
      if (live.current === 'recording') void recorder.stop().catch(() => {});
    },
    [recorder],
  );

  return { phase, levels, durationMs, start, cancel, finish };
}

/** The composer while dictating: ✕ · live waveform · time · ✓ (then "Transcribing…"). */
export function VoiceBar({ phase, levels, durationMs, onCancel, onDone }: { phase: Exclude<VoicePhase, 'idle'>; levels: number[]; durationMs: number; onCancel: () => void; onDone: () => void }) {
  const c = useTheme();
  const t = useT();
  const recording = phase === 'recording';
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} className="h-[92px] flex-row items-center gap-2 px-2">
      <IconButton icon="close" label={t(recording ? 'chat.voice.discard' : 'chat.voice.cancel')} variant="ghost" size={36} onPress={onCancel} />
      {recording ? (
        <View className="h-10 flex-1 flex-row items-center justify-center gap-[3px] overflow-hidden" accessibilityLabel={t('chat.voice.recordingA11y')} accessibilityLiveRegion="polite">
          {levels.slice(-WAVE_BARS).map((level, i) => (
            <View key={i} className="w-[3px] rounded-full" style={{ height: Math.max(3, level * 36), backgroundColor: c.text, opacity: 0.35 + 0.65 * (i / WAVE_BARS) }} />
          ))}
        </View>
      ) : (
        <View className="flex-1 flex-row items-center justify-center gap-2" accessibilityLiveRegion="polite">
          <AgentOrbit state="writing" size={16} />
          <Text variant="callout" tone="muted">
            {t('chat.voice.transcribing')}
          </Text>
        </View>
      )}
      {recording ? (
        <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {clock(durationMs)}
        </Text>
      ) : null}
      <IconButton icon="check" label={t('chat.voice.done')} variant="primary" size={36} disabled={!recording} onPress={onDone} />
    </Animated.View>
  );
}
