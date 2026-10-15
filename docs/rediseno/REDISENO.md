# Rediseño Torq · Sol‑plato + objetos 3D

Brief para implementar el nuevo diseño en el repo. Está escrito para quien
programa, no para quien diseña: dice qué cambia, en qué archivo, y qué NO se
toca.

La referencia visual exacta está en `docs/rediseno/mockups/*.dc.html`. Son las
pantallas del canvas de diseño con su HTML y sus estilos inline. Ábrelas como
texto: cada valor de color, tamaño y radio que aparece ahí es el que se busca.
No son componentes para copiar tal cual: usan una sintaxis de plantillas
(`{{…}}`, `sc-if`, `sc-for`, `dc-import`) que no existe en el repo. Tradúcelas
al estilo del repo: TypeScript que arma HTML, más clases en `src/ui/styles.css`.

---

## 0. Reglas que no se negocian

1. **Lo funcional manda.** No cambia ningún flujo, ruta, dato ni texto de
   negocio. Es un cambio de piel. Si algo del mockup choca con cómo funciona
   hoy la app, gana la app, y se anota en el PR.
2. **Abrir y rodar en dos clics.** Inicio → «Empezar a rodar» → Antes de
   empezar → «Empezar». Nada nuevo se mete en ese camino.
3. **Sin personajes.** Ningún ciclista 3D ni muñeco. La única persona es la
   ilustración del login (hombre o mujer), que ya existe.
4. **Accesible.** Contraste AA en texto; objetivos táctiles de 44 px o más;
   toda animación se apaga con `prefers-reduced-motion: reduce`. Los objetos
   3D son decorativos: `aria-hidden="true"` o `alt=""`.
5. **Pruebas verdes.** `npm test` y `npm run build` pasan en cada PR.

---

## 1. Tokens: cambiar `:root` en `src/ui/styles.css`

Se cambian los valores y se conservan los nombres actuales, para no tocar las
5,700 líneas de CSS. Las variables nuevas van al final del bloque.

| Variable | Hoy | Nuevo |
|---|---|---|
| `--bg` | `#000000` | `#0B0D1A` (noche) |
| `--surface-nav` | `#0e0f12` | `#0E1122` |
| `--surface` | `#15171b` | `#141829` |
| `--surface-sunken` | `#0b0c0f` | `#10142A` |
| `--surface-active` | `#1a1d23` | `#1C2240` |
| `--border` | `#1c1f25` | `#1E2440` |
| `--border-control` | `#2f343d` | `#2A3150` |
| `--text` | `#f2f4f7` | `#F2F4FA` (hueso) |
| `--text-soft` | `#c5cad3` | `#C9D3F5` |
| `--text-muted` | `#8b93a1` | `#A9B1CC` (para texto chico usa éste; `#7F88A8` solo en etiquetas de 12 px en mayúsculas) |
| `--accent` | `#3d8bff` | `#FF6A1F` (plato) |
| `--accent-light` | `#8fbfff` | `#FF8A4C` |
| `--on-accent` | `#000000` | `#0B0D1A` |
| `--success` | `#22c58b` | `#3FE08A` |
| `--danger` | `#ff4d4d` | `#FF4D5E` |
| `--z1` … `--z6` | — | `#8A91AD` `#4C8DFF` `#3FE08A` `#FFC24A` `#FF8A3D` `#FF4D5E` |
| `--font-display` | Barlow Condensed | `'Host Grotesk', sans-serif` |
| `--font-body` | Archivo | `'Host Grotesk', sans-serif` |
| `--radius-lg` / `--radius-xl` | 14 / 18 | 18 / 24 |

Nuevas:

```css
--sol: #FFC24A;      /* ámbar del sol */
--brasa: #E8392B;    /* rojo de la base del sol */
--card: #11152A;     /* tarjetas de día, filas de historial */
--card-hover: #1A1F38;
--radius-2xl: 28px;  /* hero de Inicio */
```

**Ojo con el azul.** Hoy el azul es el acento de acción, y en el diseño nuevo
el azul es solo la zona 2. Busca usos directos de `--accent` en gráficas de
potencia y zonas (`home-week-zonebar`, `workout-cover`, `analysis-panel`,
`chart-hover`, `train.ts`). Donde el azul signifique «Z2», cámbialo a `var(--z2)`
antes de cambiar el token, o esas gráficas se van a volver naranjas.

