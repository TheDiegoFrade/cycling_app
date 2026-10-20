# Torq

App web de entrenamiento indoor en rodillo. Corre en Chrome; todo vive local en tu navegador, y con login (opcional según el despliegue) tu historial también se sincroniza en la nube entre dispositivos. Pensada para entrenar **sin mirar la pantalla**: avisa por sonido y con mensajes grandes cuando hay que corregir algo.

Deploy en producción: **https://ridetorq.app**

La especificación completa del proyecto (modelo de datos, motor de reglas, protocolo Bluetooth, milestones) está en [`SPEC.md`](./SPEC.md).

## Qué puedes hacer con esta app hoy

**Importar y armar entrenamientos**
- Importa workouts en `.zwo` (Zwift) o `.workout.json` propio, con validación que da errores claros y accionables.
- Aplica un archivo de solo reglas (`.rules.json`) sobre cualquier workout ya importado.
- Perfil configurable: FTP, pulso máximo, piso de cadencia, techo de pulso.

**Entrenar**
- Pantalla de entrenar a pantalla completa: escenario de mensajes, cuenta regresiva animada antes de cada bloque, gráfica en vivo de potencia/cadencia/pulso sobre el perfil del workout.
- Motor de reglas propio: alertas de fábrica (piso de cadencia, techo de pulso, ERG desenganchado) más las reglas que traiga tu workout, con tolerancia, repetición, recuperación y prioridad `danger > adjust > info`.
- Control ERG real por Bluetooth (protocolo FTMS) contra rodillos compatibles — probado contra un Saris H3.
- **Arranca solo** si empiezas a pedalear, y **se pausa sola** si dejas de pedalear unos segundos — sin tocar ningún botón. Espacio para pausar/continuar manual.
- Botón para apagar el ERG a mitad de sesión (por si quieres pedalear a tu ritmo, o si otra app ya está controlando el mismo rodillo).
- Ajuste de intensidad en vivo (±5% con botones, ±1% con flechas).
- Banda de pulso por Bluetooth estándar (`heart_rate`) — funciona con cualquier banda que lo exponga (no con relojes que reservan el pulso para su propia app, como la mayoría de smartwatches).
- Reconexión automática si se cae el Bluetooth; si un sensor deja de mandar datos, se graban ceros en vez de inventar lecturas.
- Simuladores de rodillo y banda para probar todo sin hardware conectado.
- Wake Lock: la laptop no se duerme a mitad de sesión.

**Después de entrenar**
- Resumen de la sesión: gráfica, alertas disparadas, ajustes de intensidad.
- Métricas de ciclismo tipo TrainingPeaks calculadas de tus datos reales: **Normalized Power, Intensity Factor, TSS, Variability Index, Efficiency Factor**, curva de potencia (mejor 5s/30s/1min/5min/20min), y tiempo en cada zona de potencia y de pulso.
- Exportación a **`.fit`** con toda esa analítica embebida (compatible con el formato que usan Garmin/Strava/TrainingPeaks) — descarga directa o subida a intervals.icu (mecanismo construido pero sin verificar contra la API real).
- **Historial**: todas tus sesiones guardadas, navegables, cada una con su resumen completo.
- **Fitness / Fatigue / Form (PMC)**: la gráfica de CTL/ATL/TSB de TrainingPeaks, calculada a partir del TSS diario de tu historial completo.

**Cuenta y nube (opcional)**
- Login privado (correo + contraseña) — solo entran correos invitados por el administrador, no hay registro abierto.
- Con sesión iniciada, tu historial se sincroniza solo entre dispositivos (Supabase).
- **Strava**: cada usuario conecta su propia cuenta — sube tus sesiones grabadas en Torq a Strava, e importa tus rodadas de afuera (con potencia/pulso/cadencia) para verlas con las mismas métricas.

## Cómo usarla

1. **Perfil** — configura FTP, pulso máximo, piso de cadencia y techo de pulso, y los sonidos de las alertas.
2. **Historial** — en la pestaña *Biblioteca* importa workouts (`.zwo`, `.mrc`, `.erg`, `.fit` o `.json`); en *Actividad* están todas tus sesiones grabadas.
3. **Plan** — tu calendario en vista de semana o de mes: crea un entrenamiento en un día desde una plantilla, arrástralo a otro día, quítalo (pide un motivo), registra una sesión de fuerza o movilidad (la carga se mide en sRPE), agrega un entrenamiento ya hecho desde un `.fit` o desde Strava, o descarga lo agendado en CSV. Desde aquí arrancas el entrenamiento del día.
4. **Coach de IA** (en Plan, con sesión iniciada) — primero llenas un cuestionario (salud, otras actividades, días disponibles) y luego "Crear mi plan" arma un plan por bloques: rodillo más salidas largas afuera, técnica y gimnasio en el calendario. Cada semana puedes pedirle una evaluación, que también puede sugerirte un FTP nuevo. Si tienes un coach humano vinculado, lo que propone la IA le llega a él como borrador y no ves la semana hasta que él la publica.
5. **Piñón** — la mascota del coach. Se asoma de vez en cuando (se puede apagar) y explica cada pantalla la primera vez. El botón "Platica con Piñón" (Inicio, Plan, Forma e Historial) abre un chat: las preguntas comunes se contestan en el navegador con tus datos y lo demás va a la IA. Piñón solo opina — nunca cambia tu plan, tus workouts ni tu perfil.
6. **Conectar** — conecta tu rodillo y tu banda por Bluetooth (o usa "Usar simulador" si no tienes el hardware a la mano) y confirma que las lecturas se vean bien.
7. **Entrenar** — empieza a pedalear (arranca sola) o presiona "Empezar". Espacio pausa/continúa. El botón `ERG` prende/apaga el control de resistencia.
8. **Resumen** — se abre solo al terminar: revisa tus métricas, descarga el `.fit`, o súbelo a intervals.icu.
9. **Forma** — Fitness / Fatigue / Form (PMC) y tu progreso a través de todas tus sesiones.

