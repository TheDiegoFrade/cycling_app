# Coach v2 — notas de entrega

Acompaña a `prompt.ts` y `message.ts` (reemplazo directo) y a `scenarios/`.

**Qué está verificado y qué no.** Los dos `.ts` compilan con `tsc`, mantienen
los mismos exports y `buildUserMessage` arma los seis modos. Los 18 escenarios
pasan su `*InputContextSchema` sin llaves de más. **No corrí nada contra
Sonnet ni Haiku**: que las fallas bajen es una hipótesis hasta que pase por
`coach:check` y la rúbrica.

**Lo que leí en tu repo.** Revisé `~/projects/cycling_app` (commit `653b2c7`,
rama `main`) solo para confirmar supuestos; no escribí nada ahí. Ese checkout
va atrás de lo que adjuntaste (no tiene `message.ts`, `coach_week` ni
`coach-lab/`), así que lo de la sección 5 vale para esa versión.

Ningún campo de salida cambió de nombre ni de forma.

---

## 1. Changelog

| # | Cambio | Dónde | Falla que ataca |
|---|---|---|---|
| 1 | `coach_week` clasifica la semana en DESCARGA / CUIDADO / NORMAL con umbrales (TSB ≤ −20, igual que `coach:check`, palabras de cansancio en `instruction`, salto de carga > 1.3×) y cada caso tiene límites numéricos: tope de %FTP, minutos, sesiones y TSS relativo a `recentWeeks`. | `message.ts` | Over-Under con atleta muy cansado |
| 2 | En DESCARGA no se usan plantillas duras de la biblioteca, ni "ajustadas". Antes la prioridad de la biblioteca empujaba a tomar el Over-Under y recortarlo. | `message.ts` | Misma |
| 3 | Vocabulario TSS / TSB / CTL con rangos típicos y la regla "la carga de una semana se escribe en TSS, jamás en TSB". En el system prompt, en `coach_week` y en `monthly_review`. La `rationale` debe dar la carga semanal en TSS. | ambos | "310 TSB" |
| 4 | Arranque sin FTP rehecho: el coach propone un **FTP provisional bajo** en watts (según motor y sexo) y lo corrige hacia arriba o abajo. Primera sesión: escalera de ajuste submáxima. Todo con ERG prendido a potencia baja, con el test del habla como control. Luego primer test según perfil → semana conservadora → retest cada 4-8 semanas. Fuera los Over/Unders a 90-100 %. | `prompt.ts` | Arranque sin FTP ni base |
| 4b | Sección "El FTP del perfil: lo escribe el atleta, tú le dices cuándo": cuándo se cambia (tras test válido, con la cuenta exacta en el `intent`; ajustes del provisional; FTP alto dos semanas seguidas) y cuándo no (a mitad de bloque, en descarga, antes del evento, test con fatiga). | `prompt.ts` | Arranque, y tu respuesta 3 |
| 4c | Sección "Cómo leer un test": ERG fijo no mide un máximo; pulso que no se aplana = por encima del umbral (88-90 % en vez de 95 %); confirmar dos semanas; base corta = bloque de base y pocas salidas duras al cerro. Sección "Cuánta historia mirar": una ventana por pregunta, y cómo usar `athleteState` y `athleteNotes` cuando lleguen. | `prompt.ts` | Caso real del test del 7 de octubre; "3 semanas no siempre bastan" |
| 5 | Dos protocolos de test ejecutables con rodillo y banda: rampa (un solo step con `ramp_to_pct`, barato en salida) para quien no sabe dosificarse, 20 min para quien sí. Con estandarización (48 h, mismo calentamiento) y aviso de que el primero es de familiarización. | `prompt.ts` | Misma |
| 6 | Intensidad con dos anclas: lo fácil por RPE / habla / deriva de FC, lo duro por %FTP. El FTP se trata como estimación (±5-10 %) y se corrige con RPE y reglas del motor. | `prompt.ts` | Misma, y evaluación en general |
| 7 | Tope de duración como regla dura única, con la cuenta explícita (`duration_s` × `repeat`), margen de diseño (60-85 min) y una lista de revisión al final del contrato, junto a los datos. `coach_week` y `publish_block` dicen qué hacer cuando no hay `maxSessionMinutes`. | ambos | Sesión de 94 min |
| 8 | Paso "revisa la coherencia del perfil" antes de decidir el arranque: contradicciones típicas, qué eje manda (`yearsRiding` para oficio en bici, `generalFitnessLevel` para motor) y obligación de decirlo en una frase de `coachNote`. | `prompt.ts` | "experienced" con 0 años |
| 9 | Sección de lesiones con adaptaciones concretas (rodilla, espalda, dolor nuevo). Mientras `injuries` no llegue, el coach las toma de `goal` y `athleteNote`. En `coach_week`, regla verificable por tipo de lesión. | ambos | Lesiones (parcial: ver 2.1) |
| 10 | `weekly_eval` decide con un orden de casos (insert_recovery → reduce → maintain → progress) y umbrales. Distingue falta de tiempo (quita volumen, conserva calidad) de cansancio (quita intensidad). Lee las reglas del motor como señal. No repone TSS perdido. | `prompt.ts` | Criterio de coach (rúbrica) |
| 11 | Reglas de armado de semana: cuántas sesiones duras según nivel, nunca dos seguidas, una variable a la vez, +5-10 % de TSS, ciclos de carga y descarga, carga inicial desde lo que el atleta ya hace y no desde su disponibilidad. | `prompt.ts` | Hacer crecer al atleta |
| 12 | Especificidad por disciplina: XCO (40:20s, umbral con picos, salidas), maratón MTB / gravel y ruta. Solo con FTP medido y base hecha. | `prompt.ts` | Criterio de coach |
| 13 | Fuerza de pierna en `coach_week`: "ni el día anterior, ni ese día, ni el siguiente" (así lo mide `coach:check`) en vez de "48 h", que Haiku tenía que traducir a días. | `message.ts` | `coach:check` 48 h |
| 14 | Quité del system prompt la frase de Ciudad de México a 2300 msnm y la referencia a un atleta real: eran datos de un usuario en un texto que se cachea para todos. | `prompt.ts` | Restricción de system prompt estático |
| 15 | El system prompt decía "tres modos" y hay seis. Ahora los nombra todos y aclara a quién se le habla en cada uno. | `prompt.ts` | — |
| 16 | `DESCRIPTION_GUIDE` a la mitad (601 → 344 palabras) con las decisiones de ERG al día. Viaja en cada mensaje de `coach_week` y en el redactor. | `prompt.ts` | Costo |

