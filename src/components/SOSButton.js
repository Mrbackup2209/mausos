import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, typography } from '../utils/theme';
import { ALERT } from '../utils/constants';

// ---------------------------------------------------------------------------
// The SOS trigger: press and hold.
//
// A tap does nothing. The alert starts only after the button has been held for
// the full duration (3 seconds by default), which rules out pocket presses and
// stray touches without adding a confirmation dialog in a genuine emergency.
//
// Feedback while holding is deliberately physical as well as visual, so it
// works without looking at the screen:
//   - a darker fill grows from the centre to the edge over the hold,
//   - a haptic tick each second, with the remaining seconds shown,
//   - a strong haptic pulse when the hold completes.
// Releasing early springs the fill back and nothing happens.
//
// Animations run on the native thread (useNativeDriver), so they stay smooth
// even if the JavaScript thread is busy.
// ---------------------------------------------------------------------------

const SIZE = 224;

export default function SOSButton({ onActivate, disabled = false, holdMs = ALERT.HOLD_DURATION_MS }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const holdingRef = useRef(false);
  const animRef = useRef(null);
  const tickRef = useRef(null);
  const totalSeconds = Math.ceil(holdMs / 1000);
  const [holding, setHolding] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  // An idle pulse around the button signals that it is armed and touchable.
  useEffect(() => {
    if (disabled) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulse]);

  useEffect(() => () => clearInterval(tickRef.current), []);

  function startHold() {
    if (disabled) return;
    holdingRef.current = true;
    setHolding(true);
    setSecondsLeft(totalSeconds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const startedAt = Date.now();
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((holdMs - (Date.now() - startedAt)) / 1000));
      setSecondsLeft(left);
      if (left > 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 1000);

    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      clearInterval(tickRef.current);
      if (!finished) return;
      holdingRef.current = false;
      setHolding(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      progress.setValue(0);
      onActivate?.();
    });
  }

  function endHold() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    animRef.current?.stop();
    clearInterval(tickRef.current);
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.wrapper}>
      {!disabled && !holding ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
        />
      ) : null}

      <Pressable
        onPressIn={startHold}
        onPressOut={endHold}
        disabled={disabled}
        style={[styles.button, disabled && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Emergency alert"
        accessibilityHint={`Press and hold for ${totalSeconds} seconds to alert your emergency contacts`}
        accessibilityState={{ disabled }}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.fill, { transform: [{ scale: progress }] }]}
        />
        <View pointerEvents="none" style={styles.labels}>
          {holding ? (
            <>
              <Text style={styles.count}>{secondsLeft}</Text>
              <Text style={styles.caption}>Keep holding</Text>
            </>
          ) : (
            <>
              <Text style={styles.sos}>SOS</Text>
              <Text style={styles.caption}>
                {disabled ? 'Add a contact first' : `Hold ${totalSeconds} seconds`}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: SIZE * 1.4,
    height: SIZE * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.danger,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.dangerDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonDisabled: {
    backgroundColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  fill: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.dangerDark,
  },
  labels: { alignItems: 'center' },
  sos: {
    color: colors.textInverse,
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: 4,
  },
  count: {
    color: colors.textInverse,
    fontSize: 72,
    fontWeight: '800',
  },
  caption: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '600',
    opacity: 0.9,
    marginTop: 2,
  },
});
