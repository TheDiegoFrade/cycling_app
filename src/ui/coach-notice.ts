// Avisos para el atleta que tiene coach humano (vista del coach). No
// bloquean nada: el atleta sigue pudiendo usar la IA y mover, agregar o
// borrar entrenamientos — solo se le recuerda, con tono amable, que su
// coach lo verá y que conviene platicarlo.
import { appState } from './state';

export function humanCoachName(): string | null {
  const c = appState.coach.myCoach;
  return c ? c.coachName?.trim() || 'tu coach' : null;
}

/** Antes de una acción de la IA (crear plan, evaluar la semana, dar de
 * baja el plan). true = seguir. Sin coach humano no pregunta nada. */
export function confirmAiWithHumanCoach(): boolean {
  const name = humanCoachName();
  if (!name) return true;
  return window.confirm(
    `Tienes coach: ${name}. Los cambios al plan con IA conviene platicarlos primero con tu coach, para que no se contradigan con lo que está preparando.\n\n¿Quieres seguir de todos modos?`,
  );
}

/** Texto para cuando el atleta mueve o borra un entrenamiento del plan. */
export function planChangeNotice(): string | null {
  const name = humanCoachName();
  if (!name) return null;
  return `${name} verá este cambio cuando revise tu semana. No pasa nada: los planes se adaptan. Si quieres, cuéntale qué pasó.`;
}

/** Aviso flotante que se quita solo — para cambios que no necesitan
 * confirmación (mover de día). */
export function showCoachToast(text: string): void {
  document.querySelector('.coach-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'coach-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 7000);
}

/** Atajo: si hay coach humano, muestra el aviso de cambio al plan. */
export function notifyPlanChange(): void {
  const text = planChangeNotice();
  if (text) showCoachToast(text);
}