**Tamaño.** System prompt: 3,473 → 4,570 palabras (+32 %, en caché). Redactor:
752 → 517. Contrato de `coach_week`: 678 → 449. Contrato de planificación:
258 → 343 (la lista de revisión). El encabezado de `coach_week` creció más o
menos al doble; es entrada, no salida. Los límites de salida no cambiaron.

### Tres decisiones que conviene que revises

- **FTP provisional en vez de pura sensación.** Tenías razón en dudar: en tu
  app, "no sé mi FTP" no significa que el rodillo no tenga número. El perfil
  nace con 200 W por defecto (`DEFAULT_PROFILE`) y el coach solo recibe
  `null`; es decir, hoy una persona sedentaria hace sus Over/Unders a
  180-200 W. Ahora el coach propone un número bajo (90 a 200 W según el
  caso) y lo ajusta. Sin peso ni historial ese número puede fallar del orden
  de ±30 %; por eso va bajo y la primera sesión sirve para corregirlo.
- **La escalera volvió, como sesión de ajuste.** Es la versión corta de tu
  "test oxidativo" (cinco escalones de 4 min), pero el que la lee es el
  atleta con el test del habla y lo reporta en su nota, porque `weekly_eval`
  no recibe pulso por escalón. El test de umbral al 101 % sí lo cambié por
  rampa o 20 min.
- **La rampa como primer test de un novato.** El prompt anterior la prohibía
  por "riesgo de pacing"; la rampa justamente no exige dosificar. Mantuve
  que nadie hace un máximo en su semana de arranque y que un sedentario
  espera al menos 4 semanas. El 75 % del mejor minuto es una convención con
  rango real de 70-80 %: por eso la semana posterior al test va conservadora.

