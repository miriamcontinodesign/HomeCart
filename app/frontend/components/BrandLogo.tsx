import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// HomeCart logo from public/brand (served at /brand/…). `lockup` = mark + wordmark side by side
// for headers; `stacked` = cart above the wordmark (landing page); `mark` = the cart alone where
// space is tight. Swaps to the on-dark artwork in dark mode.
// The lockup's wordmark is outlined to paths, so it doesn't depend on Nunito being loaded.

const FILES = {
  lockup: { light: '/brand/homecart-lockup-horizontal.svg', dark: '/brand/homecart-lockup-horizontal-on-dark.svg', ratio: 370 / 120 },
  stacked: { light: '/brand/homecart-lockup-stacked.svg', dark: '/brand/homecart-lockup-stacked-on-dark.svg', ratio: 270 / 158 },
  mark: { light: '/brand/homecart-mark.svg', dark: '/brand/homecart-mark-on-dark.svg', ratio: 1 },
} as const;

export default function BrandLogo({ variant = 'lockup', height, style }: {
  variant?: keyof typeof FILES;
  height: number;
  style?: any;
}) {
  const { mode } = useTheme();
  const file = FILES[variant];
  return (
    <Image
      source={{ uri: file[mode] }}
      style={[{ height, width: height * file.ratio }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="HomeCart"
    />
  );
}
