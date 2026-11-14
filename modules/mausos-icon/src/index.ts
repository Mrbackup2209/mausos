import { requireOptionalNativeModule } from 'expo';

// Optional: on a build made before this module existed, the functions below
// do nothing rather than crashing the app.
type MausosIconNative = {
  isSupported(): boolean;
  isDisguised(): boolean;
  setDisguised(disguised: boolean): boolean;
};

const Native = requireOptionalNativeModule<MausosIconNative>('MausosIcon');

/** True when this build can switch its home-screen icon. */
export function isIconSwitchSupported(): boolean {
  try {
    return Boolean(Native?.isSupported());
  } catch {
    return false;
  }
}

export function isDisguised(): boolean {
  try {
    return Boolean(Native?.isDisguised());
  } catch {
    return false;
  }
}

/** Shows the calculator icon (true) or the MauSOS icon (false). */
export function setDisguised(disguised: boolean): boolean {
  try {
    return Boolean(Native?.setDisguised(disguised));
  } catch (error) {
    console.log('[MauSOS] Could not switch app icon:', (error as Error)?.message);
    return false;
  }
}
