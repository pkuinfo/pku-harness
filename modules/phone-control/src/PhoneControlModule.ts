import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { PhoneApp, PhoneReadiness, PhoneResult, PhoneOperation, PhonePreview, PhoneTapAssessment } from '@pku-harness/sdk';

declare class PhoneControlModule extends NativeModule {
  readiness(): Promise<PhoneReadiness>;
  setup(kind: 'accessibility' | 'wireless'): Promise<void>;
  pair(code: string, port: number): Promise<PhoneReadiness>;
  connect(port: number | null): Promise<PhoneReadiness>;
  disconnect(): Promise<void>;
  apps(): Promise<PhoneApp[]>;
  begin(packages: string[]): Promise<{ sessionId: string; packages: string[] }>;
  preview(sessionId: string): Promise<PhonePreview | null>;
  assessTap(sessionId: string, snapshotId: string, ref: string): Promise<PhoneTapAssessment>;
  execute(sessionId: string, operation: PhoneOperation, args: Record<string, unknown>): Promise<PhoneResult>;
  end(sessionId: string): Promise<void>;
  takeover(sessionId: string): Promise<void>;
  handback(sessionId: string): Promise<void>;
}

export default requireOptionalNativeModule<PhoneControlModule>('PhoneControl');
