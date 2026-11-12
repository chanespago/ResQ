import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, MapPin, Navigation, RefreshCw, Shield, X } from 'lucide-react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { getSupabaseClient } from '../../backend/supabase';
import { useAppPreferences } from '../../appPreferences';
import { Panel, ScreenTitle } from '../../components';
import { colors, font } from '../../theme';

type NearbySos = {
  id: string;
  display_name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  distance_meters: number | null;
  responder_count: number;
  is_responding: boolean;
};

export default function AlertsScreen() {
  const { alertId: routeAlertId } = useLocalSearchParams<{ alertId?: string }>();
  const { user } = useAuth();
  const { preferences } = useAppPreferences();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [requests, setRequests] = useState<NearbySos[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NearbySos | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function refreshRequests(coords = location) {
    if (!user || !coords) return;
    setRefreshing(true);
    setError('');
    const { data, error: requestError } = await getSupabaseClient().rpc('nearby_sos', {
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_radius_meters: 10000,
    });
    if (requestError) setError(requestError.message);
    else setRequests((data ?? []) as NearbySos[]);
    setRefreshing(false);
    setLoading(false);
  }

  useEffect(() => {
    if (!location || !user) return;
    let active = true;
    const load = async () => {
      const { data, error: requestError } = await getSupabaseClient().rpc('nearby_sos', {
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_radius_meters: 10000,
      });
      if (!active) return;
      if (requestError) setError(requestError.message);
      else setRequests((data ?? []) as NearbySos[]);
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => { void load(); }, 12000);
    return () => { active = false; clearInterval(timer); };
  }, [location, user]);

  useEffect(() => {
    if (!routeAlertId || !user) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: alertError } = await getSupabaseClient()
          .rpc('sos_alert_by_id', { p_alert_id: routeAlertId });
        if (!active) return;
        if (alertError) {
          setError(alertError.message);
          return;
        }
        setError('');
        const alert = (data ?? [])[0] as NearbySos | undefined;
        if (!alert) {
          setError('This SOS is no longer active or is no longer available to you.');
          return;
        }
        setSelectedRequest(alert);
      } catch (alertError) {
        if (active) setError(alertError instanceof Error ? alertError.message : 'Could not load this SOS alert.');
      }
    })();
    return () => { active = false; };
  }, [routeAlertId, user]);

  async function startNearbyScan() {
    if (!preferences.communitySharing) {
      setError('Turn on community sharing in Settings to find nearby SOS requests.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Location access is required to find nearby SOS requests.');
        setLoading(false);
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      await refreshRequests({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Could not get your location.');
      setLoading(false);
    }
  }

  async function toggleResponding(request: NearbySos) {
    const procedure = request.is_responding ? 'stop_responding_to_sos' : 'respond_to_sos';
    const { error: responseError } = await getSupabaseClient().rpc(procedure, { p_alert_id: request.id });
    if (responseError) {
      setError(responseError.message);
      return;
    }
    const { data: updatedAlerts, error: refreshError } = await getSupabaseClient()
      .rpc('sos_alert_by_id', { p_alert_id: request.id });
    if (refreshError) {
      setError(refreshError.message);
      return;
    }
    const updatedRequest = (updatedAlerts ?? [])[0] as NearbySos | undefined;
    if (!updatedRequest) {
      setError('This SOS is no longer active.');
      setSelectedRequest(null);
      return;
    }
    setRequests((current) => current.map((item) => item.id === request.id ? updatedRequest : item));
    setSelectedRequest(updatedRequest);
  }

  async function openMap(request: NearbySos) {
    if (request.latitude === null || request.longitude === null) {
      setError('This SOS does not have a location to show.');
      return;
    }
    try {
      await Linking.openURL(`https://maps.google.com/?q=${request.latitude},${request.longitude}`);
    } catch {
      Alert.alert('Map unavailable', 'Unable to open a map on this device.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="Help requests" subtitle="Active SOS alerts shared by nearby ResQ users." />
        <View style={styles.infoNotice}>
          <Shield color={colors.green} size={16} />
          <Text style={styles.noticeText}>Only active alerts within 10 km are shown while scanning. Push alerts are sent for requests within 5 km of a recent background location.</Text>
        </View>
        {!location ? (
          <Pressable accessibilityRole="button" disabled={loading} onPress={() => { void startNearbyScan(); }} style={[styles.scanButton, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="#fff" /> : <><Navigation color="#fff" size={16} /><Text style={styles.scanText}>Find nearby SOS alerts</Text></>}
          </Pressable>
        ) : (
          <View style={styles.scanStatus}>
            <View style={styles.liveDot} />
            <Text style={styles.scanStatusText}>Nearby scan active</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh nearby alerts" disabled={refreshing} onPress={() => { void refreshRequests(); }} style={styles.refreshButton}>
              {refreshing ? <ActivityIndicator color={colors.muted} size="small" /> : <RefreshCw color={colors.muted} size={16} />}
            </Pressable>
          </View>
        )}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {location ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Nearby requests</Text>
              <Text style={styles.count}>{String(requests.length).padStart(2, '0')} ACTIVE</Text>
            </View>
            {loading && requests.length === 0 ? <ActivityIndicator style={styles.loader} color={colors.red} /> : null}
            {!loading && requests.length === 0 ? (
              <View style={styles.emptyState}><Shield color={colors.muted} size={22} /><Text style={styles.emptyTitle}>No active requests nearby</Text><Text style={styles.emptyCopy}>New SOS alerts will appear here while your location scan is active.</Text></View>
            ) : null}
            {requests.map((request) => (
              <Pressable key={request.id} accessibilityRole="button" onPress={() => setSelectedRequest(request)} style={({ pressed }) => [styles.request, pressed && styles.requestPressed]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{request.display_name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.requestCopy}>
                  <View style={styles.requestHeading}>
                    <Text style={styles.requestName}>{request.display_name}</Text>
                    <Text style={[styles.requestStatus, request.is_responding && styles.responding]}>{request.is_responding ? 'RESPONDING' : 'ACTIVE'}</Text>
                  </View>
                  <Text style={styles.category}>Personal safety request</Text>
                  <View style={styles.requestMeta}><MapPin color={colors.muted} size={12} /><Text style={styles.metaText}>{request.distance_meters === null ? 'Distance unavailable' : formatDistance(request.distance_meters)} · {formatAge(request.created_at)}</Text></View>
                  <Text style={styles.metaText}>{request.responder_count} responding</Text>
                </View>
                <ArrowUpRight color={colors.dim} size={17} />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal animationType="fade" transparent visible={selectedRequest !== null} onRequestClose={() => setSelectedRequest(null)}>
        <View style={styles.backdrop}>
          {selectedRequest ? (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="Close request" onPress={() => setSelectedRequest(null)} style={styles.closeButton}><X color={colors.muted} size={18} /></Pressable>
              </View>
              <Text style={styles.modalName}>{selectedRequest.display_name}</Text>
              <Text style={styles.modalCategory}>Personal safety request · {formatAge(selectedRequest.created_at)}</Text>
              <Panel style={styles.locationPanel}>
                <MapPin color={colors.blue} size={16} />
                <View style={styles.locationCopy}>
                  <Text style={styles.locationTitle}>{selectedRequest.distance_meters === null ? 'Distance unavailable' : `${formatDistance(selectedRequest.distance_meters)} away`}</Text>
                  <Text style={styles.locationMeta}>{selectedRequest.latitude === null || selectedRequest.longitude === null
                    ? 'Location unavailable'
                    : `${selectedRequest.latitude.toFixed(5)}, ${selectedRequest.longitude.toFixed(5)}`}</Text>
                </View>
              </Panel>
              {selectedRequest.latitude !== null && selectedRequest.longitude !== null ? (
                <Pressable accessibilityRole="button" onPress={() => { void openMap(selectedRequest); }} style={styles.mapButton}><MapPin color={colors.blue} size={15} /><Text style={styles.mapText}>Open map</Text></Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => { void toggleResponding(selectedRequest); }} style={styles.respondButton}>
                <Text style={styles.respondText}>{selectedRequest.is_responding ? 'Stop responding' : 'I can help'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function formatAge(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  return minutes < 1 ? 'Just now' : `${minutes} min ago`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  scrollView: { flex: 1, width: '100%' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 21, paddingTop: 21, paddingBottom: 24 },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderWidth: 1, borderColor: '#31523d', borderRadius: 11, backgroundColor: '#101a13' },
  noticeText: { flex: 1, color: '#b5c8ba', fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  scanButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderRadius: 11, backgroundColor: colors.red },
  scanText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
  disabled: { opacity: 0.6 },
  scanStatus: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, paddingHorizontal: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  scanStatusText: { flex: 1, color: colors.green, fontFamily: font.medium, fontSize: 10 },
  refreshButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: 10, color: '#ff7770', fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontFamily: font.display, fontSize: 15 },
  count: { color: colors.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.7 },
  loader: { margin: 20 },
  emptyState: { alignItems: 'center', gap: 9, paddingVertical: 36, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontFamily: font.medium, fontSize: 12 },
  emptyCopy: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  request: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface },
  requestPressed: { borderColor: '#535358', backgroundColor: '#19191a' },
  avatar: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#31523d', borderRadius: 20, backgroundColor: '#15251a' },
  avatarText: { color: colors.green, fontFamily: font.bold, fontSize: 13 },
  requestCopy: { flex: 1, gap: 5 },
  requestHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  requestName: { color: colors.text, fontFamily: font.medium, fontSize: 12 },
  requestStatus: { color: '#ff827a', fontFamily: font.bold, fontSize: 8, letterSpacing: 0.5 },
  responding: { color: colors.green },
  category: { color: '#d3d3d6', fontFamily: font.regular, fontSize: 10 },
  requestMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000000d9' },
  modalCard: { width: '100%', maxWidth: 390, borderWidth: 1, borderColor: '#353537', borderRadius: 18, backgroundColor: '#111112', padding: 19 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  modalName: { marginTop: 18, color: colors.text, fontFamily: font.displayBold, fontSize: 22 },
  modalCategory: { marginTop: 4, marginBottom: 16, color: colors.muted, fontFamily: font.regular, fontSize: 12 },
  locationPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  locationCopy: { flex: 1, gap: 4 },
  locationTitle: { color: colors.text, fontFamily: font.medium, fontSize: 11 },
  locationMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  mapButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  mapText: { color: colors.blue, fontFamily: font.medium, fontSize: 10 },
  respondButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 10, backgroundColor: colors.red },
  respondText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
});