# Fase 4 — Coach más preciso y más barato

Objetivo: el mejor plan posible por el menor costo, sin integraciones nuevas.
Todo sale de cómo está hoy `coach-chat` (rama `claude/coach-prompt-lab`).

## Lo que encontré

1. **No medimos el costo por llamada.** `coach_usage` guarda un total de
   tokens por mes, sin separar modo, modelo, entrada, caché o salida. Sin
   eso no sabemos qué conviene recortar ni si un cambio de verdad ahorró.
2. **Todos los modos reciben el system prompt completo** (~30 KB, unos 8-9k
   tokens). Un tercio es la sección "Modos", y cada modo usa solo su parte.
   `coach_week` y `monthly_review` pagan, en cada llamada, las reglas del
   test, del FTP y de cómo se arma un plan, que no les sirven.
3. **La caché puede salir más cara que no usarla.** Se escribe a 1.25× y
   dura 5 minutos. Con pocos usuarios casi nunca otro usuario llama dentro
   de esos 5 minutos: se paga la escritura y no hay lectura. Conviene si
   al menos ~1 de cada 5 llamadas lee de la caché. Además, las llamadas del
   redactor salen en paralelo: arrancan al mismo tiempo, así que ninguna
   alcanza a leer lo que escribió otra.
4. **Las reglas duras viven en el prompt y en el laboratorio, no en
   producción.** `coach-lab/check.ts` ya detecta errores (test con FTP
   desconocido, TSB > 50, fechas ocupadas, nextTest mal puesto…), pero eso
   solo corre en el laboratorio. En producción, si el modelo se equivoca,
   el error llega al atleta.
5. **`effort: 'medium'` en Sonnet genera razonamiento que se cobra como
   salida.** No sabemos cuánto es (punto 1), ni si `low` da el mismo plan.
6. `finished_training_eval_comment` ya no la llama la app: no cuesta, pero
   ocupa espacio en el prompt.

## Pasos (en orden, commits chicos con tests)

| Paso | Qué | Ahorro / mejora | Llamadas a la API |
|---|---|---|---|
| 4.1 | **Registro por llamada**: tabla `coach_calls` (modo, modelo, tokens de entrada, de escritura y lectura de caché, de salida, duración, si falló) y una consulta de costo por modo | Base para decidir todo lo demás | No |
| 4.2 | **Guardia en producción**: mover las reglas de `check.ts` a un módulo compartido. Lo mecánico se corrige con código (fechas, topes, TSS); lo grave se rechaza antes de guardar | Calidad: el atleta nunca ve esos errores | No |
| 4.3 | **Prompt por modo**: un núcleo común + la sección de cada modo. Sigue siendo estático (la caché sigue funcionando por modo). Quitar lo que ya hace el código (puntos de 4.2) | Menos tokens de entrada en cada llamada y menos ruido: el modelo sigue mejor las reglas | No |
| 4.4 | **Caché según el uso real**: con los datos de 4.1, dejar la caché solo donde se lee. Redactor: lanzar la primera semana y las demás después, o juntar todo en una sola llamada | Quita el 25 % extra cuando la caché no se lee | No |
| 4.5 | **Medir `effort`**: los mismos escenarios del laboratorio con `low` y con `medium`, comparados con `check.ts` y la rúbrica | Si `low` da lo mismo, la llamada más cara baja bastante y tarda menos | **Sí**: ~10 llamadas, te pido permiso antes |
| 4.6 | **Revisión del coach real**: pasarle 6-8 respuestas del laboratorio a tu coach; sus correcciones se vuelven reglas del prompt o del código, y escenarios nuevos | La mejora de calidad más grande que queda | No |
| 4.7 (opcional) | **Batch API (−50 %)** para lo que no es en vivo: `monthly_review` y los borradores de `coach_week` | Mitad de precio en esos modos | Solo al probarlo |

## Lo que no cambia

- El system prompt sigue sin datos del atleta; nunca se mandan datos de
  Strava al modelo; el schema manda sobre la salida.
- Sonnet decide y Haiku redacta: con la salida compacta ya está en el
  punto bueno de costo y tiempo. Bajar el planner a Haiku sale más barato
  pero razona peor (ya se probó).
- Nada se despliega sin preguntarte.