---

## 2. Cambios de datos que necesitan código

Ordenados por cuánto mejoran la decisión. Los prompts ya están escritos para
usar estos campos "si vienen", así que se pueden agregar de a uno.

### Imprescindibles

**2.1 `injuries` en `create_plan`, `weekly_eval` y `publish_block`**
- Campo: `profile.injuries: string | null`, el mismo texto que ya reciben
  `coach_week` y `monthly_review`.
- Sale de: el perfil del atleta.
- Por qué: hoy el coach solo se entera si el atleta lo repite en `goal` o en
  la nota semanal. Con el campo, la adaptación (cadencia, duración, sin
  cadencia baja) deja de depender de eso.

**2.2 FTP real y si está confirmado, en `create_plan` y `weekly_eval`**
- Campos: `profile.ftp: number` (siempre el del perfil) y
  `profile.ftpConfirmed: boolean`, como ya hace `coach_week`. Opcional:
  `profile.ftpChangedAt`.
- Sale de: el perfil. Hoy `coach.ts` manda `ftp: p.ftpConfirmed ? p.ftp :
  null` a `create_plan`, y nada a `weekly_eval`.
- Por qué: el coach propone un provisional y pide cambios de FTP, pero no
  puede ver si el atleta los aplicó ni sobre qué número está corriendo el
  rodillo. Hoy depende de que el atleta lo cuente en su nota. Con esto,
  además, deja de proponer un provisional a ciegas cuando el perfil ya trae
  uno razonable.
- Ojo con el cuestionario: el campo de FTP está deshabilitado mientras "No sé
  mi FTP" esté marcado, y al desmarcarlo `ftpConfirmed` pasa a `true`. Para
  que el atleta pueda escribir el provisional sin que el coach lo tome por
  medido, hace falta poder guardar un número con `ftpConfirmed: false`.

**2.3 Contexto del plan en `weekly_eval` y `publish_block`**
- Campos: `plan: { goal, discipline, experienceLevel, generalFitnessLevel,
  days, hoursPerWeek, currentBlock: { name, focus, weeks, weekInBlock },
  nextBlock: { name, focus, weeks, targetHoursPerWeek } | null }` y
  `nextWeekStart: 'YYYY-MM-DD'`. En `publish_block` además `profile { sex,
  name }`, `maxSessionMinutes` y `occupiedDates`.
- Sale de: el plan guardado (lo que devolvió `create_plan`) y el formulario.
- Por qué: según `schemas.ts`, `weekly_eval` arma la semana siguiente sin
  saber qué días entrena el atleta, cuál es su objetivo, en qué bloque va ni
  qué disciplina practica; y `publish_block` concreta un bloque cuyo esqueleto
  no recibe. Sin `nextWeekStart` tampoco puede saber a qué día de la semana
  corresponde cada fecha de `occupiedDates`. En el checkout que revisé el
  servidor no agrega nada al `context` (ver sección 5).

**2.4 Los workouts de la semana que terminó, en `weekly_eval`**
- Campo: `weekJustFinished.workouts: [{ dayOfWeek, name, kind, plannedTSS,
  actualTSS, completed, rpe, hrDriftPct, efficiencyFactor, ruleTriggers }]`,
  donde `kind` es la zona principal (fondo, sweet spot, umbral, VO2, test).
- Sale de: `sessions` (ya guarda `efficiency_factor`, `hr_drift_pct`, RPE y
  nota) cruzado con lo planeado.
- Por qué: "progresa una variable" exige saber qué se hizo. Además desbloquea
  tres señales de fatiga que hoy el coach no ve: sRPE, deriva y EF. Y un ERG
  desenganchado significa cosas distintas en una sesión de umbral (FTP alto)
  que en una de fondo.

### Importantes

**2.5 Resultado del último test**
- Campo: `lastTest: { type, date, best1MinW | avg20MinW } | null`.
- Sale de: la sesión de test (la curva de potencia ya tiene 1 min y 20 min).
- Por qué: hoy el `intent` del test le da al atleta la cuenta para que él
  actualice su perfil, y `weekly_eval` solo se entera si lo escribe en la
  nota. Con el dato, el coach confirma el número, detecta un test
  interrumpido y decide el retest por fecha.

