// Lista las actividades de ciclismo recientes del atleta en Strava (id,
// nombre, fecha) — el cliente decide con eso cuáles le faltan importar
// (comparando contra sus sesiones locales/en la nube por strava_activity_id).
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId, getValidStravaToken } from '../_shared/strava.ts';

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  moving_time: number;
  distance: number;
}

const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const accessToken = await getValidStravaToken(userId);

    const body = req.body ? await req.json().catch(() => ({})) : {};
    const after: number | undefined = body?.afterUnixS; // unix seconds, opcional

    const params = new URLSearchParams({ per_page: '30' });
    if (after) params.set('after', String(after));

    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Strava respondió ${res.status}: ${await res.text()}`);
    const activities: StravaActivity[] = await res.json();

    const rides = activities
      .filter((a) => RIDE_TYPES.has(a.sport_type ?? a.type))
      .map((a) => ({ id: a.id, name: a.name, startDate: a.start_date, movingTimeS: a.moving_time, distanceM: a.distance }));

    return new Response(JSON.stringify(rides), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
