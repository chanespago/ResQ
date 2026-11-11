import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from './auth/AuthProvider';
import { getSupabaseClient } from './backend/supabase';

export type AppPreferences = {
  smsOnSos: boolean;
  communitySharing: boolean;
};

export type PreferenceKey = keyof AppPreferences;

type StoredPreferences = {
  sms_on_sos?: boolean;
  community_sharing?: boolean;
};

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  loading: boolean;
  updatePreference: (key: PreferenceKey, value: boolean) => Promise<void>;
};

const defaults: AppPreferences = {
  smsOnSos: true,
  communitySharing: true,
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [savedPreferences, setSavedPreferences] = useState<{ userId: string; value: AppPreferences } | null>(null);
  const preferences = user && savedPreferences?.userId === user.id ? savedPreferences.value : defaults;
  const loading = Boolean(user && savedPreferences?.userId !== user.id);

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };

    void getSupabaseClient()
      .from('profiles')
      .select('preferences')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        setSavedPreferences({ userId: user.id, value: error ? defaults : fromStored(data.preferences as StoredPreferences | null) });
      });

    return () => { active = false; };
  }, [user]);

  const value = useMemo<AppPreferencesContextValue>(() => ({
    preferences,
    loading,
    async updatePreference(key, enabled) {
      if (!user) throw new Error('Sign in before updating preferences.');
      const next = { ...preferences, [key]: enabled };
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({ preferences: toStored(next), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      setSavedPreferences({ userId: user.id, value: next });
    },
  }), [loading, preferences, user]);

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
  };
}

function toStored(preferences: AppPreferences): StoredPreferences {
  return {
    sms_on_sos: preferences.smsOnSos,
    community_sharing: preferences.communitySharing,
  };
}