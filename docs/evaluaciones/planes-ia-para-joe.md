# Planes del coach IA para que Joe los evalúe
20 de octubre de 2026 · 10 personas con el cuestionario completo, como lo llena la app hoy. Cada plan lo creó el **coach IA real de producción** (`coach-chat`, modo crear plan) con la cuenta de pruebas. Es exactamente lo que vería una persona nueva en Torq, sin historial.

**Cómo leer cada sesión:** los porcentajes son del FTP (entre paréntesis, los watts si la persona tiene FTP). «3× (5' @ 90% + 3' @ 55%)» = 3 repeticiones de 5 min al 90% con 3 min al 55%. TSS ≈ estimado. El texto en cursiva es la descripción que ve el atleta.

**Perfil de arranque:** antes de llamar a la IA, el código de Torq aplica tus reglas de la evaluación de salud y hábitos (`src/core/intake.ts`): si va primero el médico, si puede hacer un esfuerzo máximo, qué test toca y si arranca conservador. La IA está obligada a respetarlo. Va en cada perfil para que veas si la regla y el plan cuadran.

## Preguntas para Joe sobre las reglas

- **Alcohol 1–2 veces por semana.** Hoy cuenta igual que tomar seguido: sube el estrés un nivel y pone «base aeróbica antes de intensidad». Por eso Carlos (Master 40, con experiencia, duerme 7 h bien) arranca conservador y sin intensidad. ¿Así lo quieres, o solo debería contar a partir de 3 veces por semana? (La regla está marcada como provisional en el código.)
- **Sueño de 6 h exactas** no cuenta como «poco sueño» (el corte es menos de 6 h); sí cuenta si la calidad es mala. ¿El corte está bien?

## Resumen

| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |
|---|---|---|---|---|---|
| 01 | [Ana López](#p01) | Oficinista sin experiencia, quiere bajar de peso y tener energía | sin test · arranque conservador · base primero | — | 2 sesiones · 1.3 h |

---

<a id="p01"></a>
## 01. Ana López — Oficinista sin experiencia, quiere bajar de peso y tener energía

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 34 años · mujer · 68 kg |
| **Disciplina** | Sin disciplina (salud / general) · no compite |
| **Experiencia** | Nuevo en el ciclismo · Sedentario · 0 años rodando · 0 con plan estructurado |
| **FTP** | No lo sabe |
| **FC máxima** | No la sabe · reposo: no sabe |
| **Últimas 4 semanas** | poco o nada, ~0 h/sem |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 6.5 h (calidad regular) · estrés alto · fuma: no · alcohol: 1–2 veces por semana |
| **Esfuerzo** | ¿Sabe usar RPE?: no · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 2.5 h/sem · lunes, miércoles, viernes · máx 45 min por sesión |
| **Su objetivo (textual)** | «Quiero bajar 5 kg y tener más energía. Trabajo en oficina todo el día y nunca he entrenado en serio. Compré un rodillo para hacer ejercicio en casa.» |

**Perfil de arranque (reglas de Torq):** sin test: por sensación, subiendo de a poco · arranque conservador · base aeróbica antes de intensidad (tabaco/alcohol) · enseñarle a usar RPE · no hace máximos porque: viene de estar sedentario; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Primeros pedales: base y hábito · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base 1: hábito y sensación | 4 | 1.8 | Tres rodadas de 30-40 min por sensación (RPE 3-4) para que el rodillo se vuelva rutina y aprendas a medir tu esfuerzo. Sube el volumen poco a poco, con una semana de descarga al final. |
| Base 2: más tiempo, primeros cambios de ritmo | 4 | 2.1 | Rodadas de 40-45 min con cambios de ritmo suaves y un primer esfuerzo un poco más alto por sensación (RPE 6-7) hacia la semana 7, siempre subiendo de a poco. |
| Construcción: constancia y energía | 4 | 2.3 | Un día de calidad por sensación a la semana (intervalos cortos RPE 7) y dos de fondo. Repasamos cómo vas con tu meta, todo guiado por sensación. |

**Lo que le dice el coach al atleta:**

> Ana, para tu meta de bajar peso y tener más energía lo que más importa es la constancia: tres rodadas suaves por semana, de 30 a 40 min, caben en tu tiempo (3 días × 45 min es tu tope, y tus 2.5 h no entran completas, así que planeo lo que sí cabe). Vienes de vida sedentaria y sin bici, así que arrancamos construyendo base y aprendiendo a medir el esfuerzo: 3-4 = puedes platicar, 6-7 = solo frases cortas, 8-9 = pocas palabras, 10 = no puedes más. Todo es por sensación, sin ERG y sin test: metemos esfuerzos un poco más altos poco a poco. Como duermes algo justo y tu estrés es alto, vamos conservadores. Como tu pérdida de peso depende también de la comida, eso se ve mejor con un nutriólogo; yo me ocupo de que pedalees con constancia y sin lesionarte.

#### Semana 1 · 2 sesiones de rodillo · 1.3 h · TSS ≈ 41

- **miércoles 21 oct — Rodada suave 1: conocer el rodillo** · 35 min · TSS ≈ 19 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 23' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Hoy es un día para subirte a la bici sin presión: 35 minutos de rodada suave para conocer el rodillo. Déjalo con ERG apagado y elige una resistencia que te permita platicar en frases completas; la cadencia que te salga natural está bien, la app la va a observar. Tu referencia es el RPE 3-4, un esfuerzo cómodo en el que la respiración va pareja. Si sientes que no puedes hablar, baja la resistencia sin dudarlo. Así arrancas la semana con las piernas despiertas para lo que viene._

- **viernes 23 oct — Rodada suave 2: platicando** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 28' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Hoy repites la idea de la rodada anterior, pero un poquito más larga: 40 minutos a ritmo tranquilo. Deja el ERG apagado y pedalea por sensación, manteniéndote en RPE 3-4, donde puedes platicar sin problema. Si el ritmo empieza a sentirse como frases cortas o pocas palabras, es señal de bajar un poco. Al terminar, marca tu RPE en la app para que el coach pueda ajustar mejor tus próximas sesiones. Es una buena forma de cerrar la semana con sensaciones claras._

#### Semana 2 · 3 sesiones de rodillo · 2 h · TSS ≈ 68

- **lunes 26 oct — Fondo 1** · 42 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Arranca la semana con una rodada tranquila, de esas que se disfrutan sin prisa. Va por sensación, sin ERG: deja que la bici marque el ritmo y pedalea a una cadencia natural. Tu referencia es poder hablar en frases completas todo el tiempo; si te falta el aire, baja la resistencia un poco. Con esto las piernas se despiertan suave para lo que viene el miércoles._

- **miércoles 28 oct — Fondo con cambios suaves** · 39 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - 3× (2' @ 70% + 7' @ 60%)
  - Enfriamiento 5' @ 55→45%
  - _Una rodada de fondo con unos cambios de ritmo suaves para despertar las piernas sin apretar de más. Va sin ERG, por sensación: en cada cambio sube a un ritmo más vivo, donde todavía puedes hablar, aunque con frases más cortas, y luego vuelve a un ritmo cómodo antes del siguiente. Si sientes que los cambios se te van de las manos, bájalos un poco y listo. Esto te deja con buenas piernas para el viernes._

- **viernes 30 oct — Fondo 2** · 37 min · TSS ≈ 21 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 25' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Cierra la semana con una rodada tranquila, pensada para sumar kilómetros de calidad sin desgastarte. Va sin ERG, a tu cadencia natural y con sensación cómoda: que puedas hablar en frases completas durante todo el recorrido. No busques velocidad, lo que vale aquí es la constancia de estos tres días._

#### Semana 3 · 3 sesiones de rodillo · 2.1 h · TSS ≈ 72

- **lunes 2 nov — Fondo 1** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 29' @ 60%
  - Enfriamiento 4' @ 55→45%
  - _Hoy toca una rodada tranquila de 40 minutos, sin ERG: sales por sensación, a un ritmo en el que puedas platicar todo el rato. Si prefieres ERG, lo prendes con el botón ⚡, pero aquí lo que manda es tu cuerpo, no el rodillo. Es la base que sostiene tu energía de todos los días, así que no te preocupes por ir rápido. Sientes las piernas sueltas y la respiración tranquila; si empiezas a jadear, baja un poco. Este entreno te deja fresca para el resto de la semana._

- **miércoles 4 nov — Fondo con cambios de ritmo** · 43 min · TSS ≈ 26 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - 4× (2' @ 70% + 6' @ 60%)
  - Enfriamiento 4' @ 55→45%
  - _Hoy vienen cuatro cambios de ritmo de 2 minutos entre rodada tranquila, sin ERG, así que tú controlas cada esfuerzo. En los cambios sube a un ritmo en el que puedas decir frases cortas, y en la rodada vuelve a bajar hasta sentirte cómodo. Si prefieres ERG, lo prendes con el botón ⚡, aunque aquí se trata de regular tú la intensidad. Espera sentir las piernas calientes y la respiración más marcada en los cambios, pero que se recupere en cada fondo. Si en el último cambio ya te cuesta hablar, bájale un poco y anótalo para tu coach._

- **viernes 6 nov — Fondo 2** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 7' @ 50→60%
  - Constante 29' @ 60%
  - Enfriamiento 4' @ 55→45%
  - _Hoy es otra rodada de 40 minutos en ritmo cómodo, sin ERG, para sumar constancia. Sales por sensación y te mantienes en un esfuerzo en el que puedas platicar sin problema. Si esta semana ha sido pesada o dormiste poco, quédate en la parte baja del esfuerzo; no hace falta exigirte. Si quieres ERG, lo prendes con el botón ⚡, pero la referencia sigue siendo cómo respiras. Terminas con buenas sensaciones y listo para el fin de semana._

**Evaluación de Joe** (llenar):

| Pregunta | Calificación (1–5) | Comentario |
|---|---|---|
| ¿El arranque es adecuado para esta persona (ni muy fuerte ni muy suave)? | | |
| ¿Respeta su salud, lesiones y hábitos? | | |
| ¿El volumen y los días cuadran con su disponibilidad y sus otras actividades? | | |
| ¿Las sesiones (intensidades, duración, estructura) tienen sentido para su objetivo? | | |
| ¿El test (o no hacer test) es la decisión correcta? | | |
| ¿Lo que le explica el coach es claro y correcto? | | |
| **¿Se lo darías tal cual a un atleta tuyo?** (sí / con cambios / no) | | |

**¿Qué cambiarías?**

&nbsp;

---

## Cómo se generó

- Perfiles: `scripts/coach-sim/perfiles-data.mjs` (cuestionario completo: salud y hábitos, otras actividades, FTP medido / provisional / sin dato).
- Corrida: `node scripts/coach-sim/perfiles.mjs` contra producción con la cuenta de pruebas. Respuestas completas en `scripts/coach-sim/out/perfiles/`.
- Validación sin IA: `perfiles-check.ts` (mismo schema del servidor y perfil de arranque).