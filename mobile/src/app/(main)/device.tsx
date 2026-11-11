import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Battery, Check, Cpu, Smartphone, Wifi } from 'lucide-react-native';
import { BatteryState, useBatteryLevel, useBatteryState } from 'expo-battery';
import * as Network from 'expo-network';
import { useNetworkState } from 'expo-network';
import * as Device from 'expo-device';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Panel, ScreenTitle } from '../../components';
import { colors, font } from '../../theme';

export default function DeviceScreen() {
  const batteryLevel = useBatteryLevel();
  const batteryState = useBatteryState();
  const networkState = useNetworkState();
  const operatingSystem = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web preview';
  const deviceType = getDeviceTypeLabel(Device.deviceType);
  const memory = Device.totalMemory ? `${Math.round(Device.totalMemory / 1024 ** 3)} GB` : 'Not available';
  const batteryLabel = batteryLevel >= 0 ? `${Math.round(batteryLevel * 100)}%` : 'Not available';
  const batteryStatus = batteryState === BatteryState.CHARGING || batteryState === BatteryState.FULL
    ? 'Charging'
    : batteryState === BatteryState.UNPLUGGED
      ? 'On battery'
      : batteryState === BatteryState.NOT_CHARGING
        ? 'Not charging'
        : 'Status unavailable';
  const networkLabel = getNetworkLabel(networkState.type);
  const internetStatus = networkState.isInternetReachable === true
    ? 'Internet available'
    : networkState.isInternetReachable === false
      ? 'No internet'
      : 'Checking connection';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle title="This device" subtitle="Details detected from your current device." />
        <View style={styles.statusGrid}>
          <Panel style={styles.statusCard}>
            <View style={styles.statusHeading}><Battery color={colors.green} size={16} /><Text style={styles.statusLabel}>BATTERY</Text></View>
            <Text style={styles.statusValue}>{batteryLabel}</Text>
            <Text style={styles.statusMeta}>{batteryStatus}</Text>
          </Panel>
          <Panel style={styles.statusCard}>
            <View style={styles.statusHeading}><Wifi color={colors.blue} size={16} /><Text style={styles.statusLabel}>INTERNET</Text></View>
            <Text style={styles.statusValue}>{networkLabel}</Text>
            <Text style={styles.statusMeta}>{internetStatus}</Text>
          </Panel>
        </View>
        <Panel style={styles.details}>
          <Detail label="Device name" value={Device.deviceName ?? Device.modelName ?? 'Not available'} icon={<Smartphone color={colors.muted} size={15} />} />
          <Detail label="Manufacturer" value={Device.manufacturer ?? Device.brand ?? 'Not available'} />
          <Detail label="Model" value={Device.modelName ?? 'Not available'} />
          <Detail label="Operating system" value={operatingSystem} icon={<Cpu color={colors.muted} size={15} />} />
          <Detail label="OS version" value={Device.osVersion ?? 'Not available'} />
          <Detail label="Device type" value={deviceType} />
          <Detail label="Memory" value={memory} last />
        </Panel>
        <View style={styles.note}><Check color={colors.green} size={15} /><Text style={styles.noteText}>Device details stay on this device. Signal strength in dBm is not available on iOS/Android through Expo.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getDeviceTypeLabel(deviceType: Device.DeviceType | null) {
  switch (deviceType) {
    case Device.DeviceType.PHONE:
      return 'Phone';
    case Device.DeviceType.TABLET:
      return 'Tablet';
    case Device.DeviceType.TV:
      return 'TV';
    case Device.DeviceType.DESKTOP:
      return 'Desktop';
    default:
      return Platform.OS === 'web' ? 'Web preview' : 'Unknown';
  }
}

function getNetworkLabel(type: Network.NetworkStateType | undefined) {
  switch (type) {
    case Network.NetworkStateType.WIFI:
      return 'Wi-Fi';
    case Network.NetworkStateType.CELLULAR:
      return 'Cellular';
    case Network.NetworkStateType.ETHERNET:
      return 'Ethernet';
    case Network.NetworkStateType.NONE:
      return 'Offline';
    default:
      return 'Unknown';
  }
}

function Detail({ label, value, icon, last = false }: { label: string; value: string; icon?: React.ReactNode; last?: boolean }) {
  return <View style={[styles.detailRow, last && styles.lastRow]}>{icon}<Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  scrollView: { flex: 1, width: '100%' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 21, paddingTop: 21, paddingBottom: 24 },
  statusGrid: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  statusCard: { flex: 1, minWidth: 0, minHeight: 103, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  statusHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusLabel: { color: colors.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.8 },
  statusValue: { marginTop: 8, color: colors.text, fontFamily: font.display, fontSize: 17 },
  statusMeta: { marginTop: 2, color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  details: { overflow: 'hidden' },
  detailRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#242426' },
  lastRow: { borderBottomWidth: 0 },
  detailLabel: { flex: 1, color: colors.muted, fontFamily: font.regular, fontSize: 11 },
  detailValue: { color: '#e5e5e7', fontFamily: font.medium, fontSize: 10, textAlign: 'right' },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18 },
  noteText: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
});