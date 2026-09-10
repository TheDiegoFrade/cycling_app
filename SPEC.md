# Especificación del proyecto

App web de entrenamiento indoor en rodillo. Corre en Chrome, sin backend, sin login.

**La promesa del producto: entrenar sin mirar la pantalla.** El usuario ve una película o hace otra cosa mientras entrena; la app le avisa por sonido y con mensajes grandes cuando tiene que corregir algo. Todas las decisiones de diseño se subordinan a esto: si una función obliga al usuario a mirar la pantalla para funcionar, está mal diseñada.

## Stack y reglas de arquitectura

- TypeScript + Vite, vanilla (sin React). Ya está creado con `npm create vite@latest -- --template vanilla-ts`.
- Sin backend, sin cuentas, sin servidor. Todo vive en el browser. Deploy como sitio estático en Cloudflare.
- Persistencia en IndexedDB. Nada de localStorage salvo para preferencias triviales.
- Dependencias mínimas. Justifica cada una antes de agregarla.
- **Regla dura:** `engine/` no puede importar nada de `devices/` ni de `ui/`. El engine recibe muestras y emite eventos. Debe poder correr una sesión completa con datos simulados, sin browser y sin hardware, en tests.
- Tests con Vitest para `core/` y `engine/`. La UI y BLE se prueban a mano.

## Estructura

```
src/
  core/      esquema, validación, parser .zwo, cálculo de zonas
  devices/   Web Bluetooth: FTMS (rodillo) y Heart Rate (banda)
  engine/    reloj, máquina de estados, métricas derivadas, motor de reglas
  ui/        pantallas: inicio, importar, conectar, entrenar
  export/    FIT + subida a intervals.icu
  storage/   IndexedDB: workouts, reglas, sesiones, perfil
```

## Modelo de datos

Estos tipos son el contrato de todo el proyecto. Defínelos primero en `core/types.ts`.

```ts
type IntervalType = 'warmup' | 'steady' | 'interval' | 'recovery' | 'cooldown' | 'free';

interface Interval {
  name: string;
  type: IntervalType;
  duration_s: number;
  power_pct: number;        // % de FTP
  ramp_to_pct?: number;     // rampa lineal hasta este %
  cadence_min?: number;
  cadence_max?: number;
}

interface Workout {
  format_version: 1;
  id: string;
  name: string;
  description?: string;
  intervals: Interval[];
  countdown?: { seconds: number; sound: SoundId; start_sound: SoundId };
  comments?: Comment[];
  rules?: Rule[];
  created_at: string;
}

interface Comment {
  at_s?: number;            // minuto absoluto
  interval?: number;        // o número de bloque (base 1)
  offset_s?: number;
  message: string;
  detail?: string;
  sound?: SoundId;
}

interface Rule {
  id: string;
  when: { metric: MetricId; op: '<' | '<=' | '>' | '>='; value: number };
  scope: 'all' | { type: IntervalType[] } | { intervals: number[] } | { minutes: [number, number] };
  tolerance_s: number;      // segundos que debe sostenerse; 0 = inmediato
  repeat_s: number | null;  // repetir cada N s mientras siga; null = una vez
  level: 'info' | 'adjust' | 'danger';
  message: string;
  detail?: string;          // admite {metric} para insertar el valor actual
  sound: SoundId;
  recovery_message?: string; // mensaje al volver a cumplir
}

type SoundId = 'tick' | 'go' | 'alarm_low' | 'alarm_desc' | 'chime' | 'none';

interface Profile { ftp: number; hr_max: number; cadence_floor: number; hr_ceiling: number; }

interface Sample {
  t: number;                // segundo desde el inicio
  power: number; cadence: number; hr: number;
  target: number;           // objetivo ERG en ese momento
  intensity: number;        // ajuste manual, 1 = 100 %
  interval_index: number;
}
```

## Catálogo de métricas

`engine/metrics.ts` calcula estas en cada tick a partir de la ventana de muestras. Son las únicas que las reglas pueden usar; validar contra esta lista.

| id | definición |
|---|---|
| `power` | última lectura |
| `power_10s` | promedio móvil 10 s |
| `power_pct_target` | `power_10s / target * 100` |
| `cadence` | última lectura |
| `cadence_10s` | promedio móvil 10 s |
| `cadence_stability` | desviación estándar de cadencia en 30 s |
| `hr` | última lectura |
| `hr_pct_max` | `hr / profile.hr_max * 100` |
| `hr_zone` | zona 1–5 según `hr_max` |
| `hr_drop_60s` | `hr(t-60) - hr(t)`, positivo si baja |
| `hr_drift` | pendiente del pulso dentro del bloque actual |
| `time_in_interval` | segundos del bloque actual |
| `time_left_interval` | segundos restantes del bloque |
| `elapsed` | segundos totales |
| `intensity` | ajuste manual en % |

