import MausosSmsModule from './MausosSmsModule';

export type SendSmsResult = {
  sent: boolean;
  parts: number;
  /** Which SmsManager accessor the platform accepted. */
  strategy: string;
};

/** True when SEND_SMS has been granted. Requesting it is done from JavaScript
 *  with React Native's PermissionsAndroid. */
export function hasPermission(): boolean {
  return MausosSmsModule.hasPermission();
}

/** False on a device with no telephony hardware, such as a Wi-Fi tablet. */
export function isSmsCapable(): boolean {
  return MausosSmsModule.isSmsCapable();
}

/** How many parts a message will be split into. Each part is billed separately. */
export function countParts(message: string): number {
  return MausosSmsModule.countParts(message);
}

/**
 * Sends an SMS without opening any messaging application.
 *
 * Resolves only once Android confirms every part left the device, and rejects
 * with a specific code otherwise: E_PERMISSION_DENIED, E_INVALID_NUMBER,
 * E_NO_SMS_MANAGER, E_SEND_FAILED, E_SEND_THREW or E_TIMEOUT.
 */
export function sendSms(phoneNumber: string, message: string): Promise<SendSmsResult> {
  return MausosSmsModule.sendSms(phoneNumber, message);
}

export default MausosSmsModule;
