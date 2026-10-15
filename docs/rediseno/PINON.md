# Piñón — la mascota del coach de IA

Piñón es la cara del **coach de IA** de Torq. Es un piñón de arcilla mate (el mismo
estilo del kit 3D) con ojos de eslabón de cadena y una boquita (el hueco del eje).
No es persona y no representa a Joe ni a ningún coach humano: es la voz de la app.

Referencia interactiva: `docs/rediseno/mockups/Pinon.dc.html` (la demo del canvas;
sus `/_blob/…` se mapean al final de este documento).

> **Orden:** esto es la **Fase 7** del rediseño. Va después de las fases 1–6 de
> `REDISENO.md` (tokens, Host Grotesk, kit 3D). Si los tokens nuevos todavía no
> existen en `styles.css`, haz primero la Fase 1. No adelantes otras fases.

## 1. Archivos

| Archivo | Tamaño | Uso |
|---|---|---|
| `public/brand/pinon/base.webp` | 198 × 240 | Quieto (ojos abiertos) |
| `public/brand/pinon/parpadeo.webp` | 198 × 240 | Ojos cerrados. **Mismo encuadre que `base`**: se intercambian sin brincar |
| `public/brand/pinon/habla.webp` | 194 × 240 | Hablando (boca abierta) |
| `public/brand/pinon/motiva.webp` | 240 × 221 | Celebrando |
| `public/brand/pinon/asoma.webp` | 340 × 189 | Solo ojos y dientes de arriba; borde de abajo recto. Mira a la **izquierda**; `scaleX(-1)` para la derecha |

Son versiones provisionales (chicas). Las finales en alta llegarán **con los
mismos nombres**, así que nada de código debe depender del tamaño en píxeles:
fija la **altura** en CSS y deja `width:auto`. Fondo transparente.

## 2. Estados

| Estado | Imagen | Cuándo |
|---|---|---|
| Quieto | `base` ↔ `parpadeo` | Avatar junto a cualquier mensaje del coach, después de "hablar" |
| Habla | `habla` | Mientras aparece el texto de un mensaje nuevo (máx. ~2 s), luego pasa a Quieto |
| Motiva | `motiva` | Logros: semana completa, FTP nuevo aceptado, récord de potencia |
| Se asoma | `asoma` | Aparece al azar por el borde de arriba de una tarjeta |

**Parpadeo:** un solo temporizador global (no uno por figura) que cada 3–5 s
(aleatorio) cambia todas las `.pinon[data-blink]` visibles a `parpadeo` durante
140 ms. Precarga `parpadeo.webp` al iniciar para que el primer parpadeo no
parpadee de verdad.

## 3. Módulo `src/ui/pinon.ts`

Todo Piñón vive en un módulo nuevo; las pantallas solo lo llaman.

```ts
export type PinonPose = 'base' | 'habla' | 'motiva';
/** <span class="pinon pinon--{pose}"><img …></span>. alt="" (es decorativo:
 *  el texto del mensaje ya está al lado). size = altura en px. */
export function pinonFigureHtml(pose: PinonPose, size: number): string;
/** Arranca el parpadeo global (idempotente). */
export function startPinonBlink(): void;
/** Asomarse: llamar después de renderizar cada pantalla (ver §5). Devuelve cleanup. */
export function schedulePinonPeek(screen: Screen, root: HTMLElement): () => void;
/** Burbuja flotante con Piñón (abrir tras clic en el asomado, o al celebrar). */
export function openPinonBubble(opts: { pose: PinonPose; title: string; text: string;
  action?: { label: string; href: string } }): void;
/** Puro y testeable: el consejo según el estado del atleta (ver §6). */
export function pinonTip(ctx: PinonTipContext): { text: string; action?: { label: string; href: string } };
/** Puro y testeable: ¿toca asomarse en esta pantalla? (ver §5). */
export function shouldPeek(screen: Screen, peeksToday: number, enabled: boolean, rand: number): boolean;
```

Estilos en `styles.css` bajo un bloque `/* ── Piñón ── */`. Clases con prefijo
`pinon-`. Colores siempre con tokens (`--accent`, `--bg`, `--surface`, `--text`…).

## 4. Dónde aparece

1. **Avatar en la burbuja del coach** (`coachBubbleHtml` en `src/ui/coach.ts`):
   Piñón de 56 px a la izquierda de `.coach-bubble`, en pose Quieto con parpadeo.
   Cuando la burbuja es nueva (acaba de llegar la respuesta de la Edge Function),
   pose `habla` ~1.5 s y luego `base`. La etiqueta (`aiCoachTitle()`) no cambia.