**2.6 `ruleTriggers` reales en `weekly_eval`**
- Campo: el que ya existe; hoy se manda siempre `[]` porque
  `SessionRecord.alerts` no guarda el id de la regla.
- Sale de: guardar `ruleId` en cada alerta de la sesión.
- Por qué: un ERG desenganchado en los bloques duros es la señal más directa
  de que el FTP quedó alto. El prompt ya la sabe leer, pero no le llega.

**2.6b FTP sugerido como campo de salida (cambia el schema de salida)**
- Campos nuevos: `suggestedFtp: number | null` en `create_plan`, y
  `ftpAction: 'keep' | 'change' | null` con `suggestedFtp` en `weekly_eval`.
- Por qué: hoy la instrucción va dentro de `coachNote` / `reasoning` y el
  atleta la tiene que leer y teclear. Como campo, la UI puede mostrar un
  botón "Actualizar mi FTP a 105 W": el atleta sigue siendo quien lo cambia,
  pero no se pierde en el texto.

**2.7 Guarda de duración en código (no es un dato, pero es lo más seguro)**
- Dónde: después de `expand.ts`. Si la suma pasa del tope, recortar el bloque
  continuo más largo o pedir de nuevo.
- Por qué: el prompt reduce la probabilidad de una sesión de 94 min; solo el
  código la vuelve imposible.

### Opcionales

**2.8 Señal estructurada de perfil contradictorio** — nuevo campo de salida
en `create_plan`: `profileWarning: string | null`. Hoy la contradicción va
dentro de `coachNote`; como campo aparte, la UI puede pedirle al atleta que
corrija su perfil. Mejor aún: validar en el formulario (`experienced` con
`yearsRiding` 0) antes de llamar al coach.

**2.10 `profile.weightKg` y edad en `create_plan`** — con el peso, el FTP
provisional deja de salir de una tabla por sexo y pasa a W/kg (del orden de
1.5 para alguien sedentario y 2.5 para un ciclista activo), que falla mucho
menos. También permite detectar un FTP declarado poco creíble. La edad
ajusta el ciclo de carga y descarga.

**2.11 NP de las series de 40:20s** — para seguir el progreso en XCO con la
medida que mejor lo predice. Depende de 2.4.

**2.12 Altitud** — `profile.altitudeM`, si quieres que el coach la tenga en
cuenta ahora que salió del system prompt.

---

## 3. Escenarios nuevos (`scenarios/`)

18 archivos numerados del 11 al 28, en el formato del repo: `{ id, mode, title, expect, context }`.
`context` valida contra `schemas.ts`. `expect` es una lista de afirmaciones;
las que tienen número (topes, sumas de TSS, ids de biblioteca) se pueden
pasar a `coach:check`, el resto son para el juez.

