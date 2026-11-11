import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from './theme';

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      {icon}
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, positive = false }: { label: string; positive?: boolean }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, positive && styles.positiveDot]} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 7, marginBottom: 22 },
  title: { color: colors.text, fontFamily: font.displayBold, fontSize: 27 },
  subtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 12,
    backgroundColor: colors.red,
    paddingHorizontal: 18,
  },
  secondaryButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  secondaryText: { color: colors.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  pillDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.dim },
  positiveDot: { backgroundColor: colors.green },
  pillText: { color: '#c7c7ca', fontFamily: font.medium, fontSize: 10 },
});