2. **Tarjeta del coach** (`.plan-coach-card` en Plan, estado vacío / "Crear plan"):
   Piñón de 96 px en pose Quieto junto al texto que invita a crear el plan.
3. **Logros** (`src/ui/achievement-toast.ts`): el toast de celebración muestra a
   Piñón en pose `motiva` (64 px) en lugar del emoji `icon`. El emoji se queda solo
   como respaldo si la imagen no carga. Animación de salto (2 rebotes) al entrar.
4. **Se asoma** en pantallas del atleta (§5).

**Nunca** aparece en: `train` (sesión en vivo), `prepare`, `login`, `limits`,
`invite`, ni en las pantallas `coach-*` (son del coach humano). Tampoco mientras
haya un modal abierto (`.modal-backdrop`, `.ob-modal`).

**Excepción: Piñón al rodar** (`src/ui/pinon-ride.ts`, pedida después de la
Fase 7). En `train` no se asoma ni abre burbujas. Solo sale en la esquina
derecha de la fila de cadencia y pulso, con mensajes de ánimo en hitos del
bloque o de la sesión y tras 4 min seguidos en zona. Sale como máximo cada
75 s, nunca encima de una alerta (se quita en cuanto sale una) y se apaga en
Perfil («Piñón al rodar»).

## 5. Se asoma (el comportamiento travieso)

**Dónde puede asomarse:** solo en elementos marcados con `data-pinon-perch`.
Márcalos tú (2–4 por pantalla): en `home` la tarjeta "Hoy toca" y la de la
semana; en `plan` la tarjeta de la semana y la del coach; en `form` las tarjetas
Fatiga/Forma/FTP; en `library` el encabezado de la lista. Solo tarjetas de ≥ 220 px
de ancho con el borde de arriba recto.

**Frecuencia** (`shouldPeek`):
- Pantallas permitidas: `home`, `plan`, `form`, `library`.
- 40 % de probabilidad por cada render de pantalla, máximo **1 asomada por render**
  y **4 por día** (contador en `localStorage` `torq.pinon.peeks.<AAAA-MM-DD>`).
- Apagado si `localStorage['torq.pinon.peek'] === 'off'` (interruptor en Perfil:
  "Piñón se asoma", encendido por defecto).
- `localStorage` siempre dentro de try/catch, como `achievement-toast.ts`.

**Cómo:**
1. Espera 6–15 s (aleatorio) después del render.
2. Elige un `[data-pinon-perch]` visible en el viewport, con su borde de arriba
   a ≥ 80 px del borde superior de la ventana. Si no hay ninguno, no hace nada.
3. Crea una capa `position:fixed` (z-index por debajo de modales y toasts) con un
   contenedor de 120 × 66 px y `overflow:hidden`, cuyo borde inferior coincide con el
   borde superior de la tarjeta, en una x aleatoria lejos de las esquinas
   redondeadas (≥ 28 px). Dentro, un `<button>` con la imagen `asoma` que sube de
   `translateY(100%)` a `0` en 450 ms (`cubic-bezier(.2,.9,.25,1.15)`), así parece
   que sale **de detrás** de la tarjeta.
4. Mira hacia el puntero: si el puntero está a la derecha del centro de Piñón,
   `scaleX(-1)`. Escucha `pointermove` solo mientras está asomado.
5. **Tímido:** si el puntero entra a 150 px de él a más de 1.3 px/ms, se esconde
   (baja en 300 ms) y esa asomada se termina. Si se acercan despacio, se queda; si
   el puntero está cerca, extiende su tiempo.
6. Se esconde solo a los 5 s, al hacer scroll, al cambiar el tamaño de la ventana
   o al cambiar de pantalla (el cleanup del router).
7. **Clic** (o Enter/Espacio): se esconde y abre `openPinonBubble` con
   `pinonTip(...)` en pose `habla`.
8. En pantallas táctiles no hay hover: aparece igual, se queda 6 s y un toque abre
   la burbuja.

Botón accesible: `aria-label="Piñón se asoma. Abrir consejo"`; mientras está
escondido, `tabindex=-1` y `aria-hidden="true"`.

## 6. La burbuja y sus consejos

