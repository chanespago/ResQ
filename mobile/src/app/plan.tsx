import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, MapPin, ShieldCheck } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Panel, PrimaryButton, ScreenTitle } from '../components';
import { colors, font } from '../theme';

const storageKey = 'resq.reunification-plan.v1';

type ReunificationPlan = {
  primaryMeetingPoint: string;
  backupMeetingPoint: string;
  contactName: string;
  contactPhone: string;
};

const emptyPlan: ReunificationPlan = {
  primaryMeetingPoint: '',
  backupMeetingPoint: '',
  contactName: '',
  contactPhone: '',
};

export default function ReunificationPlanScreen() {
  const [plan, setPlan] = useState(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(storageKey).then((stored) => {
      if (!active || stored === null) return;
      const parsed: unknown = JSON.parse(stored);
      if (!isReunificationPlan(parsed)) throw new Error('The saved plan could not be read. You can replace it by saving a new plan.');
      setPlan(parsed);
      setHasSavedPlan(true);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'The saved plan could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function updatePlan(key: keyof ReunificationPlan, value: string) {
    setPlan((current) => ({ ...current, [key]: value }));
    setMessage('');
  }

  async function savePlan() {
    setError('');
    setMessage('');
    if (plan.primaryMeetingPoint.trim().length < 3) {
      setError('Add a primary meeting place before saving your plan.');
      return;
    }

    setSaving(true);
    try {
      const normalizedPlan = {
        primaryMeetingPoint: plan.primaryMeetingPoint.trim(),
        backupMeetingPoint: plan.backupMeetingPoint.trim(),
        contactName: plan.contactName.trim(),
        contactPhone: plan.contactPhone.trim(),
      };
      await SecureStore.setItemAsync(storageKey, JSON.stringify(normalizedPlan));
      setPlan(normalizedPlan);
      setHasSavedPlan(true);
      setMessage('Plan saved securely on this device.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The plan could not be saved securely.');
    } finally {
      setSaving(false);
    }
  }

  function confirmClearPlan() {
    Alert.alert('Clear reunification plan?', 'This removes the saved plan from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear plan',
        style: 'destructive',
        onPress: () => { void clearPlan(); },
      },
    ]);
  }

  async function clearPlan() {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await SecureStore.deleteItemAsync(storageKey);
      setPlan(emptyPlan);
      setHasSavedPlan(false);
      setMessage('Saved plan cleared from this device.');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'The saved plan could not be cleared.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <ArrowLeft color={colors.text} size={19} />
        </Pressable>
        <ScreenTitle title="Reunification plan" subtitle="Decide where your household will meet if you get separated during an emergency. Your plan stays on this device and is available offline." />
        <View style={styles.privacy}>
          <ShieldCheck color={colors.green} size={16} />
          <Text style={styles.privacyText}>Your plan is encrypted and saved only on this device. It is not sent to RESQ or your contacts.</Text>
        </View>
        {loading ? <ActivityIndicator style={styles.loader} color={colors.red} /> : (
          <>
            <Panel style={styles.form}>
              <PlanField
                label="Primary meeting place"
                hint="Choose a specific, familiar place everyone can reach."
                value={plan.primaryMeetingPoint}
                onChangeText={(value) => updatePlan('primaryMeetingPoint', value)}
                placeholder="e.g. the community center entrance"
                maxLength={200}
              />
              <PlanField
                label="Backup meeting place"
                hint="Use this if the primary place is unsafe or inaccessible."
                value={plan.backupMeetingPoint}
                onChangeText={(value) => updatePlan('backupMeetingPoint', value)}
                placeholder="e.g. the library on Oak Street"
                maxLength={200}
              />
              <PlanField
                label="Out-of-area contact"
                hint="Choose someone outside your local area who can pass messages."
                value={plan.contactName}
                onChangeText={(value) => updatePlan('contactName', value)}
                placeholder="Contact name"
                maxLength={100}
              />
              <PlanField
                label="Contact phone"
                value={plan.contactPhone}
                onChangeText={(value) => updatePlan('contactPhone', value)}
                placeholder="Phone number with country code"
                keyboardType="phone-pad"
                maxLength={40}
              />
            </Panel>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
            <PrimaryButton label={saving ? 'Saving…' : 'Save offline plan'} onPress={() => { void savePlan(); }} disabled={saving} icon={<MapPin color="#fff" size={17} />} />
            {hasSavedPlan ? (
              <Pressable accessibilityRole="button" disabled={saving} onPress={confirmClearPlan} style={styles.clearButton}>
                <Text style={styles.clearText}>Clear saved plan</Text>
              </Pressable>
            ) : null}
            <Text style={styles.footer}>Discuss the plan with everyone involved and review it when meeting places or contact details change. Keep a separate copy in case this phone is lost or damaged.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function isReunificationPlan(value: unknown): value is ReunificationPlan {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<keyof ReunificationPlan, unknown>;
  return typeof candidate.primaryMeetingPoint === 'string'
    && candidate.primaryMeetingPoint.length <= 200
    && typeof candidate.backupMeetingPoint === 'string'
    && candidate.backupMeetingPoint.length <= 200
    && typeof candidate.contactName === 'string'
    && candidate.contactName.length <= 100
    && typeof candidate.contactPhone === 'string'
    && candidate.contactPhone.length <= 40;
}

function PlanField({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad';
  maxLength: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        autoCapitalize={keyboardType === 'default' ? 'sentences' : 'none'}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 21, paddingTop: 16, paddingBottom: 30 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16, padding: 12, borderWidth: 1, borderColor: '#31513d', borderRadius: 12, backgroundColor: '#102017' },
  privacyText: { flex: 1, color: '#c7d7cc', fontFamily: font.regular, fontSize: 11, lineHeight: 17 },
  form: { gap: 17, marginBottom: 14, padding: 14 },
  field: { gap: 6 },
  label: { color: colors.text, fontFamily: font.medium, fontSize: 12 },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#303033', borderRadius: 10, backgroundColor: '#0d0d0e', color: colors.text, fontFamily: font.regular, fontSize: 12, paddingHorizontal: 12 },
  loader: { margin: 24 },
  error: { marginBottom: 10, color: '#ff7770', fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  message: { marginBottom: 10, color: colors.green, fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  clearButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1, borderColor: '#5b2c2a', borderRadius: 10, backgroundColor: '#211414' },
  clearText: { color: '#ff7770', fontFamily: font.medium, fontSize: 11 },
  footer: { marginTop: 17, color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
