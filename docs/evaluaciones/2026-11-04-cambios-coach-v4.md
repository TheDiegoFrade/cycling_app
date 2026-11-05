# Coach IA v4: comentarios de Joe (4 nov 2026)

Fuente: las calificaciones y los «¿Qué cambiarías?» de Joe en
`planes-ia-para-joe` (corrida 2 del 20 oct, 10 personas) y su plática de
WhatsApp del 4 nov. El mensaje de fondo fue que **el agente es muy
conservador**.

Archivos: `supabase/functions/coach-chat/prompt.ts` (system prompt, todos los
modos), `message.ts` (coach_week y reportes mensuales),
`src/core/monthly-report.ts` (hallazgo «Casi todo fue suave»),
`report-email.ts` (glosario) y `scripts/coach-sim/perfiles.mjs` (cómo se
describe la rampa en el documento).

## Qué cambió y por qué

| Comentario de Joe | Cambio en el prompt | Modos |
|---|---|---|
| «Muy conservador», «solo z2 suele ser aburrido», «más intensidad genera más adherencia», «arriesgar un poco más cuando sea seguro» | Sección nueva **Exigente cuando es seguro**: puro fondo solo cuando no queda de otra; cada semana trae un estímulo más alto salvo límite, dolor o fatiga. Se quitó «entre dos opciones, la prudente». | todos |
| «Me guío con las caritas y el desacople potencia-pulso: entre más tarde el desacople, mejor adaptación; entre más chico, más eficiente» | Sección nueva **Luz verde: cuándo apretar**: con RPE más bajo y desacople bajo o bajando se aprieta (una variable); si el desacople brinca en más de una sesión, se mantiene. | weekly_eval, publish_block, coach_week, mensual |
| Ana: «plano, riesgo de que se aburra», aceleraciones a RPE 5-6 de 1-2 min, de 4 a 10 reps | Sedentarios y nuevos: desde la semana 1, un día de aceleraciones RPE 5-6 (4 → 10 reps) y juego de cadencia. RPE 7 hacia la semana 2-3. | create_plan, weekly_eval |
| Ana: «no vi mareos ni limitante médico» | Ser sedentario o querer bajar de peso ya no basta para mandarlo al médico; sí hacen falta síntomas, una condición, un medicamento o una lesión. | todos |
| Ana / Daniel: «no sabemos si su percepción está calibrada» | Con `teachRpe`, cuadrar RPE contra pulso y preguntarle al atleta si no cuadran. | todos |
| Carlos: orden fuerza → fondo → tempo; las salidas con amigos a veces son carrera | Regla del **orden de la semana**, y la salida en grupo cuenta como posible sesión dura (el día antes no hay sweet spot ni umbral). | todos |
| Carlos: test en semana 2 solo si el desacople brinca en más de una sesión | Con FTP manual reciente (5 semanas o menos) y que sabe dosificarse: sin test de entrada; se valida con desacople y RPE. | create_plan, weekly_eval |
| Sofía: FTP de 40 días, «20 min sobreestima su estabilidad», test encubierto de 40-50 min | FTP manual viejo: se confirma pronto. En pruebas largas, **test encubierto** de 40-50 min (provisional). | create_plan, weekly_eval |
| Sofía: el +10 % limita, «depende de cómo ajuste sus tiempos» | El +10 % es para quien viene de poco; quien ya entrena puede acercarse a su disponibilidad de bici si sus horarios lo permiten. | create_plan |
| Sofía, Roberto, Daniel: core / fuerza / isométricos, «no darle la rutina pero sí sugerirle» | **Sugerir fuerza** sin rutina: tiempo bajo tensión y sin pesos máximos (retoma, master, hipertensión); core (triatlón, ruta); isométricos de rodilla. | todos |
| Roberto: «hacer énfasis en que ir suave es clave, no es estar mal» | Con salud primero, explicarlo como construir cimientos. | create_plan |
| Roberto: error de género («lista») | El redactor también revisa los femeninos cuando el atleta es hombre. | redactor |
| Javier: la rampa termina en RPE 8, no al máximo | Se enfatiza en el `intent` de la rampa; puede ir en la semana 1 aunque duerma mal. El documento ya no dice «hasta no poder más». | create_plan, weekly_eval |
| Javier: «son personas muy intensas»; dormir importa | Alternar sesiones por RPE y en ERG a watts fijos cuando ya tiene zonas, y una frase sobre el sueño. | todos |
| Daniel: «demasiado conservador», «la rodilla manda pero no hay impacto» | Una molestia vieja que no altera el pedaleo no quita la intensidad aeróbica. «Base primero» ya no significa solo fondo. | todos |
| Mariana: si aparece fatiga, cambiar intensidad por volumen suave | Fatiga sin alarma → menos intensidad y un poco más de volumen suave mientras asimila. | weekly_eval |
| Paola: microciclo 3-1, 30/30 a RPE 8, que el snack lo decida su nutrióloga | 3 semanas de carga y 1 de descarga por defecto (2-1 solo con señales o 50+). «Salud primero» sin `intensityLimit` ya no prohíbe intensidad corta por RPE. Nutrióloga para el snack. | todos |
| Lucía: cadencia baja solo si va cómoda arriba de 70 rpm | Regla de cadencia: debajo de 70, trabajo de cadencia alta. | todos |
| Diego: sin explicaciones técnicas en reportes; motivar y ajustar para el objetivo | Lo nuevo (desacople, luz verde, ciclos, +10 %) no se le explica en técnico al atleta. Los documentos actuales se quedan igual. | todos |

