// «Mandar comentario» (Edge Function feedback): llega al correo de soporte.
import { supabase } from '../supabase/client';
import type { FeedbackKind } from '../core/feedback';

export async function sendFeedback(input: { kind: FeedbackKind; message: string; screen: string | null; device: string | null }): Promise<void> {
  if (!supabase) throw new Error('Sin conexión. Intenta de nuevo cuando tengas internet.');
  const { data, error } = await supabase.functions.invoke('feedback', { body: input });
  if (error || data?.error) {
    let message = data?.error as string | undefined;
    if (!message && error && 'context' in error) {
      try {
        message = (await (error as unknown as { context: Response }).context.json())?.error;
      } catch {
        // sin JSON: mensaje genérico
      }
    }
    throw new Error(message ?? 'No se pudo mandar. Revisa tu conexión e intenta de nuevo.');
  }
}
