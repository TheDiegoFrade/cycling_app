# Fase 4 — Resultados de la prueba de costo y calidad

Fecha: 2026-10-08/09. 61 llamadas reales a la API, **$1.06 en total**.
Respuestas completas en `coach-lab/results/api-2026-10-0*/`; se pueden volver a
revisar con `coach-lab/check.ts` y la guardia (`guard.ts`).

## Qué se probó

- **Plan inicial (`create_plan`)**: 12 escenarios con Haiku 5.5 low y 2 con las
  cuatro configuraciones (Sonnet 5.5 medium/low, Haiku 5.5 medium/low).
- **Evaluación semanal (`weekly_eval`)**: 17 escenarios con Haiku 5.5 low, 4
  con las cuatro configuraciones y 4 difíciles (FTP/test) con Sonnet low y
  Haiku medium.
- Todo pasa por la misma guardia que producción, con su reintento.

## Costo y tiempo por llamada

"Frío" = sin aprovechar la caché, como en producción con poco tráfico.

| Modo | Configuración | n | Costo frío promedio | Tiempo promedio (máx.) |
|---|---|---|---|---|
| create_plan | Sonnet medium (antes) | 2 | $0.132 | 63 s (67) |
| create_plan | **Sonnet low** | 2 | **$0.114** | **48 s (52)** |
| create_plan | Haiku low | 14 | $0.008 | 48 s (75) |
| weekly_eval | Sonnet medium (antes) | 4 | $0.069 | 20 s (28) |
| weekly_eval | Sonnet low | 8 | $0.061 | 13 s (20) |
| weekly_eval | **Haiku low** | 21 | **$0.0046** | 24 s (36) |
| weekly_eval | Haiku medium | 8 | $0.0055 | 33 s (50) |

El redactor (Haiku, descripciones) suma ~$0.002 por plan en todos los casos.

## Calidad

**Evaluaciones semanales con Haiku low.** Resolvió bien 15 de 17:
- fatiga (absorción a tiempo, también con VFC baja y mal sueño);
- semana floja aislada contra patrón de semanas flojas;
- dolor de rodilla;
- calibración del FTP provisional;
- no subir el FTP a mitad de bloque;
- leer picos que no fueron máximos.

Falló justo donde hay que razonar sobre el FTP:
- **26 y 33** (test con ERG fijo y pulso subiendo): dijo "mantén tu FTP".
  Sonnet low en el 26 estimó ~150 W y le pidió ponerlo. Haiku medium tampoco
  lo resolvió: no es cuestión de effort.
- **23** (FTP alto tras la rampa): bajó los bloques bien, pero sin decir que
  el número quedó alto.

**Plan inicial con Haiku low.** Correcto en la mayoría, con tres errores que
en un plan nuevo pesan:
- **01**: coachNote vacío.
- **14**: olvidó la escalera de ajuste de la sedentaria sin FTP.
- **05**: metió 82 % en la semana de absorción (TSB −32).

**Sonnet low frente a medium.** Misma calidad en los 6 escenarios
comparados, ~10 % más barato y 25-35 % más rápido.

**Errores de todos los modelos** (los arregla el código, guard.ts):
- TSS imposibles: 90 min de fondo con TSS 200, o el reasoning promete 430
  cuando las sesiones suman 305. Ahora el TSS lo calcula el código desde la
  estructura.
- `suggestedFtp` vacío aunque el coachNote dice "pon 200 W en tu perfil": no
  salía el botón. Ahora se toma de esa frase.
- Un "Fondo tranquilo" al 93 % (Haiku): ahora es falla y se pide corrección.

## Decisión implementada (routing.ts)

| Llamada | Modelo |
|---|---|
| create_plan, publish_block | Sonnet 5.5 low |
| weekly_eval con test en la semana, test reciente o nota sobre FTP/test/watts | Sonnet 5.5 low |
| weekly_eval normal | Haiku 5.5 low |

La guardia agrega dos reglas que salieron de la prueba:
- coachNote o reasoning vacío es falla;
- en absorción (TSB ≤ −25 al crear el plan, o `insert_recovery`) nada pasa
  de 75 %.

Pasadas por la guardia actual, las 61 respuestas solo marcan los tres
errores reales que se encontraron a mano.

## Cuánto cambia por atleta al mes

Supuestos: ~4.3 evaluaciones semanales al mes, ~1 de cada 5 con FTP/test de
por medio, y un plan nuevo de vez en cuando.

- Evaluaciones semanales: de ~$0.30 a ~$0.07 al mes (**−75 %**).
- Plan nuevo: de ~$0.13 a ~$0.11, y unos 15 s más rápido.

## coach_week y monthly_review (2026-10-09)

7 escenarios: 5 de semana del coach y 2 de revisión mensual (el 38 es nuevo:
un mes bueno). Se probaron con Haiku 4.5 (lo de antes), Haiku 5.5 low y
Haiku 5.5 medium. Costo de esta prueba: $0.17. Sin reintento, igual que
producción en estos modos.

| | Haiku 4.5 | Haiku 5.5 low | Haiku 5.5 medium |
|---|---|---|---|
| Costo frío promedio | $0.024 | $0.0032 | $0.0041 |
| Tiempo promedio | 17 s | 11 s | 19 s |
| Reglas rotas | 2 (caso 13) | 0 | 0 |

- **13** (fuerza de pierna y rodilla, FTP sin confirmar): Haiku 4.5 puso
  sweet spot el día antes de la fuerza de pierna. También usó tal cual un
  over-under que pasa de 95 % con el FTP sin confirmar. Haiku 5.5 respetó
  todo y sugirió un test.
- **28** (mes con fatiga): Haiku 4.5 leyó la baja del mejor 20 min como
  pérdida de forma. Haiku 5.5 low lo leyó bien, pero puso como "good" una
  subida de CTL que él mismo dice que es excesiva. Solo Haiku 5.5 medium dio
  off_track con el hallazgo "bad" de fatiga, recuperar como primer objetivo
  y fuerza/movilidad.
- **38** (mes bueno): los tres dieron on_track. Haiku 4.5 inventó que "la
  molestia lumbar no limitó" y propuso subir el CTL sin descarga.

Decisión: coach_week con Haiku 5.5 low y monthly_review con Haiku 5.5
medium (una al mes por atleta, el costo extra es despreciable). En
coach_week, medium no mejoró nada.

## Pendiente

- Correr el SQL de `coach_calls` y desplegar. Con eso, la vista
  `coach_cost_by_mode` dice el costo real y si la caché se aprovecha (paso
  4.4).
- Paso 4.3 (prompt por modo) y 4.6 (revisión de tu coach).
