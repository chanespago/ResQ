import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const configExtra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabasePublicKey?: string } | undefined;
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? configExtra?.supabaseUrl ?? '').trim();
const supabasePublicKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? configExtra?.supabasePublicKey
  ?? ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublicKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) throw new Error('Supabase is not configured for this build. Set its URL and publishable key in the build environment, then rebuild the app.');
  return supabase;
}