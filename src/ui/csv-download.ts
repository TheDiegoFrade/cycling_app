// Botones «Descargar CSV» de Historial (sesiones) y Plan (lo agendado). Arma
// las filas con lo que la app ya tiene en memoria y en el dispositivo y las
// descarga: sin servidor ni IA. El formato está en core/csv-export.ts.
import { csvFileName, planCsv, sessionsCsv } from '../core/csv-export';
import type { CsvPlanItem, CsvSession } from '../core/csv-export';
import { TEMPLATE_KIND_LABELS, routineSummary } from '../core/coach-templates';
import { dayKeyOf, todayKey } from '../core/day-key';
import { NON_BIKE_KIND_LABELS, isNonBikeKind, wasTrained } from '../core/session-kind';
import { sessionSourceOf } from '../core/session-source';
import type { SessionSource } from '../core/session-source';
import { mainZoneOf } from '../core/workout-zone';
import { estimateWorkout } from '../core/workout-estimate';
import { computeSessionAnalytics } from '../engine/analytics';
import { listSessions } from '../storage/session-store';
import type { SessionRecord } from '../storage/session-store';
import type { CloudSessionSummary } from '../sync/cloud-sync';
import { appState } from './state';

const SOURCE_LABELS: Record<SessionSource, string> = {
  torq: 'Torq',
  fit_upload: 'Archivo .fit',
  intervals: 'intervals.icu',
  strava: 'Strava',
  manual: 'Registro manual',
};

const clockMinutes = (s: { startedAt: string; finishedAt: string }) => Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);

function fromLocal(s: SessionRecord, cloud: CloudSessionSummary | undefined): CsvSession {
  const base = {
    startedAt: s.startedAt,
    name: s.workoutName,
    source: SOURCE_LABELS[sessionSourceOf(s)],
    rpe: s.rpe ?? cloud?.rpe ?? null,
    note: (s.note ?? cloud?.note ?? '').trim() || null,
  };
  if (isNonBikeKind(s.kind) || s.samples.length === 0) {
    return {
      ...base,
      kind: isNonBikeKind(s.kind) ? NON_BIKE_KIND_LABELS[s.kind] : 'Bici',
      durationMin: clockMinutes(s),
      avgPower: null,
      normalizedPower: null,
      maxPower: null,
      avgHr: null,
      maxHr: null,
      avgCadence: null,
      intensityFactor: null,
      tss: null,
      ftp: null,
    };
  }
  const a = computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp });
  return {
    ...base,
    kind: 'Bici',
    durationMin: s.samples.length / 60,
    avgPower: a.avgPower,
    normalizedPower: a.normalizedPower,
    maxPower: a.maxPower,
    avgHr: a.avgHr,
    maxHr: a.maxHr,
    avgCadence: a.avgCadence,
    intensityFactor: a.intensityFactor,
    tss: a.trainingStressScore,
    ftp: s.ftp,
  };
}

function fromCloud(s: CloudSessionSummary): CsvSession {
  const bike = !isNonBikeKind(s.kind);
  return {
    startedAt: s.startedAt,
    name: s.workoutName,
    kind: bike ? 'Bici' : NON_BIKE_KIND_LABELS[s.kind as keyof typeof NON_BIKE_KIND_LABELS],
    source: SOURCE_LABELS[s.source] ?? s.source,
    durationMin: clockMinutes(s),
    avgPower: bike ? s.avgPower : null,
    normalizedPower: bike ? s.normalizedPower : null,
    maxPower: bike ? s.maxPower : null,
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    avgCadence: bike ? s.avgCadence : null,
    intensityFactor: bike ? s.intensityFactor : null,
    tss: bike ? s.trainingStressScore : null,
    ftp: bike ? s.ftp : null,
    rpe: s.rpe,
    note: (s.note ?? '').trim() || null,
  };
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sesiones de este dispositivo y de la nube (sin repetir), las que pasen
 * el filtro de fecha de Actividad. Las «No la hice» no van: no se entrenó.
 * Devuelve cuántas se exportaron. */
export async function downloadSessionsCsv(inRange: (dayKey: string) => boolean = () => true): Promise<number> {
  const local = await listSessions().catch(() => [] as SessionRecord[]);
  const cloudById = new Map(appState.cloudSessions.map((s) => [s.id, s]));
  const localIds = new Set(local.map((s) => s.id));
  const rows = [
    ...local.filter((s) => wasTrained(s) && inRange(dayKeyOf(s.startedAt))).map((s) => fromLocal(s, cloudById.get(s.id))),
    ...appState.cloudSessions.filter((s) => !localIds.has(s.id) && wasTrained(s) && inRange(dayKeyOf(s.startedAt))).map(fromCloud),
  ];
  download(csvFileName('sesiones', todayKey()), sessionsCsv(rows));
  return rows.length;
}

/** Todo lo agendado (rodillo y rutinas del coach), hecho o no. Devuelve
 * cuántos elementos se exportaron. */
export async function downloadPlanCsv(): Promise<number> {
  const local = await listSessions().catch(() => [] as SessionRecord[]);
  const doneDays = new Set([...local, ...appState.cloudSessions].filter(wasTrained).map((s) => dayKeyOf(s.startedAt)));
  const ftp = appState.profile.ftp;
  const items: CsvPlanItem[] = [
    ...appState.workouts
      .filter((w) => w.scheduledDate)
      .map((w) => {
        const est = estimateWorkout(w.intervals, ftp);
        return {
          date: w.scheduledDate!,
          name: w.name,
          kind: 'Rodillo',
          zone: mainZoneOf(w),
          minutes: est.durationS / 60,
          tss: est.tss,
          done: doneDays.has(w.scheduledDate!),
          description: w.description?.trim() || null,
        };
      }),
    ...appState.plannedRoutines.map((r) => ({
      date: r.scheduledDate,
      name: r.name,
      kind: TEMPLATE_KIND_LABELS[r.kind],
      zone: null,
      minutes: r.payload.durationMin ?? null,
      tss: null,
      done: doneDays.has(r.scheduledDate),
      description: routineSummary(r.payload),
    })),
  ];
  download(csvFileName('plan', todayKey()), planCsv(items));
  return items.length;
}
