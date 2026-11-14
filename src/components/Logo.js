import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { radius } from '../utils/theme';

// ---------------------------------------------------------------------------
// The MauSOS mark.
//
// One component so the logo is identical everywhere it appears. The source
// image already carries its own rounded corners with transparency, so it sits
// on any background without a visible square edge.
//
// The artwork includes the wordmark, so screens that show it should not also
// print "MauSOS" as a heading underneath.
// ---------------------------------------------------------------------------

export default function Logo({ size = 80, style }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={[{ width: size, height: size, borderRadius: radius.lg }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="MauSOS"
    />
  );
}

export const logoStyles = StyleSheet.create({});
