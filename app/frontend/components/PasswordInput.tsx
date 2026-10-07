import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// Password field with a show/hide toggle. Used on sign-in, sign-up, reset and change password
// so every password entry behaves the same.
export default function PasswordInput({
  value, onChangeText, placeholder = '••••••••', autoComplete = 'current-password', ...rest
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'secureTextEntry' | 'autoComplete'>) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
      <TextInput
        {...rest}
        style={[styles.input, { color: colors.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
      />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 14, borderWidth: 1, paddingLeft: 16 },
  input: { flex: 1, minWidth: 0, height: '100%', fontSize: 15 },
  toggle: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
});
