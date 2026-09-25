// Recibe el `code` que Strava le dio al navegador tras autorizar, y lo
// cambia por tokens usando el client_secret — ese intercambio NUNCA puede
// hacerse desde el navegador (expondría el secret), por eso vive acá.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const { code } = await req.json();
    if (!code) throw new Error('falta code');

    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('STRAVA_CLIENT_ID'),
        client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
        code,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`Strava respondió ${tokenRes.status}: ${await tokenRes.text()}`);
    const token = await tokenRes.json();

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: tokenErr } = await admin.from('strava_tokens').upsert({
      user_id: userId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      updated_at: new Date().toISOString(),
    });
    if (tokenErr) throw new Error(`no se pudo guardar el token: ${tokenErr.message}`);

    const athleteName = [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(' ') || null;
    const { error: connErr } = await admin.from('strava_connections').upsert({
      user_id: userId,
      strava_athlete_id: token.athlete?.id,
      strava_athlete_name: athleteName,
      connected_at: new Date().toISOString(),
    });
    if (connErr) throw new Error(`no se pudo guardar la conexión: ${connErr.message}`);

    return new Response(JSON.stringify({ connected: true, athleteId: token.athlete?.id, athleteName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
