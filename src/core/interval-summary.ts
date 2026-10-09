// Resumen compacto de los bloques de un workout, para mandárselo a la IA
// (biblioteca del coach en coach_week): agrupa las series repetidas
// ("4× (Umbral 8 min 97 %, Rec 4 min 55 %)") para que una plantilla larga
// quepa en pocas palabras.
import type { Interval } from './types';

function same(a: Interval, b: Interval): boolean {
  return a.type === b.type && a.duration_s === b.duration_s && a.power_pct === b.power_pct && a.ramp_to_pct === b.ramp_to_pct;
}

function fmt(iv: Interval): string {
  const s = iv.duration_s;
  const dur = s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
  const pct = iv.ramp_to_pct !== undefined ? `${iv.power_pct}→${iv.ramp_to_pct} %` : `${iv.power_pct} %`;
  return `${iv.name} ${dur} ${pct}`;
}

export function summarizeIntervals(intervals: readonly Interval[], maxLength = 600): string {
  const parts: string[] = [];
  let i = 0;
  while (i < intervals.length) {
    let best = { len: 1, reps: 1 };
    for (const len of [1, 2, 3]) {
      let reps = 1;
      while (i + (reps + 1) * len <= intervals.length && intervals.slice(i, i + len).every((iv, k) => same(iv, intervals[i + reps * len + k]))) reps++;
      if (reps > 1 && reps * len > best.reps * best.len) best = { len, reps };
    }
    const group = intervals.slice(i, i + best.len).map(fmt).join(', ');
    parts.push(best.reps > 1 ? `${best.reps}× (${group})` : group);
    i += best.len * best.reps;
  }
  const text = parts.join(' · ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
