# Brief para Claude Code — Coach v2 de Torq

Trabaja sobre la rama `claude/coach-prompt-lab` (base: commit `627335d`).
Este brief viene con archivos ya escritos. Tu trabajo tiene dos partes:
aplicarlos tal cual (fase 0) y desarrollar los datos que el coach todavía no
recibe (fases 1 a 3). El porqué de cada decisión está en
`coach-lab/NOTAS-v2.md`; léelo antes de empezar.

## Archivos que acompañan este brief

| Archivo del paquete | Destino en el repo |
|---|---|
| `supabase/functions/coach-chat/prompt.ts` | Reemplaza al actual |
| `supabase/functions/coach-chat/message.ts` | Reemplaza al actual |
| `coach-lab/scenarios/11-…` a `28-…` (18 archivos) | Se agregan a los 10 existentes |
| `coach-lab/NOTAS-v2.md` | Nuevo |
| `coach-lab/claude-code-brief.md` | Este documento |

## Reglas que no se rompen

1. **`COACH_SYSTEM_PROMPT` es estático** y se cachea igual para todos: ningún
   dato de un atleta entra ahí. Todo dato nuevo va en el `context`.
2. **Nunca datos de Strava hacia el modelo.** Toda métrica nueva usa el mismo
   filtro que `aiEligibleSessions` en `src/ui/coach.ts`.
3. **El schema manda.** Un campo de salida que el schema no tiene se pierde;
   un campo de entrada nuevo se agrega en `schemas.ts` y en quien arma el
   `context`. Si cambias un campo de salida, actualiza `applyModeEffects`.
4. **Costo.** La salida del coach es lo caro. Nada de lo de abajo debe
   alargarla. Los datos nuevos son entrada: mantenlos compactos.
5. **No reescribas los prompts.** Ya están escritos para usar los campos
   nuevos "si vienen". Solo agrega las frases que este brief indica.
6. **El FTP del perfil lo cambia el atleta.** El coach propone; la app puede
   ofrecer un botón, pero nunca lo cambia sola.
7. No despliegues la Edge Function ni hagas llamadas a la API sin preguntar.
8. Todo texto visible en español, de tú.

## Fase 0 — Aplicar prompts y escenarios

1. Copia los archivos a su destino. No toques `schemas.ts` todavía.
2. Corre `npm test`, `npm run build` y `npm run coach:build`.
3. Actualiza `coach-lab/check.ts`:
   - Un workout de test (nombre o `intent` con `test|rampa|ramp|escalera`) no
     cuenta como sesión dura ni dispara el aviso de ">105 % para novato".
   - `create_plan` con `profile.ftp` null: falla si algún step que no sea de
     test llega a 95 % o más; aviso si `coachNote` no trae un número en watts.
   - `coach_week`: falla si `rationale` contiene "TSB" seguido de un número
     mayor de 50.
   - Agrega un checker para `publish_block` (tope de 90 min, días duros
     seguidos).
4. Actualiza `coach-lab/README.md` (ya son 28 escenarios) y `fable-brief.md`
   si menciona reglas que cambiaron.

Criterio de aceptación: tests y build en verde; `coach:build` genera los 28
escenarios.

## Fase 1 — Datos que el prompt ya espera

**1.1 FTP provisional.** Hoy "No sé mi FTP" deja el perfil en 200 W
(`DEFAULT_PROFILE`) y el rodillo corre sobre ese número.
- `Profile`: agrega `ftpSource?: 'default' | 'provisional' | 'manual' |
  'test_ramp' | 'test_20min'` y `ftpUpdatedAt?: string`. Migra: `ftpConfirmed
  true` → `'manual'`; lo demás → `'default'`. Sincroniza en `profile-sync.ts`
  y `schema.sql`.
- Cuestionario y Perfil: con "No sé mi FTP" marcado, permite escribir un "FTP
  provisional" (guarda `ftpSource: 'provisional'`, `ftpConfirmed: false`).
- `context.profile` en `create_plan` y `weekly_eval`: `ftp` (número solo si
  `ftpConfirmed`, como hoy), `provisionalFtp` (número si la fuente es
  provisional, si no null), `ftpSource`, `ftpUpdatedAt`.
- Campos de salida nuevos: `suggestedFtp: number | null` en
  `CreatePlanOutputSchema`; `ftpAction: 'keep' | 'change' | null` y
  `suggestedFtp: number | null` en `WeeklyEvalOutputSchema`. La UI muestra un
  botón "Usar X W como mi FTP" que el atleta acepta o ignora.
- Al agregar esos campos, añade al final de la sección "El FTP del perfil" de
  `prompt.ts`: «Cuando propongas un número, ponlo también en `suggestedFtp`
  (null si no hay cambio). En `weekly_eval`, `ftpAction` es "change" si debe
  cambiarlo, "keep" si acaba de hacer un test o preguntó y debe mantenerlo, y
  null si el FTP no viene al caso esta semana.»

**1.2 Perfil completo.** Agrega a `context.profile` en `create_plan`,
`weekly_eval` y `publish_block`: `injuries: string | null`, `weightKg: number
| null`, `ageYears: number | null` (calculada de `birth_date`; no mandes la
fecha). Ya existen en `Profile`.

**1.3 Contexto del plan.** `weekly_eval` y `publish_block` hoy no saben qué
días entrena el atleta ni en qué bloque va. Agrega a los dos:
```
plan: { goal, discipline, experienceLevel, generalFitnessLevel,
        days, hoursPerWeek,
        currentBlock: { name, focus, weeks, weekInBlock },
        nextBlock: { name, focus, weeks, targetHoursPerWeek } | null }
nextWeekStart: 'YYYY-MM-DD'   // lunes de la semana que se va a generar
```
`publish_block` además necesita `profile { sex, name }`, `maxSessionMinutes`
y `occupiedDates`. Sale del plan guardado y del formulario.

