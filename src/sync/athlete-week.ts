// Estado de la semana de UN atleta para el coach: lo que tiene agendado,
// su borrador (plan_weeks) y la última publicación. Lo comparten el editor
// de una semana (screens/coach-week.ts) y "Semanas de todos"
// (screens/coach-weeks.ts) para que las reglas de guardar y publicar vivan
// en un solo lugar:
//  - el primer cambio crea el borrador con base_workout_ids = lo que había;
//  - cada cambio espera al anterior (nunca se pisan);
//  - publicar espera a que termine el último guardado.
import { addDaysKey, itemId, itemsFromWorkouts } from '../core/plan-week';
import type { PlanWeekItem } from '../core/plan-week';
import { createDraft, discardDraft, fetchAthleteWeekWorkouts, fetchDraft, fetchLastPublishedAt, fetchPlannedRoutines, publishDraft, saveDraftItems } from './plan-weeks';
import type { PlanWeekDraft } from './plan-weeks';

export class AthleteWeek {
  items: PlanWeekItem[] = [];
  draft: PlanWeekDraft | null = null;
  publishedAt: string | null = null;
  loaded = false;
  private baseIds: string[] = [];
  private saving: Promise<void> = Promise.resolve();

  readonly coachId: string;
  readonly athleteId: string;
  readonly monday: string;

  constructor(coachId: string, athleteId: string, monday: string) {
    this.coachId = coachId;
    this.athleteId = athleteId;
    this.monday = monday;
  }

  async load(): Promise<void> {
    const [workouts, routines, draft, publishedAt] = await Promise.all([
      fetchAthleteWeekWorkouts(this.athleteId, this.monday),
      fetchPlannedRoutines(this.athleteId, this.monday, addDaysKey(this.monday, 6)),
      fetchDraft(this.coachId, this.athleteId, this.monday),
      fetchLastPublishedAt(this.athleteId, this.monday),
    ]);
    this.draft = draft;
    this.publishedAt = publishedAt;
    if (draft) {
      this.items = draft.items;
      this.baseIds = draft.baseWorkoutIds;
    } else {
      this.items = itemsFromWorkouts(workouts, this.monday, routines);
      this.baseIds = this.items.map(itemId);
    }
    this.loaded = true;
  }

  /** Aplica un cambio y lo guarda en el borrador (lo crea con el primero).
   * `aiRationale`: solo cuando viene de la IA (reemplaza el anterior).
   * La promesa rechaza si no se pudo guardar. */
  change(next: PlanWeekItem[], aiRationale?: string | null): Promise<void> {
    this.items = next;
    if (this.draft && aiRationale !== undefined) this.draft = { ...this.draft, aiRationale };
    const items = next;
    const run = this.saving.then(async () => {
      if (this.draft) await saveDraftItems(this.draft.id, items, aiRationale);
      else this.draft = await createDraft(this.coachId, this.athleteId, this.monday, items, this.baseIds, aiRationale ?? null);
    });
    // la cola sigue aunque un guardado falle; el error lo recibe quien llamó
    this.saving = run.catch(() => {});
    return run;
  }

  async publish(): Promise<void> {
    await this.saving;
    if (!this.draft) return;
    await publishDraft(this.draft.id);
    await this.load();
  }

  async discard(): Promise<void> {
    await this.saving;
    if (this.draft) await discardDraft(this.draft.id);
    this.draft = null;
    await this.load();
  }

  /** Espera a que termine cualquier guardado pendiente. */
  settled(): Promise<void> {
    return this.saving;
  }
}
