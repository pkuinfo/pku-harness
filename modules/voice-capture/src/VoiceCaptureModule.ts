import { NativeModule, requireOptionalNativeModule } from 'expo';

/** 100 ms of 16 kHz mono 16-bit little-endian PCM, base64, with its loudness. */
export type VoiceChunk = { data: string; level: number };

type Events = {
  onChunk(chunk: VoiceChunk): void;
  onError(e: { message: string }): void;
};

declare class VoiceCaptureModule extends NativeModule<Events> {
  /** Start streaming the microphone (RECORD_AUDIO must be granted). */
  start(): Promise<void>;
  /** Stop; chunks already emitted stay delivered. */
  stop(): Promise<void>;
}

/**
 * Live microphone audio for voice input: chunks arrive while the user talks, so a realtime
 * speech service can transcribe as they speak. Null on builds without the module (older APKs, iOS).
 */
export default requireOptionalNativeModule<VoiceCaptureModule>('VoiceCapture');
