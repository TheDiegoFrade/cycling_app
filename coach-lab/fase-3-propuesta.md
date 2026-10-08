# Fase 3 — propuesta de diseño: lo que analiza un coach de verdad

Para revisar antes de programar (el brief lo pide así). Responde a lo que
pidió el coach de Diego:
- curva de potencia;
- tiempo hasta la fatiga;
- desacople potencia-pulso visible;
- picos de 30 s, 1, 5, 8, 20 y 60 min;
- torque;
- variabilidad de FC;
- filtros de 1 semana, 1 mes, 3 meses y 6 meses;
- volumen;
- «cada persona es diferente».

Al final hay **6 decisiones** que necesito de ti.

## La idea en una frase

El código calcula una **ficha del atleta** por ventanas de tiempo. Esa misma
ficha alimenta tres cosas: la pantalla **Forma**, la **vista del coach
humano** y el **coach de IA**. La IA no calcula nada: interpreta números que
ya vienen hechos, con su fecha y su calidad.

```
 sesiones (samples) ──► métricas por sesión ──► sessions.metrics (nube)
                                                     │
                     ficha del atleta por ventana ◄──┘  (7 / 28 / 90 / 180 días)
                       │            │             │
                     Forma    vista del coach   coach de IA (athleteState)
```

## El problema de fondo: hoy la nube no alcanza para 3 y 6 meses

- Los segundo a segundo (samples) viven solo en el dispositivo donde se
  grabó la sesión. La nube guarda un resumen: NP, IF, TSS, EF, deriva y
  **solo 3 picos** (1, 5 y 20 min).
- Así, una ventana de 6 meses solo funciona en el dispositivo que tiene
  todas las sesiones, y el coach humano (que lee la nube) nunca vería
  torque, picos de 8 o 60 min ni tiempo a umbral.

**Propuesta:** una columna `sessions.metrics jsonb` con las métricas ya
calculadas de cada sesión (unos 600 bytes). Se llena al guardar la sesión y
se rellena hacia atrás:
- desde las sesiones locales que tienen samples (igual que el relleno que
  ya existe para los picos de 1/5/20 min en `cloud-sync.ts`);
- y desde los `.fit` guardados en Storage (`fit_path`), para las sesiones
  que solo están en la nube.

```jsonc
// sessions.metrics (por sesión)
{
  "v": 1,
  "curve": { "s5": 610, "s30": 480, "m1": 395, "m5": 310, "m8": 296, "m20": 268, "m60": 241 },
  "curveQuality": { "m20": "erg_fixed", "m5": "max_effort" },   // solo las ventanas no "incidental"
  "kJ": 812,
  "zoneSec": [1200, 2400, 600, 300, 60, 10],                    // Z1..Z6 de potencia
  "torque": { "avgNm": 31.2, "maxNm": 88.0, "lowCadenceMin": 6.5 },  // lowCadence = < 70 rpm con > 80 % FTP
  "threshold": { "longestMin": 12, "totalMin": 36 },            // ≥ 95 % FTP
  "steady": true                                                 // sirve para comparar desacople (ver 2)
}
```

## 1. Métricas nuevas por sesión (`analytics.ts`)

| Métrica | Cómo | Nota |
|---|---|---|
| Curva 8 min y 60 min | Se agregan 480 s y 3600 s a `POWER_CURVE_WINDOWS_S` (hoy 5, 30, 60, 300 y 1200) | 60 min solo existe en sesiones de 60 min o más |
| Torque | `9.549 × watts / rpm` (N·m) por segundo; media y máximo de los segundos con rpm > 0, y minutos a cadencia < 70 con > 80 % FTP | El rodillo ya da potencia y cadencia cada segundo; no necesita Garmin |
| Tiempo a umbral | Bloque continuo más largo y minutos totales a ≥ 95 % del FTP de la sesión (promedios de 30 s, con tolerancia de 10 s abajo) | Es el "time in zone" que usa el coach para ver cuánto aguanta |
| kJ | Suma de watts | Volumen real, no solo horas |
| Sesión estable | Duración ≥ 45 min, VI ≤ 1.05, IF entre 0.60 y 0.80 | Solo estas cuentan para comparar desacople y EF; si no, el desacople de unos intervalos se mezcla con el de una rodada de fondo |

**Calidad de cada pico** (el pedido del brief: un pico que no fue máximo se
marca, no se omite):
- `max_effort`: sale de un test (`kind: 'test'`) o de un bloque libre/ERG off
  al final del cual la potencia cae (el atleta se vació).
