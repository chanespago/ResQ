import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getSupabaseClient } from '../backend/supabase';

const storedPushTokenKey = 'resq.expoPushToken';

export async function registerForNearbySosNotifications(userId: string) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Push notifications are available in the Android and iOS app only.');
  }
  if (!Device.isDevice) throw new Error('Push notifications require a physical device.');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sos-alerts', {
      name: 'Nearby SOS alerts',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f0443e',
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission = existingPermission.granted
    ? existingPermission
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Allow notifications for ResQ to receive nearby SOS alerts.');

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('The Expo project ID is missing from this build.');

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await getSupabaseClient().from('user_push_tokens').upsert({
    user_id: userId,
    expo_push_token: expoPushToken,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
  await SecureStore.setItemAsync(storedPushTokenKey, expoPushToken);
}

export async function unregisterFromNearbySosNotifications(userId: string) {
  const expoPushToken = await SecureStore.getItemAsync(storedPushTokenKey);
  if (!expoPushToken) return;

  const { error } = await getSupabaseClient()
    .from('user_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', expoPushToken);
  if (error) throw error;
  await SecureStore.deleteItemAsync(storedPushTokenKey);
}