**1.4 Guarda de duración.** Después de `expandSegments`, si
`totalMinutes > tope` (`maxSessionMinutes` o 90): recorta el step `steady` o
`free` más largo hasta caber. Nunca recortes calentamiento ni el bloque de un
test. Registra el recorte en el log. Tests en `expand.test.ts`.

**1.5 `ruleTriggers` reales.** `SessionRecord.alerts` no guarda el id de la
regla, y `computeWeekEvalContext` manda `[]`. Guarda `ruleId` en cada alerta
y agrega el conteo por regla.

**1.6 Test con ERG fijo (investigar).** El 7 de octubre de 2026 un test de
20 minutos corrió su bloque a 170 W exactos, el 85 % de los 200 W por
defecto. Un test de 20 minutos solo sirve si el atleta regula su potencia.
Averigua si fue el workout o la app, y asegura que un step de test
autodosificado corra sin ERG aunque el atleta lo tenga prendido.

## Fase 2 — Lectura de tests y de sesiones

**2.1 `lastTest`** en `create_plan` y `weekly_eval`. El código lo calcula de
la sesión de test más reciente; el modelo no ve samples.
```
lastTest: {
  date, type: 'ramp' | 'test20' | 'other',
  ergFixed: boolean,          // CV de la potencia del bloque < 2 %
  blockMinutes, avgPowerW,
  best1MinW,                  // para rampa
  powerFadePct,               // 2.ª mitad vs 1.ª; null si ergFixed
  hrStart, hrEnd,             // media del minuto 2 y del último minuto
  hrSlopeBpmPerMin, hrHalvesDeltaPct,
  hrEndPctOfMax, cadenceDeltaRpm,
  completed: boolean, ftpInUseW
} | null
```
Valores esperados para el caso real (úsalos en un test unitario si Diego
agrega el `.fit` como fixture): bloque de 20 min a 170 W, `ergFixed` true,
pulso 162 → 180 (máximo 182), pendiente ≈ 1.0 lpm/min, mitades 164 → 174
(+6 %), cadencia 78 → 72.

Para identificar el test: agrega `kind: 'test' | null` a
`PlannedWorkoutSchema` (cambio de salida) o, si prefieres no tocar la salida,
detecta por nombre. Dile a Diego cuál elegiste.

**2.2 Sesiones de la semana** en `weekly_eval`:
```
weekJustFinished.workouts: [{ dayOfWeek, name, zone, plannedTSS, actualTSS,
  completed, rpe, hrDriftPct, efficiencyFactor, ruleTriggers }]
```
`zone` es la zona principal (fondo, tempo, sweet spot, umbral, VO2, test).

## Fase 3 — Estado del atleta y expediente

Antes de programar esta fase, propón el diseño a Diego.

**3.1 Métricas nuevas en `analytics.ts`.**
- Curva de potencia: agrega 8 min (480 s) y 60 min (3600 s).
- Torque medio y máximo por intervalo: `9.549 × watts / rpm` (N·m).
- Tiempo a umbral: bloque continuo más largo y minutos acumulados por semana
  a 95 % del FTP o más.
- kJ por sesión.

**3.2 `athleteState`** en `create_plan`, `weekly_eval`, `publish_block` y
`coach_week`: las mismas métricas en ventanas de 7, 28, 90 y 180 días.
```
athleteState: {
  historyWeeks, lastGap: { days, endedOn } | null,
  windows: { d7, d28, d90, d180: {
    hours, tss, kJ, sessions, compliancePct,
    zoneHours: { z1..z6 },
    peaks: { s30, m1, m5, m8, m20, m60:
      { watts, date, quality: 'max_effort' | 'erg_fixed' | 'incidental' | 'untested' } },
    aerobic: { decouplingPct, ef, n },      // mediana de sesiones estables comparables
    threshold: { longestMin, weeklyMin }
  } }
}
```
La regla de "cuánta historia" vive aquí, no en el modelo: una métrica con
menos de 3 sesiones comparables en su ventana va como null. Un pico que no
salió de un esfuerzo máximo se marca, no se omite. Objetivo de tamaño: menos
de 700 tokens.

**3.3 Pantalla Forma.** Filtro de 1 semana, 1 mes, 3 meses y 6 meses; curva
de potencia y desacople potencia-pulso visibles por ventana.

**3.4 Expediente (`athleteNotes`).** Texto corto (máximo 1,200 caracteres)
por atleta con lo individual: cómo responde, qué sesiones se le caen, cuántas
semanas de carga aguanta. Tabla nueva con `updated_by: 'coach' | 'ai'`. El
coach humano lo edita en su vista; `monthly_review` propone la actualización
y el coach la aprueba (sin coach, se guarda sola). Se manda a todos los modos.

**3.5 Variabilidad de FC.** Dos caminos, en este orden:
- HRV y sueño de reposo vía intervals.icu cuando exista esa integración:
  `wellness: { hrv7d, hrvBaseline60d, hrvStatus, restingHr7d, sleepH7d }`.
- Guardar los intervalos RR que mandan algunas bandas en la característica
  Bluetooth de frecuencia cardiaca (0x2A37). Solo guardarlos por ahora.

## Cómo verificar cada fase

1. `npm test` y `npm run build` en verde.
2. `npm run coach:build` y que los escenarios existentes sigan validando. Si
   un campo de entrada nuevo es obligatorio, actualiza los 28 escenarios; si
   puede faltar, decláralo opcional en el schema.
3. Para cada campo nuevo, un escenario que lo use.
4. Commits chicos, uno por punto. Al cerrar cada fase, resume qué cambió y
   qué quedó pendiente.
