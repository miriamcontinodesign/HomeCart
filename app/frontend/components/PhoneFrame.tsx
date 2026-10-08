import React from 'react';
import { Modal, ModalProps, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// HomeCart is designed phone-first. On tablets and desktops the whole app sits in a centred,
// phone-shaped frame so the proportions stay the same; on phones it fills the screen.

const FRAME_FROM_WIDTH = 700;   // narrower windows (phones) use the full screen
// iPhone 17 Pro Max screen in points (1 : 2.17). Shorter windows scale the frame down evenly,
// so the shape never changes.
const PHONE_WIDTH = 440;
const PHONE_HEIGHT = 956;
const FRAME_MARGIN = 24;
export const FRAME_RADIUS = 36;

export type FrameRect = { framed: boolean; width: number; height: number; left: number; top: number };

export function usePhoneFrame(): FrameRect {
  const { width: winW, height: winH } = useWindowDimensions();
  if (winW < FRAME_FROM_WIDTH) return { framed: false, width: winW, height: winH, left: 0, top: 0 };
  const scale = Math.min(1, (winH - FRAME_MARGIN * 2) / PHONE_HEIGHT, (winW - FRAME_MARGIN * 2) / PHONE_WIDTH);
  const width = Math.round(PHONE_WIDTH * scale);
  const height = Math.round(PHONE_HEIGHT * scale);
  return { framed: true, width, height, left: (winW - width) / 2, top: (winH - height) / 2 };
}

/** The app's outer shell: full screen on phones, a phone-shaped card on wider screens. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const frame = usePhoneFrame();
  if (!frame.framed) {
    return <View style={[styles.fill, { backgroundColor: colors.bgApp }]}>{children}</View>;
  }
  return (
    <View style={[styles.fill, styles.desk, { backgroundColor: colors.bgDesk }]}>
      {/* Soft, blurred brand colours behind the phone */}
      <View style={styles.blurLayer} pointerEvents="none">
        <View style={[styles.blob, styles.blobA, { backgroundColor: colors.actionPrimary }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: colors.highlightFill }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: colors.matchFill }]} />
      </View>
      <View
        style={[
          styles.phone,
          { width: frame.width, height: frame.height, backgroundColor: colors.bgApp, borderColor: colors.borderDefault, boxShadow: `0 24px 64px ${colors.frameShadow}` } as any,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Drop-in for React Native's Modal. On the web, modals render over the whole window, so on
 * wide screens this keeps a sheet inside the phone frame instead of stretching across the desk.
 */
export function FramedModal({ children, transparent, ...props }: ModalProps) {
  const { colors } = useTheme();
  const frame = usePhoneFrame();
  return (
    <Modal {...props} transparent>
      <View
        style={[
          styles.modalArea,
          { width: frame.width, height: frame.height, left: frame.left, top: frame.top },
          frame.framed && styles.modalAreaFramed,
          // Opaque sheets keep their own background inside the frame.
          !transparent && { backgroundColor: colors.bgApp },
        ]}
      >
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  desk: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blurLayer: { ...StyleSheet.absoluteFillObject, filter: 'blur(90px)' } as any,
  blob: { position: 'absolute', borderRadius: 9999, opacity: 0.45 },
  blobA: { width: '45%', aspectRatio: 1, top: '-10%', left: '-8%' },
  blobB: { width: '38%', aspectRatio: 1, bottom: '-12%', right: '-6%' },
  blobC: { width: '30%', aspectRatio: 1, top: '45%', left: '62%' },
  phone: {
    borderRadius: FRAME_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalArea: { position: 'absolute' },
  modalAreaFramed: { borderRadius: FRAME_RADIUS, overflow: 'hidden' },
});
