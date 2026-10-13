// Quienes prueban el coach IA para darnos feedback: sin topes de uso (crear o
// cambiar el plan, evaluar la semana, tokens del mes). Las reglas que no son
// de conteo siguen igual: un plan activo a la vez y evaluar solo una semana
// que ya terminó. La usan la app (para no mostrar ni aplicar los topes) y
// coach-chat (que es donde de verdad se aplican).
export const UNLIMITED_COACH_USER_IDS: ReadonlySet<string> = new Set([
  '85983750-01e5-449f-adb6-0a87c7047682', // joemtb03@gmail.com — Joe Hernández, entrenador (UR Training)
]);

export function hasUnlimitedCoach(userId: string | null | undefined): boolean {
  return !!userId && UNLIMITED_COACH_USER_IDS.has(userId);
}