**Fuente.** En `index.html`, cambia el `<link>` de Google Fonts por:
`family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap`.
Cuida los números tabulares (`.num`): Host Grotesk los soporta con
`font-variant-numeric: tabular-nums`. Los títulos grandes llevan peso 600 y
`letter-spacing: -0.04em` a `-0.055em`. La palabra «torq» va en 800 itálica,
pero en la app ya se usa la imagen del logo.

---

## 2. Recursos: `public/brand/`

```
node scripts/fetch-brand-assets.mjs
```

Ese comando descarga los originales en alta resolución. Ya vienen copias
chicas de respaldo, así que la app funciona aunque no lo corras, pero
córrelo antes de publicar.

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo-torq.webp` | Palabra «torq» 3D, atardecer, fondo transparente | Menú lateral abierto, login |
| `escena-hoy.webp` | Escena nocturna con el sol‑plato (2688×1520) | Fondo de «Hoy toca» en Inicio |
| `obj-end.webp` | Meseta azul | Z2 / Endurance / Larga |
| `obj-ss.webp` | Dos bloques verdes | Sweet spot / Tempo (Z3) |
| `obj-ftp.webp` | Pico ámbar | Umbral (Z4) |
| `obj-vo2.webp` | Cinco picos naranjas | VO2max / anaeróbico (Z5–Z6) |
| `obj-rec.webp` | Loma gris | Recuperación (Z1) |
| `obj-moon.webp` | Luna sobre nube | Día de descanso |
| `obj-trainer.webp` | Rodillo | Sensor rodillo |
| `obj-hr.webp` | Banda de pulso | Sensor pulso |
| `obj-bolt.webp` | Rayo | FTP (Forma, Perfil) |
| `obj-trophy.webp` | Trofeo‑plato | Logros / récords |
| `login-subirse.mp4` | 6.6 s: se sube al rodillo y arranca | Opcional, fase 6 |

Fuerza/movilidad todavía no tiene objeto 3D. Mientras tanto usa una bolita
`radial-gradient(#626B99 → #2A3150 → #1A1F38)` con una mancuerna SVG blanca
encima (está en los mockups, `T.fuerza`).

### Qué objeto le toca a cada workout

Un helper nuevo, `src/ui/workout-token.ts`:

```ts
export type Token = 'end' | 'ss' | 'ftp' | 'vo2' | 'rec' | 'moon' | 'fuerza';
// Por plantilla (src/core/workout-templates.ts):
//   z2 → end · recovery → rec · sweet_spot → ss · threshold → ftp · vo2max → vo2
// Por bloques (workouts importados, del coach o de Strava): la zona del bloque
// de trabajo más intenso que dure ≥ 2 min, con %FTP:
//   <56 rec · <76 end · <88 ss · <106 ftp · ≥106 vo2
// Día sin sesión → moon · sesión registrada de fuerza/movilidad → fuerza
export function tokenFor(...): Token
export function tokenUrl(t: Token): string // '/brand/obj-<t>.webp'
```

Ponle pruebas en Vitest. Es lógica pura y es lo único nuevo con lógica en
todo el rediseño.

### Microinteracciones (CSS compartido)

```css
.tk { display:block; background:center/contain no-repeat;
      filter: drop-shadow(0 10px 12px rgba(0,0,0,.55));
      transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.lift:hover .tk, .lift:focus-visible .tk { transform: translateY(-6px) rotate(-5deg) scale(1.08); }
.bob { animation: bob 4.5s ease-in-out infinite; }
@keyframes bob { 0%,100% { transform: translateY(0) rotate(-2deg) } 50% { transform: translateY(-9px) rotate(2deg) } }
@media (prefers-reduced-motion: reduce) { .bob { animation: none } .tk { transition: none } }
```

`.bob` solo va en UN objeto por pantalla, el protagonista (el de hoy, o el
del día seleccionado). Lo demás se queda quieto hasta el hover.

---

## 3. Fases (un PR por fase)

### Fase 1 · Base: tokens, fuente, logo, menú

- `styles.css`: tokens de la sección 1. Primero cambia los usos de azul-como-Z2.
- `index.html`: fuente Host Grotesk.
- `src/ui/sidebar.ts` (mockup `Sidebar.dc.html`):
  - Abierto: `logo-torq.webp` de 99 px de ancho, como link a Inicio. Quita el texto «torq».
  - Plegado (76 px): se queda el ícono actual del sol (no el logo 3D).
  - Ítem activo: fondo `--surface-active`, ícono con trazo `--accent`.
  - Bloque «Sensores» (`sidebar-sensor-row`): a cada fila se le agrega su objeto
    (`obj-trainer` / `obj-hr`) de 34 px en lugar del `status-dot`. Sin conectar va
    con `opacity:.6; filter:grayscale(.6)`; conectado, a color. El texto del
    estado se queda. Las filas siguen siendo botones que conectan por
    Bluetooth: no cambies su comportamiento.
  - La tarjeta «Tu coach» (`sidebar-coach-card`) usa el mismo estilo de tarjeta.
- Revisa que el resto de pantallas siga legible con los tokens nuevos. Solo
  ajusta lo que se rompa; no las rediseñes todavía.

### Fase 2 · Inicio (`src/ui/screens/home.ts`, mockup `Inicio.dc.html`)

- **Hoy toca:** la tarjeta hero mide 540 px de alto y usa `--radius-2xl`.
  - Fondo: `escena-hoy.webp` con `object-fit:cover; object-position:68% 50%` y un
    `drift` muy lento (22 s, escala de 1.06 a 1, se apaga con reduced-motion).
  - Encima, un degradado izquierdo: `linear-gradient(90deg, rgba(11,13,26,.92) 0%, rgba(11,13,26,.7) 34%, transparent 62%)`.
  - Columna de texto a la izquierda: saludo, nombre del workout (60–104 px),
    objeto del workout con `.bob` y meta (min · W · zona).
  - Abajo, el CTA: una píldora naranja de 68 px de alto con ▶ y el texto
    «Empezar a rodar». Hace exactamente lo mismo que el botón ▶ actual
    (`home-play-btn`), que lo reemplaza. Debajo, en gris, una pista: «Rodillo
    sin conectar · se conecta en el siguiente paso», o «Rodillo y pulso
    conectados» si ya lo están.
  - Respeta todos los estados que ya existen: varios workouts («elige uno»),
    nada agendado y banner de sesión cortada.
- **Esta semana:** 7 fichas de 72 px o más, cada una con el día, su objeto de
  46 px y una palomita verde si está hecha. Hoy lleva anillo naranja.
  Conserva los números (entrenamientos/horas/TSS) y la barra de tiempo por
  zona, que son útiles. Las fichas reemplazan solo a `home-week-days`.
- **Generar workout:** cada `plan-chip` de plantilla se vuelve una tarjeta de
  112 px con su objeto de 54 px arriba y el nombre abajo. La seleccionada lleva
  borde naranja. El resto del formulario queda igual.
- La ilustración hombre/mujer de Perfil sigue aplicando al **login**. En
  Inicio la sustituye la escena. Actualiza el texto de ayuda en `perfil.ts` si
  dice «Login e Inicio».

### Fase 3 · Plan (`src/ui/screens/calendar.ts`, mockup `Plan.dc.html`)

- **Semana:** 7 tarjetas (`minmax(118px,1fr)`; en móvil, scroll horizontal).
  - Cada tarjeta lleva: día (HOY en naranja), objeto de 92 px con sombra
    elíptica de piso, nombre y «min · TSS». Hecho = palomita.
  - Al pasar el mouse: `perspective(700px) rotateX(8deg) translateY(-3px)`.
  - La seleccionada lleva fondo `--card-hover` y anillo naranja.
- Debajo, el panel del día seleccionado: objeto de 128 px con `.bob`, título,
  meta, el perfil del workout en zonas (el `workout-cover` actual sirve), nota
  del coach y las mismas acciones de hoy (Entrenar / mover / registrar).
- **Mes:** en cada celda, el objeto de 40 px en lugar de la mini gráfica.
  Los días pasados van con opacidad .55.
- No cambies la lógica de semanas del coach, Evaluar semana, Importar,
  Strava ni Biblioteca: solo cómo se ven.

### Fase 4 · Antes de empezar (`src/ui/screens/connect.ts`, mockup `Preparar.dc.html`)

- Las filas de sensores llevan su objeto de 64 px a la izquierda. Sin conectar
  van en gris; conectado, a color con `.bob` y un halo verde suave.
- La tarjeta «Vas a entrenar» lleva el objeto del workout arriba a la derecha.
- El botón Empezar y su lógica de habilitado no cambian.

### Fase 5 · Forma e Historial

- **Forma** (`renderForma` en `history.ts`, mockup `Forma.dc.html`):
  - Fatiga, Forma y FTP pasan a ser tarjetas `--card` con un objeto en la
    esquina: `obj-vo2`, `obj-ss` y `obj-bolt` (este último con `.bob`).
  - La tarjeta de FTP lleva un fondo cálido sutil:
    `linear-gradient(135deg,#2A1A12,#11152A 70%)`.
  - La gráfica PMC se queda; solo cambia de colores con los tokens.
- **Historial** (`library.ts`, mockup `Historial.dc.html`): cada fila lleva el
  objeto de 44 px antes del nombre. Al pasar el mouse, el objeto se inclina.
  Se conserva la mini gráfica de planeado (punteada) contra lo hecho.
- **Logros / Rachas y récords:** `obj-trophy`.

### Fase 6 · Pendientes (sin diseño cerrado todavía)

- **Sesión en vivo (`train.ts`) y Resumen (`summary.ts`).** Por ahora solo
  heredan tokens y fuente. Revisa que las alertas grandes sigan leyéndose a
  2 m de distancia, que es lo más importante de esa pantalla. No le metas
  objetos 3D.
- **Login con video** (`login.ts`): `login-subirse.mp4` se reproduce una vez,
  con `muted`, `playsinline` y `poster="login-escena-hombre.webp"`, y se queda
  en el último cuadro. Falta un loop de pedaleo bueno y la versión mujer, así
  que no lo actives hasta que existan. Con reduced-motion se ve solo el poster.

### Fase 7 · Piñón, la mascota del coach de IA

Todo está en `docs/rediseno/PINON.md`, con sus imágenes en `public/brand/pinon/`
y la demo en `mockups/Pinon.dc.html`. Va en su propio PR.

---

## 4. Cómo revisar cada PR

- Capturas de escritorio (1440 px) y móvil (390 px) de las pantallas tocadas,
  junto al mockup.
- El tab de teclado recorre todo y se ve el foco (`outline` naranja).
- Con `prefers-reduced-motion` activo no se mueve nada.
- Ningún objeto 3D pasa de 92 px en listas; el peso total de `/brand` debe
  quedar por debajo de ~1.5 MB.
- `npm test` y `npm run build` pasan.

---

## Anexo · Las URL `/_blob/…` de los mockups

Los mockups apuntan a recursos del canvas. Su equivalente en el repo:

| En el mockup | En el repo |
|---|---|
| `/_blob/2d7bacf49b2e427b53e401e19b0f387c` | `/brand/escena-hoy.webp` |
| `/_blob/fa445c8b0bfbd44f1286236cad318e02` | `/brand/logo-torq.webp` |
| `/_blob/8cdaf45c0a131a708795625d5eb2a17f` | `/brand/obj-end.webp` |
| `/_blob/4a39691785bd530ad1a80dee35d911f0` | `/brand/obj-ss.webp` |
| `/_blob/f5e1bb068fffae6ed39225391bd64edc` | `/brand/obj-ftp.webp` |
| `/_blob/7979febf3ce233c85ea9e1dde580903d` | `/brand/obj-vo2.webp` |
| `/_blob/97c5ab1bf9039846a23e32be3943a7a1` | `/brand/obj-rec.webp` |
| `/_blob/34634d9dd5f1c08358508c44e182d71b` | `/brand/obj-moon.webp` |
| `/_blob/379d4e39942097c1efdb6648d8dd74a7` | `/brand/obj-trainer.webp` |
| `/_blob/66c0ccfd5781e25d6d9d54dcaae9e657` | `/brand/obj-hr.webp` |
| `/_blob/cbfb672bfccc52ba6893bfbd10e34a31` | `/brand/obj-bolt.webp` |
