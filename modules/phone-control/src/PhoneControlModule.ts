import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { PhoneApp, PhoneBrightness, PhoneBrightnessChange, PhoneReadiness, PhoneResult, PhoneOperation, PhonePreview, PhoneTapAssessment } from '@pku-harness/sdk';

type NativeFailure = { nativeError: { code: string; message: string } };

declare class PhoneControlModule extends NativeModule<{ onControlStopped: (event: { sessionId: string }) => void; onOverlayAnswer: (answer: { id: number; sessionId: string; allowed: boolean }) => void }> {
  overlayStatus(value: { sessionId: string; phase: 'waiting' | 'thinking' | 'working' | 'attention'; title: string } | null): Promise<void>;
  overlayApproval(value: { id: number; sessionId: string; title: string; detail: string } | null): Promise<void>;
  readiness(): Promise<PhoneReadiness>;
  setup(kind: 'accessibility' | 'wireless' | 'appInfo'): Promise<void>;
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
  execute(sessionId: string, operation: PhoneOperation, args: Record<string, unknown>): Promise<PhoneResult | NativeFailure>;
  end(sessionId: string): Promise<void>;
  takeover(sessionId: string): Promise<void>;
  handback(sessionId: string): Promise<void>;
}

export default requireOptionalNativeModule<PhoneControlModule>('PhoneControl');
