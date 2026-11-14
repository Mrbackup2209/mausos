import { NativeModule, requireNativeModule } from 'expo';

declare class MausosSmsModule extends NativeModule<{}> {
  hasPermission(): boolean;
  isSmsCapable(): boolean;
  countParts(message: string): number;
  sendSms(phoneNumber: string, message: string): Promise<{ sent: boolean; parts: number; strategy: string }>;
}

export default requireNativeModule<MausosSmsModule>('MausosSms');
