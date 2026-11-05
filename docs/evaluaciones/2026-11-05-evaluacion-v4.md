# Coach IA v4 en producción: evaluación y ajustes v4.1 (5 nov 2026)

Corrida: `node scripts/coach-sim/perfiles.mjs p01 p02 p03 p08 p10` contra producción (cuenta dummy), una vez por persona, después de desplegar `coach-chat` con el prompt v4 (PR #55). Se confirmó la versión por el tamaño del prompt cacheado en `coach_calls`: 29,919 tokens con v3 y 35,899 con v4. Base de comparación: los planes que Joe evaluó el 20 oct (`planes-ia-para-joe-datos/`). Costo de la corrida v4: US$0.64.

## Resultado por persona

| Persona | v4 vs 20 oct | Lo que pidió Joe |
|---|---|---|
| Ana | Mejor | Sí: aceleraciones de 90 s a RPE 5-6 desde la semana 1 (4 → 5 → 6), juego de cadencia, sugerencia de fuerza y sueño. |
| Carlos | Mejor | Sí: sin test de entrada (FTP manual de 3 semanas), retest en la semana 5, gym → fondo → sweet spot, aviso de que la salida con amigos puede volverse carrera. Algo agresivo: sweet spot al 90 % en su primera sesión de rodillo. |
| Sofía | Mejor | Sí: bloque de 40 min a RPE 7 en la semana 2 en vez del test de 20 min, core, hidratación. Volumen parcial (4.5 h → 5 h). |
| Daniel | Mejor | Sí en parte: aceleraciones a RPE 5-6 desde la semana 1, fuerza y core, RPE contra pulso, ajuste de la bici. Faltan los isométricos por nombre. |
| Paola | Igual o mejor | Sí en parte: 30/30 a RPE 7-8 en la semana 3 (10 reps en 2 bloques), nutriólogo para el snack, descarga 3-1. |

## Errores que quedaron y qué se cambió (v4.1)

| Error | Dónde nace | Cambio |
|---|---|---|
| Paola: "antes de apretar, que tu médico te dé luz verde" y aun así RPE 7-8 | prompt, `healthFirst` | Si hay RPE 7 o más: "comparte este plan con tu médico; los esfuerzos de RPE 7-8 van cuando te dé luz verde", y la sesión dice "si no, a RPE 5-6". Revisión 8 de la lista del contrato. |
| Ana: "la revisamos juntos" | correo (coach) | Regla de "juntas"/"juntos" en `report`, `coachNote` y `reasoning`, y `guard.ts` lo corrige con código según `profile.sex`. |
| Carlos: semana 3 de 6 h 20 min con 6 h disponibles | prompt y guardia | Regla "Horas de la semana: todo cuenta" (rodillo + salidas afuera + técnica) y revisión 7. La guardia ahora suma los extras "outdoor"/"skills" y en weekly_eval usa `plan.hoursPerWeek` (aviso, no falla: una falla sin corregir deja al atleta sin plan). |
| Sofía: coachNote con el día de la salida larga cambiado; correo sin el bloque de 40 min | prompt, `report` | "Lo que dices tiene que ser lo que armaste": días, semanas y tests del texto iguales a `firstBlockWeeks`, `extras` y `nextTest`; el test encubierto se anuncia en `report.why`. |
| Carlos: sweet spot en la primera sesión de rodillo | prompt, arranque | La primera sesión en el rodillo con Torq no es la más dura; el primer sweet spot o umbral, desde la segunda. |
| Descripciones: "si puedes decir una oración completa vas bien" en tempo; RPE 3-4 en tramos animados; "te recomendamos"; "ERG con tu FTP de perfil" sin FTP | redactor | Una sola escala RPE ↔ respiración, el RPE de la intención sin cambiarlo, coach en singular, ERG sin "FTP de perfil" cuando no está medido. |
| Carlos: `546 WORKER_RESOURCE_LIMIT` una vez | `coach-chat` (no es el prompt) | Pendiente: revisar los logs de Supabase. La IA respondió y la función se quedó sin recursos después; el plan no se guardó. El reintento salió bien. |

Lo de los modos que evalúan (weekly_eval, publish_block) toma las mismas reglas: horas con `plan.hoursPerWeek`, género, salud primero y el redactor.

## Pendiente

- Desplegar `coach-chat` y repetir la corrida (y una evaluación semanal) para confirmar v4.1.
- Una sola corrida por persona: hay variación.
