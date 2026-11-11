# RESQ Mobile

Expo React Native app targeting Android and iOS, backed by Supabase for accounts, emergency contacts, SOS alerts, and community responses.

## Configure Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/20261030_initial_resq.sql`, then `supabase/migrations/20261030_lockdown_nearby_sos.sql` in the Supabase SQL Editor. Run the lockdown migration even if you previously applied the initial schema.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `mobile/.env.local`. The Expo config also accepts the `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` names. Use only a publishable/anon key in the app; never put a `service_role` key in a client app.
4. Keep email confirmation enabled for production. New users must confirm their email before signing in if that is enabled in the Supabase Auth settings.

Without valid environment values and the migration, sign-in, contacts, SOS, and Alerts are not connected.

## Run

```sh
cd mobile
npm install
npx expo start -c
```

Scan the QR code with Expo Go to open the app on a device. `npm run android` starts the app in a configured Android emulator. A local iOS build requires macOS and Xcode; on Windows, use Expo Go on an iPhone to preview it.

This project uses native Expo modules. If Expo Go reports an `EventEmitter` runtime error or cannot load the current SDK, use the matching Android development client instead of Expo Go:

```sh
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client -c
```

Install the development APK on the device, then open it and connect to the running development server. Rebuild the development client after adding or changing native modules.

## Build an Android APK

The `preview` EAS build profile generates an installable APK. Before the first cloud build, add the Supabase URL and publishable key to EAS's `preview` environment (use the values from your Supabase project):

```sh
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT_REF.supabase.co" --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "YOUR_PUBLISHABLE_KEY" --environment preview --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

Run `npx eas-cli@latest env:list --environment preview` to check the environment variables are set. Sign in to an Expo account when prompted. Local `.env.local` files are excluded from cloud uploads, so setting those values only in that file will not configure a cloud build. These client-side values are included in the app; use only a publishable/anon key, never a `service_role` key.

## Screens

- Splash and registration flow
- Safety home with location-backed SOS, a sound alarm, maximum-brightness strobe, emergency guide, reunification plan, and emergency-contact calling
- Offline emergency guide with general advice for earthquakes, floods, fires, and severe weather
- Offline reunification plan saved locally using encrypted device storage
- Alerts with nearby active SOS requests and responder status
- Device information and account settings with emergency contacts

SOS creates a community alert when the signed-in user enables community sharing. Location is requested only when starting an SOS or nearby scan. Nearby alerts are queried while the app is open. Precise location is returned only to an accepted responder; other users see an approximate location. The emergency-contact action opens the phone's SMS composer with a prepared message; the user must confirm sending, and delivery status may not be available on Android.

The sound alarm and strobe are user-started, work in the foreground, and stop when RESQ leaves the foreground. The alarm uses the phone's media volume and may be limited by device settings. The reunification plan stays on the device and is not synced to RESQ; keep a separate copy in case the phone is unavailable. The emergency guide is general preparedness information, so follow local emergency services' instructions.

The app does not dispatch emergency services or send push notifications. Call your local emergency number directly for immediate danger.
