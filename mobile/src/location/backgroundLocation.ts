import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getSupabaseClient } from '../backend/supabase';

export const backgroundLocationTaskName = 'resq-background-location';
const locationUpdateIntervalMs = 15 * 60 * 1000;
let locationTaskStart: Promise<void> | null = null;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

if (Platform.OS !== 'web') {
  TaskManager.defineTask<BackgroundLocationTaskData>(backgroundLocationTaskName, async ({ data, error }) => {
    if (error) {
      console.error('ResQ background location task failed:', error.message);
      return;
    }

    const location = data?.locations?.[data.locations.length - 1];
    if (!location) return;

    try {
      const client = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData.session?.user.id;
      if (!userId) {
        await stopLocationUpdates();
        return;
      }

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single();
      if (profileError) throw profileError;

      const preferences = profile.preferences as Record<string, unknown> | null;
      const isSharingLocation = preferences?.background_location_sharing === true;
      const { data: activeAlerts, error: alertsError } = await client
        .from('sos_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      if (alertsError) throw alertsError;

      if (isSharingLocation) {
        await saveUserLocation(userId, location);
      }

      const activeAlert = activeAlerts?.[0];
      if (activeAlert) {
        const { error: updateError } = await client
          .from('sos_alerts')
          .update({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy_meters: location.coords.accuracy,
            location_updated_at: new Date(location.timestamp).toISOString(),
          })
          .eq('id', activeAlert.id)
          .eq('user_id', userId);
        if (updateError) throw updateError;
      } else if (!isSharingLocation) {
        await stopLocationUpdates();
      }
    } catch (taskError) {
      console.error(
        'ResQ could not save a background location update:',
        taskError instanceof Error ? taskError.message : taskError,
      );
    }
  });
}

export async function requestBackgroundLocationPermissions() {
  if (Platform.OS === 'web') throw new Error('Background location sharing is available in the Android and iOS app only.');

  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Allow location access while using ResQ before enabling background location sharing.');

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) {
    throw new Error('Background location permission is required. Enable “Allow all the time” for ResQ in your device settings.');
  }
}

export async function startBackgroundLocationUpdates() {
  if (Platform.OS === 'web') throw new Error('Background location sharing is available in the Android and iOS app only.');
  if (locationTaskStart) return locationTaskStart;
  locationTaskStart = startLocationUpdates();
  try {
    await locationTaskStart;
  } finally {
    locationTaskStart = null;
  }
}

async function startLocationUpdates() {
  const permission = await Location.getBackgroundPermissionsAsync();
  if (!permission.granted) throw new Error('Background location permission is not enabled for ResQ.');

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(backgroundLocationTaskName);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(backgroundLocationTaskName, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: locationUpdateIntervalMs,
    distanceInterval: 250,
    deferredUpdatesInterval: locationUpdateIntervalMs,
    deferredUpdatesDistance: 250,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ResQ location sharing is on',
      notificationBody: 'Low-power location updates help find nearby SOS alerts.',
      notificationColor: '#f0443e',
    },
  });
}

export async function saveCurrentUserLocation(userId: string) {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await saveUserLocation(userId, position);
}

export async function reconcileBackgroundLocationUpdates(userId: string, isSharingLocation: boolean) {
  if (Platform.OS === 'web') return;

  const client = getSupabaseClient();
  const { data: activeAlerts, error } = await client
    .from('sos_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .limit(1);
  if (error) throw error;

  if (!isSharingLocation) {
    const { error: deleteError } = await client.from('user_locations').delete().eq('user_id', userId);
    if (deleteError) throw deleteError;
  }

  if (isSharingLocation || activeAlerts?.length) {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.granted) await startBackgroundLocationUpdates();
    else if (isSharingLocation) throw new Error('Background location permission has been disabled for ResQ.');
    return;
  }

  await stopLocationUpdates();
}

export async function removeBackgroundLocationForSignOut(userId: string) {
  await stopLocationUpdates();
  const { error } = await getSupabaseClient().from('user_locations').delete().eq('user_id', userId);
  if (error) throw error;
}

async function saveUserLocation(userId: string, location: Location.LocationObject) {
  const { error } = await getSupabaseClient().from('user_locations').upsert({
    user_id: userId,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_meters: location.coords.accuracy,
    updated_at: new Date(location.timestamp).toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

async function stopLocationUpdates() {
  if (Platform.OS === 'web') return;
  const started = await Location.hasStartedLocationUpdatesAsync(backgroundLocationTaskName);
  if (started) await Location.stopLocationUpdatesAsync(backgroundLocationTaskName);
}
