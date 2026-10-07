// Biblioteca del coach (vista del coach, paso 5): sus plantillas de bici y
// de fuerza/movilidad. Solo el coach las lee y escribe (RLS en
// supabase/schema.sql); al agendarlas se copian, así que el atleta nunca
// necesita leer esta tabla.
import type { BikePayload, RoutinePayload, SessionTemplate, TemplateKind } from '../core/coach-templates';
import { supabase } from '../supabase/client';

function client() {
  if (!supabase) throw new Error('Supabase no configurado');
  return supabase;
}

function fromRow(r: { id: string; name: string; kind: TemplateKind; payload: unknown; updated_at: string }): SessionTemplate {
  return r.kind === 'bike'
    ? { id: r.id, name: r.name, kind: 'bike', payload: r.payload as BikePayload, updatedAt: r.updated_at }
    : { id: r.id, name: r.name, kind: r.kind, payload: r.payload as RoutinePayload, updatedAt: r.updated_at };
}

export async function listTemplates(coachId: string): Promise<SessionTemplate[]> {
  const { data, error } = await client()
    .from('session_templates')
    .select('id, name, kind, payload, updated_at')
    .eq('coach_id', coachId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/** Crea (sin id) o actualiza (con id) una plantilla. */
export async function saveTemplate(
  coachId: string,
  t: { id?: string; name: string; kind: TemplateKind; payload: BikePayload | RoutinePayload },
): Promise<SessionTemplate> {
  const row = { coach_id: coachId, name: t.name.trim(), kind: t.kind, payload: t.payload, updated_at: new Date().toISOString() };
  const query = t.id
    ? client().from('session_templates').update(row).eq('id', t.id).eq('coach_id', coachId)
    : client().from('session_templates').insert(row);
  const { data, error } = await query.select('id, name, kind, payload, updated_at').single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteTemplate(coachId: string, id: string): Promise<void> {
  const { error } = await client().from('session_templates').delete().eq('id', id).eq('coach_id', coachId);
  if (error) throw error;
}
