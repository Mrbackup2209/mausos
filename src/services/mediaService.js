import { Camera } from 'expo-camera';
import { cloudinaryConfig, isCloudinaryConfigured } from '../config/cloudinary';

// ---------------------------------------------------------------------------
// Alert photos: camera permission, upload, and clean-up.
//
// The photo is uploaded to Cloudinary rather than Firebase Storage (D-06): the
// contacts who receive the alert have no account here, so the link must open
// for anyone who holds it. Each upload gets a random public id, so the link is
// unguessable even though it is public.
//
// Uploads ask Cloudinary for a delete token. If the alert is cancelled during
// the countdown, the token is used to remove the photo straight away, so a
// picture taken for an alert that never happened does not stay online.
// ---------------------------------------------------------------------------

const UPLOAD_TIMEOUT_MS = 30000;

export async function getCameraPermission() {
  try {
    const r = await Camera.getCameraPermissionsAsync();
    return { granted: r.granted, canAskAgain: r.canAskAgain };
  } catch (error) {
    return { granted: false, canAskAgain: true };
  }
}

export async function requestCameraPermission() {
  try {
    const r = await Camera.requestCameraPermissionsAsync();
    return { granted: r.granted, canAskAgain: r.canAskAgain };
  } catch (error) {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * Inserts a delivery transformation so contacts download a phone-sized,
 * automatically compressed image rather than the full camera original. The
 * original stays stored; only what is served changes.
 */
function deliveryUrl(secureUrl) {
  return secureUrl.replace('/image/upload/', '/image/upload/w_1280,q_auto/');
}

/**
 * Sends a multipart form with React Native's own XMLHttpRequest.
 *
 * Not `fetch`: from Expo SDK 52 the global fetch is Expo's implementation,
 * which rejects React Native's { uri, type, name } file parts with
 * "Unsupported FormDataPart implementation" (C-10). XMLHttpRequest still goes
 * through React Native's networking layer, which streams the file from disk.
 */
function postForm(url, form, timeoutMs) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = timeoutMs;
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || '' });
    xhr.onerror = () => reject(Object.assign(new Error('Network request failed'), { code: 'network' }));
    xhr.ontimeout = () => reject(Object.assign(new Error('Request timed out'), { code: 'timeout' }));
    xhr.send(form);
  });
}

/**
 * Uploads a captured photo.
 * Returns { ok: true, url, deleteToken, bytes, ms } or { ok: false, reason }.
 */
export async function uploadPhoto(localUri) {
  if (!isCloudinaryConfigured()) {
    console.warn('[MauSOS] Cloudinary is not configured; photo will not be uploaded.');
    return { ok: false, reason: 'not-configured' };
  }

  const started = Date.now();
  const { cloudName, uploadPreset } = cloudinaryConfig;
  console.log(`[MauSOS] Uploading photo to ${cloudName} with preset ${uploadPreset}`);

  const form = new FormData();
  form.append('file', { uri: localUri, type: 'image/jpeg', name: `alert-${started}.jpg` });
  form.append('upload_preset', uploadPreset);
  // No folder or public id is sent: the preset fixes the folder and generates
  // a random public id, and refuses one supplied by the client.

  try {
    const { status, text } = await postForm(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      form,
      UPLOAD_TIMEOUT_MS
    );
    let body = {};
    try {
      body = JSON.parse(text);
    } catch (e) {
      // Not JSON (e.g. an HTML error page); keep the raw text for the log.
    }

    if (status < 200 || status >= 300 || !body.secure_url) {
      console.log(`[MauSOS] Photo upload rejected: HTTP ${status} ·`, body?.error?.message || text.slice(0, 200));
      return { ok: false, reason: body?.error?.message || `http-${status}` };
    }

    console.log(`[MauSOS] Photo uploaded in ${Date.now() - started} ms (${body.bytes} bytes)`);
    return {
      ok: true,
      url: deliveryUrl(body.secure_url),
      deleteToken: body.delete_token ?? null,
      bytes: body.bytes,
      ms: Date.now() - started,
    };
  } catch (error) {
    console.log(`[MauSOS] Photo upload failed after ${Date.now() - started} ms:`, error?.code || '', error?.message);
    return { ok: false, reason: error?.code === 'timeout' ? 'timeout' : 'network' };
  }
}

/**
 * Removes an uploaded photo using the token returned at upload time. Tokens
 * are valid for ten minutes, which comfortably covers a cancelled countdown.
 */
export async function deleteUploadedPhoto(deleteToken) {
  if (!deleteToken || !isCloudinaryConfigured()) return false;
  try {
    const form = new FormData();
    form.append('token', deleteToken);
    const { status, text } = await postForm(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/delete_by_token`,
      form,
      10000
    );
    console.log(`[MauSOS] Cancelled alert photo delete: HTTP ${status}`, status === 200 ? '' : text.slice(0, 200));
    return status === 200;
  } catch (error) {
    console.log('[MauSOS] Cancelled alert photo delete failed:', error?.message);
    return false;
  }
}
