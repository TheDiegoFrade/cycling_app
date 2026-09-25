# Torq

App web de entrenamiento indoor en rodillo. Corre en Chrome; todo vive local en tu navegador, y con login (opcional según el despliegue) tu historial también se sincroniza en la nube entre dispositivos. Pensada para entrenar **sin mirar la pantalla**: avisa por sonido y con mensajes grandes cuando hay que corregir algo.

Deploy en producción: **https://cycling-app.dpcfrade.workers.dev**

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

## Cómo usarla

1. **Inicio** — configura tu perfil (FTP, pulso máximo, piso de cadencia, techo de pulso), prueba los sonidos y ajusta el volumen, e importa un workout (`.zwo` o `.workout.json`).
2. **Conectar** — conecta tu rodillo y tu banda por Bluetooth (o usa "Usar simulador" si no tienes el hardware a la mano) y confirma que las lecturas se vean bien.
3. **Entrenar** — empieza a pedalear (arranca sola) o presiona "Empezar". Espacio pausa/continúa. El botón `ERG` prende/apaga el control de resistencia.
4. **Resumen** — se abre solo al terminar: revisa tus métricas, descarga el `.fit`, o súbelo a intervals.icu.
5. **Historial** — cualquier momento, para ver tu progreso a través de todas tus sesiones grabadas.

### Requisitos

- **Chrome de escritorio** (u otro navegador con Web Bluetooth). Safari no lo soporta.
- Para Bluetooth real: HTTPS o `localhost`, y permiso de Bluetooth otorgado al navegador a nivel de sistema operativo.
- Sin Bluetooth compatible, todo funciona igual con los simuladores.

## Desarrollo local

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm test           # corre toda la suite de Vitest
npm run build      # type-check + build de producción
npm run simulate   # corre una sesión simulada completa y la imprime en consola
```

161 tests en Vitest cubren `core/`, `engine/`, `devices/` (parseo de protocolo BLE) y `export/`. La UI y la conexión Bluetooth real se prueban a mano — no hay forma de automatizar hardware real en CI.

## Estructura del proyecto

```
src/
  core/      tipos, validador, parser de .zwo, cálculo de zonas
  engine/    reloj, plan del workout, métricas, motor de reglas, sesión, analítica (NP/IF/TSS), PMC
  devices/   Web Bluetooth: FTMS (rodillo) y Heart Rate (banda), más adaptadores simulados
  ui/        pantallas: inicio, conectar, entrenar, resumen, historial
  export/    generación de .fit, subida a intervals.icu
  storage/   IndexedDB: perfil, biblioteca de workouts, ajustes, sesiones grabadas
```

Regla dura de arquitectura: `engine/` no importa nada de `devices/` ni de `ui/` — el motor recibe muestras y emite eventos, y puede correr una sesión completa con datos simulados sin browser y sin hardware (ver `npm run simulate`).

## Qué NO hace (todavía, o a propósito)

- No tiene backend ni cuentas — todo vive en IndexedDB de tu navegador. Si cambias de dispositivo o borras datos del sitio, pierdes tu historial (no hay sincronización en la nube por ahora).
- No llama a ningún LLM — la app no tiene IA integrada. Hay un prompt (`prompt-editor-workout.md`) que puedes pegar en tu propia IA para generar workouts y reglas.
- No optimizada para celular — el objetivo es laptop.
- La subida a intervals.icu no está verificada contra la API real (falta probarla con una cuenta y una API key reales).
