# Simulaciones del coach IA

Arnés de la auditoría del 9 oct 2026. El resultado está en `docs/evaluaciones/2026-10-09-hallazgos-coach-torq.md`.

Corre 21 escenarios (disciplina × perfil de atleta) contra los endpoints **reales de producción**: `coach-chat` (`create_plan`, `weekly_eval`) y `coach-retire-plan`. Usa la sesión de una cuenta dummy de pruebas.

> ⚠️ **Escribe en producción, en la cuenta dummy.** Cada corrida:
> - reescribe el perfil del dummy;
> - borra sus contadores anti-abuso (`plan_actions`, `coach_usage`) y su expediente (`athlete_notes`);
> - crea planes reales y manda correos reales a la bandeja del dummy;
> - gasta tokens de la API de Claude. La auditoría completa costó ≈US$6.
>
> Úsalo **solo** con la cuenta dummy. Nunca lo apuntes a una cuenta de un usuario real.

## Requisitos

Variables de entorno:

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | llamadas a las Edge Functions con la sesión del dummy |
| `SUPABASE_SERVICE_ROLE_KEY` | abrir la sesión del dummy (magic link) y leer y escribir sus tablas |
| `SUPABASE_ACCESS_TOKEN` | Management API: SQL directo (reseteo de contadores) |
| `TORQ_DUMMY_EMAIL` | correo de la cuenta dummy |
| `TORQ_DUMMY_USER_ID` | `user_id` de la cuenta dummy |

Si hay un proxy de salida, Node necesita `NODE_USE_ENV_PROXY=1` (y `NODE_EXTRA_CA_CERTS` si el proxy usa su propia CA).

## Uso

```sh
cd scripts/coach-sim
node run.mjs <escenario> <corrida> [flags]   # un escenario
./driver.sh                                  # los 21, dos corridas cada uno
./extras.sh                                  # corridas extra de la auditoría (concurrencia, limpias, repeticiones)
node retire.mjs                              # da de baja el plan activo del dummy
```

Flags de `run.mjs`:

| Flag | Qué hace |
|---|---|
| `--eval` | después de crear, simula la retro de la semana 1 y corre `weekly_eval` |
| `--no-retire` | no da de baja el plan al terminar |
| `--clean` | no cuenta como ocupadas las fechas de sesiones ya grabadas en el historial del dummy (solo las de workouts agendados) |
| `--try-dup` | intenta crear un segundo plan sin dar de baja el primero (debe dar 409) |
| `--rapid` | lanza dos `create_plan` simultáneos y luego da de baja y vuelve a crear seguido |
| `--extreme` | manda valores extremos o vacíos (debe dar 400) |
| `--ftp-change` | cambia el FTP con el plan activo |
| `--tag=x` | sufijo de la carpeta de salida |

Cada corrida deja en `out/sNN-rK[-tag]/`:
- los contextos enviados (`create-context.json`, `eval-context.json`);
- las respuestas;
- el plan capturado de la base (`create.json`, `post-eval.json`) y resúmenes legibles (`*-summary.md`);
- `run.json` (tiempos y pruebas de ruptura) y `log.txt`.

`out/` y `report/` no se suben al repo.

## Evaluación y reporte

1. Por cada escenario, un evaluador (persona o agente) sigue `EVAL_GUIDE.md`: método, rúbrica C1-C14 y formato de salida. `AGENT_PROMPT.md` es el prompt que se le dio a cada agente evaluador.
2. Escribe `report/sNN.md` a partir de `out/` y de los correos del dummy en Gmail.
3. Las secciones generales van en `report/00-meta.md`, `01-summary.md`, …, `errors-base.md`.
4. `python3 assemble.py` las junta en `out/hallazgos_coach_torq.md`.

`brief-scenarios.md` tiene la tabla de los 21 escenarios con su retro de la semana 1 y la prueba de ruptura asignada. Los datos ejecutables están en `scenarios.mjs`.

## Prueba en el navegador

`ui-test.mjs` recorre el cuestionario inicial y crea un plan desde la interfaz. Corre contra el frontend local conectado a producción; las instrucciones están al inicio del archivo. Necesita Playwright. Si no está instalado en el proyecto, define `PLAYWRIGHT_MODULE` con la ruta de su `index.mjs`.

## Cambios desde la auditoría

- Desde el cuestionario obligatorio (#27), `create_plan` exige sexo, edad y peso. Los escenarios sin sexo ahora mandan `'other'`, así que el coach sigue usando lenguaje neutro, como en la auditoría.
- **La simulación de `--eval` se escribió para la semántica v2.** En esa versión, la evaluación solo se permitía cuando ya habían pasado las semanas armadas. Desde #25, el servidor decide qué semana evalúa a partir de `startDate` y de la fecha de hoy (`evalWeekTarget`). Antes de una auditoría nueva, revisa `run.mjs` (`--eval`): recorre el plan al pasado y arma un `weekJustFinished` sintético.
- La corrida en seco de la v3 usó una función temporal, `coach-lab-run`, que ya se borró. Por eso sus scripts no están aquí.
