import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Activity, Battery, Bell, Flashlight, MapPin, Phone, Shield, Volume2, Wifi, X } from 'lucide-react-native';
import { useBatteryLevel } from 'expo-battery';
import { useNetworkState } from 'expo-network';
import * as Brightness from 'expo-brightness';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Panel, StatusPill } from '../../components';
import { useAppPreferences } from '../../appPreferences';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../backend/supabase';
import { colors, font } from '../../theme';

const tools = [
  { name: 'Strobe', Icon: Flashlight },
  { name: 'Sound alarm', Icon: Volume2 },
  { name: 'Emergency guide', Icon: Shield },
  { name: 'Reunification plan', Icon: MapPin },
  { name: 'Call Contact', Icon: Phone },
];
const sosRequestTimeoutMs = 15000;

type NearbySos = {
  id: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
};

type EmergencyContact = { id: string; name: string; phone: string };

export default function SafetyScreen() {
  const [emergencyVisible, setEmergencyVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [emergencySaving, setEmergencySaving] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [sosLocation, setSosLocation] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [contactMessageStatus, setContactMessageStatus] = useState('');
  const [sendingContactMessage, setSendingContactMessage] = useState(false);
  const [resolvingAlert, setResolvingAlert] = useState(false);
  const [strobeActive, setStrobeActive] = useState(false);
  const [strobeLit, setStrobeLit] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const [nearbyAlerts, setNearbyAlerts] = useState<NearbySos[]>([]);
  const [callContacts, setCallContacts] = useState<EmergencyContact[]>([]);
  const [callContactsVisible, setCallContactsVisible] = useState(false);
  const [loadingCallContacts, setLoadingCallContacts] = useState(false);
  const [holdProgress] = useState(() => new Animated.Value(0));
  const [radarProgress] = useState(() => new Animated.Value(0));
  const strobeStarting = useRef(false);
  const strobeBrightness = useRef<number | null>(null);
  const alarmPlayer = useAudioPlayer(require('../../../assets/emergency-alarm.wav'));
  const alarmStatus = useAudioPlayerStatus(alarmPlayer);
  const batteryLevel = useBatteryLevel();
  const networkState = useNetworkState();
  const { user } = useAuth();
  const { preferences } = useAppPreferences();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emergencyStart = useRef<number | null>(null);

  const restoreStrobeBrightness = useCallback(async () => {
    const previousBrightness = strobeBrightness.current;
    strobeBrightness.current = null;
    if (previousBrightness === null || Platform.OS === 'web') return;
    try {
      await Brightness.setBrightnessAsync(previousBrightness);
    } catch (error) {
      Alert.alert('Brightness could not be restored', error instanceof Error ? error.message : 'Restore your preferred brightness in device settings.');
    }
  }, []);

  const stopStrobe = useCallback(async () => {
    setStrobeActive(false);
    setStrobeLit(false);
    await restoreStrobeBrightness();
  }, [restoreStrobeBrightness]);

  const startStrobe = useCallback(async () => {
    if (strobeStarting.current) return;
    strobeStarting.current = true;
    try {
      if (Platform.OS !== 'web') {
        strobeBrightness.current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      }
      setStrobeLit(false);
      setStrobeActive(true);
    } catch (error) {
      await restoreStrobeBrightness();
      Alert.alert('Strobe unavailable', error instanceof Error ? error.message : 'Could not set the screen to maximum brightness.');
    } finally {
      strobeStarting.current = false;
    }
  }, [restoreStrobeBrightness]);

  const stopAlarm = useCallback(() => {
    setAlarmActive(false);
  }, []);

  useEffect(() => {
    if (!emergencyVisible) return;
    const timer = setInterval(() => {
      if (emergencyStart.current) setElapsed(Math.floor((Date.now() - emergencyStart.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [emergencyVisible]);

  useEffect(() => {
    if (!emergencyVisible) return;
    radarProgress.setValue(0);
    const sweep = Animated.loop(Animated.timing(radarProgress, { toValue: 1, duration: 2600, useNativeDriver: true }));
    sweep.start();
    return () => sweep.stop();
  }, [emergencyVisible, radarProgress]);

  useEffect(() => {
    if (!strobeActive) return;
    const timer = setInterval(() => setStrobeLit((lit) => !lit), 700);
    return () => clearInterval(timer);
  }, [strobeActive]);

  useEffect(() => {
    if (!strobeActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void stopStrobe();
    });
    return () => subscription.remove();
  }, [strobeActive, stopStrobe]);

  useEffect(() => {
    if (!alarmActive || !alarmStatus.isLoaded) return;
    let active = true;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).then(() => {
      if (!active) return;
      alarmPlayer.volume = 1;
      alarmPlayer.loop = true;
      alarmPlayer.play();
    }).catch((error: unknown) => {
      if (!active) return;
      setAlarmActive(false);
      Alert.alert('Alarm could not start', error instanceof Error ? error.message : 'Check your phone audio settings and try again.');
    });
    return () => {
      active = false;
      alarmPlayer.pause();
    };
  }, [alarmActive, alarmPlayer, alarmStatus.isLoaded]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setAlarmActive(false);
        if (strobeActive) void stopStrobe();
      }
    });
    return () => subscription.remove();
  }, [strobeActive, stopStrobe]);

  useEffect(() => {
    if (!emergencyVisible || !sosLocation || !preferences.communitySharing) return;
    let active = true;
    const loadNearby = async () => {
      const { data, error } = await getSupabaseClient().rpc('nearby_sos', {
        p_latitude: sosLocation.latitude,
        p_longitude: sosLocation.longitude,
        p_radius_meters: 10000,
      });
      if (active && !error) setNearbyAlerts((data ?? []) as NearbySos[]);
    };
    void loadNearby();
    const timer = setInterval(() => { void loadNearby(); }, 12000);
    return () => { active = false; clearInterval(timer); };
  }, [emergencyVisible, preferences.communitySharing, sosLocation]);

  function beginEmergencyHold() {
    if (!user || emergencySaving) return;
    setIsHolding(true);
    holdProgress.setValue(0);
    Animated.timing(holdProgress, { toValue: 1, duration: 2000, useNativeDriver: false }).start();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      void createEmergencyAlert();
    }, 2000);
  }

  async function createEmergencyAlert() {
    if (!user || emergencySaving) return;
    setEmergencySaving(true);
    setContactMessageStatus('');
    setActiveAlertId(null);
    setNearbyAlerts([]);
    setSosLocation(null);
    emergencyStart.current = Date.now();
    setElapsed(0);
    setEmergencyVisible(true);
    let location: Location.LocationObject | null = null;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }

      const { data, error } = await getSupabaseClient()
        .from('sos_alerts')
        .insert({
          user_id: user.id,
          latitude: location?.coords.latitude ?? null,
          longitude: location?.coords.longitude ?? null,
          accuracy_meters: location?.coords.accuracy ?? null,
          community_visible: preferences.communitySharing,
          status: 'active',
        })
        .select('id')
        .single();

      if (error) throw error;
      setActiveAlertId(data.id);
      setSosLocation(location ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      } : null);
    } catch (error) {
      setEmergencyVisible(false);
      emergencyStart.current = null;
      Alert.alert('SOS could not be sent', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setEmergencySaving(false);
    }
  }

  async function notifyEmergencyContacts() {
    if (!user) return;
    if (!preferences.smsOnSos) {
      setContactMessageStatus('SMS alerts are disabled in Settings.');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), sosRequestTimeoutMs);
    setSendingContactMessage(true);
    setContactMessageStatus('Loading emergency contacts…');
    try {
      const { data: contacts, error } = await getSupabaseClient()
        .from('emergency_contacts')
        .select('name, phone')
        .eq('user_id', user.id)
        .abortSignal(controller.signal);
      if (error) throw error;
      const recipients = (contacts ?? []).map((contact) => contact.phone).filter(Boolean);
      if (!recipients.length) {
        setContactMessageStatus('Add an emergency contact in Settings first.');
        return;
      }
      if (!(await SMS.isAvailableAsync())) {
        setContactMessageStatus('SMS is not available on this device.');
        return;
      }

      const sender = typeof user.user_metadata.display_name === 'string' ? user.user_metadata.display_name : 'A RESQ user';
      const locationLink = sosLocation
        ? ` Location: https://maps.google.com/?q=${sosLocation.latitude},${sosLocation.longitude}`
        : ' Location permission was unavailable.';
      const message = `${sender} activated an SOS alert in RESQ.${locationLink} Please contact them now.`;
      const result = await SMS.sendSMSAsync(recipients, message);
      setContactMessageStatus(result.result === 'sent'
        ? 'SMS marked as sent by the device.'
        : result.result === 'cancelled'
          ? 'SMS composer cancelled.'
          : 'SMS composer closed; delivery could not be confirmed.');
    } catch (error) {
      setContactMessageStatus(controller.signal.aborted
        ? 'Could not load contacts: the request timed out. Check your internet connection and try again.'
        : error instanceof Error ? error.message : 'Could not open SMS.');
    } finally {
      clearTimeout(timeout);
      setSendingContactMessage(false);
    }
  }

  async function resolveEmergencyAlert() {
    if (!activeAlertId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), sosRequestTimeoutMs);
    setResolvingAlert(true);
    try {
      const { data, error } = await getSupabaseClient()
        .from('sos_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', activeAlertId)
        .abortSignal(controller.signal)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The alert could not be found or you no longer have permission to resolve it.');
      setEmergencyVisible(false);
      setActiveAlertId(null);
    } catch (error) {
      Alert.alert(
        'Could not resolve alert',
        controller.signal.aborted
          ? 'The request timed out. Check your internet connection and try again.'
          : error instanceof Error ? error.message : 'Try again.',
      );
    } finally {
      clearTimeout(timeout);
      setResolvingAlert(false);
    }
  }

  async function showCallContactPicker() {
    if (!user) return;
    setLoadingCallContacts(true);
    try {
      const { data, error } = await getSupabaseClient()
        .from('emergency_contacts')
        .select('id,name,phone')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!data?.length) {
        Alert.alert('No emergency contacts', 'Add an emergency contact in Settings first.');
        return;
      }
      setCallContacts(data as EmergencyContact[]);
      setCallContactsVisible(true);
    } catch (error) {
      Alert.alert('Contacts unavailable', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoadingCallContacts(false);
    }
  }

  async function callEmergencyContact(phone: string) {
    try {
      await Linking.openURL(`tel:${phone}`);
      setCallContactsVisible(false);
    } catch {
      Alert.alert('Calling unavailable', 'This device cannot open the phone app.');
    }
  }

  function cancelEmergencyHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setIsHolding(false);
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
  }

  function activateTool(tool: string) {
    switch (tool) {
      case 'Strobe':
        if (strobeActive) void stopStrobe();
        else void startStrobe();
        break;
      case 'Sound alarm':
        setAlarmActive(true);
        break;
      case 'Emergency guide':
        router.push('/guide');
        break;
      case 'Reunification plan':
        router.push('/plan');
        break;
      case 'Call Contact':
        void showCallContactPicker();
        break;
    }
  }

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const batteryLabel = batteryLevel >= 0 ? `${Math.round(batteryLevel * 100)}%` : 'N/A';
  const networkLabel = getInternetLabel(networkState);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.brand}>RESQ</Text></View>
          <StatusPill label="Safety ready" positive />
        </View>
        <Panel style={styles.devicePill}>
          <StatusCell icon={<Battery color={colors.green} size={14} />} label="Battery" value={batteryLabel} />
          <StatusCell icon={<Wifi color={networkState.isInternetReachable ? colors.blue : colors.muted} size={14} />} label="Internet" value={networkLabel} />
        </Panel>

        <View style={styles.sosArea}>
          <View pointerEvents="none" style={styles.outerRing} />
          <View pointerEvents="none" style={styles.midRing} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold for two seconds to create an SOS alert"
            accessibilityHint="Saves an SOS alert, requests your location, and lets you open an SMS for your emergency contacts."
            onPressIn={beginEmergencyHold}
            onPressOut={cancelEmergencyHold}
            style={({ pressed }) => [styles.sosButton, pressed && styles.sosPressed]}
          >
            <Text style={styles.sosText}>SOS</Text>
            <Text style={styles.sosCaption}>Hold for Help</Text>
          </Pressable>
          <View pointerEvents="none" style={styles.holdProgressTrack}>
            <Animated.View
              style={[
                styles.holdProgressFill,
                { width: holdProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={[styles.holdCaption, isHolding && styles.holdCaptionActive]}>
            {emergencySaving ? 'Sending SOS...' : isHolding ? 'Keep holding...' : 'Hold 2 seconds to activate emergency'}
          </Text>
        </View>

        <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>Quick tools</Text></View>
        <View style={styles.tools}>
          {tools.map(({ name, Icon }) => {
            const active = name === 'Strobe' ? strobeActive
              : name === 'Sound alarm' ? alarmActive
                : name === 'Call Contact' && callContactsVisible;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityHint={name === 'Reunification plan' ? 'View or edit your offline meeting plan.' : undefined}
                onPress={() => activateTool(name)}
                style={[styles.toolButton, active && styles.toolActive]}
              >
                <Icon color={active ? '#ff7770' : '#9a9a9e'} size={18} strokeWidth={1.7} />
                <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.safetyHint}><Shield color={colors.green} size={16} /><Text style={styles.safetyHintText}>Emergency guide and plan work offline.</Text><Wifi color="#7d7d82" size={15} /></View>
      </ScrollView>

      <Modal animationType="fade" transparent visible={emergencyVisible} onRequestClose={() => { if (!emergencySaving) void resolveEmergencyAlert(); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.alertBadge}><Bell color="#ff7770" size={13} /><Text style={styles.alertBadgeText}>{emergencySaving ? 'SENDING SOS' : 'SOS ALERT ACTIVE'}</Text></View>
            <View style={styles.timer}><Shield color="#fff" size={17} /><Text style={styles.timerText}>{clock}</Text></View>
            <Text style={styles.modalTitle}>{emergencySaving ? 'Sending your SOS…' : 'SOS is active'}</Text>
            <View accessible accessibilityLabel={`Radar showing ${nearbyAlerts.length} active nearby SOS requests`} style={styles.radar}>
              <View style={[styles.radarRing, styles.radarRingOuter]} />
              <View style={[styles.radarRing, styles.radarRingMiddle]} />
              <View style={[styles.radarRing, styles.radarRingInner]} />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.radarSweep,
                  { transform: [{ rotate: radarProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
                ]}
              >
                <View style={styles.radarBeam} />
              </Animated.View>
              {sosLocation ? nearbyAlerts.map((alert) => (
                <View key={alert.id} style={[styles.radarBlip, getRadarBlipPosition(sosLocation, alert)]} />
              )) : null}
              <View style={styles.radarCenter}><Activity color={colors.green} size={19} /></View>
            </View>
            <Text style={styles.radarTitle}>{nearbyAlerts.length} nearby SOS {nearbyAlerts.length === 1 ? 'request' : 'requests'}</Text>
            <Text style={styles.radarCopy}>{emergencySaving ? 'Please wait while your alert is sent.' : !preferences.communitySharing ? 'Community sharing is off in Settings.' : sosLocation ? 'Live requests within 10 km. Refreshes every 12 seconds.' : 'Nearby scan unavailable without your location.'}</Text>
            <Text style={styles.modalCopy}>{emergencySaving ? 'Keep this screen open while RESQ requests your location and sends the alert.' : preferences.communitySharing ? 'Your SOS is shared with the RESQ community. For immediate danger, call your local emergency number.' : 'Your SOS is active for you. Community sharing is off. For immediate danger, call your local emergency number.'}</Text>
            <Panel style={styles.locationPanel}><MapPin color={colors.blue} size={16} /><View style={styles.locationText}><Text style={styles.locationTitle}>Your location</Text><Text style={styles.locationMeta}>{sosLocation ? `${sosLocation.latitude.toFixed(5)}, ${sosLocation.longitude.toFixed(5)}` : 'Unavailable · location permission not granted'}</Text></View></Panel>
            {emergencySaving ? <ActivityIndicator color={colors.red} style={{ margin: 20 }} /> : (
              <>
                <Pressable accessibilityRole="button" disabled={sendingContactMessage || resolvingAlert} onPress={() => { void notifyEmergencyContacts(); }} style={[styles.endButton, (sendingContactMessage || resolvingAlert) && styles.actionDisabled]}>
                  {sendingContactMessage ? <ActivityIndicator color={colors.text} size="small" /> : null}
                  <Text style={styles.endButtonText}>{sendingContactMessage ? 'Opening SMS…' : 'Open SMS for emergency contacts'}</Text>
                </Pressable>
                {contactMessageStatus ? <Text style={styles.contactMessageStatus}>{contactMessageStatus}</Text> : null}
                <Pressable accessibilityRole="button" disabled={resolvingAlert || sendingContactMessage} onPress={() => { void resolveEmergencyAlert(); }} style={[styles.resolveButton, (resolvingAlert || sendingContactMessage) && styles.actionDisabled]}>
                  {resolvingAlert ? <ActivityIndicator color="#ff7770" size="small" /> : null}
                  <Text style={styles.resolveText}>{resolvingAlert ? 'Resolving alert…' : 'Resolve SOS alert'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={strobeActive} onRequestClose={() => { void stopStrobe(); }}>
        <View style={[styles.strobeOverlay, strobeLit ? styles.strobeLit : styles.strobeDim]}>
          <Flashlight color={strobeLit ? '#292929' : '#fff'} size={34} />
          <Text style={[styles.strobeTitle, strobeLit && styles.darkText]}>STROBE ACTIVE</Text>
          <Text style={[styles.strobeCopy, strobeLit && styles.darkText]}>Screen brightness is at maximum and flashes slowly. Flashing light may trigger seizures or discomfort; stop if you feel unwell.</Text>
          <Pressable accessibilityRole="button" onPress={() => { void stopStrobe(); }} style={styles.strobeStop}><Text style={styles.endButtonText}>Stop strobe</Text></Pressable>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={alarmActive} onRequestClose={stopAlarm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.alertBadge}><Volume2 color="#ff7770" size={14} /><Text style={styles.alertBadgeText}>SOUND ALARM ACTIVE</Text></View>
            <View style={[styles.timer, styles.sirenTimer]}><Volume2 color="#fff" size={28} /></View>
            <Text style={styles.modalTitle}>{alarmStatus.isLoaded ? 'Alarm playing' : 'Starting alarm…'}</Text>
            <Text style={styles.modalCopy}>The alarm repeats until stopped. It uses your phone’s media volume and stops when RESQ leaves the foreground. Sound may be limited by your device settings.</Text>
            <Pressable accessibilityRole="button" onPress={stopAlarm} style={styles.endButton}><Text style={styles.endButtonText}>Stop alarm</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={callContactsVisible} onRequestClose={() => setCallContactsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.callPicker}>
            <View style={styles.callPickerHeader}>
              <Text style={styles.callPickerTitle}>Call an emergency contact</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCallContactsVisible(false)} style={styles.closeCallPicker}><X color={colors.muted} size={18} /></Pressable>
            </View>
            {callContacts.map((contact) => (
              <Pressable key={contact.id} accessibilityRole="button" onPress={() => { void callEmergencyContact(contact.phone); }} style={styles.callContactRow}>
                <View style={styles.callContactCopy}><Text style={styles.callContactName}>{contact.name}</Text><Text style={styles.callContactPhone}>{contact.phone}</Text></View>
                <Phone color={colors.green} size={18} />
              </Pressable>
            ))}
            {loadingCallContacts ? <ActivityIndicator color={colors.red} style={{ margin: 20 }} /> : null}
            <Pressable accessibilityRole="button" onPress={() => { setCallContactsVisible(false); router.push('/(main)/settings'); }} style={styles.manageContactsButton}>
              <Text style={styles.manageContactsText}>Manage emergency contacts</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  scrollView: { flex: 1, width: '100%' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 21, paddingTop: 13, paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  brand: { color: colors.text, fontFamily: font.displayBold, fontSize: 25, lineHeight: 30 },
  devicePill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingHorizontal: 8 },
  deviceStat: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  statusCopy: { minWidth: 0, alignItems: 'flex-start' },
  statusLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
  statusValue: { color: colors.text, fontFamily: font.medium, fontSize: 9 },
  statusValueActive: { color: colors.green },
  sosArea: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  outerRing: { position: 'absolute', width: 215, height: 215, borderWidth: 1, borderColor: '#f0443e12', borderRadius: 120 },
  midRing: { position: 'absolute', width: 183, height: 183, borderWidth: 1, borderColor: '#f0443e1c', borderRadius: 100 },
  sosButton: { width: 154, height: 154, alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: '#f0443e13', borderRadius: 90, backgroundColor: colors.red, shadowColor: colors.red, shadowOpacity: 0.26, shadowRadius: 25, elevation: 10 },
  sosPressed: { transform: [{ scale: 0.96 }], backgroundColor: '#d73631' },
  sosText: { color: '#fff', fontFamily: font.displayBold, fontSize: 28 },
  sosCaption: { marginTop: 2, color: '#ffe2e0', fontFamily: font.medium, fontSize: 10 },
  holdProgressTrack: { position: 'absolute', bottom: 48, width: 154, height: 4, overflow: 'hidden', borderRadius: 3, backgroundColor: '#ffffff24' },
  holdProgressFill: { height: '100%', borderRadius: 3, backgroundColor: '#ffb2ac' },
  holdCaption: { position: 'absolute', bottom: 21, color: colors.muted, fontFamily: font.regular, fontSize: 10 },
  holdCaptionActive: { color: '#ffc0ba', fontFamily: font.medium },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionHeading: { color: colors.text, fontFamily: font.display, fontSize: 15 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolButton: { flexBasis: '48%', flexGrow: 1, minHeight: 69, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  toolActive: { borderColor: '#63312e', backgroundColor: '#211616' },
  toolLabel: { color: '#a5a5a9', fontFamily: font.medium, fontSize: 9 },
  toolLabelActive: { color: '#ff7770' },
  safetyHint: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: '#101011' },
  safetyHintText: { flex: 1, color: '#a2a2a6', fontFamily: font.regular, fontSize: 10 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000000d9' },
  modalCard: { width: '100%', maxWidth: 390, alignItems: 'center', borderWidth: 1, borderColor: '#353537', borderRadius: 20, backgroundColor: '#111112', padding: 21 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#6f2e2b', borderRadius: 20, backgroundColor: '#321817', paddingHorizontal: 11, paddingVertical: 7 },
  alertBadgeText: { color: '#ff7770', fontFamily: font.bold, fontSize: 9, letterSpacing: 0.6 },
  timer: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 25, marginBottom: 20, borderWidth: 8, borderColor: '#f0443e16', borderRadius: 60, backgroundColor: colors.redDark },
  timerText: { color: '#fff', fontFamily: font.displayBold, fontSize: 24 },
  modalTitle: { color: colors.text, fontFamily: font.displayBold, fontSize: 19, textAlign: 'center' },
  radar: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 6, overflow: 'hidden', borderRadius: 72, backgroundColor: '#0b1612' },
  radarRing: { position: 'absolute', borderWidth: 1, borderColor: '#2ed16c55', borderRadius: 100 },
  radarRingOuter: { width: 136, height: 136 },
  radarRingMiddle: { width: 96, height: 96 },
  radarRingInner: { width: 54, height: 54 },
  radarSweep: { position: 'absolute', width: 144, height: 144 },
  radarBeam: { position: 'absolute', top: 71, left: 72, width: 66, height: 1, backgroundColor: '#72eea1', opacity: 0.9 },
  radarBlip: { position: 'absolute', width: 7, height: 7, borderRadius: 5, backgroundColor: colors.green, shadowColor: colors.green, shadowOpacity: 0.9, shadowRadius: 6, elevation: 3 },
  radarCenter: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2ed16c66', borderRadius: 18, backgroundColor: '#10251a' },
  radarTitle: { marginTop: 3, color: '#d8e6dc', fontFamily: font.medium, fontSize: 11 },
  radarCopy: { marginTop: 4, marginBottom: 10, color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center' },
  modalCopy: { marginTop: 7, marginBottom: 18, color: colors.muted, fontFamily: font.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  locationPanel: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  locationText: { flex: 1, gap: 3 },
  locationTitle: { color: colors.text, fontFamily: font.medium, fontSize: 11 },
  locationMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  endButton: { width: '100%', minHeight: 47, alignItems: 'center', justifyContent: 'center', marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surfaceRaised },
  endButtonText: { color: colors.text, fontFamily: font.bold, fontSize: 12 },
  contactMessageStatus: { marginTop: 9, color: colors.muted, fontFamily: font.regular, fontSize: 10, textAlign: 'center' },
  resolveButton: { width: '100%', minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 9, borderWidth: 1, borderColor: '#5b2c2a', borderRadius: 10, backgroundColor: '#211414' },
  actionDisabled: { opacity: 0.65 },
  resolveText: { color: '#ff7770', fontFamily: font.medium, fontSize: 11 },
  silentBadge: { marginTop: 10, color: '#ffc0ba', fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8 },
  strobeOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  strobeLit: { backgroundColor: '#f5f5f5' },
  strobeDim: { backgroundColor: colors.redDark },
  strobeTitle: { marginTop: 20, color: '#fff', fontFamily: font.displayBold, fontSize: 22 },
  strobeCopy: { marginTop: 8, color: '#fff', fontFamily: font.regular, fontSize: 12, textAlign: 'center' },
  darkText: { color: '#252525' },
  strobeStop: { minWidth: 140, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 30, borderWidth: 1, borderColor: '#ffffff80', borderRadius: 12, backgroundColor: '#00000066', paddingHorizontal: 18 },
  sirenTimer: { backgroundColor: '#a52825' },
  callPicker: { width: '100%', maxWidth: 390, borderWidth: 1, borderColor: '#353537', borderRadius: 18, backgroundColor: '#111112', padding: 18 },
  callPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  callPickerTitle: { color: colors.text, fontFamily: font.displayBold, fontSize: 17 },
  closeCallPicker: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  callContactRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  callContactCopy: { flex: 1, gap: 3 },
  callContactName: { color: colors.text, fontFamily: font.medium, fontSize: 11 },
  callContactPhone: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
  manageContactsButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  manageContactsText: { color: colors.muted, fontFamily: font.medium, fontSize: 10 },
});

function StatusCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.deviceStat}>
      {icon}
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function getInternetLabel(networkState: ReturnType<typeof useNetworkState>) {
  if (networkState.isConnected === false || networkState.type === 'NONE') return 'Offline';
  if (networkState.isInternetReachable === false) return 'No internet';
  if (networkState.type === 'WIFI') return 'Wi-Fi';
  if (networkState.type === 'CELLULAR') return 'Cellular';
  if (networkState.isInternetReachable === true) return 'Online';
  return 'Checking';
}

function getRadarBlipPosition(
  origin: { latitude: number; longitude: number },
  alert: NearbySos,
) {
  const earthRadiusMeters = 6_371_000;
  const north = ((alert.latitude - origin.latitude) * Math.PI / 180) * earthRadiusMeters;
  const east = ((alert.longitude - origin.longitude) * Math.PI / 180) * earthRadiusMeters * Math.cos(origin.latitude * Math.PI / 180);
  const angle = Math.atan2(east, north);
  const radius = Math.max(12, Math.min(56, alert.distance_meters / 10_000 * 56));

  return {
    top: 72 - Math.cos(angle) * radius - 3.5,
    left: 72 + Math.sin(angle) * radius - 3.5,
  };
}