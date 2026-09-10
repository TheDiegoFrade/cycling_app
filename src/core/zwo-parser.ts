import type { Comment, Interval } from './types';

export interface ZwoParseResult {
  name: string;
  description?: string;
  intervals: Interval[];
  comments: Comment[];
  errors: string[];
}

const KNOWN_TAGS = new Set([
  'warmup',
  'steadystate',
  'intervalst',
  'ramp',
  'cooldown',
  'freeride',
  'textevent',
]);

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString))) {
    attrs[m[1]] = decodeXmlEntities(m[2]);
  }
  return attrs;
}

function num(attrs: Record<string, string>, key: string): number | undefined {
  if (!(key in attrs)) return undefined;
  const n = Number(attrs[key]);
  return Number.isFinite(n) ? n : undefined;
}

function pct(attrs: Record<string, string>, key: string): number | undefined {
  const n = num(attrs, key);
  return n === undefined ? undefined : Math.round(n * 100);
}

function extractTagContent(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? decodeXmlEntities(m[1].trim()) : undefined;
}

interface Block {
  tag: string;
  attrs: Record<string, string>;
}

function extractWorkoutBlocks(xml: string): { blocks: Block[]; errors: string[] } {
  const errors: string[] = [];
  const workoutMatch = /<workout>([\s\S]*?)<\/workout>/i.exec(xml);
  if (!workoutMatch) {
    return { blocks: [], errors: ['no se encontró el bloque `<workout>...</workout>` en el archivo .zwo'] };
  }
  const inner = workoutMatch[1];

  const blocks: Block[] = [];
  const tagRe = /<(\w+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(inner))) {
    const tag = m[1].toLowerCase();
    if (tag === 'workout') continue;
    if (!KNOWN_TAGS.has(tag)) {
      errors.push(
        `el archivo .zwo usa la etiqueta \`<${m[1]}>\`, que no se reconoce; las etiquetas soportadas son: Warmup, SteadyState, IntervalsT, Ramp, Cooldown, FreeRide, textevent`,
      );
      continue;
    }
    blocks.push({ tag, attrs: parseAttrs(m[2]) });
  }

  return { blocks, errors };
}

function blockToIntervals(block: Block, errors: string[]): Interval[] {
  const { tag, attrs } = block;
  const duration_s = num(attrs, 'Duration');

  if (tag !== 'intervalst' && duration_s === undefined) {
    errors.push(`un bloque \`<${tag}>\` no tiene \`Duration\`, es obligatorio`);
    return [];
  }

  const cadence_min = num(attrs, 'Cadence');

  switch (tag) {
    case 'warmup': {
      const powerLow = pct(attrs, 'PowerLow');
      const powerHigh = pct(attrs, 'PowerHigh');
      return [
        {
          name: 'Calentamiento',
          type: 'warmup',
          duration_s: duration_s!,
          power_pct: powerLow ?? pct(attrs, 'Power') ?? 0,
          ramp_to_pct: powerHigh,
          cadence_min,
        },
      ];
    }
    case 'cooldown': {
      const powerLow = pct(attrs, 'PowerLow');
      const powerHigh = pct(attrs, 'PowerHigh');
      return [
        {
          name: 'Vuelta a la calma',
          type: 'cooldown',
          duration_s: duration_s!,
          power_pct: powerLow ?? pct(attrs, 'Power') ?? 0,
          ramp_to_pct: powerHigh,
          cadence_min,
        },
      ];
    }
    case 'ramp': {
      const powerLow = pct(attrs, 'PowerLow');
      const powerHigh = pct(attrs, 'PowerHigh');
      return [
        {
          name: 'Rampa',
          type: 'steady',
          duration_s: duration_s!,
          power_pct: powerLow ?? 0,
          ramp_to_pct: powerHigh,
          cadence_min,
        },
      ];
    }
    case 'steadystate': {
      return [
        {
          name: 'Bloque estable',
          type: 'steady',
          duration_s: duration_s!,
          power_pct: pct(attrs, 'Power') ?? 0,
          cadence_min,
        },
      ];
    }
    case 'freeride': {
      return [
        {
          name: 'Libre',
          type: 'free',
          duration_s: duration_s!,
          power_pct: 0,
          cadence_min,
        },
      ];
    }
    case 'intervalst': {
      const repeat = num(attrs, 'Repeat');
      const onDuration = num(attrs, 'OnDuration');
      const offDuration = num(attrs, 'OffDuration');
      const onPower = pct(attrs, 'OnPower');
      const offPower = pct(attrs, 'OffPower');
      const cadenceResting = num(attrs, 'CadenceResting');
      if (repeat === undefined || onDuration === undefined || offDuration === undefined) {
        errors.push('un bloque `<IntervalsT>` necesita `Repeat`, `OnDuration` y `OffDuration`');
        return [];
      }
      const out: Interval[] = [];
      for (let i = 1; i <= repeat; i++) {
        out.push({
          name: `Intervalo ${i}`,
          type: 'interval',
          duration_s: onDuration,
          power_pct: onPower ?? 0,
          cadence_min,
        });
        out.push({
          name: `Recuperación ${i}`,
          type: 'recovery',
          duration_s: offDuration,
          power_pct: offPower ?? 0,
          cadence_min: cadenceResting,
        });
      }
      return out;
    }
    default:
      return [];
  }
}

function blockToComment(block: Block, errors: string[]): Comment | null {
  const { attrs } = block;
  const at_s = num(attrs, 'timeoffset');
  const message = attrs.message;
  if (at_s === undefined || !message) {
    errors.push('un `<textevent>` necesita `timeoffset` y `message`');
    return null;
  }
  return { at_s, message };
}

/** Parser de `.zwo`. Solo produce intervalos y comentarios (textevent); las
 * reglas no existen en este formato y se numeran los bloques según el orden
 * de aparición una vez expandidos los `IntervalsT`. */
export function parseZwo(xml: string): ZwoParseResult {
  const errors: string[] = [];
  const name = extractTagContent(xml, 'name') ?? 'Workout importado';
  const description = extractTagContent(xml, 'description');

  const { blocks, errors: blockErrors } = extractWorkoutBlocks(xml);
  errors.push(...blockErrors);

  const intervals: Interval[] = [];
  const comments: Comment[] = [];
  for (const block of blocks) {
    if (block.tag === 'textevent') {
      const comment = blockToComment(block, errors);
      if (comment) comments.push(comment);
    } else {
      intervals.push(...blockToIntervals(block, errors));
    }
  }

  return { name, description, intervals, comments, errors };
}
