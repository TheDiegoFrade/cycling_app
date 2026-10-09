// Expediente del atleta (tabla athlete_notes, ver supabase/schema.sql): lo
// edita su coach activo, lo actualiza la IA si no tiene coach, y el atleta
// lo ve y puede borrarlo. RLS decide quién puede qué; aquí solo se llama.
import { supabase } from '../supabase/client';

export const NOTES_MAX_CHARS = 1200; // mismo tope que la tabla y coach-chat/notes.ts

export interface AthleteNotes {
  body: string;
  updatedBy: 'coach' | 'ai';
  updatedAt: string;
}

export async function fetchAthleteNotes(athleteId: string): Promise<AthleteNotes | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('athlete_notes').select('body, updated_by, updated_at').eq('athlete_id', athleteId).maybeSingle();
  if (error) throw error;
  return data && data.body ? { body: data.body, updatedBy: data.updated_by, updatedAt: data.updated_at } : null;
}

/** Guarda el expediente como coach (también al aprobar lo que propuso la IA:
 * desde ese momento es suyo). */
export async function saveNotesAsCoach(athleteId: string, coachUserId: string, body: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('athlete_notes').upsert({
    athlete_id: athleteId,
    body: body.trim().slice(0, NOTES_MAX_CHARS),
    updated_by: 'coach',
    updated_by_user: coachUserId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** El atleta borra su propio expediente. */
export async function deleteMyNotes(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('athlete_notes').delete().eq('athlete_id', userId);
  if (error) throw error;
}
