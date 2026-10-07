# Torq · Vista del coach

Especificación de la vista del coach (Joe · UR Training): modelo de datos, permisos, flujo de las semanas y pantallas. Fecha: 7 oct 2026.

La vista del coach necesita 5 tablas nuevas, 5 columnas en `sessions` y permisos que dejen al coach leer a sus atletas sin poder tocar sus datos personales.

Decisiones ya tomadas:

- **Solo ciclismo** como deporte entrenado, pero el atleta puede registrar sesiones de fuerza, movilidad y flexibilidad.
- **La IA propone y el coach aprueba**: el atleta nunca ve una semana que el coach no haya publicado.
- **Vinculación por link de invitación**, de un solo uso y con vencimiento.
- **Lo que llega por Strava no entra** ni a la IA ni a la vista del coach (los términos de la API de Strava prohíben usar sus datos en modelos de IA y mostrarlos a otras personas).
- **El coach es un usuario con un permiso extra, no otro tipo de cuenta**: `profiles.is_coach`, que solo se activa a mano desde el SQL Editor (la app no puede cambiarlo). El coach entrena con Torq como cualquier atleta y además ve las secciones del coach en la barra lateral; nunca se le quita nada de la app de atleta. Un coach puede tener muchos atletas; cada atleta, máximo un coach activo.

## Pantallas

Los mockups están en `mockups/` como archivos `.dc.html`. Son referencia de diseño, no código para copiar: no se abren solos en un navegador (dependen del runtime del canvas donde se diseñaron), pero el markup muestra el layout, los colores, los textos y los datos de ejemplo (en `renderVals()` de cada archivo). Todos los datos son de ejemplo.

| Archivo | Pantalla | Quién la ve |
| --- | --- | --- |
| `Main.dc.html` | **Atletas**: resumen (semanas por aprobar, revisiones mensuales, alertas, cumplimiento) y tabla de atletas con cumplimiento de la semana, Forma (TSB), Fitness (CTL), última actividad, alerta y siguiente paso | Coach |
| `Atleta.dc.html` | **Análisis de un atleta**: indicadores, gráfica CTL/ATL/TSB de 12 semanas, plan vs. realizado por semana (con puntos de fuerza/movilidad), sesiones recientes con fuente y cumplimiento, "Lo que detectó la IA" (solo para el coach), revisión mensual y notas privadas | Coach |
| `Semanas.dc.html` | **Semanas de todos**: una fila por atleta y una columna por día. Tocar una sesión abre un panel para cambiarla por otra de la biblioteca, moverla de día, ajustar intensidad ±5% (recalcula TSS), dejar nota, copiar a otros atletas o quitarla. Estados por fila: Borrador IA / Editado · sin publicar / Publicada. Publicar por fila o todas las pendientes | Coach |
| `Semana.dc.html` | **Semana de un atleta a detalle**: borrador de la IA por día, totales (TSS, horas, sesiones, forma esperada), "Por qué la IA propone esta semana", regenerar con indicación, biblioteca | Coach |
| `Invitar.dc.html` | **Invitación**: lado del coach (elegir plan, copiar link, invitaciones pendientes) y lado del atleta (qué podrá y qué no podrá ver el coach, aviso de conectar el reloj a intervals.icu directo y no por Strava, aceptar) | Coach y atleta |
| `Registrar.dc.html` | **Registrar fuerza o movilidad**: rutina asignada por el coach (ejercicios, dosis, link a video), tipo, ¿la completaste?, duración, RPE 1–10, nota, subir .fit, carga estimada en sRPE | Atleta |

Estilo: el de Torq (`src/ui/styles.css`): fondo negro, superficies `#15171b`, acento `#3d8bff`, Barlow Condensed para títulos y números, Archivo para texto, colores de zona Z1–Z6 existentes. Color nuevo para fuerza: `#b9a4ff`; movilidad: `#c5cad3`. La vista del coach es para laptop pero debe funcionar en pantallas angostas (tablas con scroll horizontal).

Navegación del coach (barra lateral): Atletas · Semanas · Biblioteca · Invitar atleta.

## Tablas nuevas y cambios

Todo se agrega sobre el esquema actual de Supabase (`supabase/schema.sql`); nada existente se borra. Mismo estilo del archivo: `if not exists`, RLS en todo.

| Tabla | Para qué | Columnas clave | Quién escribe |
| --- | --- | --- | --- |
| `coach_athletes` | Vínculo coach ↔ atleta y su plan contratado | `coach_id`, `athlete_id`, `tier` (basica, pro, revision, todo), `status` (active, ended), `started_at`, `ended_at` | Edge Function al aceptar; el atleta puede terminarlo |
| `coach_invites` | Links de invitación | `coach_id`, `token_hash`, `tier`, `expires_at`, `used_by`, `used_at` | El coach crea; una Edge Function la consume |
| `session_templates` | Biblioteca del coach: bici, fuerza, movilidad | `coach_id`, `kind`, `name`, `payload` (intervalos o ejercicios con dosis y link de video) | El coach |
| `plan_weeks` | Una semana por atleta, la unidad que se aprueba | `athlete_id`, `coach_id`, `iso_week`, `status` (draft, published, superseded), `items` (día, plantilla o sesión, quién la editó), `ai_rationale`, `published_at` | La IA crea el borrador; el coach edita y publica |
| `coach_notes` | Notas privadas del coach sobre un atleta | `coach_id`, `athlete_id`, `body`, `created_at` | El coach; la IA las lee |

