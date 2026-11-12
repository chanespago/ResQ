import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { colors, font } from '../theme';

export default function SplashScreen() {
  const { loading, user } = useAuth();
  const [fade] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(18));

  useEffect(() => {
    if (!loading && user) router.replace('/(main)');
  }, [loading, user]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(lift, { toValue: 0, speed: 13, bounciness: 4, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fade, lift]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.beam} />
      <View style={styles.beamSecond} />
      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: lift }] }]}>
        <View style={styles.brandMark}>
          <View style={styles.markGlow} />
          <ShieldCheck color={colors.red} size={39} strokeWidth={1.7} />
        </View>
        <Text style={styles.brand}>ResQ</Text>
        <View style={styles.rule} />
        <Text style={styles.copy}>A little more prepared.{ '\n' }Everywhere you go.</Text>
      </Animated.View>
      <View style={styles.bottom}>
        {loading ? <ActivityIndicator color={colors.red} /> : (
          <Pressable accessibilityRole="button" onPress={() => router.replace('./register')} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}>
            <Text style={styles.startText}>Get started</Text>
            <ArrowRight color="#fff" size={18} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden', justifyContent: 'space-between', backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 68, paddingBottom: 20 },
  beam: { position: 'absolute', top: '35%', left: -100, width: 600, height: 9, backgroundColor: '#9e211c', opacity: 0.32, transform: [{ rotate: '-22deg' }] },
  beamSecond: { position: 'absolute', top: '67%', left: 140, width: 450, height: 7, backgroundColor: colors.red, opacity: 0.16, transform: [{ rotate: '-48deg' }] },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', alignItems: 'flex-start', justifyContent: 'center', paddingBottom: 36 },
  brandMark: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#54211f', borderRadius: 25, backgroundColor: '#171112', marginBottom: 24 },
  markGlow: { position: 'absolute', width: 116, height: 116, borderRadius: 60, backgroundColor: '#f0443e0c' },
  brand: { color: colors.text, fontFamily: font.displayBold, fontSize: 55, lineHeight: 62 },
  rule: { width: 40, height: 2, marginTop: 27, marginBottom: 20, backgroundColor: colors.red },
  copy: { color: '#b7b7ba', fontFamily: font.regular, fontSize: 17, lineHeight: 26 },
  bottom: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 20 },
  startButton: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: colors.red, paddingHorizontal: 18 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  startText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
});