MVP: implementa `power`, `power_10s`, `power_pct_target`, `cadence`, `cadence_10s`, `hr`, `hr_pct_max`, `time_*`, `elapsed`, `intensity`. Las derivadas complejas (`hr_drift`, `cadence_stability`, `hr_drop_60s`) déjalas para después, pero que el catálogo esté tipado desde ahora.

## Motor de reglas

En cada tick (1 Hz), para cada regla activa según su `scope`:

1. Evalúa la condición contra la métrica.
2. Si se cumple y `tolerance_s` transcurrió sostenidamente, dispara.
3. Si `repeat_s` no es null, vuelve a disparar cada `repeat_s` mientras siga cumpliéndose.
4. Cuando deja de cumplirse, resetea el contador y, si hay `recovery_message`, muéstralo como `info` breve.
5. Sustituye `{metric}` en `message` y `detail` por el valor actual redondeado.

Prioridad cuando varias reglas disparan en el mismo tick: `danger` > `adjust` > `info`. Solo se muestra una a la vez en el escenario; el resto se descarta (no se encolan, los datos ya caducaron).

**Reglas de fábrica** (`core/defaults.ts`): se generan a partir del perfil del usuario y están activas salvo que las apague. Son reglas normales, mismo motor.

1. `cadence < profile.cadence_floor`, scope all, tolerance 0, repeat 4 s, adjust, "No bajes de {N}", `alarm_low`.
2. `hr > profile.hr_ceiling`, scope all, tolerance 0, repeat 20 s, danger, "Baja las pulsaciones", `alarm_desc`.
3. Cuenta regresiva 5 s antes de cada bloque (no es una Rule, es parte del runtime).
4. Aviso al arrancar bloque: flash con nombre, watts y cadencia objetivo.
5. `power_pct_target < 80`, scope all, tolerance 10 s, repeat 30 s, adjust, "El ERG se desenganchó, pedalea más rápido".

Si un bloque trae `cadence_min`, se genera automáticamente una regla de ese bloque con tolerance 8 s, repeat null.

## Dispositivos (Web Bluetooth)

Interfaz común: cada adaptador emite eventos con lecturas y su estado de conexión. `engine/` solo ve un stream unificado a 1 Hz.

- **Banda:** servicio `heart_rate`, característica `heart_rate_measurement`. El bit 0 de las banderas dice si el valor es uint8 o uint16.
- **Rodillo (Saris H3):** servicio `fitness_machine`.
  - `indoor_bike_data` para leer: parsear el campo de banderas de 16 bits y extraer potencia (W, int16) y cadencia (viene en medias revoluciones por minuto: dividir entre 2).
  - `fitness_machine_control_point` para ERG: primero `0x00` (request control), luego `0x07` (start) y después `0x05` + int16 little-endian con los watts objetivo. Mandar el objetivo en cada cambio de bloque y en cada cambio de intensidad.
  - Suscribirse a `fitness_machine_status` para detectar si el rodillo pierde el modo.

**Requisitos no negociables:**
- Reconexión automática al evento `gattserverdisconnected`, con reintentos y backoff. Al reconectar el rodillo hay que repetir request control + start + objetivo actual.
- Un indicador de estado por sensor siempre visible en la barra superior.
- Wake Lock API para que la laptop no se duerma durante la sesión.
- El registro no se detiene si un sensor se cae: se graban ceros o el último valor marcado como stale, y la sesión sigue.

## Runtime del entrenamiento

- Reloj a 1 Hz basado en tiempo real (no en conteo de ticks, para que no se desfase).
- Ajuste de intensidad: botones ±5 %, flechas ↑↓ ±1 %, rango 50–120 %. Aplica al objetivo, al perfil dibujado y a las etiquetas del siguiente bloque. Cada cambio se registra como evento con su timestamp.
- Pausa: barra espaciadora o botón. Baja el objetivo ERG a un mínimo, congela el reloj, y muestra estado de pausa. Auto-pausa si la cadencia es 0 por más de 10 s, y reanudación automática al volver a pedalear.
- Al terminar: guardar sesión, generar FIT, ofrecer descarga y subida a intervals.icu.

## Sonido

Los beeps son parte central del producto, no un adorno: el usuario no está mirando la pantalla. Web Audio API, osciladores, sin archivos. Cada evento tiene su firma sonora y deben ser distinguibles con audífonos puestos y una película sonando:

