import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Text, Linking, StyleSheet } from 'react-native';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useTheme } from '../theme/ThemeContext';

// Invisible hCaptcha for Supabase Auth's CAPTCHA protection. When it's switched on in Supabase
// (Authentication → Attack Protection), every sign-in, sign-up, password reset and anonymous
// (demo) sign-in must carry a fresh token. Call `getToken()` right before the auth call: it
// runs the check in the background and only shows a puzzle when hCaptcha is unsure.
//
// Without EXPO_PUBLIC_HCAPTCHA_SITE_KEY nothing renders and getToken() resolves undefined, so
// auth works as before — set the key (and redeploy) before enabling CAPTCHA in Supabase.

export const CAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY || '';

export type CaptchaHandle = {
  /** A single-use token for the next Supabase auth call, or undefined when CAPTCHA is off. */
  getToken: () => Promise<string | undefined>;
};

const Captcha = forwardRef<CaptchaHandle>(function Captcha(_props, ref) {
  const { colors } = useTheme();
  const widget = useRef<HCaptcha>(null);

  useImperativeHandle(ref, () => ({
    getToken: async () => {
      if (!CAPTCHA_SITE_KEY) return undefined;
      if (!widget.current) throw new Error('The security check is still loading. Please try again.');
      try {
        const { response } = await widget.current.execute({ async: true });
        return response;
      } catch (e: any) {
        throw new Error(e === 'challenge-closed' || e?.message === 'challenge-closed'
          ? 'Please complete the security check to continue.'
          : "The security check couldn't load. Check your connection and try again.");
      } finally {
        // Tokens are single-use: start fresh for the next attempt.
        widget.current?.resetCaptcha();
      }
    },
  }), []);

  if (!CAPTCHA_SITE_KEY) return null;

  // hCaptcha's terms ask invisible-mode sites to show this notice.
  return (
    <>
      <HCaptcha ref={widget} sitekey={CAPTCHA_SITE_KEY} size="invisible" theme="light" />
      <Text style={[styles.notice, { color: colors.textSecondary }]}>
        Protected by hCaptcha. Its{' '}
        <Text style={{ color: colors.textAccent }} onPress={() => Linking.openURL('https://www.hcaptcha.com/privacy')}>Privacy Policy</Text>
        {' '}and{' '}
        <Text style={{ color: colors.textAccent }} onPress={() => Linking.openURL('https://www.hcaptcha.com/terms')}>Terms of Service</Text>
        {' '}apply.
      </Text>
    </>
  );
});

export default Captcha;

const styles = StyleSheet.create({
  notice: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16 },
});
