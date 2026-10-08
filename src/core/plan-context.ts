// Lo que el coach de IA necesita saber del plan guardado para generar la
// semana siguiente (weekly_eval) o el bloque siguiente (publish_block): para
// qué entrena, qué días, en qué bloque va y cuándo toca el próximo test.
// Sin esto generaba la semana sin saber los días del atleta ni su objetivo.
// Lógica pura: la usa ui/coach.ts al armar el context.
import type { Profile } from './types';

export type TestType = 'ramp' | 'test20';

/** Test que el coach dejó agendado (ver nextTest en coach-chat/schemas.ts). */
export interface PlannedTest {
  weekIndex: number;
  type: TestType;
  reason: string;
}

export interface StoredPlanBlock {
  name: string;
  weeks: number;
  focus: string;
  targetHoursPerWeek?: number;
  published?: boolean;
}

export interface StoredPlanData {
  startDate: string;
  blocks: StoredPlanBlock[];
  weeks: { weekIndex: number; workoutIds: string[] }[];
  /** Lo que el atleta escribió en el formulario de crear plan. Planes
   * anteriores a este campo no lo tienen. */
  form?: { goal: string; days: string[]; hoursPerWeek: number };
  nextTest?: PlannedTest | null;
}

export interface CoachPlanContext {
  goal: string;
  discipline: Profile['discipline'] | null;
  experienceLevel: Profile['experienceLevel'] | null;
  generalFitnessLevel: Profile['generalFitnessLevel'] | null;
  days: string[];
  hoursPerWeek: number | null;
  currentBlock: { name: string; focus: string; weeks: number; weekInBlock: number };
  nextBlock: { name: string; focus: string; weeks: number; targetHoursPerWeek: number | null } | null;
  nextTest: PlannedTest | null;
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Bloque al que pertenece `weekIndex` y su semana dentro de él (1 = la
 * primera). Más allá del último bloque, se queda en el último. */
export function blockOfWeek(blocks: readonly StoredPlanBlock[], weekIndex: number): { index: number; weekInBlock: number } {
  let start = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (weekIndex < start + blocks[i].weeks) return { index: i, weekInBlock: weekIndex - start + 1 };
    start += blocks[i].weeks;
  }
  const last = Math.max(0, blocks.length - 1);
  return { index: last, weekInBlock: weekIndex - (start - (blocks[last]?.weeks ?? 0)) + 1 };
}

/** Lunes de la semana `weekIndex` del plan (YYYY-MM-DD). Misma ancla que el
 * servidor (mondayOf en coach-chat/index.ts): semanas calendario reales. */
export function weekStartOf(startDate: string, weekIndex: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + weekIndex * 7);
  return d.toISOString().slice(0, 10);
}

/** Contexto del plan para la semana `weekIndex`. `workoutDays` (días de los
 * workouts que ya generó el plan) solo se usa en planes viejos sin `form`. */
export function planContextFor(
  plan: { goal: string; data: StoredPlanData },
  profile: Profile,
  weekIndex: number,
  workoutDays: readonly string[] = [],
): CoachPlanContext {
  const { blocks, form } = plan.data;
  const cur = blockOfWeek(blocks, weekIndex);
  const block = blocks[cur.index];
  const next = blocks[cur.index + 1];
  const days = form?.days ?? DAY_ORDER.filter((d) => workoutDays.includes(d));
  return {
    goal: form?.goal ?? plan.goal,
    discipline: profile.discipline ?? null,
    experienceLevel: profile.experienceLevel ?? null,
    generalFitnessLevel: profile.generalFitnessLevel ?? null,
    days,
    hoursPerWeek: form?.hoursPerWeek ?? null,
    currentBlock: { name: block?.name ?? '', focus: block?.focus ?? '', weeks: block?.weeks ?? 0, weekInBlock: cur.weekInBlock },
    nextBlock: next ? { name: next.name, focus: next.focus, weeks: next.weeks, targetHoursPerWeek: next.targetHoursPerWeek ?? null } : null,
    nextTest: plan.data.nextTest ?? null,
  };
}

const TEST_LABEL: Record<TestType, string> = { ramp: 'test de rampa', test20: 'test de 20 min' };

/** "Tu primer test: test de rampa, semana del 2 nov." para la tarjeta del plan. */
export function plannedTestLabel(test: PlannedTest, startDate: string, hasMeasuredFtp: boolean): string {
  const monday = new Date(`${weekStartOf(startDate, test.weekIndex)}T12:00:00Z`);
  const when = monday.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${hasMeasuredFtp ? 'Próximo test' : 'Tu primer test'}: ${TEST_LABEL[test.type]}, semana del ${when}.`;
}
