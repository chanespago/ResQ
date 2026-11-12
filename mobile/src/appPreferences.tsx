import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from './auth/AuthProvider';
import { getSupabaseClient } from './backend/supabase';
import { reconcileBackgroundLocationUpdates } from './location/backgroundLocation';
import { registerForNearbySosNotifications } from './notifications/pushNotifications';

export type AppPreferences = {
  smsOnSos: boolean;
  communitySharing: boolean;
  nearbySosNotifications: boolean;
  backgroundLocationSharing: boolean;
};

export type PreferenceKey = keyof AppPreferences;

type StoredPreferences = {
  sms_on_sos?: boolean;
  community_sharing?: boolean;
  nearby_sos_notifications?: boolean;
  background_location_sharing?: boolean;
};

type LoadedPreferences = {
  userId: string;
  value: AppPreferences;
  error?: string;
};

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  loading: boolean;
  loadError: string | null;
  updatePreference: (key: PreferenceKey, value: boolean) => Promise<void>;
};

const defaults: AppPreferences = {
  smsOnSos: true,
  communitySharing: true,
  nearbySosNotifications: false,
  backgroundLocationSharing: false,
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [savedPreferences, setSavedPreferences] = useState<LoadedPreferences | null>(null);
  const preferences = user && savedPreferences?.userId === user.id ? savedPreferences.value : defaults;
  const loading = Boolean(user && savedPreferences?.userId !== user.id);
  const loadError = user && savedPreferences?.userId === user.id
    ? savedPreferences.error ?? null
    : null;

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };

    void (async () => {
      try {
        const { data, error } = await getSupabaseClient()
          .from('profiles')
          .select('preferences')
          .eq('id', user.id)
          .single();
        if (!active) return;
        if (error) {
          console.error('ResQ could not load user preferences:', error);
          setSavedPreferences({ userId: user.id, value: defaults, error: error.message });
          return;
        }
        setSavedPreferences({ userId: user.id, value: fromStored(data.preferences as StoredPreferences | null) });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('ResQ could not load user preferences:', error);
        setSavedPreferences({ userId: user.id, value: defaults, error: message });
      }
    })();

    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || loading) return;
    void reconcileBackgroundLocationUpdates(user.id, preferences.backgroundLocationSharing).catch((error: unknown) => {
      console.error('ResQ could not restore background location sharing:', error);
    });
  }, [loading, preferences.backgroundLocationSharing, user]);

  useEffect(() => {
    if (!user || loading || !preferences.nearbySosNotifications) return;
    void registerForNearbySosNotifications(user.id).catch((error: unknown) => {
      console.error('ResQ could not refresh push notification registration:', error);
    });
  }, [loading, preferences.nearbySosNotifications, user]);

  const value = useMemo<AppPreferencesContextValue>(() => ({
    preferences,
    loading,
    loadError,
    async updatePreference(key, enabled) {
      if (!user) throw new Error('Sign in before updating preferences.');
      if (savedPreferences?.userId !== user.id || savedPreferences.error) {
        throw new Error('Preferences are unavailable. Reconnect and reopen Settings before changing them.');
      }
      const next = { ...preferences, [key]: enabled };
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({ preferences: toStored(next), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      setSavedPreferences({ userId: user.id, value: next });
    },
  }), [loadError, loading, preferences, savedPreferences, user]);

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  return context;
}

function fromStored(stored: StoredPreferences | null): AppPreferences {
  return {
    smsOnSos: stored?.sms_on_sos ?? defaults.smsOnSos,
    communitySharing: stored?.community_sharing ?? defaults.communitySharing,
    nearbySosNotifications: stored?.nearby_sos_notifications ?? defaults.nearbySosNotifications,
    backgroundLocationSharing: stored?.background_location_sharing ?? defaults.backgroundLocationSharing,
  };
}

function toStored(preferences: AppPreferences): StoredPreferences {
  return {
    sms_on_sos: preferences.smsOnSos,
    community_sharing: preferences.communitySharing,
    nearby_sos_notifications: preferences.nearbySosNotifications,
    background_location_sharing: preferences.backgroundLocationSharing,
  };
}