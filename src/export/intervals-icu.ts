/** Subida a intervals.icu. NO VERIFICADO: no tengo forma de confirmar el
 * endpoint ni el formato exacto sin acceso a internet ni una API key real.
 * Antes de confiar en esto, pruébalo con tu cuenta y revisa la respuesta —
 * si el endpoint cambió, este es el único lugar que hay que tocar. Docs:
 * https://intervals.icu/api-docs.html (revisar ahí primero). */
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
    headers: { Authorization: `Basic ${btoa(`API_KEY:${creds.apiKey}`)}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`intervals.icu respondió ${response.status}: ${await response.text().catch(() => '')}`);
  }
  return response;
}
