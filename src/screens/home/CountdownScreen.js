import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Vibration, BackHandler, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView } from 'expo-camera';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import { getAlertSession, cancelAlert, providePhoto } from '../../services/alertService';
import { getCameraPermission, uploadPhoto } from '../../services/mediaService';
import { describeFix } from '../../services/locationService';
import { ALERT } from '../../utils/constants';
import { colors, spacing, typography, radius } from '../../utils/theme';

// ---------------------------------------------------------------------------
// The cancellation window between the trigger and the alert being sent.
//
// The whole screen turns red and the phone vibrates every second, so an
// accidental trigger — a phone pressed in a bag — is noticed even without
// looking. Cancelling takes one tap on a target that fills the bottom of the
// screen, or the hardware back button.
//
// The user's position is already being found while this counts down, and the
// result is shown here so the user knows before sending what their contacts
// will see.
//
// A photo of the surroundings is taken here too. Android cannot photograph
// without a live camera view, so a small preview is shown in the corner: the
// user can see exactly what is being captured, and nothing is taken in secret.
// The photo uploads while the countdown continues. If the alert is cancelled
// before capture, no photo is taken; if after, the upload is deleted.
// ---------------------------------------------------------------------------

function recipientsLine(contacts) {
  if (contacts.length === 0) return 'No emergency contacts';
  const names = contacts.map((c) => c.name);
  if (names.length === 1) return `To ${names[0]}`;
  if (names.length === 2) return `To ${names[0]} and ${names[1]}`;
  return `To ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export default function CountdownScreen({ navigation }) {
  const { user, profile } = useAuth();
  const { contacts } = useContacts();

  const total = profile?.settings?.countdownSeconds ?? ALERT.DEFAULT_COUNTDOWN_S;
  const [left, setLeft] = useState(total);
  const [fix, setFix] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [pictureSize, setPictureSize] = useState(undefined);
  const capturing = useRef(false);
  const settled = useRef(false);
  const cancelled = useRef(false);
  const captured = useRef(false);
  const cameraRef = useRef(null);
  const backSub = useRef(null);
  const giveUp = useRef(null);
  const openedAt = useRef(Date.now());
  // Held directly, because the photo may arrive after sending has started.
  const alertSession = useRef(getAlertSession());
  const facing = profile?.settings?.preferredCamera === 'front' ? 'front' : 'back';

  const since = () => Date.now() - openedAt.current;

  function givePhoto(result, uri = null) {
    if (captured.current) return;
    captured.current = true;
    clearTimeout(giveUp.current);
    if (!uri) console.log(`[MauSOS] No photo (${result?.reason}) after ${since()} ms`);
    providePhoto(result, uri, alertSession.current);
  }

  /**
   * Picks the smallest picture size that is still at least 1280 px on its
   * long side, preferring the 4:3 sizes that use the whole sensor. Contacts
   * receive 1280 px anyway (deliveryUrl), so anything larger only makes the
   * upload slower: a full-resolution A50 photo did not finish uploading in
   * 20 s.
   */
  function choosePictureSize(sizes) {
    const parsed = (sizes || [])
      .map((label) => {
        const [w, h] = String(label).split('x').map(Number);
        return { label, long: Math.max(w, h), short: Math.min(w, h) };
      })
      .filter((x) => x.long > 0 && x.short > 0);
    const bigEnough = parsed.filter((x) => x.long >= 1280).sort((a, b) => a.long - b.long);
    const fourThree = bigEnough.filter((x) => Math.abs(x.long / x.short - 4 / 3) < 0.05);
    return (fourThree[0] || bigEnough[0])?.label;
  }

  async function onCameraReady() {
    // The camera can report "ready" more than once (it does on the A50, and
    // again after the picture size changes). Only the first one captures.
    if (captured.current || capturing.current) return;
    capturing.current = true;
    console.log(`[MauSOS] Camera ready after ${since()} ms`);

    try {
      const size = choosePictureSize(await cameraRef.current?.getAvailablePictureSizesAsync());
      if (size) {
        setPictureSize(size);
        console.log(`[MauSOS] Picture size ${size}`);
      }
    } catch (error) {
      // Not fatal: the camera's default size is used.
    }

    // A moment for the new size to apply and for exposure and focus to
    // settle, so the frame is not dark.
    await new Promise((r) => setTimeout(r, 500));
    if (captured.current || cancelled.current || !cameraRef.current) return;
    try {
      // skipProcessing: return the camera's own JPEG instead of decoding,
      // rotating and re-compressing it on the phone. On the A50 the processed
      // capture took over 7 s — longer than the countdown. Orientation
      // stays in the EXIF data, which Cloudinary applies on delivery.
      const picture = await cameraRef.current.takePictureAsync({
        skipProcessing: true,
        shutterSound: false,
      });
      console.log(`[MauSOS] Photo captured after ${since()} ms (${picture.width}x${picture.height})`);
      // Re-check after the capture: the countdown may have been cancelled or
      // finished while the camera was working. Only start the upload if the
      // photo is still wanted.
      if (cancelled.current || captured.current) return;
      setPhotoUri(picture.uri);
      setCameraOn(false);
      givePhoto(uploadPhoto(picture.uri), picture.uri);
    } catch (error) {
      givePhoto({ ok: false, reason: 'capture' });
    }
  }

  function cancel() {
    if (settled.current) return;
    settled.current = true;
    cancelled.current = true;
    Vibration.cancel();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    cancelAlert(user?.uid);
    navigation.goBack();
  }

  function fire() {
    if (settled.current) return;
    settled.current = true;
    backSub.current?.remove();
    // The status screen opens on top of this one rather than replacing it, so
    // the camera stays alive underneath and a slow camera can still finish.
    // The alert does not wait for it: a photo that misses the send follows
    // separately. A camera that never delivers is given up on after 10 s.
    if (!captured.current) {
      giveUp.current = setTimeout(() => givePhoto({ ok: false, reason: 'camera-timeout' }), 10000);
    }
    Vibration.vibrate(600);
    navigation.navigate('AlertStatus');
  }

  useEffect(() => {
    getAlertSession()?.locationPromise.then((result) => {
      if (!settled.current) setFix(result);
    });

    // Decide whether to photograph at all, then open the camera.
    (async () => {
      if (profile?.settings?.capturePhoto === false) {
        givePhoto({ ok: false, reason: 'disabled' });
        return;
      }
      const permission = await getCameraPermission();
      if (!permission.granted) {
        givePhoto({ ok: false, reason: 'permission' });
        return;
      }
      if (!cancelled.current) setCameraOn(true);
    })();

    const startedAt = Date.now();
    let lastShown = total;
    Vibration.vibrate(250);

    const timer = setInterval(() => {
      const remaining = total - Math.floor((Date.now() - startedAt) / 1000);
      if (remaining <= 0) {
        clearInterval(timer);
        fire();
      } else if (remaining !== lastShown) {
        lastShown = remaining;
        setLeft(remaining);
        Vibration.vibrate(200);
      }
    }, 100);

    // Hardware back cancels, which is what someone fumbling to stop an
    // accidental alert will instinctively press.
    backSub.current = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });

    return () => {
      clearInterval(timer);
      backSub.current?.remove();
      Vibration.cancel();
      // Leaving before a photo was taken (e.g. back to home): stop waiting.
      givePhoto({ ok: false, reason: 'not-ready' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {cameraOn || photoUri ? (
        <View style={styles.photoBox}>
          <View style={styles.photoFrame}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <CameraView
                ref={cameraRef}
                style={styles.photo}
                facing={facing}
                animateShutter={false}
                pictureSize={pictureSize}
                onCameraReady={onCameraReady}
                onMountError={() => givePhoto({ ok: false, reason: 'camera' })}
              />
            )}
          </View>
          <Text style={styles.photoLabel}>{photoUri ? 'Photo taken' : 'Taking photo…'}</Text>
        </View>
      ) : null}

      <View style={styles.top}>
        {alertSession.current?.triggerMethod === 'shake' ? (
          <Text style={styles.trigger}>Shake detected</Text>
        ) : null}
        <Text style={styles.kicker}>Sending emergency alert in</Text>
        <Text style={styles.count} accessibilityLiveRegion="assertive">
          {left}
        </Text>
        <Text style={styles.recipients}>{recipientsLine(contacts)}</Text>

        <View style={styles.locationRow}>
          <Ionicons
            name={fix ? (fix.ok ? 'location' : 'alert-circle') : 'locate'}
            size={18}
            color={colors.textInverse}
          />
          <Text style={styles.location} numberOfLines={2}>
            {describeFix(fix)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={cancel}
        style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
        accessibilityRole="button"
        accessibilityLabel="Cancel alert"
      >
        <Text style={styles.cancelText}>Cancel</Text>
        <Text style={styles.cancelHint}>Tap if you are safe</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.danger, padding: spacing.lg },
  photoBox: { position: 'absolute', top: spacing.xxl, right: spacing.lg, alignItems: 'center', zIndex: 2 },
  photoFrame: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.textInverse,
    backgroundColor: colors.dangerDark,
  },
  photo: { width: '100%', height: '100%' },
  photoLabel: { ...typography.caption, color: colors.textInverse, marginTop: spacing.xs, fontSize: 11 },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { ...typography.h3, color: colors.textInverse, opacity: 0.9 },
  trigger: {
    ...typography.label,
    color: colors.textInverse,
    opacity: 0.85,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  count: {
    fontSize: 160,
    lineHeight: 176,
    fontWeight: '800',
    color: colors.textInverse,
    marginVertical: spacing.sm,
  },
  recipients: { ...typography.h3, color: colors.textInverse, textAlign: 'center' },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.18)',
    maxWidth: '100%',
  },
  location: {
    ...typography.caption,
    color: colors.textInverse,
    marginLeft: spacing.sm,
    flexShrink: 1,
  },
  cancel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  cancelPressed: { opacity: 0.85 },
  cancelText: { fontSize: 26, fontWeight: '800', color: colors.dangerDark },
  cancelHint: { ...typography.caption, color: colors.dangerDark, marginTop: 2 },
});