- `erg_fixed`: la ventana tiene potencia casi constante pegada al objetivo
  (la misma regla de `lastTest`, CV < 2 %).
- `incidental`: todo lo demás (lo que salió en un entrenamiento normal).
- `untested`: no hay ninguna sesión con esa duración en la ventana.

**Tiempo hasta la fatiga:** con los picos de 3 a 20 min de calidad
`max_effort` de los últimos 90 días se ajusta el modelo de potencia crítica
(CP y W′). Con eso se responde «¿cuánto aguanta a X W?», como
`W′ / (X − CP)`. Si no hay al menos 2 esfuerzos máximos de duraciones
distintas, no se calcula: un modelo hecho con picos incidentales engaña.

## 2. La ficha del atleta (`src/core/athlete-state.ts`)

Es una función pura sobre filas de sesión (locales o de la nube, con
`metrics`), con tests. La regla de «cuánta historia» vive aquí, no en el
modelo:
- una métrica con menos de 3 sesiones comparables en su ventana va como
  `null`;
- `aerobic` usa solo sesiones estables.

**Tamaño.** El formato del brief, como lo imprime hoy `buildUserMessage`
(JSON con sangría), pesa **≈ 1,600 tokens**; compacto, ≈ 850. Propongo
dejarlo en **≈ 460 tokens**, por debajo del objetivo de 700, con tres
cambios:
- los picos como `[watts, "MM-DD", calidad]` en vez de objetos;
- las zonas como un arreglo de 6 números;
- **sin picos en la ventana de 7 días**: en una semana casi nunca son
  máximos, y lo que importa ahí es la carga.

Y `athleteState` se serializa compacto aunque el resto del mensaje siga con
sangría.

```jsonc
"athleteState": {
  "historyWeeks": 26, "lastGap": { "days": 9, "endedOn": "2026-08-20" },
  "windows": {
    "d7":   { "hours": 6.4, "tss": 412, "kJ": 4820, "sessions": 5, "compliancePct": 92,
              "zoneHours": [1.1,3.2,0.9,0.8,0.3,0.1], "aerobic": null, "threshold": { "longestMin": 12, "weeklyMin": 36 } },
    "d28":  { "...": "...", "peaks": { "s30": [480,"09-30","incidental"], "m20": [268,"10-07","erg_fixed"], "m60": [null,null,"untested"] },
              "aerobic": { "decouplingPct": 3.1, "ef": 1.48, "n": 4 }, "torque": { "lowCadenceMin": 18 } },
    "d90":  { "...": "...", "cp": { "cpW": 252, "wPrimeKJ": 14.8, "from": ["06-12","08-03"] } },
    "d180": { "..." : "..." }
  }
}
```

**Va a:** `create_plan`, `weekly_eval`, `publish_block` y `coach_week`. En
`coach_week` la arma el cliente del coach con los datos que su vínculo le
deja leer; las sesiones de Strava nunca entran.

**Costo:** son tokens de entrada, a unos $0.001 por llamada con Sonnet. Lo
caro sigue siendo la salida, que no cambia.

## 3. Pantalla Forma con ventanas (y vista del coach)

- **Selector** arriba: 1 semana · 1 mes · 3 meses · 6 meses. Se recuerda en
  el navegador.
- **Curva de potencia** de la ventana contra la ventana anterior del mismo
  largo (línea punteada). Los picos `erg_fixed` y `incidental` se dibujan
  con otro trazo, y los que no se han probado no se dibujan.
- **Tarjetas de picos** 30 s · 1 · 5 · 8 · 20 · 60 min, con fecha y una
  etiqueta si no fue un máximo.
- **Desacople potencia-pulso**: un punto por sesión estable, con la banda de
  "< 5 % = buena base".
- **Torque**: minutos a cadencia baja con carga por semana. Es lo que
  importa en MTB, y con rodilla delicada es una alerta.
- **Tiempo a umbral**: bloque más largo y minutos por semana.
- **Volumen**: barras de horas, TSS y kJ por semana, más la distribución
  por zonas.
- **Tiempo hasta la fatiga** (si hay CP): «a 270 W aguantas ≈ 18 min».

La misma pantalla, en modo lectura, en la ficha del atleta de la vista del
coach (`coach-athlete.ts`).

## 4. Expediente del atleta (`athleteNotes`)

Texto corto (máximo 1,200 caracteres) con lo que hace única a esa persona:
- cómo responde;
- qué sesiones se le caen;
- cuántas semanas de carga aguanta;
- qué le molesta.

