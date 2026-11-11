import { router } from 'expo-router';
import { ArrowLeft, Shield } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Panel, ScreenTitle } from '../components';
import { colors, font } from '../theme';

const guidance = [
  {
    title: 'Earthquake',
    steps: [
      'Drop to your hands and knees, cover your head and neck, and hold on under sturdy furniture if available.',
      'Stay away from windows. If you are outside, move to an open area away from buildings, trees, and power lines.',
      'After shaking stops, check for injuries and hazards. Avoid damaged buildings and expect aftershocks.',
    ],
  },
  {
    title: 'Flood',
    steps: [
      'Move to higher ground and follow evacuation instructions from local authorities.',
      'Never walk, swim, or drive through floodwater. Water may hide hazards or move more quickly than it appears.',
      'Avoid downed power lines and contaminated water. Return only when authorities say it is safe.',
    ],
  },
  {
    title: 'Fire',
    steps: [
      'Leave immediately using the nearest safe exit. Do not stop to collect belongings or use elevators.',
      'If there is smoke, stay low. Once outside, move away from the building and call your local emergency number.',
      'Do not re-enter until firefighters or local authorities say it is safe.',
    ],
  },
  {
    title: 'Severe weather',
    steps: [
      'Go to a sturdy shelter, preferably an interior room away from windows.',
      'Monitor official local weather alerts if available and follow evacuation instructions.',
      'After the event, watch for debris, unstable structures, floodwater, and downed power lines.',
    ],
  },
];

export default function EmergencyGuideScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <ArrowLeft color={colors.text} size={19} />
        </Pressable>
        <ScreenTitle title="Emergency guide" subtitle="Quick reminders for common emergencies. This guide works offline; follow instructions from local emergency services." />
        <View style={styles.warning}>
          <Shield color={colors.green} size={16} />
          <Text style={styles.warningText}>If you are in immediate danger, contact your local emergency number as soon as it is safe.</Text>
        </View>
        {guidance.map(({ title, steps }) => (
          <Panel key={title} style={styles.card}>
            <Text style={styles.sectionHeading}>{title}</Text>
            {steps.map((step, index) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Panel>
        ))}
        <Text style={styles.footer}>General preparedness information only. Local risks and official guidance vary by location.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 21, paddingTop: 16, paddingBottom: 30 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 15, padding: 12, borderWidth: 1, borderColor: '#31513d', borderRadius: 12, backgroundColor: '#102017' },
  warningText: { flex: 1, color: '#c7d7cc', fontFamily: font.regular, fontSize: 11, lineHeight: 17 },
  card: { gap: 12, marginBottom: 11, padding: 15 },
  sectionHeading: { color: colors.text, fontFamily: font.display, fontSize: 15 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNumber: { width: 21, height: 21, overflow: 'hidden', borderRadius: 11, backgroundColor: '#242426', color: colors.green, fontFamily: font.bold, fontSize: 10, lineHeight: 21, textAlign: 'center' },
  stepText: { flex: 1, color: '#d1d1d4', fontFamily: font.regular, fontSize: 11, lineHeight: 17 },
  footer: { marginTop: 4, color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
