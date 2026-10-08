/** Subida a intervals.icu. NO VERIFICADO: no tengo forma de confirmar el
 * endpoint ni el formato exacto sin acceso a internet ni una API key real.
 * Antes de confiar en esto, pruébalo con tu cuenta y revisa la respuesta —
 * si el endpoint cambió, este es el único lugar que hay que tocar. Docs:
 * https://intervals.icu/api-docs.html (revisar ahí primero). */
import type { WellnessDay } from '../engine/wellness';

export interface IntervalsIcuCredentials {
  athleteId: string;
  apiKey: string;
}

export async function uploadActivityFit(
  creds: IntervalsIcuCredentials,
  fitBytes: Uint8Array,
  filename: string,
): Promise<Response> {
  const form = new FormData();
  form.append('file', new Blob([fitBytes as unknown as ArrayBuffer], { type: 'application/octet-stream' }), filename);

  const response = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/activities`, {
    method: 'POST',
    headers: { Authorization: basicAuth(creds) },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`intervals.icu respondió ${response.status}: ${await response.text().catch(() => '')}`);
  }
  return response;
}

const basicAuth = (creds: IntervalsIcuCredentials): string => `Basic ${btoa(`API_KEY:${creds.apiKey}`)}`;

/** Un día de `GET /athlete/{id}/wellness` (el `id` es la fecha). intervals.icu
 * junta ahí lo que manda el reloj/anillo: `hrv` es rMSSD (ms), `restingHR`
 * en lpm, `sleepSecs` en segundos. Cualquier campo puede faltar. */
export interface IcuWellnessRow {
  id: string;
  hrv?: number | null;
  restingHR?: number | null;
  sleepSecs?: number | null;
}

export function wellnessDayFromIcu(row: IcuWellnessRow): WellnessDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.id)) return null;
  const pos = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const hrvMs = pos(row.hrv);
  const restingHr = pos(row.restingHR);
  const sleepS = pos(row.sleepSecs);
  if (hrvMs === null && restingHr === null && sleepS === null) return null;
  return {
    dateKey: row.id,
    hrvMs: hrvMs === null ? null : Math.round(hrvMs * 10) / 10,
    restingHr: restingHr === null ? null : Math.round(restingHr),
    sleepH: sleepS === null ? null : Math.round((sleepS / 3600) * 10) / 10,
  };
}

/** Días de bienestar entre dos fechas (YYYY-MM-DD, inclusive). NO VERIFICADO
 * contra la API real (igual que la subida de arriba). */
export async function fetchWellness(creds: IntervalsIcuCredentials, oldest: string, newest: string): Promise<WellnessDay[]> {
  const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(creds.athleteId)}/wellness?oldest=${oldest}&newest=${newest}`;
  const response = await fetch(url, { headers: { Authorization: basicAuth(creds) }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`intervals.icu respondió ${response.status}`);
  const rows = (await response.json()) as IcuWellnessRow[];
  return Array.isArray(rows) ? rows.flatMap((r) => wellnessDayFromIcu(r) ?? []) : [];
}