- `tick` — 880 Hz, 70 ms (cuenta regresiva)
- `go` — 1320 Hz + 1760 Hz encadenados (arranca bloque)
- `alarm_low` — 330 Hz onda cuadrada, doble, grave (cadencia)
- `alarm_desc` — 660 → 520 → 400 Hz descendente (pulso, peligro)
- `chime` — 1047 + 1319 Hz suave (comentario del coach)

En la pantalla de inicio debe haber un botón para probar cada sonido y ajustar volumen antes de empezar. El AudioContext requiere un gesto del usuario para inicializarse: hacerlo en el click de "empezar".

## Importación

- Parser de `.zwo`: `<Warmup>`, `<SteadyState>`, `<IntervalsT>` (se expande en pares on/off), `<Ramp>`, `<Cooldown>`, `<FreeRide>`, `<textevent>`. Numerar los bloques desde 1 después de expandir. Los `textevent` se convierten en `Comment`.
- Import de `.rules.json` (solo reglas, sin intervalos) que se aplica sobre cualquier workout cargado.
- Validador que devuelve errores en lenguaje claro y accionable: "la regla `pulso-max` usa la métrica `heart_rate`, que no existe; las disponibles son: ...". El usuario va a pegar ese error en su AI para que se lo corrija, así que el mensaje debe bastar por sí solo.
- La pantalla de importación muestra el perfil dibujado con la numeración de bloques y qué reglas y comentarios caen en cada uno, para confirmar antes de arrancar.

## Pantallas

1. **Inicio:** biblioteca de workouts guardados, perfil (FTP, pulso máximo, piso de cadencia, techo de pulso), switches de las alertas de fábrica, prueba de sonidos, botón de importar.
2. **Conectar:** botones para rodillo y banda, con estado y lecturas en vivo para verificar antes de empezar.
3. **Entrenar:** la pantalla principal, ya diseñada (ver mockup adjunto).
4. **Resumen:** al terminar, gráfica de la sesión, alertas disparadas, ajustes de intensidad, descarga de FIT y subida a intervals.icu.

## Diseño visual

El mockup `rodillo-mockup-v6.html` es la referencia normativa de la pantalla de entrenar: úsalo para colores, tipografía, layout y animaciones. Resumen de las decisiones:

- Fondo negro. El reposo vive en grises apagados para que cualquier color destaque.
- Amarillo `#FFD400` reservado exclusivamente para interrupciones: cuenta regresiva y alertas de ajuste. Si aparece seguido, pierde su efecto.
- Rojo solo para peligro (pulso). Azul para información. Escala de zonas gris→azul→verde→amarillo→naranja→rojo.
- La mitad superior de la pantalla es el escenario de mensajes; los números (potencia, cadencia, pulso, intervalo) van abajo, del mismo peso.
- Gráfica estilo Rouvy: perfil del workout de fondo con el bloque actual encendido, líneas de pulso, cadencia y potencia que avanzan.
- Cuenta regresiva a pantalla completa con el número amarillo gigante y anillo que se expande.
- Nunca depender solo del color: cada alerta tiene texto, posición y sonido propio.

## Milestones

Trabaja en este orden y para en cada uno para que lo revise.

1. **M1 — Core:** tipos, validador, parser de .zwo, cálculo de zonas, tests. Sin UI.
2. **M2 — Engine simulado:** reloj, máquina de estados, métricas, motor de reglas, corriendo con un generador de muestras falsas y salida por consola. Tests de que las reglas disparan cuando deben.
3. **M3 — Pantalla de entrenar:** el mockup convertido en componentes reales, alimentado por el engine simulado. Aquí ya se ve el producto.
4. **M4 — Bluetooth:** adaptadores de banda y rodillo, ERG, reconexión, pantalla de conectar. Primera rodada real.
5. **M5 — Persistencia:** IndexedDB, biblioteca de workouts, perfil, exportar/importar biblioteca.
6. **M6 — Salida:** FIT con laps por intervalo, descarga, subida a intervals.icu.

## Cosas que NO hay que hacer

- No agregar login, cuentas ni backend.
- No llamar a ningún LLM desde la app. La AI vive fuera: hay un prompt público que el usuario pega en su propia AI para generar reglas.
- No inventar métricas fuera del catálogo.
- No usar localStorage para datos de sesión.
- No poner analítica que mande datos personales; solo conteo anónimo de páginas.
- No optimizar para móvil en el MVP: el objetivo es laptop.
