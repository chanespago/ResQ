import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { Bell, House, Settings, Watch } from 'lucide-react-native';
import { AppPreferencesProvider } from '../../appPreferences';
import { useAuth } from '../../auth/AuthProvider';
import { colors, font } from '../../theme';

const tabIcons = { index: House, alerts: Bell, device: Watch, settings: Settings };

export default function MainTabs() {
  const { configured, loading, user } = useAuth();

  useEffect(() => {
    if (!loading && (!configured || !user)) router.replace('../register');
  }, [configured, loading, user]);

  if (loading || !configured || !user) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.red} /></View>;
  }

  return (
    <AppPreferencesProvider>
      <Tabs
        screenOptions={({ route }) => {
          const Icon = tabIcons[route.name as keyof typeof tabIcons] ?? House;
          return {
            headerShown: false,
            tabBarActiveTintColor: colors.red,
            tabBarInactiveTintColor: '#89898e',
            tabBarStyle: {
              height: 66,
              paddingTop: 8,
              paddingBottom: 8,
              borderTopColor: '#303033',
              backgroundColor: colors.surfaceNav,
            },
            tabBarLabelStyle: { fontFamily: font.medium, fontSize: 9 },
            tabBarIcon: ({ color }) => <Icon color={color} size={19} strokeWidth={1.7} />,
          };
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Safety' }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
        <Tabs.Screen name="device" options={{ title: 'Device' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </AppPreferencesProvider>
  );
}