**Vista del coach humano.** Una cuenta con `profiles.is_coach` (se activa a mano desde el SQL Editor; la app no puede cambiarlo) sigue entrenando como cualquier atleta y además ve en la barra lateral **Atletas**, **Semanas**, **Biblioteca** e **Invitar atleta**. El coach invita con un link de un solo uso que vence; el atleta lo abre, inicia sesión y acepta. Desde ahí el coach revisa el análisis de cada atleta (sin las sesiones que llegaron por Strava), deja notas privadas, edita y publica las semanas que propone la IA, arma su biblioteca de sesiones de bici, fuerza y movilidad, publica revisiones mensuales y aprueba los correos al atleta. La especificación está en [`docs/coach-view/README.md`](./docs/coach-view/README.md).

### Requisitos

- Un navegador con Web Bluetooth: **Chrome o Edge**, en computadora o en Android. Ningún navegador de iPhone/iPad lo soporta (la app sugiere la app gratuita Bluefy), ni Firefox.
- Para Bluetooth real: HTTPS o `localhost`, y permiso de Bluetooth otorgado al navegador a nivel de sistema operativo.
- Sin Bluetooth compatible, todo funciona igual con los simuladores.
- Login, sincronización, coach de IA, Piñón y vista del coach necesitan Supabase configurado (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`). Sin esas variables la app corre en modo solo local: sin login, sin nube y sin IA.

## Desarrollo local

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm test           # corre toda la suite de Vitest
npm run build      # type-check + build de producción
npm run simulate   # corre una sesión simulada completa y la imprime en consola
```

Unos 540 tests en Vitest cubren `core/`, `engine/`, `devices/` (parseo de protocolo BLE), `export/`, `storage/`, partes de `ui/` (Piñón, portadas) y la lógica de la Edge Function `coach-chat` (ruteo de modelos, guardas, biblioteca). La UI completa y la conexión Bluetooth real se prueban a mano — no hay forma de automatizar hardware real en CI.

## Estructura del proyecto

```
src/
  core/      tipos, validador, parser de .zwo, cálculo de zonas
  engine/    reloj, plan del workout, métricas, motor de reglas, sesión, analítica (NP/IF/TSS), PMC
  devices/   Web Bluetooth: FTMS (rodillo) y Heart Rate (banda), más adaptadores simulados
  ui/        pantallas: inicio, plan, conectar, entrenar, resumen, historial, forma, perfil, coach de IA, Piñón, vista del coach
  export/    generación de .fit, subida a intervals.icu
  storage/   IndexedDB: perfil, biblioteca de workouts, ajustes, sesiones grabadas
  supabase/  cliente de Supabase (null si no está configurado)
  sync/      sincronización con la nube, Strava, coach de IA, chat de Piñón, datos del coach humano
supabase/
  schema.sql esquema y permisos (RLS)
  functions/ Edge Functions: coach-chat, pinon-chat, monthly-self-report, Strava, correos del coach, etc.
```

Regla dura de arquitectura: `engine/` no importa nada de `devices/` ni de `ui/` — el motor recibe muestras y emite eventos, y puede correr una sesión completa con datos simulados sin browser y sin hardware (ver `npm run simulate`).

## Qué NO hace (todavía, o a propósito)

- Sin Supabase configurado no hay cuentas ni nube: todo vive en IndexedDB de tu navegador, y si cambias de dispositivo o borras datos del sitio pierdes tu historial.
- No hay registro abierto, y el coach de IA y Piñón están en lanzamiento controlado: solo responden a las cuentas de una lista fija en `supabase/functions/_shared/coach-access.ts` (las demás reciben "todavía no está disponible para tu cuenta"), con topes de uso.
- Lo que llega por Strava no entra a la IA ni a la vista del coach (lo prohíben los términos de la API de Strava).
- La subida a intervals.icu no está verificada contra la API real (falta probarla con una cuenta y una API key reales).
