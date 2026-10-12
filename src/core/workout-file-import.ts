import { parseErg, parseMrc } from './course-format-parser';
import { parseFitWorkout } from './fit-workout-parser';
import type { Workout } from './types';
import { validateWorkout } from './validator';
import { parseZwo } from './zwo-parser';

/** Import compartido entre Inicio y Calendario — ambos dejan elegir un
 * archivo (.zwo/.mrc/.erg/.fit/.workout.json) y arman un Workout listo para
 * guardar. `ftp` hace falta para `.erg` y `.fit` (watts absolutos) y
 * `hrMax` para `.fit` con pulso en % del máximo. */
export async function importWorkoutFile(file: File, ftp: number, hrMax = 185): Promise<{ workout?: Workout; errors: string[] }> {
  if (file.name.toLowerCase().endsWith('.fit')) {
    const parsed = parseFitWorkout(await file.arrayBuffer(), { ftp, hrMax });
    if (parsed.errors.length > 0) return { errors: parsed.errors };
    const workout: Workout = {
      format_version: 1,
      id: crypto.randomUUID(),
      name: parsed.name,
      description: [
        parsed.allFree ? 'Por pulso: va sin ERG y el esfuerzo lo pones tú; Torq te avisa si te sales del rango.' : '',
        parsed.warnings.length ? `Al importar: ${parsed.warnings.join('; ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      intervals: parsed.intervals,
      comments: parsed.comments.length ? parsed.comments : undefined,
      created_at: new Date().toISOString(),
      // Todo por pulso (o libre): arranca sin ERG, en modo calle.
      ...(parsed.allFree ? { erg: 'off' as const } : {}),
    };
    const result = validateWorkout(workout);
    return result.valid ? { workout, errors: [] } : { errors: result.errors };
  }
  const text = await file.text();
  if (file.name.endsWith('.zwo') || file.name.endsWith('.mrc') || file.name.endsWith('.erg')) {
    const parsed = file.name.endsWith('.zwo') ? parseZwo(text) : file.name.endsWith('.mrc') ? parseMrc(text) : parseErg(text, ftp);
    if (parsed.errors.length > 0) return { errors: parsed.errors };
    const workout: Workout = {
      format_version: 1,
      id: crypto.randomUUID(),
      name: parsed.name,
      description: 'description' in parsed ? (parsed as { description?: string }).description : undefined,
      intervals: parsed.intervals,
      comments: parsed.comments.length ? parsed.comments : undefined,
      created_at: new Date().toISOString(),
    };
    const result = validateWorkout(workout);
    return result.valid ? { workout, errors: [] } : { errors: result.errors };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: [`"${file.name}" no es JSON válido.`] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.intervals)) {
    return { errors: [`"${file.name}" no tiene \`intervals\`; si es un archivo de solo reglas, usa el botón "+ reglas" sobre un workout ya importado.`] };
  }
  const workout: Workout = {
    ...(record as unknown as Workout),
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    created_at: typeof record.created_at === 'string' && record.created_at ? record.created_at : new Date().toISOString(),
  };
  const result = validateWorkout(workout);
  return result.valid ? { workout, errors: [] } : { errors: result.errors };
}