Además (observado en las simulaciones, no lo pidió Joe): no repetir una
sesión idéntica dos veces en la semana, y el redactor explica el botón ⚡
solo una vez por semana en vez de en cada descripción.

Reportes mensuales: se agrega el hallazgo sugerido «Casi todo fue suave»
(95 % o más de las horas en recuperación o fondo, con 6 h o más en el mes),
y la IA lee el desacople como luz verde o amarilla para proponer objetivos.

## Para confirmar con Joe

1. **Test encubierto** (Sofía): ¿a qué intensidad va el bloque de 40-50 min?
   Escribí «el ritmo más alto que pueda sostener parejo, RPE 7 al final», con
   88-92 % del FTP como referencia, y que el FTP de trabajo es al menos el
   promedio si el desacople sale abajo de 5 %. Son números míos.
2. **FTP manual «reciente» = 5 semanas o menos.** Carlos (21 días) no
   necesita test y Sofía (40 días) sí; puse el corte en medio.
3. ~~Tabaco ocasional → base primero~~ **Decidido (Diego, 4 nov):** fumar
   ya no cambia el plan, ni ocasional ni diario. «Base primero» queda solo
   para alcohol frecuente; el coach no menciona el tabaco.
4. **Fernando**: no dejó comentarios. ¿Faltan arranques de 10-15 s para XCO?
5. **«Casi todo fue suave»**: los umbrales (95 % y 6 h) son provisionales.

## Simulación con el prompt v4 (`coach-lab/sim-v4/`)

8 casos nuevos (6 de crear plan y 2 de evaluación semanal). Usan el mismo
mensaje que producción (`message.ts` + `starting` de `intake.ts`), los
responde Sonnet y pasan por `guard.ts`. No es la API real: no usa
`output_config` ni el redactor de descripciones.

- Los 8 pasan la guardia.
- Ronda 1: salieron mal la luz amarilla (absorción completa: carga de
  323 a 88), el 30/30 de la diabética hasta la semana 5, la repetición de la
  escala de RPE y de la fuerza cada semana, y «la app va a comparar tu RPE
  con tu pulso» (la app no lo hace). Se corrigió el prompt.
- Ronda 2 (los 3 afectados): la luz amarilla da `maintain` con el mismo
  volumen y un test encubierto; el 30/30 cae el sábado de la semana 3; la luz
  verde mete el primer bloque a RPE 7 sin repetir explicaciones.
- Aún hay cuentas tipo «4 × 50 = 200 min» en la nota: se ajustó el prompt
  para decir el resultado sin la operación (sin volver a correr).

Para repetir: `npx deno@2 run -A coach-lab/sim-v4/build.ts`, responder cada
`out/<caso>.md` con `out/_system-prompt.md` como instrucciones, guardar en
`results/` y correr `coach-lab/sim-v4/check.ts`.

## Lo que falta

Volver a correr las 10 personas (`scripts/coach-sim`, con la cuenta dummy)
para ver si los planes cambian como Joe pidió. Eso necesita las llaves de
producción y gasta tokens; no se corrió aquí.
