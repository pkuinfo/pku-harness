import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { PhoneApp, PhoneBrightness, PhoneBrightnessChange, PhoneLook, PhoneReadiness, PhoneResult, PhoneOperation, PhonePreview, PhoneTapAssessment } from '@pku-harness/sdk';

type NativeFailure = { nativeError: { code: string; message: string } };

declare class PhoneControlModule extends NativeModule<{ onControlStopped: (event: { sessionId: string }) => void; onOverlayAnswer: (answer: { id: number; sessionId: string; allowed: boolean }) => void }> {
  overlayStatus(value: { sessionId: string; phase: 'waiting' | 'thinking' | 'working' | 'attention'; title: string } | null): Promise<void>;
  overlayApproval(value: { id: number; sessionId: string; title: string; detail: string } | null): Promise<void>;
  readiness(): Promise<PhoneReadiness>;
  setup(kind: 'accessibility' | 'wireless' | 'appInfo' | 'overlays'): Promise<void>;
  pair(code: string, port: number | null): Promise<PhoneReadiness>;
  startPairing(): Promise<PhoneReadiness>;
  stopPairing(): Promise<void>;
  connect(port: number | null): Promise<PhoneReadiness>;
  disconnect(): Promise<void>;
  apps(): Promise<PhoneApp[]>;
  begin(packages: string[]): Promise<{ sessionId: string; packages: string[] }>;
  allow(sessionId: string, packageName: string): Promise<{ sessionId: string; packages: string[] } | NativeFailure>;
  preview(sessionId: string): Promise<PhonePreview | null>;
  readBrightness(sessionId: string): Promise<PhoneBrightness | NativeFailure>;
  setBrightness(sessionId: string, percent: number, adaptive: boolean | null): Promise<PhoneBrightnessChange | NativeFailure>;
  assessSubmit(sessionId: string, snapshotId: string, ref: string): Promise<PhoneTapAssessment | NativeFailure>;
  assessTap(sessionId: string, snapshotId: string, ref: string): Promise<PhoneTapAssessment | NativeFailure>;
  /** Approval target of a point on a `look` screenshot (screenshot pixels). Missing on APKs before the vision fallback. */
  assessAt?(sessionId: string, snapshotId: string, x: number, y: number): Promise<PhoneTapAssessment | NativeFailure>;
  execute(sessionId: string, operation: PhoneOperation, args: Record<string, unknown>): Promise<PhoneResult | NativeFailure>;
  /** 'look': the screenshot for the model (Copilot's opt-in vision fallback). */
  execute(sessionId: string, operation: 'look', args: Record<string, never>): Promise<PhoneLook | NativeFailure>;
  end(sessionId: string): Promise<void>;
  takeover(sessionId: string): Promise<void>;
  /** takeover with the reason shown on the floating panel next to its Done button. Missing on APKs before 1.0.11. */
  handoff?(sessionId: string, note: string | null): Promise<void>;
  /** Resolves when the user hands the session back, it ends, or `timeoutMs` passes. Missing on APKs before 1.0.11. */
  awaitHandback?(sessionId: string, timeoutMs: number): Promise<{ handedBack: boolean; ended: boolean; timedOut?: boolean }>;
  handback(sessionId: string): Promise<void>;
}

export default requireOptionalNativeModule<PhoneControlModule>('PhoneControl');
