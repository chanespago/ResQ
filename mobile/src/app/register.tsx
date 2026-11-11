import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { Panel, PrimaryButton } from '../components';
import { colors, font } from '../theme';

export default function RegisterScreen() {
  const { configured, loading: authLoading, signIn, signUp, user } = useAuth();
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>('sign-up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authLoading && user) router.replace('/(main)');
  }, [authLoading, user]);

  async function submitAccount() {
    setError('');
    setMessage('');
    if (!configured) {
      setError('Supabase is not configured for this build. Add its URL and publishable key to the build environment, then rebuild the app.');
      return;
    }
    if (mode === 'sign-up' && name.trim().length < 2) return setError('Enter your name to continue.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (mode === 'sign-up' && !acceptedTerms) return setError('Please agree to the Terms and Privacy Policy.');

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password);
        router.replace('/(main)');
      } else {
        const hasSession = await signUp(name.trim(), email.trim(), password);
        if (hasSession) router.replace('/(main)');
        else {
          setMode('sign-in');
          setMessage('Check your email to confirm your account, then sign in.');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to authenticate. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to welcome screen" onPress={() => router.back()} style={styles.back}>
            <ArrowLeft color={colors.text} size={19} />
          </Pressable>
          <View style={styles.mark}><ShieldCheck color={colors.red} size={22} /></View>
          <Text style={styles.title}>{mode === 'sign-up' ? <>Create your{'\n'}RESQ account.</> : <>Sign in to{'\n'}RESQ.</>}</Text>
          <Text style={styles.subtitle}>{mode === 'sign-up' ? 'Your safety circle starts here.' : 'Access your safety circle.'}</Text>

          <Panel style={styles.form}>
            {mode === 'sign-up' ? <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" /> : null}
            <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" autoComplete="email" keyboardType="email-address" />
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordBox}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.dim}
                  secureTextEntry={!showPassword}
                  style={styles.passwordInput}
                  value={password}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  {showPassword ? <EyeOff color={colors.muted} size={18} /> : <Eye color={colors.muted} size={18} />}
                </Pressable>
              </View>
            </View>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
            {mode === 'sign-up' ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms }} onPress={() => setAcceptedTerms(!acceptedTerms)} style={styles.terms}>
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>{acceptedTerms ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                <Text style={styles.termsCopy}>I agree to the <Text style={styles.link}>Terms</Text> and <Text style={styles.link}>Privacy Policy</Text></Text>
              </Pressable>
            ) : null}
            <PrimaryButton
              disabled={submitting || authLoading}
              label={submitting ? 'Please wait...' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
              onPress={submitAccount}
              icon={<ArrowRight color="#fff" size={17} />}
            />
          </Panel>
          <View style={styles.accountSwitch}>
            <Text style={styles.accountSwitchText}>{mode === 'sign-up' ? 'Already have an account?' : 'New to RESQ?'}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}>
              <Text style={styles.link}>{mode === 'sign-up' ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
          </View>
          <View style={styles.privacy}><ShieldCheck color={colors.green} size={15} /><Text style={styles.privacyText}>{configured ? 'Authentication is managed securely by Supabase.' : 'Supabase setup is required to enable sign-in.'}</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, autoComplete, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoComplete: 'name' | 'email';
  keyboardType?: 'email-address';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoComplete === 'email' ? 'none' : 'words'}
        autoComplete={autoComplete}
        keyboardType={keyboardType ?? 'default'}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        returnKeyType="next"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  flex: { flex: 1, width: '100%' },
  scrollView: { flex: 1, width: '100%' },
  scroll: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 26 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  mark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 26, marginBottom: 15, borderRadius: 13, backgroundColor: '#291514' },
  title: { color: colors.text, fontFamily: font.displayBold, fontSize: 32, lineHeight: 37 },
  subtitle: { marginTop: 8, marginBottom: 22, color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  form: { padding: 16, gap: 14 },
  fieldWrap: { gap: 7 },
  label: { color: '#d3d3d6', fontFamily: font.medium, fontSize: 11 },
  input: { height: 48, borderWidth: 1, borderColor: '#303033', borderRadius: 10, backgroundColor: '#0d0d0e', color: colors.text, fontFamily: font.regular, fontSize: 13, paddingHorizontal: 12 },
  passwordBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#303033', borderRadius: 10, backgroundColor: '#0d0d0e', paddingRight: 12 },
  passwordInput: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 13, paddingHorizontal: 12, paddingVertical: 12 },
  error: { color: '#ff7770', fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  message: { color: colors.green, fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 },
  checkbox: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5b5b60', borderRadius: 5 },
  checkboxChecked: { borderColor: colors.red, backgroundColor: colors.red },
  checkmark: { color: '#fff', fontSize: 12, lineHeight: 15 },
  termsCopy: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
  link: { color: '#e9e9eb', fontFamily: font.medium },
  accountSwitch: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 20 },
  accountSwitchText: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20 },
  privacyText: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
});