// Sube un .fit ya generado por el cliente a la cuenta de Strava del usuario.
// El cliente manda los bytes (ya los tiene, los usa también para exportar/
// guardar en Storage) — esta función solo necesita el access token, que sí
// vive protegido acá.
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId, getValidStravaToken } from '../_shared/strava.ts';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const { fitBase64, filename } = await req.json();
    if (!fitBase64) throw new Error('falta fitBase64');

    const accessToken = await getValidStravaToken(userId);
    const bytes = base64ToUint8Array(fitBase64);

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), filename ?? 'session.fit');
    form.append('data_type', 'fit');

    const res = await fetch('https://www.strava.com/api/v3/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const body = await res.json();
    // Strava responde de inmediato con un upload_id y sigue procesando
    // aparte — esto NO confirma que la actividad ya quede visible, solo que
    // se recibió. No verificado contra la API real todavía.
    if (!res.ok) throw new Error(`Strava respondió ${res.status}: ${JSON.stringify(body)}`);

    return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
