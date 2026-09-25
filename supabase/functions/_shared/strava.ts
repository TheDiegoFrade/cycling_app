import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Cliente con la service role key: ignora RLS a propósito — es el único
 * lugar del sistema con permiso de leer/escribir strava_tokens. Nunca
 * exponer esta key al navegador (vive solo como secret de la Edge Function). */
function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Verifica el JWT que manda automáticamente supabase.functions.invoke() del
 * lado del cliente y devuelve el user id — lanza si no hay sesión válida. */
export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('sin sesión');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('sesión inválida');
  return data.user.id;
}

/** Access token vigente de Strava para este usuario. Lo refresca solo si ya
 * expiró (o está por hacerlo) — el refresh también necesita el
 * client_secret, por eso vive acá y nunca en el navegador. */
export async function getValidStravaToken(userId: string): Promise<string> {
  const admin = adminClient();
  const { data: row, error } = await admin.from('strava_tokens').select('*').eq('user_id', userId).single();
  if (error || !row) throw new Error('Strava no está conectado para este usuario');

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 60) return row.access_token;

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`no se pudo refrescar el token de Strava (${res.status}): ${await res.text()}`);
  const fresh = await res.json();

  await admin
    .from('strava_tokens')
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return fresh.access_token;
}
