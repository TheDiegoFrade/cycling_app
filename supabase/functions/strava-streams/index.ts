// Trae potencia/pulso/cadencia segundo a segundo de una actividad de Strava
// y los devuelve como samples crudos — el cliente arma la SessionRecord con
// esto y reutiliza TODO su código ya probado (computeSessionAnalytics,
// encodeFitActivity, saveSession, pushSessionToCloud) en vez de duplicar esa
// lógica acá. No verificado contra la API real: la resolución/alineación
// exacta de los streams de Strava puede variar por actividad.
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId, getValidStravaToken } from '../_shared/strava.ts';

interface StravaStream {
  data: number[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const { activityId } = await req.json();
    if (!activityId) throw new Error('falta activityId');
    const accessToken = await getValidStravaToken(userId);

    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,watts,heartrate,cadence&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error(`Strava respondió ${res.status}: ${await res.text()}`);
    const streams: Record<string, StravaStream> = await res.json();

    const time = streams.time?.data ?? [];
    const watts = streams.watts?.data ?? [];
    const hr = streams.heartrate?.data ?? [];
    const cadence = streams.cadence?.data ?? [];

    const samples = time.map((t, i) => ({
      t,
      power: watts[i] ?? 0,
      cadence: cadence[i] ?? 0,
      hr: hr[i] ?? 0,
    }));

    return new Response(JSON.stringify({ samples }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
