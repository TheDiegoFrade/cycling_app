# Brief para el chat con Fable — mejorar el razonamiento del coach

Abre un chat con Fable, pega este documento completo y adjunta:

- `supabase/functions/coach-chat/prompt.ts` — system prompt (`COACH_SYSTEM_PROMPT`),
  guía de descripciones, contratos de workout y prompt del redactor.
- `supabase/functions/coach-chat/message.ts` — encabezado de cada modo; aquí
  viven las reglas de `coach_week` y `monthly_review`.
- `supabase/functions/coach-chat/schemas.ts` — qué datos recibe el coach
  (`*InputContextSchema`) y qué debe devolver (`*OutputSchema`).
- Los escenarios de `coach-lab/scenarios/` y, si ya corriste una ronda, las
  respuestas de `coach-lab/results/` con su calificación de `rubric.md`.

---

## Contexto

Torq es una app de entrenamiento de ciclismo en rodillo inteligente (ERG,
potencia, pulso, cadencia). Tiene un coach de IA que:

- **create_plan** — arma la periodización (bloques) y concreta hasta 3
  semanas de workouts reales a partir del perfil del atleta y de un
  formulario corto (objetivo en texto libre, horas por semana, días, minutos
  máximos). Modelo: Sonnet 5.5, effort medium.
- **weekly_eval** — cada semana evalúa lo que pasó (TSS planeado vs. real,
  faltas, reglas del motor que se dispararon, nota del atleta, PMC) y decide
  progress / maintain / reduce / insert_recovery + la semana siguiente.
  Modelo: Sonnet 5.5.
- **publish_block** — concreta el siguiente bloque cuando se agota el actual.
- **coach_week** — para coaches humanos: propone la semana de un atleta
  respetando lo bloqueado y priorizando la biblioteca de plantillas del coach.
  Modelo: Haiku (corto y barato).
- Después, otro modelo (Haiku 5.5, `WRITER_SYSTEM_PROMPT`) escribe la
  descripción de cada workout a partir de la `intent` que dejó el coach.

El objetivo de esta ronda: que el coach razone como **un entrenador de
ciclismo experto de verdad, que evalúa bien y hace crecer al atleta**, sin
volverse más caro.

## Fallas vistas en pruebas reales

1. **coach_week con atleta "muy cansado"**: metió un Over-Under el jueves.
   Las reglas de coach_week (`message.ts`) casi no hablan de fatiga, TSB ni
   de cómo dosificar una semana de absorción.
2. **coach_week**: escribió "310 TSB" en vez de TSS (confunde métricas).
3. **Arranque sin FTP / sin capacidad aeróbica conocida**: el usuario no ve
   que el coach sepa empezar bien con alguien de quien no sabemos ni el FTP
   ni la base aeróbica. Hoy el protocolo de arranque (`prompt.ts`, "Regla de
   arranque" y "Protocolo de arranque sin FTP conocido") mete Over/Unders a
   90-100 % de un FTP *estimado* antes del test. Revisarlo: ¿cómo empezaría
   un coach experto con alguien así (pulso, RPE, test de 20 min vs. rampa,
   cuándo, cómo leerlo, cómo recalibrar)?
4. **Tope de 90 min**: salió una sesión de 94 min con `maxSessionMinutes`
   null (el prompt dice que el techo general es 90).
5. **Datos contradictorios**: un perfil "experienced" con 0 años en bici y
   activo en otro deporte. El coach no lo señaló ni ajustó su prudencia.
6. **Lesiones**: el atleta las escribe en su perfil, pero `create_plan` y
   `weekly_eval` no las reciben (no están en sus schemas de entrada). Solo
   `coach_week` y `monthly_review` las ven.

## Lo que quiero de vuelta

1. **`prompt.ts` y `message.ts` completos, ya reescritos**, listos para
   reemplazar los actuales. No me sirven solo diffs sueltos.
2. **Lista de cambios de datos que necesitan código**, si los hay. Por
   ejemplo, mandar `injuries` a create_plan y weekly_eval, o un campo nuevo
   en un schema. Para cada uno: qué campo, de dónde sale y por qué mejora la
   decisión. Yo los implemento aparte.
3. **Changelog corto**: qué cambiaste y qué falla de arriba resuelve cada
   cambio.
4. **Escenarios nuevos** que valga la pena agregar a `coach-lab/scenarios/`,
   con el mismo formato (`context` válido contra el schema + `expect`).

## Restricciones (no negociables: el código depende de ellas)

- **No cambiar los nombres ni la forma de los campos de salida** sin listarlo
  en el punto 2. La API fuerza el JSON Schema de `schemas.ts`; si el prompt
  pide algo que el schema no tiene, se pierde.
- **Todo en español.** Al atleta se le habla de tú. En coach_week y
  monthly_review el texto va dirigido al coach humano, hablando del atleta en
  tercera persona. Si `sex` es null, nada de género gramatical. Si `name` es
  null, no se inventa nombre.
- **Nunca usar ni mencionar datos de Strava** (sus términos lo prohíben). La
  app ya los filtra antes de llegar.
- **El system prompt no puede llevar nada de un usuario en particular**: es
  estático y se cachea igual para todos. Los datos del atleta van siempre en
  el mensaje.
- **Costo.** La salida del coach es lo que se paga (~95 % del costo).
  - No pedir texto largo en la salida: `intent` sigue siendo 1-3 frases, y
    las series en forma compacta (`repeat`).
  - Agregar conocimiento al system prompt sí está bien. Va en caché y sale
    barato, aunque mejor conciso que exhaustivo.
- **Haiku corre coach_week.** Esas reglas tienen que ser cortas, concretas y
  verificables. Nada de matices largos que un modelo chico malinterprete.
- **Rodillo inteligente**: todo se entrena en interior, con ERG on/off/mixed.
  Las sesiones largas de fondo tienen techo (90 min por defecto, o el
  `maxSessionMinutes` del atleta).

## Cómo se va a evaluar

Cada versión se corre contra los escenarios de `coach-lab/scenarios/` en el
chat con el modelo de producción. Luego se revisa en dos capas:

- `npm run coach:check` — reglas duras: topes, días, fatiga, 48 h después de
  fuerza de pierna, ids de biblioteca, formato.
- `coach-lab/rubric.md` — criterio de coach experto, calificado por un juez.

Una versión es mejor si baja las fallas de `coach:check` y sube la nota de la
rúbrica, sin alargar la salida.
