// Quienes prueban el coach IA para darnos feedback: sin topes de uso (crear o
// cambiar el plan, evaluar la semana, tokens del mes). Las reglas que no son
// de conteo siguen igual: un plan activo a la vez y evaluar solo una semana
// que ya terminó. La usan la app (para no mostrar ni aplicar los topes) y
// coach-chat (que es donde de verdad se aplican).
export const UNLIMITED_COACH_USER_IDS: ReadonlySet<string> = new Set([
  '85983750-01e5-449f-adb6-0a87c7047682', // joemtb03@gmail.com — Joe Hernández, entrenador (UR Training)
  'b73d7ff9-adcb-494a-98fb-c94fdc509b3b', // joemtb03+pruebas@gmail.com — su cuenta de pruebas
  '68c9ddae-cee4-4d2f-8d0f-9553f9fe5782', // dperezcf@gmail.com — cuenta dummy de pruebas (las pruebas de Piñón pasan del tope de 10 al día)
]);

export function hasUnlimitedCoach(userId: string | null | undefined): boolean {
  return !!userId && UNLIMITED_COACH_USER_IDS.has(userId);
}