`openPinonBubble`: panel flotante abajo a la derecha (en móvil, abajo, a lo
ancho, respetando `env(safe-area-inset-bottom)`), con Piñón de 120–160 px flotando
(sube y baja 8 px, 3.4 s) y una burbuja clara (`#FFF4EC`, texto `--bg`) con:
título pequeño en mayúsculas, el texto y hasta dos acciones (principal naranja,
secundaria "Luego"). El texto aparece letra por letra (~30 ms cada 2 letras)
mientras Piñón está en pose `habla`; al terminar pasa a `base` con parpadeo. Copia
completa en un `<span>` visualmente oculto con `aria-live="polite"` (el texto que
se va escribiendo lleva `aria-hidden`). Cierra con Esc, con "Luego" o con clic
fuera; al cerrar, el foco vuelve a donde estaba. Solo una burbuja a la vez.

**`pinonTip` no llama a la IA** (no gasta cuota de `coach-chat`): arma el consejo
con datos que la app ya tiene. Contexto:

```ts
interface PinonTipContext {
  todayWorkout?: { name: string; minutes: number; zone: WorkoutZone | null };
  weekDone: number; weekPlanned: number;   // entrenamientos de la semana actual
  tsb?: number;                            // de computePmc, si hay datos
  hasPlan: boolean; isRestDay: boolean;
}
```

Prioridad (el primero que aplique):
1. Hay entrenamiento hoy → «Hoy toca {name}, {minutes} min. {frase por zona}» +
   acción **Empezar a rodar** (el mismo flujo que el botón principal de Inicio).
2. Falta 1 para cerrar la semana → «Llevas {done} de {planned}. Una más y cierras
   la semana.» + **Ver mi plan**.
3. `tsb` < −20 → «Vienes cargado. Hoy suave o descanso, que el cuerpo también
   entrena cuando para.»
4. Día de descanso → «Hoy descansas. Mañana rodamos con piernas frescas.»
5. Sin plan → «¿Armamos tu plan? Te pregunto cuatro cosas y listo.» +
   **Crear plan** (abre el flujo existente de `coach.ts`, respetando
   `confirmAiWithHumanCoach`).
6. Si no, uno de 3–4 consejos genéricos de rodillo (ventilador, hidratación,
   cadencia), rotando.

Tono: español de México, de tú, cálido y breve (≤ 120 caracteres), sin emojis,
máximo un signo de exclamación. Nunca regaña ni culpa por entrenamientos perdidos.
Si el atleta tiene coach humano, nunca sugiere cambiar el plan: solo anima.

**Motiva:** al detectar semana completa (en Inicio, la primera vez que
`weekDone === weekPlanned > 0`; guarda `torq.pinon.motiva.<semana>` para no
repetir) abre la burbuja en pose `motiva` con título «¡SEMANA CERRADA!» y
«{planned} de {planned}. Así se construye la Forma.» + **Ver mi semana**.

## 7. Movimiento reducido y rendimiento

Con `prefers-reduced-motion: reduce`: sin parpadeo, sin flotar, sin rebotes, sin
deslizar (el asomado aparece y desaparece sin animar) y el texto aparece completo.
Imágenes con `loading="lazy"` y `decoding="async"` salvo `parpadeo` (precargada).
Sin dependencias nuevas.

## 8. Pruebas (vitest)

`src/ui/pinon.test.ts`:
- `shouldPeek`: pantallas no permitidas → false; tope de 4 al día; apagado → false;
  umbral 40 % con `rand`.
- `pinonTip`: cada rama de la prioridad, y que con coach humano nunca sugiera
  cambiar el plan.

## 9. Revisión antes del PR

- [ ] `npm run build` y `npm test` pasan.
- [ ] No aparece en `train`, `prepare`, `login`, `coach-*` ni con un modal abierto.
- [ ] El asomado sale de detrás del borde de la tarjeta (no flota encima).
- [ ] Base y parpadeo no brincan al cambiar.
- [ ] Teclado: Tab llega al asomado, Enter abre, Esc cierra, el foco regresa.
- [ ] Movimiento reducido: nada se anima.
- [ ] Interruptor en Perfil funciona y se recuerda.
- [ ] Móvil (375 px): burbuja sin desbordar, botones de ≥ 44 px.

## Apéndice — mapa del mockup

| En `Pinon.dc.html` | En el repo |
|---|---|
| `/_blob/2166ab69c5ff9f537b93a8366779584a` | `/brand/pinon/base.webp` |
| `/_blob/4a03e47a7382576601fab30730c319f0` | `/brand/pinon/parpadeo.webp` |
| `/_blob/a9089738b8efcae366c802ea0e5c047f` | `/brand/pinon/habla.webp` |
| `/_blob/f1cfc7134b2a55d5bd83ddd9d2247294` | `/brand/pinon/motiva.webp` |
| `/_blob/e39b6a1b1c2395c2c3fe6f754f38b285` | `/brand/pinon/asoma.webp` |
