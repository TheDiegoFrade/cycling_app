# coach-lab — laboratorio del razonamiento del coach

Aquí se mejora **cómo piensa el coach de IA** (el prompt), no el código. Las
pruebas se corren en el chat de claude.ai con tu suscripción, no con la API,
así que no gastan créditos. La API solo se usa al final para confirmar.

```
coach-lab/
  scenarios/   34 escenarios (create_plan, weekly_eval, publish_block, coach_week,
               monthly_review): el context exacto que manda la app + qué haría un buen coach
  out/         (generado) texto listo para pegar en claude.ai — no se sube al repo
  results/     las respuestas que pegues del chat, una por escenario (<id>.json)
  build.ts     arma out/ con el MISMO prompt y mensaje que producción
  check.ts     revisa results/ contra reglas duras (gratis, local)
  rubric.md    rúbrica de coach experto para calificar cada respuesta
  fable-brief.md  lo que se le lleva al chat con Fable para mejorar el prompt
```

Versión actual del prompt: **v2** (ver `NOTAS-v2.md` para el changelog y
`claude-code-brief.md` para las fases que siguen). El prompt vive en
`supabase/functions/coach-chat/prompt.ts` (system prompt,
contratos de workout) y en `supabase/functions/coach-chat/message.ts` (el
encabezado de cada modo, incluidas las reglas de `coach_week`). `build.ts` los
importa directo, así que lo que pruebas es exactamente lo que corre en la app.

Requisito: Node (para `npx`). La primera vez `npx` baja Deno solo.

## El ciclo

1. **Generar los textos.**
   ```
   npm run coach:build
   ```
2. **Montar el Proyecto en claude.ai** (una sola vez por versión del prompt):
   un Proyecto nuevo con `out/_system-prompt.md` como instrucciones.
3. **Correr cada escenario.** Un chat nuevo dentro del Proyecto por escenario,
   con el **modelo de producción** (lo imprime `coach:build`: Sonnet 5.5 para
   `create_plan`/`weekly_eval`, Haiku para `coach_week`). Probar con Fable u
   Opus da una idea falsa: se vería mejor de lo que saldrá en la app.
   Pega todo `out/<escenario>.md` y guarda la respuesta en
   `results/<escenario>.json` (el bloque ```json``` tal cual sirve).
4. **Reglas duras** (formato, topes de minutos, días disponibles u ocupados,
   fatiga, nada duro el día antes / el día / el día después de fuerza de
   pierna, ids de biblioteca, nada ≥ 95 % sin FTP medido salvo el test,
   "TSB" con números de TSS). Los tests, rampas y escaleras no cuentan como
   sesión dura. `monthly_review` solo se revisa contra el schema):
   ```
   npm run coach:check                         # todos los que tengan resultado
   npm run coach:check -- 07-eval-fatiga       # uno
   ```
5. **Criterio de coach.** En otro chat (aquí sí Fable/Opus, como juez), pega
   `rubric.md`, el escenario (`scenarios/<id>.json`) y la respuesta. Anota la
   calificación.
6. **Mejorar el prompt.** Lleva `fable-brief.md` + los resultados al chat con
   Fable. Trae de vuelta los cambios y pídele a Claude Code que los aplique en
   `prompt.ts` / `message.ts`. Vuelve al paso 1 y compara contra la ronda
   anterior (los `results/` quedan en git para comparar).
7. **Confirmar con la API** cuando el prompt ya esté bien: 1-2 llamadas reales
   (~$0.10 cada una) para ver que pasa el schema y se guarda.

## Limitaciones

- El chat no fuerza el schema ni usa el mismo `effort` que la API, y claude.ai
  agrega su propio contexto. Sirve para juzgar razonamiento; el formato exacto
  se confirma en el paso 7.
- En `create_plan`/`weekly_eval` la respuesta del coach trae solo la intención
  de cada workout: las descripciones las escribe después Haiku (otro prompt,
  `WRITER_SYSTEM_PROMPT`), que aquí no se prueba.
- Los escenarios usan fechas de octubre de 2026; si los corres mucho después,
  actualiza `startDate`/`weekStart`.
