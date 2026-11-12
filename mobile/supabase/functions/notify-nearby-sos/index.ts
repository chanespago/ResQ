import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SosAlert = {
  id: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  community_visible: boolean;
  status: string;
  expires_at: string;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { id?: string };
};

type PushTokenRow = { user_id: string; expo_push_token: string };
type PushTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
const pushBatchSize = 100;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('SOS_WEBHOOK_SECRET');
  if (!webhookSecret) return jsonResponse({ error: 'SOS_WEBHOOK_SECRET is not configured' }, 500);
  if (request.headers.get('x-webhook-secret') !== webhookSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await request.json() as DatabaseWebhookPayload;
  } catch {
    return jsonResponse({ error: 'Invalid webhook payload' }, 400);
  }

  const alertId = payload.record?.id;
  if (payload.type !== 'INSERT' || payload.table !== 'sos_alerts' || payload.schema !== 'public' || !alertId) {
    return jsonResponse({ message: 'Ignored unsupported database event' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase service configuration is incomplete' }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: alert, error: alertError } = await supabase
      .from('sos_alerts')
      .select('id,user_id,latitude,longitude,community_visible,status,expires_at')
      .eq('id', alertId)
      .maybeSingle();
    if (alertError) throw alertError;
    if (!isNotifiableAlert(alert)) return jsonResponse({ message: 'SOS is not active or community-visible' }, 200);

    const { data: tokens, error: tokensError } = await supabase
      .rpc('nearby_sos_push_tokens', { p_alert_id: alertId });
    if (tokensError) throw tokensError;
    const recipients = (tokens ?? []) as PushTokenRow[];
    if (recipients.length === 0) return jsonResponse({ sent: 0 }, 200);

    const recipientIds = [...new Set(recipients.map(({ user_id }) => user_id))];
    const { error: recordError } = await supabase
      .from('sos_push_recipients')
      .upsert(
        recipientIds.map((user_id) => ({ alert_id: alertId, user_id })),
        { onConflict: 'alert_id,user_id', ignoreDuplicates: true },
      );
    if (recordError) throw recordError;

    const invalidTokens: string[] = [];
    for (let index = 0; index < recipients.length; index += pushBatchSize) {
      const batch = recipients.slice(index, index + pushBatchSize);
      const messages = batch.map(({ expo_push_token: to }) => ({
        to,
        title: 'Nearby SOS alert',
        body: 'A ResQ user needs help nearby. Tap to view the alert.',
        sound: 'default',
        priority: 'high',
        channelId: 'sos-alerts',
        data: { alertId },
      }));
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      };
      const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

      const response = await fetch(expoPushEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
      if (!response.ok) throw new Error(`Expo Push Service returned HTTP ${response.status}`);

      const result = await response.json() as { data?: PushTicket[] };
      for (const [ticketIndex, ticket] of (result.data ?? []).entries()) {
        if (ticket.status !== 'error') continue;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(batch[ticketIndex].expo_push_token);
          continue;
        }
        console.error('Expo push ticket failed:', ticket.message ?? ticket.details?.error ?? 'Unknown error');
      }
    }

    if (invalidTokens.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_push_tokens')
        .delete()
        .in('expo_push_token', invalidTokens);
      if (deleteError) throw deleteError;
    }

    return jsonResponse({ sent: recipients.length - invalidTokens.length }, 200);
  } catch (error) {
    console.error('Could not send nearby SOS notifications:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Notification delivery failed' }, 500);
  }
});

function isNotifiableAlert(alert: SosAlert | null): alert is SosAlert {
  return Boolean(
    alert
    && alert.status === 'active'
    && alert.community_visible
    && alert.latitude !== null
    && alert.longitude !== null
    && Date.parse(alert.expires_at) > Date.now(),
  );
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