Cambios en `sessions` para que convivan bici, fuerza y movilidad:

- `kind`: bike_indoor, bike_outdoor, strength, mobility, flexibility, other.
- `source`: torq, fit_upload, intervals, strava, manual. Es la llave de la regla de Strava.
- `completion`: complete, partial, skipped.
- `srpe_load`: RPE × minutos, solo para sesiones que no son de bici.
- `planned_item_id`: con qué sesión de `plan_weeks` se empata.

`training_plans` sigue guardando el bloque y la meta; las semanas concretas pasan a `plan_weeks`, porque ahí vive la aprobación del coach. Índice en `plan_weeks (coach_id, iso_week)` para la pantalla de Semanas.

## Permisos (RLS)

Una sola función decide todo: `is_coach_of(athlete_id)` es verdadera solo si existe un vínculo `active` en `coach_athletes` entre el usuario actual y ese atleta. Al desvincularse, deja de serlo en ese instante.

| Tabla | El atleta | El coach vinculado |
| --- | --- | --- |
| `sessions` | Lee y escribe lo suyo | Lee las de sus atletas, excepto `source = 'strava'`; no escribe |
| `.fit` en Storage | Lee y sube lo suyo | Lee a través de una Edge Function que aplica la misma regla de Strava |
| `profiles` | Lee y edita lo suyo | Lee una vista con solo campos de entrenamiento (nombre, FTP, pulso máximo, disciplina, meta, lesiones); no ve fecha de nacimiento ni correo |
| `plan_weeks` | Lee solo semanas `published` | Lee todas, edita borradores y publica |
| `session_templates` | No las lee: al publicar, el contenido de la plantilla se copia a su semana (`workouts` o `planned_routines`) | Crea y edita las suyas |
| `coach_notes` | No las ve | Lee y escribe las suyas |
| `coach_invites` | Consume un link vía Edge Function | Crea y cancela los suyos |

Reglas adicionales:

- La IA corre con service role, así que la regla de Strava se aplica también en el código que arma su contexto, no solo en RLS.
- Un atleta tiene como máximo un coach activo, garantizado con un índice único parcial, igual que hoy con `training_plans`.
- El cobro por tier queda fuera de esta especificación; `coach_athletes.tier` solo registra qué plan acordaron.

## Flujo de la semana

1. Cada domingo, con los datos de la semana, la IA arma un borrador (`plan_weeks.status = draft`).
2. El coach lo revisa y edita (en la pantalla Semanas o en el detalle de un atleta).
3. Si no lo aprueba, puede regenerarlo con una indicación; la IA conserva las ediciones manuales del coach y solo reacomoda lo demás.
4. Al aprobarlo se publica (`published`) y el atleta ya la ve.
5. Si el coach la vuelve a editar después, se publica una versión nueva y la anterior queda `superseded`.

## Carga de fuerza y movilidad

Las sesiones sin potencia se miden con sRPE (RPE × minutos) y se muestran en su propia línea; no se suman al TSS ni al CTL de la bici, porque son escalas distintas.

- **Cómo llega:** el atleta registra tipo, duración, RPE y si la completó. Si la grabó en su reloj, llega por intervals.icu con duración y pulso, y Torq solo le pide el RPE.
- **Cómo la usa la IA:** como contexto de fatiga (total semanal y tendencia) y para acomodar el calendario, por ejemplo separar una sesión pesada de pierna de los intervalos duros.
- **Qué no hace:** no convierte sRPE a TSS. Si el coach quiere una carga combinada, él define el criterio y se agrega después.

## Orden de construcción

Cada paso deja algo usable antes del siguiente. Un pull request por paso.

1. Columna `source` y excluir Strava del contexto de la IA. Es prerrequisito de todo lo demás.
2. `kind`, `completion` y `srpe_load` en `sessions`, más la pantalla para registrar fuerza y movilidad (`Registrar.dc.html`).
3. `coach_athletes`, `coach_invites`, la función `is_coach_of` y el flujo del link (`Invitar.dc.html`).
4. Vista de Atletas y análisis de un atleta, solo lectura (`Main.dc.html`, `Atleta.dc.html`).
5. `session_templates`: la biblioteca del coach.
6. `plan_weeks`: borrador de la IA, edición y publicación (`Semanas.dc.html`, `Semana.dc.html`).
7. Revisión mensual con reporte armado.

## Preguntas abiertas para el coach (antes del paso 6)

- [ ] ¿Qué 5 a 10 métricas o gráficas mira en WKO5 con cada atleta?
- [ ] ¿Cuántos minutos puede dedicar por atleta a la revisión mensual?
- [ ] ¿Qué separación mínima quiere entre fuerza de pierna e intervalos duros?
- [ ] ¿Qué día publica las semanas, y qué pasa si no aprueba a tiempo: el atleta espera o se publica el borrador?
- [ ] ¿Sus rutinas de fuerza son plantillas fijas o las ajusta por atleta?
- [ ] ¿El atleta debe ver el razonamiento de la IA o solo la semana publicada?
