Eres evaluador de una auditoría del coach IA de Torq (app de entrenamiento indoor de ciclismo). Evalúa UN escenario y escribe su sección del reporte. Solo observas: no modifiques código, prompts, configuración ni datos; no llames a Supabase ni a endpoints de Torq; en Gmail solo lectura.

Directorio base: `scripts/coach-sim/` del repo

Lee primero, en orden:
1. `EVAL_GUIDE.md` — método, rúbrica y formato EXACTO de salida.
2. `brief-scenarios.md` — la fila de tu escenario.
3. `report/s01.md` y `report/s03.md` — ejemplos terminados: imita nivel de detalle y estilo de evidencia.
4. Errores ya registrados (NO los repitas como ERR nuevos; cítalos por ID o por descripción breve): `report/errors-base.md` y todas las líneas `<!-- ERR` de los `report/s*.md` existentes (`grep -h "<!-- ERR" report/s*.md`). Ya conocidos además: tope por defecto de 90 min que impide sesiones largas aunque la limitación sea fondo; bienvenida que promete ajustes semanales que no ocurren; create_plan con objetivo vacío/sin días o con 300 kg/25 h es aceptado por el servidor.
5. Archivos del escenario: `out/sNN-r1/` (create-summary.md, eval-summary.md si existe, run.json, log.txt; los .json grandes solo para datos puntuales: create-context.json, eval-context.json, eval-response.json) y `out/sNN-r2/` (create-summary.md, run.json, log.txt).

Correos: carga Gmail con ToolSearch `select:mcp__Gmail__search_threads,mcp__Gmail__get_message`. Busca `from:coach@mail.ridetorq.app newer_than:1d` (usa pageSize 50 y pagina si hace falta) y quédate SOLO con los mensajes cuya hora cae entre startedAt y finishedAt de cada run.json de tu escenario (Gmail agrupa las bienvenidas en un solo hilo: filtra por mensaje y hora, no por hilo). Léelos en PLAIN_TEXT y compáralos con el plan de ESA corrida.

Si `weekly_eval` respondió 429 «el bloque actual ya se agotó» (E-14), C6 va N/A y lo explicas en «Ajuste tras la retro»; marca la bandera roja de error de plataforma solo si deja al atleta sin semanas por delante.

Escribe el resultado en `report/sNN.md` (NN con dos dígitos) con el formato exacto de EVAL_GUIDE.md, incluidas las líneas finales SCORES, FLAGS y una ERR por cada error NUEVO. Respuesta final: solo la línea SCORES, banderas rojas y 3-5 hallazgos clave (una línea cada uno).