| Escenario | Qué prueba |
|---|---|
| `coach-week-fatiga-alta-tsb` | La falla original: TSB −29, biblioteca con Over-Under. Además TSS vs. TSB en `rationale`. |
| `coach-week-cansancio-solo-en-instruccion` | TSB normal (−5) pero el coach reporta agotamiento. |
| `coach-week-fuerza-rodilla-sin-ftp-confirmado` | Fuerza bloqueada, lesión de rodilla, FTP sin confirmar, tope null. |
| `create-plan-sin-ftp-sedentario` | FTP provisional bajo, escalera de ajuste y 3 semanas sin test máximo. |
| `create-plan-sin-ftp-con-oficio` | El otro extremo: test en la semana 1. |
| `create-plan-perfil-contradictorio` | "experienced", 0 años, otro deporte. |
| `create-plan-tope-90-y-horas-que-no-caben` | 10 h en 4 días con tope null y una fecha ocupada. |
| `create-plan-lesion-en-texto-libre` | Rodilla mencionada solo en `goal`. |
| `weekly-eval-cumplio-pero-agotado` | 103 % de cumplimiento con nota de agotamiento y TSB −28. |
| `weekly-eval-semana-floja-aislada` | Una semana al 48 % por viaje, tras tres buenas. |
| `weekly-eval-tercera-semana-floja` | Tres semanas bajo 70 % con huecos recurrentes. |
| `weekly-eval-dolor-de-rodilla-en-nota` | Dolor reportado con cumplimiento de 97 %. |
| `weekly-eval-ftp-alto-tras-test` | ERG desenganchado tras una rampa, sin fatiga. |
| `weekly-eval-calibracion-provisional-bajo` | El atleta reporta que el provisional quedó bajo: subirlo 10-15 %. |
| `weekly-eval-pide-subir-ftp-a-mitad-de-bloque` | Decirle que mantenga su FTP y por qué. |
| `weekly-eval-test-en-erg-con-pulso-subiendo` | El caso real: 170 W fijos por ERG con el pulso de 162 a 180. No aceptar 162 W. |
| `publish-block-fatiga-al-cierre` | Descarga y retest al abrir bloque; tope sin dato. |
| `monthly-review-fatiga-alta-y-mejor-20min-bajo` | Fatiga real y una baja de 20 min que no es pérdida de forma. |

Reglas que valdría agregar a `coach:check` porque ahora son verificables:
"TSB" seguido de un número mayor de 50; primera razón de `rationale` nombra
el caso; ningún step > 75 % cuando TSB ≤ −25; ningún step
≥ 95 % si `ftp` es null (salvo el test); `targetTSS` dentro de ±20 % de
horas × IF² × 100.

---

## 4. Lo que estas reglas no resuelven

- Los umbrales de fatiga (TSB −25, rampa de CTL, 60 % de carga en descarga)
  son convenciones de la práctica, no leyes. Con CTL bajo un TSB de −25 pesa
  mucho más que con CTL alto; lo ajusté solo en Sonnet (−15 si CTL < 30) y
  dejé el umbral fijo en Haiku para que sea verificable.
- La detección de cansancio en `coach_week` depende de que la `instruction`
  lo diga con palabras reconocibles. Un coach que escriba "anda medio
  apagado" puede pasar por NORMAL.
- Las adaptaciones por lesión son genéricas (rodilla, espalda). Un texto
  libre con otra lesión cae en "adapta la carga y di qué adaptaste".
- La calibración depende de que el atleta escriba en su nota cómo le fue en
  la escalera. Si no deja nota, el provisional no se mueve. Vale la pena que
  la app se lo pida al terminar esa sesión.
- El coach le pide al atleta cambiar su FTP, pero no ve si lo hizo (2.2).

---

## 5. Confirmado en el repo y lo que sigue abierto

Confirmado leyendo `origin/claude/coach-prompt-lab` (commit `627335d`), que
es idéntica a los archivos que adjuntaste:
1. `ctlRampLast4Weeks` es el cambio total de CTL en 4 semanas.
2. El servidor manda al modelo exactamente el `context` validado. El punto
   2.3 es real: `weekly_eval` no recibe días, objetivo ni bloque.
3. Con "No sé mi FTP" el rodillo usa el FTP por defecto del perfil, 200 W.
4. `ruleTriggers` llega siempre vacío a `weekly_eval`.
5. Todos los modos comparten `COACH_SYSTEM_PROMPT`.
6. `coach:check` trata como cansado a un atleta de `coach_week` con TSB ≤ −20
   y mide las 48 h de fuerza hacia los dos lados; `message.ts` ya coincide.
7. El perfil ya guarda `injuries`, `weight_kg` y `birth_date`: mandarlos al
   coach es solo armar el contexto.

Sigue abierto:
1. Por qué el test del 7 de octubre corrió el bloque de 20 min a potencia
   fija (ver el brief de Claude Code, 1.6).
2. Que la app tolere abandonar a la mitad el step de rampa de 25 min.
3. `type: "free"` no lo usé en los tests porque no sé cómo lo trata el
   rodillo; el bloque de 20 min va como `interval` al 100 % con ERG off.
4. En `monthly_review` moví "fatiga alta" de −30 a −25.