Va en los seis modos, y el prompt v2 ya le da prioridad sobre las reglas
generales.

```sql
create table athlete_notes (
  athlete_id uuid primary key references auth.users on delete cascade,
  body text not null check (char_length(body) <= 1200),
  updated_by text not null check (updated_by in ('coach', 'ai')),
  updated_by_user uuid references auth.users,
  updated_at timestamptz not null default now()
);
-- RLS: el atleta lo lee; su coach activo lo lee y lo edita; la IA escribe con service role.
```

- **Con coach humano:** lo edita en su vista. `monthly_review` propone un
  cambio (campo de salida `notesUpdate`) y el coach lo aprueba o lo edita
  antes de que se guarde.
- **Sin coach:** cada 4 evaluaciones semanales, `weekly_eval` propone una
  actualización y se guarda sola, marcada como "ai".

**Riesgo y cómo acotarlo.** Si la IA reescribe su propio expediente semana
a semana, un error se queda pegado y se repite. Tres frenos:
- la IA solo agrega observaciones con un dato que las respalde («3 semanas
  seguidas con RPE 9 en umbral»);
- nunca borra lo que escribió un coach;
- el atleta puede verlo y borrarlo.

## 5. Variabilidad de frecuencia cardiaca

Dos caminos, en este orden:

1. **Guardar los intervalos RR desde ya**, aunque todavía no se analicen.
   - La banda los manda en la misma característica de pulso (0x2A37, bit 4
     de las banderas) y hoy `parseHeartRateMeasurement` los descarta.
   - El parser de `.fit` también podría leer el mensaje `hrv` (número 78)
     que graba un Garmin.
   - Se guardan en la sesión local (≈ 9,000 números en una hora a 150 lpm) y en el
     `.fit` subido; no van a la base de datos.
   - Con eso, después se puede calcular DFA-α1 (umbral aeróbico durante el
     ejercicio, ver la investigación) sin pedirle nada nuevo al atleta.
2. **HRV de reposo y sueño vía intervals.icu**, si decides integrarlo:
   `wellness: { hrv7d, hrvBaseline60d, hrvStatus, restingHr7d, sleepH7d }`.
   - Es la señal de fatiga más útil que no tenemos.
   - Pero exige una integración nueva (clave API del atleta) y revisar sus
     términos: si los datos vienen de Strava a través de intervals.icu,
     aplica la misma prohibición de usarlos con IA.

## Orden propuesto (commits chicos, cada uno con tests)

| Paso | Qué | Depende de |
|---|---|---|
| 3.1 | Métricas nuevas en `analytics.ts` + `sessions.metrics` + relleno desde sesiones locales | — |
| 3.1b | Relleno desde los `.fit` de Storage | 3.1 |
| 3.2 | `athlete-state.ts` (ventanas, calidad de picos, CP) + mandarlo a los 4 modos, compacto + escenarios | 3.1 |
| 3.3 | Forma con ventanas y gráficas; misma vista para el coach | 3.2 |
| 3.4 | `athlete_notes`: tabla, editor del coach, propuesta de `monthly_review`/`weekly_eval` | — |
| 3.5 | Guardar RR (banda y `.fit`) | — |
| 3.5b | intervals.icu | tu decisión |

3.4 y 3.5 no dependen de lo demás. Si quieres algo visible pronto, 3.1 →
3.3 es la ruta; si quieres que el coach mejore pronto, 3.1 → 3.2.

## Decisiones que necesito de ti

1. **¿Guardamos `sessions.metrics` en la nube?** Recomiendo que sí: sin eso,
   las ventanas de 3 y 6 meses solo existen en un dispositivo y el coach
   humano no las ve.
2. **¿Relleno desde los `.fit` de Storage?** Leer los `.fit` viejos para
   calcular métricas cuesta tiempo de proceso, una vez.
3. **¿La regla de calidad de los picos te convence?** Es decir, qué cuenta
   como esfuerzo máximo y qué como incidental. Conviene validarla con tu
   coach.
4. **Expediente:** ¿lo puede ver el atleta? Y sin coach humano, ¿lo
   actualiza la IA sola cada 4 semanas, o solo lo escribe el atleta?
5. **intervals.icu:** ¿lo integramos (HRV de reposo y sueño), o por ahora
   solo guardamos RR?
6. **Formato compacto de `athleteState` (≈ 460 tokens)** en lugar del
   formato del brief (≈ 850-1,600). Cambia la forma que espera el prompt:
   habría que ajustar una frase en "Cuánta historia mirar".
