// Correos de la IA que el coach aprueba para su atleta (Edge Function
// send-coach-email): la bienvenida del plan y el resumen de cada semana.
// Cada uno se puede enviar como máximo 2 veces, siempre con un comentario.
import { supabase } from '../supabase/client';

export interface CoachEmailItem {
  key: string; // "plan" o "week:<weekIndex>"
  weekStart: string | null; // lunes de esa semana del plan
  sends: number;
  remaining: number;
  lastSentAt: string | null;
}


function client() {
  if (!supabase) throw new Error('Sin conexión a la nube');
  return supabase;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke('send-coach-email', { body });
  if (error || data?.error) {
    let message = data?.error as string | undefined;
    if (!message && error && 'context' in error) {
      try {
        message = (await (error as unknown as { context: Response }).context.json())?.error;
      } catch {
        // sin JSON: nos quedamos con error.message
      }
    }
    throw new Error(message ?? error?.message ?? 'error desconocido');
  }
  return data as T;
}

/** Qué correos tiene pendientes o enviados este atleta. */
export async function fetchCoachEmails(athleteId: string): Promise<CoachEmailItem[]> {
  const res = await invoke<{ items: CoachEmailItem[] }>({ athleteId, action: 'status' });
  return res.items ?? [];
}

/** Manda uno con el comentario del coach. */
export async function sendCoachEmail(athleteId: string, key: string, comment: string): Promise<{ test: boolean; sentTo: string; remaining: number; sentAt: string }> {
  return invoke({ athleteId, action: 'send', key, comment });
}
