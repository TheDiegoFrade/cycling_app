# Planes del coach IA para que Joe los evalúe
20 de octubre de 2026 · 10 personas con el cuestionario completo, como lo llena la app hoy. Cada plan lo creó el **coach IA real de producción** (`coach-chat`, modo crear plan) con la cuenta de pruebas. Es exactamente lo que vería una persona nueva en Torq, sin historial.

**Cómo leer cada sesión:** los porcentajes son del FTP (entre paréntesis, los watts si la persona tiene FTP). «3× (5' @ 90% + 3' @ 55%)» = 3 repeticiones de 5 min al 90% con 3 min al 55%. TSS ≈ estimado. El texto en cursiva es la descripción que ve el atleta.

**Perfil de arranque:** antes de llamar a la IA, el código de Torq aplica tus reglas de la evaluación de salud y hábitos (`src/core/intake.ts`): si va primero el médico, si puede hacer un esfuerzo máximo, qué test toca y si arranca conservador. La IA está obligada a respetarlo. Va en cada perfil para que veas si la regla y el plan cuadran.

**Qué es de quién:** el plan, las sesiones y la nota al atleta los escribió el coach IA (textual). Las secciones «Por qué tomó estas decisiones» y «Hallazgos» son un análisis aparte, hecho leyendo cada plan contra el perfil: la IA no entrega un razonamiento propio además de su nota.

## Hallazgos y preguntas (análisis de la corrida del 20 de octubre de 2026 (corrida 2))

**Qué cambió desde la corrida 1** (esa misma tarde, después de la revisión de producto):

- **Ya no promete resultados.** A Carlos: «La meta de menos de 4 h la juzgamos tras el test y las primeras semanas; por ahora la meta del plan es llegar entero a la subida final». A Roberto: «se ve alcanzable con 15 semanas, pero con tus primeras semanas vamos a ver qué ritmo es realista». A Lucía: «aún no sé qué tiempo es realista». A Ana y Daniel: «no prometo kilos».
- **El FTP que escribió la persona se confirma pronto.** Carlos y Sofía hacen su test de 20 min en la semana 2 (antes, en las semanas 5 y 6). Fernando, que hizo un test hace 10 días, lo repite hasta la semana 4.
- **Parte de lo que ya hace cada quien.** Fernando: «respeto tu semana… y cambio solo la progresión». Carlos: «la salida larga del domingo, que ya haces, se queda». Mariana: «partimos de tu semana real». Lucía: «parto de lo que ya haces». Sofía: arranca en 3 h 20 min de bici, «máximo +10 % sobre lo que ya haces».
- **El alcohol ocasional ya no frena.** Carlos ahora arranca normal: sweet spot hasta 89–90% desde la semana 1 (antes, nada arriba de 82% en 3 semanas).
- **Mariana ahora tiene salida larga afuera** (3 h 30 min los sábados, con el equipo), como la que ya hacía.
- **Género:** antes había 8 errores (7 a mujeres); ahora hay 1, al revés: a Roberto le dice «lista».
- **Paola:** ya no aparece el extra «Sin gimnasio hoy» ni la frase de técnica de montaña.

**Se mantiene bien:** las reglas de salud (Roberto, Lucía y Paola sin test, por sensación y con la indicación de ir al médico; nada arriba de ~78%). Nunca se pasa de la disponibilidad y cuenta gym, carrera, natación y yoga.

**Pendientes para Torq:**

1. **Género al revés:** una descripción de Roberto dice «lista para descansar».
2. **Tope de 90 min en rodillo:** a Mariana le dice «tu sesión indoor llega a 90 min… si quieres rodillo más largo, súbelo en tu formulario», pero ella no puso tope: es el límite general del coach y se lo presenta como si fuera suyo.
3. **Contenido del gym:** a Carlos y Mariana les agenda qué hacer en su gym («pierna moderada», «tren superior y core»), aunque solo dijeron que van.

**Preguntas para Joe:**

- **Volumen.** Sigue por debajo de lo disponible, ahora con razones explícitas: Sofía 3 h 20 min de bici de 5 («máximo +10 % sobre lo que ya haces»), Mariana ~4.7–5.9 h de rodillo más 3.5 h afuera de 11, Fernando 6.7–7.8 h de 9 contando técnica y salida larga (la semana 3 es de descarga). ¿Estás de acuerdo?
- **Javier** (duerme mal, estrés alto) sigue con la rampa el jueves de la semana 1. ¿Tan pronto?
- **Paola** tiene descarga en la semana 3 (baja a 1.6 h), cuando apenas lleva 2 semanas de 2.1–2.2 h. ¿Hace falta tan pronto?
- **Ana** (34, sana, sedentaria): le recomienda chequeo médico antes de subir intensidad. ¿Lo pedirías a todo sedentario?
- **Metformina:** a Paola le dice «come algo antes de rodar y lleva algo dulce». Es una regla escrita en el prompt (método de Joe). ¿La mantenemos así?
- **Contenido del gym:** ¿quieres que la IA le diga a la persona qué hacer en su gym, o solo que lo tome en cuenta?

## Resumen

| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |
|---|---|---|---|---|---|
| 01 | [Ana López](#p01) | Oficinista sin experiencia, quiere bajar de peso y tener energía | sin test · arranque conservador | Empezando con el rodillo: energía y constancia | 2 sesiones · 1.2 h |
| 02 | [Carlos Méndez](#p02) | MTB Master 40, primera carrera larga (Chupacabras 60 km) | test de 20 min | Chupacabras 60 km: llegar fuerte a la subida final | 3 sesiones · 3 h |
| 03 | [Sofía Ramírez](#p03) | Triatleta: la bici es su punto débil para un 70.3 | test de 20 min · en temporada | Hacia Cozumel 70.3: bici con piernas para correr | 2 sesiones · 1.7 h |
| 04 | [Roberto García](#p04) | Retoma después de 3 años, hipertensión controlada, gran fondo 80 km | médico primero · sin test | Vuelta a la bici: gran fondo de 80 km | 3 sesiones · 2.5 h |
| 05 | [Mariana Torres](#p05) | Ciclista élite, selectivo nacional en 8 semanas | test de 20 min · en temporada | Selectivo de ruta: umbral y arranques hacia el 20 de diciembre | 4 sesiones · 4.7 h |
| 06 | [Javier Hernández](#p06) | Papá con poco tiempo, gravel de 100 km, FTP provisional | test de rampa · arranque conservador | Gravel Sierra Gorda 100 km | 3 sesiones · 2.1 h |
| 07 | [Lucía Fernández](#p07) | MTB recreativa con asma, quiere subir el Ajusco sin bajarse | médico primero · sin test | Ajusco sin bajarte | 2 sesiones · 1.9 h |
| 08 | [Daniel Ortiz](#p08) | Exfutbolista con sobrepeso y molestia de rodilla | sin test · base primero | Volver a rodar: base y constancia | 3 sesiones · 2.2 h |
| 09 | [Fernando Ruiz](#p09) | XCO Master 50 a media temporada, Copa Nacional en 8 semanas | test de 20 min · en temporada | Copa Nacional XCO: chispa en arranques y subidas cortas | 2 sesiones · 2.2 h |
| 10 | [Paola Jiménez](#p10) | Diabetes tipo 2 controlada, entrena por salud y diversión | médico primero · sin test · arranque conservador · metabólico primero | Base y energía: rodar con gusto | 3 sesiones · 2.1 h |

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

**Perfil de arranque (reglas de Torq):** sin test: por sensación, subiendo de a poco · arranque conservador · enseñarle a usar RPE · no hace máximos porque: viene de estar sedentario; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Empezando con el rodillo: energía y constancia · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y hábito | 4 | 2 | Tres rodadas por semana de 35-45 min, por sensación y a un ritmo en el que puedas platicar (RPE 3-4). Sin intensidad; en la semana 3 entran cambios suaves de ritmo. |
| Construcción suave | 4 | 2.25 | Subimos el tiempo de los bloques constantes y metemos el primer esfuerzo por sensación (RPE 7) en una sesión a la semana. Las otras dos siguen suaves. |
| Consolidación | 4 | 2.25 | Sesiones de 45 min con un bloque de calidad por sensación y dos de fondo. Al cerrar, revisamos cómo respondiste y decidimos cuándo medir tu punto de partida en watts. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Ana, arrancamos con prudencia: vienes de una vida sedentaria, con mucho estrés y 6.5 h de sueño, así que primero hábito y base. Tus 2.5 h por semana no caben en 3 días de 45 min (3 × 45 = 135 min = 2.25 h), así que planeo 3 sesiones de 35-45 min. Escala del esfuerzo: RPE 3-4 es poder platicar, 6-7 solo frases cortas, 8-9 pocas palabras y 10 es no poder más; en las primeras semanas casi todo va en 3-4. Como quieres bajar de peso, te recomiendo un chequeo médico antes de subir la intensidad y que un nutriólogo vea tu alimentación; yo no prometo kilos, sí constancia y un proceso medible. Medimos tu avance con cómo se siente cada sesión (RPE) y la regularidad. Sin test por ahora: todo va por sensación y lo intenso entra poco a poco hacia la semana 3.

#### Semana 1 · 2 sesiones de rodillo · 1.2 h · TSS ≈ 40

- **miércoles 21 oct — Primera rodada suave** · 33 min · TSS ≈ 18 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 20' @ 60%
  - Enfriamiento 5' @ 50%
  - _Esta es tu primera rodada para conocer el rodillo y pedalear a gusto, sin presión. Va con ERG apagado, así que pedalea con la cadencia que te salga natural y ajusta la resistencia para que puedas hablar en frases completas; si no puedes, bájala sin dudarlo. Si prefieres ERG, puedes prenderlo con el botón ⚡, pero para esta primera vez te recomiendo rodar por sensación. Lo que vas a sentir es un ritmo parejo, con las piernas sueltas y la respiración tranquila. Es una sesión para arrancar la semana con buena energía y dejar la bici lista para lo que viene._

- **viernes 23 oct — Rodada suave constante** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 25' @ 60%
  - Enfriamiento 7' @ 50%
  - _Hoy toca un poco más de tiempo al mismo esfuerzo suave, para que el cuerpo se acostumbre a pedalear sin prisa. Va con ERG apagado: elige una resistencia a la que puedas platicar todo el rato y deja que la cadencia sea la que te salga cómoda. Si prefieres ERG, puedes prenderlo con el botón ⚡, aunque aquí lo que buscas es sentirte bien, no forzar. Al terminar, marca en la app qué tan duro se sintió, porque con eso ajusto tu siguiente semana. Lo que esperas es respirar tranquila y terminar con ganas de más, no agotada._

#### Semana 2 · 3 sesiones de rodillo · 2.1 h · TSS ≈ 69

- **lunes 26 oct — Fondo suave** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 25' @ 60%
  - Enfriamiento 7' @ 50%
  - _Arrancamos la semana con una rodada tranquila para agarrarle el gusto a la bici. Vas a rodar parejo, con ERG apagado y por sensación: si prefieres ERG, lo prendes con el botón ⚡, pero aquí manda cómo te sientes más que un número. La referencia es poder platicar en frases completas, con respiración tranquila. Si llegas cansada o con poco sueño, baja un poco el ritmo sin culpa y listo. Con esto ya te estás creando el hábito, y eso vale más que cualquier esfuerzo heroico._

- **miércoles 28 oct — Fondo suave** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 25' @ 60%
  - Enfriamiento 7' @ 50%
  - _Es la misma sesión del lunes, pero esta vez buscamos que se sienta un poco más fácil. Ruédala con ERG apagado, cadencia natural y a un ritmo en el que puedas platicar sin esfuerzo. Si al principio se siente pesada, es normal: el cuerpo se va acomodando. Cuida que la respiración se mantenga tranquila durante los 25 minutos fuertes del fondo. Con este entreno llegas al viernes con las piernas ya más sueltas para la rodada larga._

- **viernes 30 oct — Fondo suave largo** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 30' @ 60%
  - Enfriamiento 7' @ 50%
  - _Hoy es la rodada más larga de la semana, 45 minutos para disfrutar la bici con calma. Va con ERG apagado, así que ruédala por sensación: si quieres ERG, lo prendes con el botón ⚡. Mantén un ritmo en el que puedas platicar en frases completas, y no tengas prisa en la segunda mitad; ahí es donde se nota el trabajo de base. Al terminar, marca tu RPE para que tu coach vea cómo te fue. Así cierras la semana con buen ritmo y con ganas de más._

#### Semana 3 · 3 sesiones de rodillo · 2.2 h · TSS ≈ 74

- **lunes 2 nov — Fondo suave** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 25' @ 60%
  - Enfriamiento 7' @ 50%
  - _Arrancamos la semana con una rodada tranquila de 40 minutos, de esas en las que puedes ir platicando. Va con ERG apagado, en calle plana y por sensación: pedalea con cadencia natural y sin presionar. Si prefieres ERG, lo prendes con el botón ⚡, pero para este día no hace falta. Lo que tienes que sentir es RPE 3-4, con frases completas sin esfuerzo. Es un buen comienzo para soltar las piernas y entrar con ganas al resto de la semana._

- **miércoles 4 nov — Cambios de ritmo suaves** · 45 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - 5× (3' @ 70% + 3' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Hoy toca aprender a cambiar de ritmo sin cansarte de más: 5 bloques de 3 minutos un poco más firmes, alternados con 3 minutos suaves. Va con ERG apagado, así que regulas tú con la sensación, sin que sea un esfuerzo duro. En los tramos firmes deberías estar en RPE 5, con frases un poco más cortas pero sin ahogarte; en los suaves, vuelves a respirar con calma. Si en algún momento sientes que te pasaste, baja un poco y listo. Esto prepara tus piernas para el viernes._

- **viernes 6 nov — Fondo suave largo** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→58%
  - Constante 30' @ 60%
  - Enfriamiento 7' @ 50%
  - _Rodada larga de 45 minutos para asimilar el trabajo del miércoles. Va con ERG apagado, en calle plana y por sensación, y si prefieres ERG lo prendes con el botón ⚡. Mantén RPE 3-4, con la capacidad de hablar en frases completas durante todo el recorrido. Si las piernas vienen pesadas, baja la resistencia sin problema: lo que cuenta hoy es la constancia y terminar sintiéndote bien. Así llegas al fin de semana con el cuerpo asentado y entera para lo que sigue._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Sin test, sin ERG, por sensación (RPE 3–4):** sedentaria y no sabe usar RPE. Le explica la escala.
- **Arranque conservador:** estrés alto y 6.5 h de sueño regular (el alcohol semanal ya no suma).
- **Volumen:** 1.2 → 2.1 → 2.2 h; explica que 3 × 45 min (2.25 h) no alcanzan sus 2.5 h.
- **Meta:** «no prometo kilos, sí constancia y un proceso medible»; la alimentación, con nutriólogo. Además le recomienda un chequeo médico antes de subir intensidad.

**Qué cambió desde la corrida 1:** Casi igual. Ahora dice explícitamente que no promete kilos y agrega el chequeo médico. Ya no hay errores de género.

**Para revisar:**

- ¿Chequeo médico para toda persona sedentaria, o solo con alguna señal?

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

<a id="p02"></a>
## 02. Carlos Méndez — MTB Master 40, primera carrera larga (Chupacabras 60 km)

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 42 años · hombre · 84 kg |
| **Disciplina** | Montaña · compite (Master 40) |
| **Experiencia** | Con experiencia · Ciclista activo · 6 años rodando · 2 con plan estructurado |
| **FTP** | 235 W — lo escribió la persona (sin confirmar en Torq), hace 21 días (2.8 W/kg) |
| **FC máxima** | 182 lpm (medida) · reposo: 56 lpm |
| **Últimas 4 semanas** | rodadas suaves, ~5 h/sem |
| **Su semana típica (textual)** | «Martes y jueves rodillo 1 h (uno suave y otro con series de 10 min), y el sábado o domingo salida de montaña de 2.5 a 3 h con amigos. Gym lunes y miércoles.» |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés medio · fuma: no · alcohol: 1–2 veces por semana |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Gym / fuerza 2×/sem de 60 min (lunes, miércoles) |
| **Disponibilidad** | 6 h/sem · martes, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Correr el Chupacabras 60 km (MTB) el 17 de enero de 2027. Quiero terminar en menos de 4 horas y no tronarme en la subida final. Voy al gym lunes y miércoles.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Chupacabras 60 km: llegar fuerte a la subida final · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y tempo | 4 | 5.5 | Reconfirmar el FTP con un test de 20 min en la semana 2 y construir tempo y sweet spot cortos. La salida larga de montaña del domingo sube de 2.5 h a 2 h 45 min y baja en la semana 4 (descarga). |
| Construcción | 4 | 6 | Sweet spot y umbral largos, con tempo largo para la demanda de maratón. La salida larga llega a 3 h con comida desde el minuto 30. Semana 8 de descarga. |
| Específico | 4 | 6 | Umbral largo, subidas sostenidas y bloques de tempo al final de la salida larga para la subida final. Retest al abrir el bloque y descarga en la semana 12. |
| Carrera | 1 | 3 | Semana de la carrera (17 de enero): volumen bajo, activaciones cortas y llegar fresco. |

**Próximo test:** test20 · Tu FTP de 235 W es manual y sabes dosificarte; tras dos rodadas de rodillo lo confirmamos en la semana 2, con el viernes sin bici.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Carlos, tu prueba es un maratón MTB de 60 km: mucho tiempo en tempo y subidas sostenidas, así que priorizo base, tempo, sweet spot y la salida larga del domingo, que ya haces y se queda. Arrancamos con tus 235 W y los confirmamos con el test de 20 min el sábado de la semana 2; hasta entonces nada intenso a más del 90 %. Con 6 h por semana y el gimnasio lunes y miércoles contados, la bici dura va en sábado, lejos de tus días de fuerza. El rodillo no entrena técnica de montaña: lo bajamos al cerro en tus salidas. La meta de menos de 4 h la juzgamos tras el test y las primeras semanas; por ahora la meta del plan es llegar entero a la subida final.

#### Semana 1 · 3 sesiones de rodillo · 3 h · TSS ≈ 144

- **martes 20 oct — Fondo base** · 60 min · TSS ≈ 39 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 40' @ 65% (153 W)
  - Enfriamiento 10' @ 55% (129 W)
  - _Martes de rodada de fondo, de esas que te dejan la cabeza despejada después del gimnasio. Va por sensación, con ERG apagado: sal suave, cadencia la que te salga natural y mantén RPE 3-4, de forma que puedas hablar en frases completas. Si de pronto no puedes, baja el ritmo sin pena. Es un buen momento para ver cómo llegas tras el gimnasio, y la idea es terminar con ganas de más, no vacío._

- **jueves 22 oct — Tempo 2x15** · 60 min · TSS ≈ 49
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 2× (15' @ 80% (188 W) + 5' @ 55% (129 W))
  - Enfriamiento 10' @ 55% (129 W)
  - _Jueves de tempo para aprender a sostener un ritmo parejo, como en un maratón de MTB. Te recomiendo ERG prendido con el botón ⚡ para que el rodillo marque los dos bloques de 15 min al 80 %, y tú cuidas la cadencia. Busca RPE 5-6, con frases cortas. Si el miércoles de gimnasio te dejó las piernas pesadas, baja 3-5 puntos sin dudarlo; llegar fuerte a la recuperación de los bloques es lo que cuenta._

- **sábado 24 oct — Sweet spot 3x10** · 60 min · TSS ≈ 56
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 3× (10' @ 89% (209 W) + 5' @ 55% (129 W))
  - Enfriamiento 5' @ 55% (129 W)
  - _Sábado para tu primer contacto con sweet spot. Te recomiendo ERG prendido con el botón ⚡: el rodillo sostiene los tres bloques de 10 min al 89 %, y tú mantienes la cadencia firme. Busca RPE 6-7; es un esfuerzo sostenido y cómodamente duro. Como todavía no confirmamos tu FTP, si no logras completar los bloques o pasas de RPE 8, baja 3-5 puntos y anótalo para tu coach. Terminar bien esta sesión te deja con buenas piernas para la semana siguiente._
- _Fuera del rodillo:_ **miércoles 21 oct — Gimnasio: pierna moderada** (60 min): Mañana toca tempo en el rodillo: cuida la pierna y no la lleves al límite. Que termines con ganas de pedalear.
- _Fuera del rodillo:_ **domingo 25 oct — Salida larga de montaña** (150 min): Salida con tus amigos a RPE 3-4, de las que puedes platicar. Come desde el minuto 30 y no te enganches en las subidas.

#### Semana 2 · 3 sesiones de rodillo · 2.9 h · TSS ≈ 72 (sin contar el test)

- **martes 27 oct — Fondo con cadencia libre** · 60 min · TSS ≈ 39 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 40' @ 65% (153 W)
  - Enfriamiento 10' @ 55% (129 W)
  - _Martes de fondo por sensación: 40 minutos de rodada cómoda con RPE 3-4, sin forzar cadencia, para que la bici se sienta fácil y tú te sientas fresco. Va con ERG apagado, así que tú marcas el ritmo; si prefieres ERG, actívalo con el botón ⚡, pero aquí lo que cuenta es rodar suelto. Si puedes hablar en frases completas, vas bien. Esto te deja con buenas piernas para el sábado, así que no hace falta apretar._

- **jueves 29 oct — Fondo suave** · 60 min · TSS ≈ 33 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60% (118→141 W)
  - Constante 40' @ 60% (141 W)
  - Enfriamiento 10' @ 50% (118 W)
  - _Jueves de rodada suave para soltar las piernas antes del test. Va con ERG apagado y a sensación: busca un ritmo tan cómodo que puedas platicar sin esfuerzo, RPE 3. Si al hablar te cuesta armar frases completas, baja un poco y anótalo para tu coach. Es un entrenamiento tranquilo que llega justo para dejarte listo para el sábado._

- **sábado 31 oct — Test de 20 minutos** · 53 min · 🧪 test hasta el fallo (la duración es el máximo posible) · por sensación (sin ERG)
  - Calentamiento 10' @ 45→70% (106→165 W)
  - 3× (1' @ 100% (235 W) + 1' @ 50% (118 W))
  - Recuperación 5' @ 50% (118 W)
  - 20' libre, por sensación y sin ERG (referencia ~100% (235 W))
  - Enfriamiento 12' @ 50% (118 W)
  - _Sábado es día de test: vas a confirmar tu FTP. Ve con ERG apagado, porque el esfuerzo de 20 minutos tienes que regularlo tú. Llega descansado, con ventilador y bien comido. Los primeros 5 minutos del bloque principal deben sentirse contenidos, y después sostén el máximo que puedas. Si al cierre sientes que te pasaste, no pasa nada: anótalo para tu coach. Al terminar, actualiza tu perfil con el número que te dé el test._
- _Fuera del rodillo:_ **lunes 26 oct — Gimnasio: tren superior y core** (60 min): Esta semana hay test el sábado: carga ligera en pierna y enfócate en tren superior y core.
- _Fuera del rodillo:_ **miércoles 28 oct — Gimnasio: pierna ligera** (60 min): Pierna ligera, sin llegar al límite: quiero que llegues fresco al test del sábado.
- _Fuera del rodillo:_ **domingo 1 nov — Salida larga de montaña** (150 min): Salida a RPE 3-4 con comida desde el minuto 30. Después del test, que sea tranquila.

#### Semana 3 · 3 sesiones de rodillo · 3.1 h · TSS ≈ 156

- **martes 3 nov — Fondo** · 60 min · TSS ≈ 39 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 40' @ 65% (153 W)
  - Enfriamiento 10' @ 55% (129 W)
  - _Arrancamos la semana con un fondo tranquilo para soltar las piernas después del gimnasio del lunes. Va por sensación, sin ERG: rueda a un ritmo en el que puedas hablar en frases completas, con RPE 3-4. Si prefieres ERG, lo prendes con el botón ⚡, pero aquí no hace falta. Al terminar vas a sentir que te fuiste con energía, no con cansancio, y eso deja el cuerpo listo para lo que viene el jueves._

- **jueves 5 nov — Tempo 2x18** · 60 min · TSS ≈ 52
  - Calentamiento 8' @ 55→70% (129→165 W)
  - 2× (18' @ 80% (188 W) + 5' @ 55% (129 W))
  - Enfriamiento 6' @ 55% (129 W)
  - _Hoy toca un tempo largo para aprender a sostener un ritmo parejo. Te recomiendo prender el ERG con el botón ⚡ para que el rodillo marque los dos bloques de 18 min al 80 % de tu FTP, y tú solo cuidas la cadencia. Busca un esfuerzo de RPE 5-6, cómodo pero que se note. Si ves que el pulso se va subiendo poco a poco, baja un par de puntos sin problema. Así llegas al sábado con buenas piernas._

- **sábado 7 nov — Sweet spot 3x12** · 66 min · TSS ≈ 65
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 3× (12' @ 90% (212 W) + 5' @ 55% (129 W))
  - Enfriamiento 5' @ 55% (129 W)
  - _Sweet spot de tres bloques de 12 minutos, con un umbral conservador por ser de las primeras semanas después del test. Te recomiendo ERG prendido con el botón ⚡: el rodillo sostiene el 90 % de tu FTP y tú mantienes la cadencia. Anda por RPE 6-7; si llegas a RPE 8 o no logras completar algún bloque, baja 3-5 puntos y no pasa nada. Cuando termines vas a sentir las piernas trabajadas pero con control, y eso te deja bien preparado para la semana que sigue._
- _Fuera del rodillo:_ **lunes 2 nov — Gimnasio: tren superior y core** (60 min): Enfoca tren superior y core: el martes toca fondo, pero la semana trae sweet spot y quiero tus piernas frescas.
- _Fuera del rodillo:_ **miércoles 4 nov — Gimnasio: pierna moderada** (60 min): Pierna moderada: mañana toca tempo en el rodillo y no quiero que llegues vacío.
- _Fuera del rodillo:_ **domingo 8 nov — Salida larga de montaña** (165 min): Salida de 2 h 45 min a RPE 3-4, con comida desde el minuto 30. Tras el sweet spot del sábado, ritmo conversacional.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Su FTP es de partida:** «arrancamos con tus 235 W y los confirmamos con el test de 20 min el sábado de la semana 2; hasta entonces nada intenso a más del 90 %».
- **No promete el «menos de 4 h»:** lo juzga después del test; mientras, la meta es llegar entero a la subida final.
- **Parte de su semana:** la salida larga de montaña del domingo «que ya haces, se queda» (2 h 30 → 2 h 45); gym lunes y miércoles contado, lo duro el sábado.
- **Sin freno por alcohol:** sweet spot hasta 89–90% desde la semana 1.

**Qué cambió desde la corrida 1:** Antes: aceptaba «menos de 4 h» como la demanda, 3 semanas sin nada arriba de 82% por la regla del alcohol y test hasta la semana 5. Ahora: meta por evaluar, test en la semana 2, sweet spot desde la semana 1 y parte de su salida del domingo.

**Para revisar:**

- Le agenda contenido para su gym («pierna moderada», «tren superior y core»). ¿Debe?

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

<a id="p03"></a>
## 03. Sofía Ramírez — Triatleta: la bici es su punto débil para un 70.3

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 29 años · mujer · 58 kg |
| **Disciplina** | Ruta · compite (Grupos de edad 25-29) |
| **Experiencia** | Con experiencia · Ciclista activo · 3 años rodando · 3 con plan estructurado |
| **FTP** | 190 W — lo escribió la persona (sin confirmar en Torq), hace 40 días (3.3 W/kg) |
| **FC máxima** | 189 lpm (medida) · reposo: 50 lpm |
| **Últimas 4 semanas** | con intensidad, ~9 h/sem |
| **Su semana típica (textual)** | «Bici: miércoles rodillo 1 h con tempo y sábado salida larga de 2 h. Corro martes (series), jueves (rodaje) y domingo (largo de 1 h 15). Nado lunes y viernes 1 h.» |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7.5 h (calidad buena) · estrés medio · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Correr 3×/sem de 50 min (martes, jueves, domingo); Natación 2×/sem de 60 min (lunes, viernes) |
| **Disponibilidad** | 5 h/sem · miércoles, viernes, sábado |
| **Su objetivo (textual)** | «Medio Ironman 70.3 en Cozumel el 14 de febrero de 2027. Corro y nado bien; la bici (90 km) es mi punto débil y quiero llegar a correr el medio maratón sin morirme.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Hacia Cozumel 70.3: bici con piernas para correr · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base específica | 4 | 3.5 | Semanas 1 a 4: ordenar tus 3 días de bici alrededor de la carrera y la natación. Miércoles de tempo en rodillo, viernes suave y sábado de salida larga afuera, de 1 h 40 min a 2 h 15 min. Test de 20 min el viernes de la semana 2. |
| Construcción | 5 | 4.2 | Semanas 5 a 9: más tiempo sostenido a ritmo de 70.3 (tempo y sweet spot largos) el miércoles. Salida larga de 2 h 15 min a 2 h 45 min con comida desde el minuto 30. Retest al abrir el bloque. |
| Específico 70.3 | 6 | 4.8 | Semanas 10 a 15: bloques largos al 80-88 % de tu FTP. Salida larga de hasta 3 h a ritmo de carrera, con un brick corto de trote al final. Descarga cada 3-4 semanas. |
| Afinación y carrera | 2 | 3 | Semanas 16 y 17: el volumen baja al 50-60 % y se conserva algo de ritmo de carrera. La semana 17 es la del 70.3 en Cozumel, el domingo 14 de febrero. |

**Próximo test:** test20 · Traes un FTP escrito por ti y sabes dosificarte (compites, 3 años con estructura); tras dos rodadas para conocer el rodillo y con jueves suave, el viernes de la semana 2 es el momento de confirmarlo.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Sofía, tu demanda es un 70.3: ritmo sostenido de 75-85 % durante muchos minutos y llegar con piernas para correr, así que priorizo tempo largo y la salida larga afuera. Vienes de otro entrenamiento con intensidad y de 9 h por semana en total; tu carrera y tu natación cuentan en la carga, por eso el miércoles queda en tempo (día después de tus series del martes, nada de intensidad alta) y el viernes, día de natación, va suave. Tus 5 h declaradas no caben con rodillo en tus 3 días sin pasarte de lo que ya haces, así que arranco en unas 3 h 20 min de bici (máximo +10 % sobre lo que ya haces) y subimos poco a poco. El FTP de 190 W es el que escribiste: arrancamos con él y lo confirmamos con un test de 20 min el viernes 30 de octubre (semana 2); después del test, actualiza tu perfil. Cuéntame qué día corres fuerte y si alguna de las salidas largas incluye brick corto de trote más adelante.

#### Semana 1 · 2 sesiones de rodillo · 1.7 h · TSS ≈ 71

- **miércoles 21 oct — Tempo en rodillo 2x15** · 60 min · TSS ≈ 45
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 2× (15' @ 78% (148 W) + 5' @ 55% (105 W))
  - Enfriamiento 10' @ 50% (95 W)
  - _Hoy es tu primer contacto con el rodillo y con tu FTP de 190 W, así que vamos con calma pero con ganas: dos bloques de 15 min a ritmo de tempo con el ERG prendido, que el rodillo marque la potencia mientras tú sostienes una cadencia que te salga natural. Lo que vas a sentir es un esfuerzo cómodamente exigente, RPE 5-6, donde puedes decir frases cortas pero no cantar; si en el segundo bloque te cuesta mucho, no pasa nada, bájale un poco y sigue. Mañana es jueves de rodaje, así que no te aprietes de más hoy y deja algo de gasolina para entonces._

- **viernes 23 oct — Rodada suave** · 40 min · TSS ≈ 26 · por sensación (sin ERG)
  - Constante 40' @ 62% (118 W)
  - _Viernes de rodada suave para soltar las piernas después de la natación. Puedes hacerla con el ERG apagado, por sensación, y si prefieres tenerlo prendido lo activas con el botón ⚡. Va a sentirse fácil, RPE 3-4, con la respiración tranquila como para platicar en frases completas; si no puedes hablar así, baja el ritmo sin dudarlo. Es un rodaje de recuperación que te deja lista para el resto de la semana._
- _Fuera del rodillo:_ **sábado 24 oct — Salida larga afuera** (100 min): Rodada continua a RPE 3-4, de modo que puedas platicar todo el tiempo. Come algo desde el minuto 30 y practica tu hidratación de carrera.

#### Semana 2 · 2 sesiones de rodillo · 1.9 h · TSS ≈ 49 (sin contar el test)

- **miércoles 28 oct — Tempo en rodillo 2x18** · 60 min · TSS ≈ 49
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 2× (18' @ 78% (148 W) + 4' @ 55% (105 W))
  - Enfriamiento 6' @ 50% (95 W)
  - _Este miércoles toca subir los bloques de tempo de 15 a 18 minutos, y es lo único que cambia respecto a la semana pasada. Deja el ERG prendido para que el rodillo marque el ritmo y tú solo sostengas la cadencia. Esfuerzo de RPE 5-6: debe sentirse firme pero controlado, con respiración que puedas mantener. Si al último minuto de cada bloque te cuesta hablar en frases cortas, baja un poco y anótalo para tu coach. Con esto llegas al jueves con las piernas trabajadas pero sin cansancio acumulado._

- **viernes 30 oct — Test de 20 minutos** · 53 min · 🧪 test hasta el fallo (la duración es el máximo posible) · por sensación (sin ERG)
  - Calentamiento 10' @ 45→70% (86→133 W)
  - 3× (1' @ 100% (190 W) + 1' @ 50% (95 W))
  - Constante 5' @ 50% (95 W)
  - 20' libre, por sensación y sin ERG (referencia ~100% (190 W))
  - Enfriamiento 12' @ 50% (95 W)
  - _El viernes es tu test de 20 minutos para confirmar tu FTP, y te recomiendo dejarlo con el ERG apagado para regular el esfuerzo por sensación. Llega descansada, con el jueves de rodaje suave y bien comida. Los primeros 5 minutos deben sentirse contenidos; después ve subiendo poco a poco hasta lo máximo que puedas sostener, sin arrancar al límite. Esperas una respiración intensa pero rítmica y piernas que aguantan la subida; si sientes mareo o ahogo, para y avísale a tu coach. Es tu primer test aquí, así que tómalo como familiarización, y haz la natación del viernes ligera._
- _Fuera del rodillo:_ **sábado 31 oct — Salida larga afuera** (110 min): Rodada continua a RPE 3-4, sin picar con nadie. Es el día después del test: ve suelta, con comida desde el minuto 30.

#### Semana 3 · 2 sesiones de rodillo · 1.8 h · TSS ≈ 84

- **miércoles 4 nov — Tempo en rodillo 2x20** · 65 min · TSS ≈ 55
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 2× (20' @ 80% (152 W) + 5' @ 55% (105 W))
  - Enfriamiento 5' @ 50% (95 W)
  - _Sofía, hoy toca tempo en rodillo: dos bloques de 20 minutos en zona tempo, con recuperación suave entre ellos. Te recomiendo prender el ERG para que el rodillo marque la potencia y tú solo sostengas la cadencia; si ya actualizaste tu FTP tras el test, los porcentajes se ajustan solos. Arranca conservadora, sobre todo en estas primeras semanas con el FTP nuevo: tu referencia es un RPE de 5 a 6, con piernas firmes pero respiración controlada. Si sientes que pasas de RPE 7, baja un poco la potencia sin culpa. Llegar bien aquí deja las piernas listas para el jueves._

- **viernes 6 nov — Rodada suave** · 45 min · TSS ≈ 29 · por sensación (sin ERG)
  - Constante 45' @ 62% (118 W)
  - _Hoy es día de soltar piernas después de natación: una rodada suave de 45 minutos por sensación, sin presión. Va con ERG apagado, así que busca la cadencia que te salga natural y ajusta tú la intensidad. Anda en un RPE de 3 a 4, cómoda y con la respiración tranquila, como si fuera una plática larga. Si prefieres usar ERG, lo puedes prender con el botón ⚡, pero para hoy el objetivo es aflojar, no apretar._
- _Fuera del rodillo:_ **sábado 7 nov — Salida larga afuera** (120 min): Dos horas continuas a RPE 3-4, con comida desde el minuto 30. Mañana corres tu largo, así que no la endurezcas.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Demanda del 70.3:** tempo largo y salida larga, sin vaciar las piernas para la carrera a pie.
- **Su FTP se confirma:** test de 20 min el viernes de la semana 2.
- **Parte de su carga real:** venía de 9 h en total (bici, carrera y natación); arranca en 3 h 20 min de bici, «máximo +10 % sobre lo que ya haces». Miércoles tempo (después de sus series del martes), viernes suave (natación), sábado largo afuera 1 h 40 → 2 h.
- **Pregunta lo que le falta:** qué día corre fuerte y si quiere brick más adelante (el brick entra en el bloque específico).

**Qué cambió desde la corrida 1:** Antes: test en la semana 6 y no hablaba de su carga actual. Ahora: test en la semana 2, volumen calculado desde lo que ya hace y brick planeado.

**Para revisar:**

- 3 h 20 min de 5 h disponibles: ¿la regla del +10 % sobre su carga total te parece bien para una triatleta?

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

<a id="p04"></a>
## 04. Roberto García — Retoma después de 3 años, hipertensión controlada, gran fondo 80 km

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 58 años · hombre · 88 kg |
| **Disciplina** | Ruta · no compite |
| **Experiencia** | Retoma o nuevo en apps de entrenamiento · Sedentario · 10 años rodando · 0 con plan estructurado |
| **FTP** | No lo sabe |
| **FC máxima** | No la sabe · reposo: 72 lpm |
| **Últimas 4 semanas** | poco o nada, ~0 h/sem |
| **Salud** | Condiciones: hipertensión · medicamento: Losartán todos los días · lesión reciente: no |
| **Hábitos** | Duerme 6 h (calidad regular) · estrés medio · fuma: no · alcohol: 1–2 veces por semana |
| **Esfuerzo** | ¿Sabe usar RPE?: más o menos · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 4 h/sem · lunes, miércoles, viernes, sábado · máx 60 min por sesión |
| **Su objetivo (textual)** | «Rodar un gran fondo de 80 km el 31 de enero de 2027 con mis amigos. Dejé la bici hace 3 años y subí de peso. Tengo la presión alta controlada con medicamento.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico; viene de estar sedentario · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Vuelta a la bici: gran fondo de 80 km · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y hábito | 6 | 2.5 | Volver a la bici con constancia: 3 rodadas por semana de 45-60 min en fondo, por sensación (RPE 3-4). Los cambios de ritmo suaves entran poco a poco y el primer esfuerzo a RPE 7 llega en la semana 3. |
| Construcción | 5 | 3.5 | Subir volumen despacio hasta 4 h por semana. Salida larga afuera de 1.5 h a 2.5 h, con tempo suave y algunos intervalos por sensación. |
| Específico gran fondo | 3 | 4 | Ritmo de evento: bloques largos de tempo y salida larga afuera de hasta 3 h con comida desde el minuto 30. |
| Descarga y evento | 1 | 2 | Semana del 31 de enero: poco volumen, piernas frescas y una salida suave el día antes del gran fondo. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Roberto, tienes 10 años de bici y eso cuenta, pero hoy partes casi de cero en condición y vamos a construir juntos. Como tomas medicación para la presión, antes de apretar pásate por tu médico y que te dé luz verde para esfuerzos fuertes; mientras construimos con cuidado. Un gran fondo de 80 km el 31 de enero se ve alcanzable con 15 semanas, pero con tus primeras semanas vamos a ver qué ritmo es realista; la meta es llegar entero. Hasta el momento todo va por sensación (RPE: 3-4 puedes platicar, 6-7 solo frases cortas, 8-9 pocas palabras, 10 no puedes más) y no hay test por ahora. Con 4 días disponibles y 60 min por sesión caben unas 4 h como máximo; empezamos con 3 sesiones y el viernes de descanso, y más adelante la salida larga va afuera.

#### Semana 1 · 3 sesiones de rodillo · 2.5 h · TSS ≈ 86

- **miércoles 21 oct — Rodada de reencuentro** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 7' @ 50%
  - _Roberto, esta es tu primera rodada de reencuentro con el rodillo, así que sin prisa: 45 minutos para sentir la bici y tomarle el ritmo. Va con ERG apagado, por sensación; si prefieres, puedes prenderlo con el botón ⚡, pero la idea es que la cadencia te salga natural. Tu referencia es RPE 3-4: debes poder hablar en frases completas, y si no puedes, baja la potencia sin pena. Al terminar vas a sentir las piernas sueltas y con ganas de más, y eso es justo lo que buscamos para llegar fuerte al resto de la semana._

- **viernes 23 oct — Fondo cómodo** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 7' @ 50%
  - _Otro fondo tranquilo, Roberto, para seguir agarrando confianza con el rodillo. Va con ERG apagado y por sensación: si quieres ERG, lo prendes con el botón ⚡. Mantén RPE 3-4, conversacional, como el miércoles. Hidrátate bien y ventila el cuarto para que el rodaje sea cómodo. Cuando termines, anota tu RPE; me sirve mucho para ajustar la semana que sigue._

- **sábado 24 oct — Fondo de 60 min** · 60 min · TSS ≈ 36 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 40' @ 63%
  - Enfriamiento 10' @ 50%
  - _Esta es la rodada más larga de la semana, Roberto, así que tómala con calma: RPE 3-4, sin forzar en ningún momento. Va con ERG apagado, por sensación; si prefieres ERG, lo prendes con el botón ⚡. Como guía, si la segunda mitad se siente igual de fácil que la primera, vas muy bien; si empiezas a necesitar frases cortas (RPE 6-7), baja un poco. Sales con las piernas trabajadas pero frescas, y eso te deja una base sólida para las siguientes semanas._

#### Semana 2 · 3 sesiones de rodillo · 2.6 h · TSS ≈ 93

- **lunes 26 oct — Fondo con cambios suaves** · 45 min · TSS ≈ 26 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - 4× (2' @ 72% + 5' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Rodada suave para sentir la bici sin pelearla: fondo a RPE 3-4 con cuatro cambios cortos de ritmo, de unos 2 minutos, donde subes un poco pero sin forzar, y luego vuelves a un fondo cómodo. Va sin ERG, así que tú decides el ritmo por sensación y la cadencia natural; si prefieres trabajar con ERG, lo puedes prender con el botón ⚡. Lo que esperas es poder hablar, aunque sea entrecortado, incluso en los cambios; si te cuesta mucho respirar, baja y anótalo para tu coach. Es el tipo de sesión que te deja las piernas frescas para lo que viene, sin robarte energía._

- **miércoles 28 oct — Fondo constante** · 52 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 35' @ 62%
  - Enfriamiento 7' @ 50%
  - _Fondo parejo y conversacional, de los que se disfrutan: busca un ritmo constante a RPE 3-4 durante 35 minutos, el tipo de rodada en la que puedes platicar sin problema. Lo importante es que tu pulso no se vaya subiendo con los minutos; si lo notas, afloja un poco. Va sin ERG, así que lo manejas por sensación; si quieres usar ERG, lo prendes con el botón ⚡. Si terminas con ganas de más y la respiración tranquila, hiciste bien tu parte._

- **sábado 31 oct — Fondo de 60 min** · 60 min · TSS ≈ 37 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 40' @ 64%
  - Enfriamiento 10' @ 50%
  - _Fondo largo de sábado, un poco más sostenido que el de la semana pasada: 40 minutos a un ritmo firme pero platicado, a RPE 3-4. Va sin ERG, así que tú marcas el paso por sensación; si prefieres ERG, lo prendes con el botón ⚡. Tu referencia es poder hablar en frases completas; si empiezas a cortar las frases, baja un poco y sigue. Terminas con las piernas trabajadas pero sin desgaste, lista para descansar bien el resto del fin de semana._

#### Semana 3 · 3 sesiones de rodillo · 2.7 h · TSS ≈ 95

- **lunes 2 nov — Fondo suave** · 52 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 35' @ 62%
  - Enfriamiento 7' @ 50%
  - _Lunes de rodar suave para aflojar las piernas: 52 minutos a ritmo cómodo, con RPE 3-4 y cadencia natural, sin buscar nada. Va por sensación, así que deja el ERG apagado; si prefieres usarlo, lo prendes con el botón ⚡, pero aquí lo que manda es cómo te sientes. Hablando en frases completas vas bien. Con este día llegas al miércoles fresco para tu primer esfuerzo de la semana._

- **miércoles 4 nov — Primer esfuerzo por sensación** · 51 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (4' libre, por sensación y sin ERG (referencia ~85%) + 4' @ 50%)
  - Constante 10' @ 60%
  - Enfriamiento 7' @ 50%
  - _Miércoles para tu primer esfuerzo por sensación: tres bloques de 4 minutos a RPE 7, firmes pero repetibles, con 4 minutos suaves de verdad entre cada uno. El ERG va apagado, así que tú regulas el ritmo; en el primer bloque no salgas de más, que los tres tienen que salir parejos. Sentirás las piernas trabajar y la respiración más marcada, pero si puedes decir solo frases cortas en los esfuerzos, vas en el punto. Si algún bloque te queda muy arriba, baja y anótalo para tu coach. Esto deja las piernas listas para el fin de semana._

- **sábado 7 nov — Fondo de 60 min** · 60 min · TSS ≈ 37 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 40' @ 64%
  - Enfriamiento 10' @ 50%
  - _Sábado de fondo largo para cerrar la semana: 60 minutos a RPE 3-4, con un ritmo que se sienta fácil y fluido, sobre todo después del esfuerzo del miércoles. El ERG va apagado, así que rueda por sensación y, si prefieres ERG, lo prendes con el botón ⚡. Si las piernas están pesadas desde el inicio, baja un poco la intensidad sin problema. La referencia es poder hablar en frases completas durante todo el recorrido._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero:** hipertensión con losartán. Sin test, sin FTP, todo por sensación, nada arriba de 72%.
- **Meta realista sin prometer:** «se ve alcanzable con 15 semanas, pero con tus primeras semanas vamos a ver qué ritmo es realista; la meta es llegar entero».
- **3 sesiones de 45–60 min** (su tope es 60), viernes libre; la salida larga afuera llega en el bloque 2.

**Qué cambió desde la corrida 1:** Antes: en la semana 3 bajaba a 2 sesiones sin explicar. Ahora: 3 sesiones estables (2.5 → 2.7 h) y una evaluación explícita de la meta.

**Para revisar:**

- Una descripción le dice «lista para descansar» (error de género, para Torq).

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

<a id="p05"></a>
## 05. Mariana Torres — Ciclista élite, selectivo nacional en 8 semanas

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 23 años · mujer · 56 kg |
| **Disciplina** | Ruta · compite (Élite femenil) |
| **Experiencia** | Con experiencia · Ciclista activo · 7 años rodando · 4 con plan estructurado |
| **FTP** | 235 W — test de 20 min, hace 14 días (4.2 W/kg) |
| **FC máxima** | 196 lpm (medida) · reposo: 46 lpm |
| **Últimas 4 semanas** | con intensidad, ~12 h/sem |
| **Su semana típica (textual)** | «Lunes suave o descanso, martes series de umbral, miércoles fondo de 2 h, jueves VO2 (5×4 min), sábado salida larga de 3-4 h con el equipo y domingo criterium o fondo. Gym lunes y jueves.» |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 8 h (calidad buena) · estrés bajo · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Gym / fuerza 2×/sem de 45 min (lunes, jueves) |
| **Disponibilidad** | 11 h/sem · lunes, martes, miércoles, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Selectivo nacional de ruta (criterium y contrarreloj) el 20 de diciembre de 2026. Quiero mejorar mis arranques y aguantar más tiempo en umbral.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: bajo

### Lo que armó el coach IA

**Plan:** Selectivo de ruta: umbral y arranques hacia el 20 de diciembre · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Construcción específica | 3 | 9.5 | Umbral sostenido (de 3×10 a 4×10 min) y arranques cortos cada domingo, con la salida larga del sábado afuera de 3 a 3.5 h. La semana 4 será de descarga y cierra con retest de 20 min. |
| Específico de selectivo | 3 | 10 | Bloques de umbral más largos para la contrarreloj y 40:20s, over/unders y sprints repetidos para el criterium. Salida larga de 3 h afuera, con una semana de descarga dentro del bloque. |
| Afinación | 2 | 8 | Se mantiene la calidad con menos volumen: ritmo de contrarreloj y salidas explosivas. Las piernas llegan frescas, sin fatiga acumulada. |
| Semana del selectivo | 1 | 5 | Activaciones cortas, descanso y la carrera el domingo 20 de diciembre. |

**Próximo test:** test20 · Se hace al abrir el siguiente bloque, fresca después de la semana de descarga y con más de 4 semanas desde tu test del 6 de octubre.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Mariana, partimos de tu semana real: umbral el martes, fondo el miércoles, salida larga el sábado y criterium o arranques el domingo. La demanda de un selectivo de criterium y contrarreloj es umbral sostenido más arranques repetidos, y eso es lo que priorizo. Arrancamos con tus 235 W, con el umbral al 95 % las dos primeras semanas, y el retest de 20 min va en la semana 4, después de la descarga. Tus gimnasios del lunes y el jueves cuentan en la carga: por eso el lunes es de bici muy suave y el jueves de piernas sueltas. Como tu sesión indoor llega a 90 min, la salida larga del sábado afuera (3 h 30 min) completa las horas; si quieres rodillo más largo, súbelo en tu formulario.

#### Semana 1 · 4 sesiones de rodillo · 4.7 h · TSS ≈ 192

- **martes 20 oct — Umbral 3×10** · 67 min · TSS ≈ 64
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 3× (10' @ 95% (223 W) + 5' @ 55% (129 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Hoy toca tu primer contacto con el umbral, al 95 % de tu FTP. Va un poco conservador porque tu test es de hace dos semanas, así que mantén el ERG encendido: el rodillo marca la potencia y tú sostienes la cadencia. Los últimos 2 minutos de cada bloque deben sentirse exigentes pero sostenibles, alrededor de RPE 7-8. Si no logras completar el último bloque, baja 3-5 puntos la próxima vez. Esto deja las piernas listas para el jueves, aunque sea un día de rodada suave._

- **miércoles 21 oct — Fondo 90 min** · 90 min · TSS ≈ 65 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 75' @ 68% (160 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Fondo aeróbico tranquilo para construir base. Te recomiendo ERG apagado y pedalear por sensación, con tu cadencia natural y sin forzar. El ritmo ideal es RPE 3-4, de los que te permiten hablar en frases completas. Si prefieres ERG, puedes prenderlo con el botón ⚡ con tu FTP de perfil, pero el control aquí es tu respiración. Disfruta los 75 minutos del medio, que son los que más suman._

- **jueves 22 oct — Rodada suave** · 60 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 10' @ 45→55% (106→129 W)
  - Constante 45' @ 58% (136 W)
  - Enfriamiento 5' @ 45% (106 W)
  - _Rodada suave para soltar las piernas el día de gimnasio. Va con ERG apagado y sin mirar los watts: pedalea a RPE 2-3, cómodo y relajado. El objetivo es que llegues fresca el sábado, cuando toca salida larga, así que no te dejes llevar por el ritmo. Si sientes las piernas pesadas, es buena señal de que todavía tienes margen para ir más suave._

- **domingo 25 oct — Arranques y 30/30** · 65 min · TSS ≈ 32 · por sensación (sin ERG)
  - Calentamiento 15' @ 50→70% (118→165 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 6× (12" libre, por sensación y sin ERG (referencia ~160% (376 W)) + 2.8' @ 50% (118 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Sesión para entrenar el criterium: series de 30 segundos fuertes con 30 segundos suaves y luego sprints de 12 segundos con recuperación completa. Va con ERG apagado, así que sal a sensación. Si la potencia cae mucho a mitad de la serie, saliste demasiado fuerte, así que dosifica desde el inicio. Para los sprints, da todo al máximo, sentada o parada como en carrera. Llegarás con las piernas encendidas, y eso es exactamente lo que buscamos._
- _Fuera del rodillo:_ **jueves 22 oct — Gimnasio: pierna ligera** (45 min): Pierna ligera y core: el sábado hay salida larga y no quieres llegar con las piernas cargadas. Que termines con ganas de más.
- _Fuera del rodillo:_ **sábado 24 oct — Salida larga con el equipo** (210 min): Rodada de 3 h 30 min afuera a RPE 3-4, comiendo desde el minuto 30. Deja los esfuerzos fuertes para otros días.

#### Semana 2 · 5 sesiones de rodillo · 5.7 h · TSS ≈ 225

- **lunes 26 oct — Rodada de recuperación** · 45 min · TSS ≈ 19
  - Constante 45' @ 50% (118 W)
  - _Hoy toca rodar suave para soltar las piernas después de la salida larga y el criterium. Déjalo en RPE 1-2, sin pelearle a nadie ni mirar números: que sea un paseo que te deje lista para lo que viene. Puedes dejar el ERG prendido para que el rodillo te marque el ritmo bajo, o apagarlo si prefieres ir por sensación; tú decides. Si al final te sientes con más energía de la que esperabas, no la conviertas en esfuerzo, la idea es recuperar._

- **martes 27 oct — Umbral 3×12** · 70 min · TSS ≈ 72
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 3× (12' @ 95% (223 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Esta es la misma sesión de umbral de la semana pasada, pero con bloques de 12 minutos en vez de los de antes. Lo que vas a ganar es aguantar más tiempo, así que no busques más watts. Te recomiendo dejar el ERG prendido para sostener el 95 % FTP parejo, y tú solo cuida la cadencia. Los primeros 6 minutos de cada bloque van con respiración controlada; si al final de los bloques sientes RPE 7-8, vas exactamente como debe ser. Llegas al martes con mucho trabajo hecho, así que cuida la recuperación entre bloques._

- **miércoles 28 oct — Fondo 90 min** · 90 min · TSS ≈ 65 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 75' @ 68% (160 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Miércoles de fondo aeróbico, de esos que se disfrutan platicando. Aquí no hay watts que perseguir: va por sensación, RPE 3-4, con la respiración tranquila. Te recomiendo dejar el ERG apagado y rodar en calle plana, y si prefieres el control del rodillo lo prendes con el botón ⚡. Si notas que el pulso sube en la segunda mitad, estás yendo fuerte: baja un poco hasta volver a platicar. Esto te deja una base sólida para el resto de la semana._

- **jueves 29 oct — Rodada suave** · 60 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 10' @ 45→55% (106→129 W)
  - Constante 45' @ 58% (136 W)
  - Enfriamiento 5' @ 45% (106 W)
  - _Jueves de rodada suave para soltar las piernas el día de gimnasio. Va en RPE 2-3, sin prisa y sin forzar nada. Lo tienes en calle plana con ERG apagado, así que ajusta tú el ritmo por sensación; si prefieres el ERG, lo prendes con el botón ⚡. Si las piernas se sienten pesadas, no te preocupes, es justo para eso. Lo que buscas es llegar al fin de semana fresca, porque viene una carga importante._

- **domingo 1 nov — Arranques y 30/30 (3 series)** · 76 min · TSS ≈ 38 · por sensación (sin ERG)
  - Calentamiento 15' @ 50→70% (118→165 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 6× (12" libre, por sensación y sin ERG (referencia ~160% (376 W)) + 2.8' @ 50% (118 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Domingo de arranques y 30/30, con una serie más que la semana pasada y los mismos sprints. Va con ERG apagado y tú regulas el esfuerzo: la idea es que la potencia se mantenga pareja hasta el final de cada serie, sin irte al máximo al principio. En los sprints sí dales todo, con recuperación completa para que el último también salga fuerte. Si notas que te pasaste en una serie, baja un poco en la siguiente y anótalo para tu coach. Terminas la semana con trabajo de calidad y con la satisfacción de haber cerrado bien._
- _Fuera del rodillo:_ **lunes 26 oct — Gimnasio: tren superior y core** (45 min): Enfócate en tren superior y core: mañana hay umbral y las piernas deben llegar frescas.
- _Fuera del rodillo:_ **jueves 29 oct — Gimnasio: pierna ligera** (45 min): Pierna ligera y core, porque el sábado hay salida larga. Termina con energía.
- _Fuera del rodillo:_ **sábado 31 oct — Salida larga con el equipo** (210 min): 3 h 30 min afuera a RPE 3-4, comiendo desde el minuto 30. Si el grupo sube el ritmo, no te quemes.

#### Semana 3 · 5 sesiones de rodillo · 5.9 h · TSS ≈ 238

- **lunes 2 nov — Rodada de recuperación** · 45 min · TSS ≈ 19
  - Constante 45' @ 50% (118 W)
  - _Hoy toca soltar las piernas, no sumar kilómetros. Prende el ERG y deja que el rodillo marque un ritmo suave al 50 % de tu FTP; tu única tarea es pedalear sin pelear con nada. Si te sientes pesada al arrancar, eso es normal y se va en unos minutos. Puedes hablar en frases completas durante toda la rodada. Es una buena forma de empezar la semana con las piernas listas para lo que viene._

- **martes 3 nov — Umbral 4×10** · 78 min · TSS ≈ 82
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 4× (10' @ 97% (228 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Hoy es el día de sostener el umbral, y ya llevas dos semanas construyéndolo. Prende el ERG: el rodillo lleva la potencia de cada bloque de 10 minutos al 97 % y tú cuidas la cadencia. Los bloques deben sentirse sostenibles, alrededor de RPE 7-8: exigentes, pero controlados, con respiración agitada y frases cortas. Si en algún bloque no alcanzas la potencia, no te obligues; baja 3-5 puntos y anótalo para que lo platiquemos. Llega con las piernas descansadas y verás que el cuarto bloque se siente mejor de lo que esperas._

- **miércoles 4 nov — Fondo 90 min** · 90 min · TSS ≈ 65 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 75' @ 68% (160 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Hoy es un fondo tranquilo para recuperar el trabajo de umbral de ayer. Va por sensación, con el ERG apagado: pedalea cómoda a RPE 3-4, con la respiración tranquila y la posibilidad de hablar en frases completas. Si el ritmo empieza a subir solo, bájalo; el objetivo es salir con la sensación de que pudiste más. Si prefieres usar ERG, puedes prenderlo con el botón ⚡, pero no hace falta. Es un día para rodar sin prisa y sin querer demostrar nada._

- **jueves 5 nov — Rodada suave** · 60 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 10' @ 45→55% (106→129 W)
  - Constante 45' @ 58% (136 W)
  - Enfriamiento 5' @ 45% (106 W)
  - _Rodada suave antes del gimnasio, sin ERG y por sensación. Pedalea con las piernas sueltas a RPE 2-3, en un ritmo en el que puedas platicar sin esfuerzo. Si quieres usar ERG para mantener el ritmo, prende el botón ⚡, aunque la idea es que te sientas ligera y con buena cadencia. Es un día para moverte, calentar bien el cuerpo y llegar al gimnasio con energía._

- **domingo 8 nov — Arranques y 30/30 + 8 sprints** · 82 min · TSS ≈ 41 · por sensación (sin ERG)
  - Calentamiento 15' @ 50→70% (118→165 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (30" libre, por sensación y sin ERG (referencia ~130% (306 W)) + 30" @ 50% (118 W))
  - Recuperación 3' @ 50% (118 W)
  - 8× (12" libre, por sensación y sin ERG (referencia ~160% (376 W)) + 2.8' @ 50% (118 W))
  - Enfriamiento 10' @ 50% (118 W)
  - _Hoy cierras la semana con la sesión más intensa: arranques y 30/30, y al final ocho sprints más. Va sin ERG, así que regulas tú la potencia; si quieres la referencia del rodillo, prende el botón ⚡, pero el control es tuyo. En los 30 fuertes busca un esfuerzo alto pero parejo, y en los sprints de 12 segundos da todo al máximo con recuperación completa. Si notas que pierdes potencia, para y descansa sin culpa, porque cada sprint limpio vale más que uno forzado. Al terminar sentirás las piernas pesadas, y eso es lo esperado después de una semana de carga._
- _Fuera del rodillo:_ **lunes 2 nov — Gimnasio: tren superior y core** (45 min): Tren superior y core: mañana hay umbral y las piernas tienen que estar frescas.
- _Fuera del rodillo:_ **jueves 5 nov — Gimnasio: pierna ligera** (45 min): Pierna ligera y core: el sábado hay salida larga. Cuida las piernas.
- _Fuera del rodillo:_ **sábado 7 nov — Salida larga con el equipo** (210 min): 3 h 30 min afuera a RPE 3-4, comiendo desde el minuto 30. Es la última salida larga antes de la descarga.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Parte de su semana real:** umbral el martes, fondo el miércoles, salida larga el sábado, arranques el domingo.
- **En temporada:** umbral (3×10 → 4×10 min al 95–97%) y arranques desde la semana 1.
- **Salida larga afuera con el equipo:** 3 h 30 min los sábados, que completa las horas que el rodillo no da.
- **Retest de 20 min en la semana 4** (su último test fue hace 2 semanas).

**Qué cambió desde la corrida 1:** Antes: todo en rodillo (máximo 90 min) y sin salida larga. Ahora: respeta su salida del sábado y su estructura.

**Para revisar:**

- Rodillo 4.7–5.9 h + 3.5 h afuera = ~8–9.5 h, de 11 disponibles y 12 que venía haciendo. ¿Bien a 8 semanas del selectivo?
- Le presenta el tope general de 90 min como si ella lo hubiera puesto (para Torq).

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

<a id="p06"></a>
## 06. Javier Hernández — Papá con poco tiempo, gravel de 100 km, FTP provisional

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 37 años · hombre · 79 kg |
| **Disciplina** | Gravel · no compite |
| **Experiencia** | Con experiencia · Ciclista activo · 5 años rodando · 1 con plan estructurado |
| **FTP** | 250 W — provisional (estimado), hace 3 días (3.2 W/kg) |
| **FC máxima** | No la sabe · reposo: 60 lpm |
| **Últimas 4 semanas** | rodadas suaves, ~3 h/sem |
| **Su semana típica (textual)** | «Martes y jueves 40 min de rodillo suave antes de que despierten mis hijos; el sábado salgo 1.5 h de gravel cuando puedo.» |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 6 h (calidad mala) · estrés alto · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: más o menos · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 4 h/sem · martes, miércoles, jueves, sábado · máx 120 min por sesión |
| **Su objetivo (textual)** | «Gravel de 100 km en la Sierra Gorda el 17 de enero de 2027. Tengo dos hijos chicos: entre semana solo puedo 40 minutos temprano y el sábado hasta 2 horas. Duermo mal.» |

**Perfil de arranque (reglas de Torq):** test de rampa · arranque conservador · enseñarle a usar RPE · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Gravel Sierra Gorda 100 km · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base | 4 | 3.5 | Constancia con poco tiempo: 40 min entre semana y salida larga afuera el sábado de 1.5 h a 2 h. La semana 4 es de descarga. Test de rampa en la semana 1. |
| Construcción | 4 | 4 | Tempo y sweet spot en bloques cortos entre semana, y salida larga de 2 h a 2.5 h con comida. Retest al abrir el bloque. |
| Específico gravel | 3 | 4 | Ritmo sostenido con cambios de ritmo (repechos y grupos) y salida larga de hasta 3 h afuera, con descarga cada 3 semanas. |
| Afinación y carrera | 2 | 3 | Bajamos volumen, conservamos algo de calidad y llegamos fresco al domingo 17 de enero. |

**Próximo test:** ramp · Ya tienes experiencia con esfuerzos máximos; el jueves de la semana 1 llegas con dos rodadas suaves previas y el día anterior tranquilo.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Javier, la demanda de un gravel de 100 km es ritmo sostenido muchas horas con repechos, así que priorizo base y salida larga afuera, luego tempo y sweet spot. Con tus 4 h reales (3 sesiones de 40 min más 2 h el sábado) sumamos 4 h; ese es tu techo y lo respetamos. Tu sueño corto y el estrés alto pesan: arrancamos conservadores, con una sola sesión de intensidad por semana y el RPE como guía. Hasta el test la intensidad va por sensación; el jueves de la semana 1 haces la rampa de 2 min por escalón, que te da tus zonas en watts. Sube a la bici de rodillo solo para trabajo de calidad: la salida larga del sábado va afuera.

#### Semana 1 · 3 sesiones de rodillo · 2.1 h · TSS ≈ 47 (sin contar el test)

- **martes 20 oct — Rodada suave** · 40 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 62%
  - Enfriamiento 5' @ 50%
  - _Javier, esta es una rodada para soltar las piernas y reconocer el rodillo antes del test. Va por sensación, así que arranca sin ERG y tú marcas el ritmo con tus cambios; si prefieres usar ERG, lo prendes con el botón ⚡. Mantente en un esfuerzo donde puedas hablar en frases completas, y si no puedes, baja y anótalo para tu coach. Con esto llegas con las piernas listas para el miércoles._

- **miércoles 21 oct — Rodada suave** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Hoy va muy suave: a platicar sin problema, con RPE 3-4 y la cadencia que te salga natural, que es justo lo que necesitas el día antes del test. Arranca sin ERG, así que vas por sensación; si quieres ERG, lo prendes con el botón ⚡. Lo importante es llegar descansado, así que no lo conviertas en un día de más esfuerzo. Si sientes las piernas pesadas, baja un poco más._

- **jueves 22 oct — Test de rampa** · 48 min · 🧪 test hasta el fallo (la duración es el máximo posible)
  - Rampa: escalones de 2' subiendo ~12.5% cada uno, de 25% hasta 313% o hasta no poder más (24 escalones como máximo)
  - _Hoy es tu primer test de rampa y el objetivo es familiarizarte con cómo sube la potencia. Prende ERG: el rodillo sube 25 W cada 2 minutos y tú sostienes la cadencia mientras puedas. Llega descansado y con ventilador, y contesta el RPE con honestidad: para en 8, no en 10. Cuando la cadencia empiece a caerse, esa es tu señal de cierre. No te preocupes si no sale perfecto, porque el siguiente saldrá mejor._
- _Fuera del rodillo:_ **sábado 24 oct — Salida de gravel** (90 min): Rueda tus 1.5 h de gravel a RPE 3-4, platicando sin problema. Come algo desde el minuto 30.

#### Semana 2 · 3 sesiones de rodillo · 2 h · TSS ≈ 72

- **martes 27 oct — Intervalos por sensación** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 58%
  - 3× (5' libre, por sensación y sin ERG (referencia ~95%) + 4' @ 50%)
  - Enfriamiento 5' @ 50%
  - _Hoy es tu primer contacto con intensidad en el plan, así que va despacio y con cabeza: tres bloques de 5 minutos a RPE 7, donde solo te salen frases cortas. Va por sensación, sin ERG, y dosifica para que el último bloque salga igual que el primero. Las recuperaciones son suaves, sin parar del todo. Si al tercero sientes que se te va la respiración, baja un poco y listo; lo importante es terminar parejo._

- **miércoles 28 oct — Fondo suave** · 40 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 62%
  - Enfriamiento 5' @ 50%
  - _Hoy toca absorber el trabajo del martes con un fondo tranquilo, a RPE 3-4, donde puedas platicar en frases completas y con cadencia natural. Va sin ERG, por sensación. Si dormiste mal, hazlo todavía más suave: el objetivo es llegar fresco al jueves, no exprimirte hoy._

- **jueves 29 oct — Fondo con cambios de ritmo** · 40 min · TSS ≈ 26 · por sensación (sin ERG)
  - Calentamiento 7' @ 55%
  - 4× (2' @ 78% + 4' @ 62%)
  - Enfriamiento 9' @ 50%
  - _Fondo a RPE 3-4 con cuatro cambios suaves de ritmo de 2 minutos a RPE 5, como los repechos de gravel. Va sin ERG: regula tú los cambios según cómo te sientas. Entre cambio y cambio vuelve a hablar en frases completas antes del siguiente. Te deja las piernas activas después del trabajo del martes sin cargarlas de más._
- _Fuera del rodillo:_ **sábado 31 oct — Salida larga de gravel** (105 min): Salida larga a RPE 3-4, platicando sin problema. Come desde el minuto 30 y practica tu comida de carrera.

#### Semana 3 · 3 sesiones de rodillo · 2 h · TSS ≈ 74

- **martes 3 nov — Intervalos por sensación** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 7' @ 58%
  - 3× (6' libre, por sensación y sin ERG (referencia ~95%) + 4' @ 50%)
  - Enfriamiento 3' @ 50%
  - _Hoy toca subirle a la intensidad con tres bloques de 6 minutos a RPE 7, y como ya tienes zonas de tu test, el truco es que los tres salgan parejos: regula tú la potencia, sin ERG, y que cada bloque se sienta igual que el anterior en lugar de arrancar fuerte y apagarte. Piensa en frases cortas mientras pedaleas. Entre bloques recupera suave sin parar del todo, así llegas al tercero con las piernas todavía frescas. Si el tercer bloque se siente igual de controlado que el primero, vas muy bien; si cae mucho, es señal de bajar un poco la potencia la próxima vez._

- **miércoles 4 nov — Fondo suave** · 40 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 62%
  - Enfriamiento 5' @ 50%
  - _Hoy es día de rodar tranquilo: 30 minutos de fondo a RPE 3-4, de los que puedes platicar sin problema. Sin ERG, a tu sensación, y si la frecuencia cardiaca empieza a subir de más, baja un poco y déjala asentarse. Es un entreno para soltar las piernas y sumar base, no para medirte, así que disfrútalo y deja que el ritmo sea cómodo de principio a fin._

- **jueves 5 nov — Fondo con tempo suave** · 40 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 7' @ 55%
  - Constante 10' @ 78%
  - Constante 15' @ 62%
  - Enfriamiento 8' @ 50%
  - _Hoy el protagonista es un bloque de 10 minutos de tempo suave a RPE 5, donde debes poder sostener frases cortas sin ahogarte; es la base que te va a servir para los tramos sostenidos del gravel. Sin ERG, regulas tú la potencia, así que mantén un ritmo parejo y no te vayas de más al inicio. Antes y después hay rodada de fondo que te deja el cuerpo entrando en calor y bajando sin prisa. Si al final del tempo todavía puedes decir algo completo, vas bien; si no, anótalo para tu coach._
- _Fuera del rodillo:_ **sábado 7 nov — Salida larga de gravel** (120 min): Tu salida larga de 2 h a RPE 3-4, con comida desde el minuto 30. Si vienes con mal sueño, mejor más tranquilo.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Ignora el FTP provisional:** todo por sensación hasta la rampa del jueves de la semana 1.
- **Su tiempo real:** 3 × 40 min entre semana y el sábado de gravel afuera 1 h 30 → 2 h (su techo de 4 h).
- **Conservador:** sueño corto y estrés alto; una sola sesión de intensidad por semana (tempo hasta 78% por RPE).

**Qué cambió desde la corrida 1:** Casi igual. Ahora las semanas 2 y 3 tienen un tempo por RPE (hasta 78%) en lugar de solo fondo.

**Para revisar:**

- ¿Rampa en la semana 1 con sueño malo y estrés alto?

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

<a id="p07"></a>
## 07. Lucía Fernández — MTB recreativa con asma, quiere subir el Ajusco sin bajarse

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 46 años · mujer · 64 kg |
| **Disciplina** | Montaña · no compite |
| **Experiencia** | Retoma o nuevo en apps de entrenamiento · Ciclista activo · 3 años rodando · 0 con plan estructurado |
| **FTP** | No lo sabe |
| **FC máxima** | No la sabe · reposo: no sabe |
| **Últimas 4 semanas** | rodadas suaves, ~3 h/sem |
| **Su semana típica (textual)** | «Martes rodillo 45 min suave y sábado rodada de montaña de 2 h con mis amigas; me bajo en las subidas largas.» |
| **Salud** | Condiciones: asma · medicamento: Inhalador (salbutamol) antes de rodar · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés medio · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: no · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Yoga / movilidad 1×/sem de 60 min (miércoles) |
| **Disponibilidad** | 4 h/sem · martes, jueves, sábado |
| **Su objetivo (textual)** | «Subir el Ajusco sin bajarme de la bici en las rodadas con mis amigas. Martes y jueves rodillo; el sábado salgo a rodar con ellas. No compito.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Ajusco sin bajarte · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y primeras subidas sostenidas | 4 | 3.5 | Construir fondo y tempo suave en el rodillo (martes y jueves) y una salida larga de montaña el sábado de 2 h a 2 h 15 min. Semana 4 de descarga. |
| Subida sostenida por sensación | 4 | 4 | Bloques de umbral por RPE de 6-10 min y tempo largo para sostener subidas de 20-30 min. Sábado de 2 h 15 min a 2 h 30 min, semana 8 de descarga. |
| Específico Ajusco | 4 | 4 | Bloques más largos por RPE 6-7 simulando la subida, con sábado de 2 h 30 min en montaña. Última semana ligera y fresca. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Lucía, parto de lo que ya haces (martes de rodillo suave y sábado de 2 h) y subo poco a poco; con 4 h y tres días, la demanda de subir el Ajusco es tempo sostenido, así que priorizo fondo y tempo por sensación. Como tienes asma y usas inhalador, antes de apretar conviene que tu médico te dé luz verde; mientras, construimos con cuidado y sin tests máximos. Todavía no hay FTP medido, así que todo va por sensación (RPE): 3-4 = puedes platicar, 6-7 = solo frases cortas, 8-9 = pocas palabras, 10 = no puedes más. Ajusto con tus primeras sesiones; tu yoga del miércoles lo tomé en cuenta y lo dejé libre entre rodillos. El rodillo no entrena el manejo en montaña, así que tus sábados son la mejor práctica. Sobre el Ajusco, aún no sé qué tiempo es realista: vamos viendo con las primeras semanas; la meta es subir sin bajarte.

#### Semana 1 · 2 sesiones de rodillo · 1.9 h · TSS ≈ 73

- **martes 20 oct — Fondo con cambios de ritmo** · 53 min · TSS ≈ 35 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - 4× (2' @ 75% + 5' @ 62%)
  - Constante 10' @ 62%
  - Enfriamiento 5' @ 55%
  - _Rodada de fondo con cambios de ritmo para despertar las piernas. Vas por sensación con ERG apagado: tú mandas, no los números. Quédate en un ritmo donde puedas platicar en frases completas, y si no puedes, baja; en los cuatro cambios de dos minutos sube a frases cortas. Usa tu inhalador como te indicó tu médico. Vas a sentir las piernas más despiertas al final, y eso te deja lista para el jueves._

- **jueves 22 oct — Fondo conversacional** · 60 min · TSS ≈ 38 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - Constante 45' @ 63%
  - Enfriamiento 5' @ 55%
  - _Una hora continua a ritmo conversacional, de esas que te dejan la cabeza en orden. Va con ERG apagado, así que rueda por sensación: si puedes hablar en frases completas y el pulso no se te va subiendo hacia el final, vas muy bien. Busca una cadencia natural y no fuerces. Es el tipo de rodada que construye base, así que disfrútala sin prisa._
- _Fuera del rodillo:_ **sábado 24 oct — Rodada de montaña con tus amigas** (120 min): Sal a rodar a RPE 3-4 en lo plano y sostén RPE 5-6 en las subidas; si te falta el aire, baja un cambio antes de bajarte de la bici. Come algo desde el minuto 30 y lleva tu inhalador.

#### Semana 2 · 2 sesiones de rodillo · 1.9 h · TSS ≈ 77

- **martes 27 oct — Fondo con bloques de tempo suave** · 51 min · TSS ≈ 36 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - 2× (8' @ 76% + 5' @ 58%)
  - Constante 10' @ 62%
  - Enfriamiento 5' @ 55%
  - _Martes te toca un fondo con dos bloques de tempo suave, de esos que te preparan para una subida sostenida sin desgastarte. Hazlo con ERG apagado y tu cadencia natural: en los bloques de 8 minutos ve a un ritmo donde puedas decir frases cortas sin ahogarte, y en los 5 minutos de recuperación baja a un ritmo muy suave para llegar entera al siguiente. Si prefieres ERG, lo prendes con el botón ⚡, pero aquí el control lo tienes tú. Vas a sentir las piernas trabajar en los bloques, pero si la respiración se te corta, baja un poco y anótalo para tu coach._

- **jueves 29 oct — Fondo conversacional** · 63 min · TSS ≈ 41 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - Constante 48' @ 64%
  - Enfriamiento 5' @ 55%
  - _Jueves es día de acumular tiempo cómodo: una hora de fondo por sensación, sin persiguir números. Ve con ERG apagado, a un ritmo donde puedas hablar en frases completas, y si lo prefieres puedes prenderlo con el botón ⚡. Lo que buscas es sentirte suelta y tranquila durante todo el rodado, con las piernas sueltas y la respiración estable. Si te cuesta mantener frases completas, baja el ritmo; este día construye base y no pide sufrir._
- _Fuera del rodillo:_ **sábado 31 oct — Rodada de montaña con tus amigas** (125 min): Mismo plan: fácil en lo plano, RPE 5-6 en las subidas largas, y trata de seguir pedaleando en vez de bajarte. Come desde el minuto 30 y lleva tu inhalador.

#### Semana 3 · 2 sesiones de rodillo · 2 h · TSS ≈ 82

- **martes 3 nov — Tempo en bloques por sensación** · 55 min · TSS ≈ 41 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - 2× (10' @ 78% + 5' @ 58%)
  - Constante 10' @ 62%
  - Enfriamiento 5' @ 55%
  - _Hoy toca tempo por bloques, y el truco está en arrancar contenida: el primer minuto tiene que sentirse fácil, casi aburrido. Vas a hacer dos bloques de 10 minutos a RPE 6, con frases cortas y respiración marcada pero controlada, con el ERG apagado para que vayas por sensación y regules tú el ritmo; si prefieres el ERG, lo puedes prender con el botón ⚡, pero te recomiendo probar primero por sensación. Entre bloques, 5 minutos suaves a RPE 3 para recuperar. Si al final te quedó energía, eso es buena señal: significa que el ritmo estuvo bien medido y el jueves llegas fresca._

- **jueves 5 nov — Fondo conversacional** · 63 min · TSS ≈ 41 · por sensación (sin ERG)
  - Calentamiento 10' @ 55→62%
  - Constante 48' @ 64%
  - Enfriamiento 5' @ 55%
  - _Hoy es un fondo conversacional de una hora, sin prisa y sin presión. Ruedas a RPE 3-4 por sensación, con el ERG apagado, y la referencia es poder hablar en frases completas todo el tiempo; si en algún momento no puedes, baja un poco. Si el martes te dejó cansada, esta sesión es para bajarle a la intensidad y disfrutar la bici, así que no intentes subirle el ritmo. Esto te deja las piernas sueltas para el fin de semana._
- _Fuera del rodillo:_ **sábado 7 nov — Rodada de montaña con tus amigas** (135 min): Subimos 10 minutos la salida. Mantén RPE 5-6 en las subidas largas y recupera en lo plano; la idea es subir sin bajarte, aunque sea a tu ritmo.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero:** asma con inhalador. Sin test ni máximos, por sensación, nada arriba de 78%.
- **Parte de lo que ya hace:** martes de rodillo y sábado de 2 h con sus amigas (2 h → 2 h 15); jueves rodillo; yoga del miércoles libre.
- **Meta honesta:** «aún no sé qué tiempo es realista… la meta es subir sin bajarte».

**Qué cambió desde la corrida 1:** Antes ya iba bien. Ahora parte explícitamente de su rutina y dice la meta. Ya no hay errores de género.

**Para revisar:**

- ¿Trabajo de fuerza en subida (cadencia baja) antes del bloque 2?

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

<a id="p08"></a>
## 08. Daniel Ortiz — Exfutbolista con sobrepeso y molestia de rodilla

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 31 años · hombre · 98 kg |
| **Disciplina** | Sin disciplina (salud / general) · no compite |
| **Experiencia** | Nuevo en el ciclismo · Sedentario · 0 años rodando · 0 con plan estructurado |
| **FTP** | No lo sabe |
| **FC máxima** | No la sabe · reposo: 78 lpm |
| **Últimas 4 semanas** | poco o nada, ~0 h/sem |
| **Salud** | Condiciones: Ninguna · lesión reciente: no · molestias: Molestia en la rodilla derecha: me operaron el menisco hace 4 años y me duele al subir escaleras rápido. |
| **Hábitos** | Duerme 6.5 h (calidad regular) · estrés medio · fuma: ocasional · alcohol: 1–2 veces por semana |
| **Esfuerzo** | ¿Sabe usar RPE?: no · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 4 h/sem · lunes, martes, jueves, sábado · máx 60 min por sesión |
| **Su objetivo (textual)** | «Bajar 12 kg y volver a estar en forma. Jugaba fútbol hasta hace 2 años y dejé de hacer ejercicio.» |

**Perfil de arranque (reglas de Torq):** sin test: por sensación, subiendo de a poco · base aeróbica antes de intensidad (tabaco/alcohol) · enseñarle a usar RPE · no hace máximos porque: viene de estar sedentario; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Volver a rodar: base y constancia · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base 1: hábito y rodillo | 4 | 2.5 | Tres rodadas por semana de 40-60 min a RPE 3-4, en las que puedas hablar en frases completas. Aprendemos la escala de esfuerzo y cuidamos la rodilla. |
| Base 2: más volumen | 4 | 3.3 | Sumamos minutos poco a poco, hasta cuatro sesiones si las toleras. Entran cambios de ritmo suaves por sensación y la primera medición del esfuerzo. |
| Construcción | 4 | 4 | Entran intervalos cortos a RPE 7 y rodadas de hasta 60 min, con una semana de descarga para asimilar. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Daniel, tus 4 h caben en 4 días de 60 min, pero como vienes de dos años sin entrenar empezamos con 3 sesiones (~2 h 10 min) y dos días libres entre ellas; el lunes queda de descanso. Hasta que midamos tu esfuerzo todo va por sensación: RPE 3-4 = puedes platicar, 6-7 = solo frases cortas, 8-9 = pocas palabras, 10 = no puedes más. Rodilla: cadencia cómoda, sin fuerza a cadencia baja ni arrancadas máximas; como la molestia sigue desde la cirugía, te recomiendo que la revise un fisioterapeuta o médico del deporte. Sobre los 12 kg, no prometo cifras ni plazos: el plan te da constancia y la alimentación que la vea un nutriólogo. Vemos cómo respondes en las primeras semanas para decidir cuándo medirte.

#### Semana 1 · 3 sesiones de rodillo · 2.2 h · TSS ≈ 72

- **martes 20 oct — Rodada fácil 1** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 26' @ 60%
  - Enfriamiento 6' @ 50%
  - _Martes es tu primera toma de contacto con el rodillo, así que vas a rodar tranquilo y por sensación, con el ERG apagado: la idea es que la bici se sienta tuya antes de pedirle nada. Te recomiendo dejarlo apagado hoy; si prefieres probarlo, lo prendes con el botón ⚡, pero no lo necesitas. Busca un RPE de 3 a 4, de los que puedes platicar en frases completas, y usa la cadencia que te salga natural. Si notas que no puedes hablar, baja la potencia sin pena. Al terminar te vas a sentir ligero y con ganas de más, que es justo lo que queremos._

- **jueves 22 oct — Rodada fácil 2** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 26' @ 60%
  - Enfriamiento 6' @ 50%
  - _Jueves repite la misma sensación del martes: suave, constante y sin forzar, con RPE de 3 a 4. El ERG va apagado y tú llevas el ritmo por cómo te sientes. Hoy el objetivo es crear el hábito, así que si vas bien no subas la potencia por subirla. Mantén una cadencia cómoda y, si la rodilla empieza a molestar, detente y avísame. Esto te deja con las piernas frescas para el sábado._

- **sábado 24 oct — Rodada de base** · 50 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 35' @ 60%
  - Enfriamiento 5' @ 50%
  - _Sábado es una rodada de base un poco más larga, pero a la misma sensación de siempre: RPE de 3 a 4 y la capacidad de hablar sin problema. Con el ERG apagado, vas por sensación y tú decides el ritmo durante los 50 minutos. Cuando termines, anota tu RPE del 1 al 10 para que pueda ajustar mejor lo que sigue. Es una buena forma de cerrar la semana con kilómetros de calidad y sin exigirte de más._

#### Semana 2 · 3 sesiones de rodillo · 2.4 h · TSS ≈ 81

- **martes 27 oct — Rodada fácil 1** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 31' @ 60%
  - Enfriamiento 6' @ 50%
  - _Martes de rodada fácil, de esas que se disfrutan: cinco minutos más que la semana pasada, pero a la misma sensación, RPE 3-4, en la que puedes platicar sin problema. Va sin ERG, por sensación, con cadencia natural y sin prisa; si prefieres el control del rodillo, puedes prender el ERG con el botón ⚡. Lo que esperar es piernas sueltas y respiración cómoda todo el tiempo; si en algún momento ya no puedes hablar en frases completas, baja un poco y anótalo para tu coach. Esta rodada te deja el cuerpo listo para el jueves._

- **jueves 29 oct — Rodada fácil 2** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 31' @ 60%
  - Enfriamiento 6' @ 50%
  - _Jueves de rodada suave y pareja, con RPE 3-4 y la idea de salir de aquí con ganas de más. Va sin ERG, por sensación; si prefieres el rodillo, lo prendes con el botón ⚡. Si el pulso se te dispara o ya no puedes hablar, baja la potencia sin pensarlo. Si la rodilla molesta en algún momento, para y avísame, eso no se negocia._

- **sábado 31 oct — Rodada de base** · 55 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 40' @ 60%
  - Enfriamiento 5' @ 50%
  - _Sábado es tu rodada más larga hasta ahora: 55 minutos a RPE 3-4, así que la clave es dosificar desde el inicio para terminar sintiendo que podrías seguir. Va sin ERG, por sensación; si quieres el control del rodillo, prende el ERG con el botón ⚡. Espera piernas sueltas y una respiración que te permita platicar; si empiezas a apretar de más en la primera parte, afloja. Al terminar, marca tu RPE para que tengamos un dato real de cómo te fue._

#### Semana 3 · 3 sesiones de rodillo · 2.5 h · TSS ≈ 83

- **martes 3 nov — Rodada fácil** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 31' @ 60%
  - Enfriamiento 6' @ 50%
  - _Martes: rodada fácil de 45 minutos para consolidar lo de la semana pasada. Va con ERG apagado, por sensación; si prefieres ERG, lo prendes con el botón ⚡, pero aquí lo que manda es tu cuerpo. Busca una cadencia cómoda y respiración tranquila, en RPE 3-4, de modo que puedas hablar en frases completas. Es un rodaje sencillo que te deja las piernas frescas para el jueves._

- **jueves 5 nov — Primeros esfuerzos** · 44 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 15' @ 60%
  - 3× (2' libre, por sensación y sin ERG (referencia ~85%) + 3' @ 50%)
  - Enfriamiento 6' @ 50%
  - _Jueves: primeros esfuerzos, tu primer contacto con un esfuerzo más fuerte. Son tres bloques de 2 minutos a RPE 7, donde solo te saldrán frases cortas, con 3 minutos muy suaves entre cada uno. Va con ERG apagado: tú regulas la potencia, siempre sentado y sin arrancadas fuertes por la rodilla. Si los primeros bloques se sienten muy duros, baja un poco; mejor terminar con control que pasarte. Lo que esperas sentir es piernas cargadas y respiración agitada en los bloques, con recuperación clara entre ellos. Si el dolor de rodilla aparece, para y anótalo para tu coach._

- **sábado 7 nov — Rodada de base** · 60 min · TSS ≈ 34 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 45' @ 60%
  - Enfriamiento 5' @ 50%
  - _Sábado: rodada de base de 60 minutos continuos, el tope de tu tiempo por sesión. Va con ERG apagado, por sensación; si prefieres ERG, lo prendes con el botón ⚡. Busca un ritmo parejo en RPE 3-4, sin subirte en los tramos. Si puedes platicar de principio a fin, vas perfecto. Es la sesión que construye tu resistencia para la semana._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **La rodilla manda:** cadencia cómoda, sin fuerza a cadencia baja ni arranques máximos; recomienda fisioterapeuta o médico del deporte.
- **Sin test, todo a RPE 3–4** (≤60%): dos años sin entrenar y no sabe usar RPE.
- **3 sesiones (~2.2 h) de 4 disponibles,** con días libres entre ellas.
- **Peso:** «no prometo cifras ni plazos»; nutriólogo.

**Qué cambió desde la corrida 1:** Más prudente que antes: tope de 60% (antes, cambios hasta 74%) y dice explícitamente que no promete kilos.

**Para revisar:**

- ¿Muy suave para un exfutbolista de 31 años? ¿4ª sesión desde el inicio?

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

<a id="p09"></a>
## 09. Fernando Ruiz — XCO Master 50 a media temporada, Copa Nacional en 8 semanas

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 51 años · hombre · 72 kg |
| **Disciplina** | Montaña · compite (Master 50) |
| **Experiencia** | Con experiencia · Ciclista activo · 15 años rodando · 8 con plan estructurado |
| **FTP** | 265 W — test de rampa, hace 10 días (3.7 W/kg) |
| **FC máxima** | 176 lpm (medida) · reposo: 48 lpm |
| **Últimas 4 semanas** | con intensidad, ~9 h/sem |
| **Su semana típica (textual)** | «Lunes rodillo suave, martes 40/20 o series de VO2, jueves técnica en el cerro, sábado intervalos de umbral y domingo salida larga de 3 h. Corrí la segunda fecha de la Copa hace 2 semanas.» |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés bajo · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 9 h/sem · lunes, martes, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Copa Nacional de XCO (Master 50) el 20 de diciembre de 2026. Estoy a media temporada: corrí hace 2 semanas. Quiero llegar con más chispa en los arranques y en las subidas cortas.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: bajo

### Lo que armó el coach IA

**Plan:** Copa Nacional XCO: chispa en arranques y subidas cortas · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Construcción específica XCO | 3 | 7.5 | Mantenemos tu estructura actual: 40:20s los martes, umbral los sábados y la salida larga afuera de 3 h los domingos. La semana 3 es de descarga. Subimos una variable a la vez, empezando por las series de 40:20s. |
| Específico XCO | 3 | 8.5 | Retest de 20 min al abrir el bloque. Después, salidas simuladas (1 min muy fuerte y luego sostener umbral), umbral con picos y 40:20s más largos. Salida larga de 2.5-3 h afuera, con descarga en la semana 6. |
| Afinación | 2 | 6.5 | Menos volumen y la misma calidad: arranques y subidas cortas con recuperación completa. La salida larga baja a 2 h para llegar con piernas. |
| Semana de carrera | 1 | 4 | Activación corta, frescura y logística. La Copa es el domingo 20 de diciembre. |

**Próximo test:** test20 · Pasarán más de 4 semanas del último test, llegas fresco tras la semana de descarga y sabes dosificarte en un máximo.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Fernando, ya vienes entrenando con intensidad, así que no arrancamos desde base: respeto tu semana (lunes suave, martes 40:20, jueves técnica, sábado umbral, domingo largo) y cambio solo la progresión. La demanda del XCO es intermitente y decide la capacidad de repetir arranques por encima del umbral, por eso priorizo los 40:20s y el umbral con picos. Con 51 años pongo descarga cada 3 semanas y nunca dos días duros en 72 h. Arrancamos con tus 265 W medidos el 10 de octubre y los confirmamos con un test de 20 min en la semana 4, ya pasadas más de 4 semanas del último. El rodillo no entrena técnica: por eso la salida del jueves al cerro cuenta como parte del plan. El plan no usa las 9 h completas porque la sesión larga es afuera: cuento 3 h el domingo más el rodillo y la técnica.

#### Semana 1 · 2 sesiones de rodillo · 2.2 h · TSS ≈ 101

- **martes 20 oct — 40:20s: arranques** · 63 min · TSS ≈ 37
  - Calentamiento 15' @ 50→70% (133→186 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 3' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 3' @ 50% (133 W)
  - Constante 20' @ 65% (172 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy toca chispa, Fernando: 2 series de 6 arranques de 40 segundos fuertes con 20 suaves, con el ERG suelto. Sal a un esfuerzo que aguantes las 6 repeticiones, de RPE 8 a 9; si la potencia se desploma a mitad de serie, saliste demasiado fuerte. Te recomiendo ERG apagado para que regules tú cada arranque, y si lo prendes, que sea solo para mantener el ritmo sin pelearte con el rodillo. Entre series rueda 3 minutos suaves. Espera que la respiración se corte en los arranques y se recupere en los tramos suaves; si sientes las piernas pesadas desde el primer bloque, baja un poco la intensidad. Esta sesión afina tu punch para el fin de semana._

- **sábado 24 oct — Umbral 3×10** · 67 min · TSS ≈ 64
  - Calentamiento 12' @ 50→70% (133→186 W)
  - 3× (10' @ 95% (252 W) + 5' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Sábado de umbral: 3 bloques de 10 minutos al 95 % de tu FTP, con 5 de recuperación entre ellos. Te recomiendo dejar el ERG prendido para que el rodillo marque la potencia y tú solo sostengas la cadencia; si se te desengancha o no completas los bloques, baja 3 a 5 puntos en el siguiente intento. Busca un RPE 7, en frases cortas: si puedes hablar en frases completas, sube un poco, y si no logras decir más de unas palabras, baja y anótalo para tu coach. Llega con el día anterior suave para que las piernas respondan desde el primer bloque._
- _Fuera del rodillo:_ **jueves 22 oct — Técnica en el cerro** (90 min): Bajadas, curvas, raíces y frenado, y arranques cortos desde parado. Suave en lo cardiovascular, que se sienta como juego.
- _Fuera del rodillo:_ **domingo 25 oct — Salida larga** (180 min): 3 h afuera a RPE 3-4, con la que puedas platicar. Come desde el minuto 30 y no la conviertas en carrera.

#### Semana 2 · 3 sesiones de rodillo · 3.3 h · TSS ≈ 145

- **lunes 26 oct — Rodillo suave** · 60 min · TSS ≈ 35 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60% (133→159 W)
  - Constante 40' @ 62% (164 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy es día de piernas sueltas: 60 minutos rodando por sensación, a un RPE de 3 a 4, con una cadencia que te salga natural y sin pelear con nada. ERG apagado, así que tú marcas el ritmo; si prefieres ERG, lo prendes con el botón ⚡, pero para este día te recomiendo dejarlo apagado. La referencia es poder hablar en frases completas durante todo el rodaje. Sal cómodo y termina sintiéndote mejor de como empezaste; mañana toca calidad, y hoy esto te deja fresco para ella._

- **martes 27 oct — 40:20s: 3 series** · 64 min · TSS ≈ 37
  - Calentamiento 15' @ 50→70% (133→186 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 3' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 3' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Constante 15' @ 65% (172 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy llega la serie extra: 3 bloques de 6 repeticiones de 40 segundos fuertes por 20 suaves, con 3 minutos de recuperación entre bloques. Te recomiendo ERG suelto, es decir, apagado o prendido según lo que prefieras, pero sin fijar la potencia: busca un RPE de 8 a 9 y mantén la misma potencia en las tres series, sin arrancar explosivo para luego caer. Cuando termines, compara tus watts promedio con los de la semana pasada; esa es tu mejor medida de progreso. Si en la tercera serie sientes la respiración muy agitada y las piernas pesadas, es normal a este nivel; si de plano no puedes sostener el ritmo, baja y anótalo para tu coach._

- **sábado 31 oct — Umbral 3×12** · 73 min · TSS ≈ 73
  - Calentamiento 12' @ 50→70% (133→186 W)
  - 3× (12' @ 95% (252 W) + 5' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Sábado de umbral: tres bloques de 12 minutos al 95 % de tu FTP, con 5 minutos de recuperación entre ellos. Te recomiendo ERG prendido para que el rodillo marque la potencia y tú sostengas la cadencia; el RPE objetivo es 7, con respiración firme pero controlada. Si en el último bloque el pulso sigue subiendo sin parar, el número está alto: baja 3 a 5 puntos y termina entero. Este trabajo deja las piernas listas para el lunes de recuperación._
- _Fuera del rodillo:_ **jueves 29 oct — Técnica en el cerro** (90 min): Bajadas técnicas, curvas y salidas de curva con pedaleo fuerte. Que no termine en esfuerzo cardiovascular.
- _Fuera del rodillo:_ **domingo 1 nov — Salida larga** (180 min): 3 h a RPE 3-4, comiendo desde el minuto 30. Si las subidas te sacan de la zona, sube más suave.

#### Semana 3 · 3 sesiones de rodillo · 2.5 h · TSS ≈ 103

- **lunes 2 nov — Rodillo suave** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60% (133→159 W)
  - Constante 25' @ 62% (164 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Lunes de descarga: 45 minutos suaves para soltar las piernas después de la semana pesada. Va por sensación, sin ERG, así que ajusta la intensidad a lo que sientas; si prefieres ERG, lo prendes con el botón ⚡. Mantente a RPE 3-4, en un ritmo donde puedas hablar en frases completas. No te preocupes si se siente demasiado fácil: la idea es llegar con las piernas sueltas para lo que viene._

- **martes 3 nov — 40:20s: descarga** · 55 min · TSS ≈ 32
  - Calentamiento 15' @ 50→70% (133→186 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 3' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Constante 15' @ 65% (172 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Martes de 40:20s en modo descarga: solo dos series de 6 repeticiones, con menos volumen para mantener la calidad. Te recomiendo el ERG en modo mixto, pero tú decides cuándo prenderlo. Mide los primeros esfuerzos fuertes para no salir demasiado rápido; si el ritmo se te cae en la segunda serie, es buena señal de que vas bien dosificado. Se trata de sentir un RPE 8 en los fuertes y recuperar bien en los suaves. Esto te deja fresco para el retest._

- **sábado 7 nov — Umbral 2×10** · 52 min · TSS ≈ 46
  - Calentamiento 12' @ 50→70% (133→186 W)
  - 2× (10' @ 95% (252 W) + 5' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Sábado de umbral en modo descarga: dos bloques de 10 minutos al 95 % del FTP con el ERG prendido, que el rodillo marca el ritmo mientras tú sostienes la cadencia. Busca un RPE 7, fuerte pero controlado, y en las recuperaciones respira y prepárate para el segundo bloque. Al terminar debe quedarte la sensación de que podías hacer uno más. Llegas al final con buen margen para el resto de la semana._
- _Fuera del rodillo:_ **jueves 5 nov — Técnica ligera** (75 min): Técnica suave en el cerro, a tu ritmo y sin esfuerzo fuerte. Que sirva para soltar las piernas.
- _Fuera del rodillo:_ **domingo 8 nov — Salida larga de descarga** (120 min): 2 h a RPE 3-4, comiendo desde el minuto 30. Es descarga: no la alargues.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Respeta su semana:** lunes suave, martes 40:20, jueves técnica, sábado umbral, domingo largo; «cambio solo la progresión».
- **XCO = repetir esfuerzos arriba del umbral:** 40:20 s y umbral con picos.
- **51 años:** descarga cada 3 semanas y nunca dos días duros en 72 h.
- **Su FTP (rampa de hace 10 días) se queda** hasta el test de 20 min de la semana 4.

**Qué cambió desde la corrida 1:** Antes ya iba bien. Ahora lo construye explícitamente sobre su rutina y explica por qué no usa las 9 h (la salida larga es afuera).

**Para revisar:**

- ¿Faltan arranques más cortos (10–15 s) para XCO?

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

<a id="p10"></a>
## 10. Paola Jiménez — Diabetes tipo 2 controlada, entrena por salud y diversión

### Perfil

| | |
|---|---|
| **Edad · sexo · peso** | 39 años · mujer · 70 kg |
| **Disciplina** | Sin disciplina (salud / general) · no compite |
| **Experiencia** | Retoma o nuevo en apps de entrenamiento · Activo en otro deporte · 1 años rodando · 0 con plan estructurado |
| **FTP** | No lo sabe |
| **FC máxima** | No la sabe · reposo: 70 lpm |
| **Últimas 4 semanas** | rodadas suaves, ~2 h/sem |
| **Su semana típica (textual)** | «Voy a clase de spinning 2 veces por semana (45 min) y a yoga martes y jueves.» |
| **Salud** | Condiciones: diabetes · medicamento: Metformina · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad regular) · estrés alto · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: más o menos · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Yoga / movilidad 2×/sem de 60 min (martes, jueves) |
| **Disponibilidad** | 3 h/sem · lunes, miércoles, viernes, domingo · máx 45 min por sesión |
| **Su objetivo (textual)** | «Quiero hacer ejercicio que me guste para controlar mi glucosa y bajar el estrés. Me gustan las clases con música; nada de competir.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · arranque conservador · primero el metabolismo (fondo y tempo constantes) · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Base y energía: rodar con gusto · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base metabólica | 4 | 2.2 | Rodadas frecuentes y parejas de 40-45 min, en fondo y con cambios de ritmo suaves por sensación (RPE 5-6). Sin picos largos ni intensidad fuerte hasta que tu médico dé luz verde. |
| Variedad tipo clase | 4 | 2.7 | Subimos de a poco hasta unas 2.5-3 h por semana con bloques cortos de cadencia y ritmo, una semana de descarga a la mitad del bloque. |
| Consolidación | 4 | 3 | Sostenemos 3 h por semana en 4 sesiones de hasta 45 min, con más tiempo en tempo suave por sensación. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Paola, antes de apretar, que tu médico te dé luz verde; mientras construimos con cuidado: fondo y ritmo suave por sensación, sin picos largos. Con metformina, come algo antes de rodar y lleva algo dulce. Tus yoga de martes y jueves cuentan en la carga: por eso los días de bici van alrededor y arrancamos de lo que ya haces (unas 2 h por semana, subimos poco a poco). Tu meta es salud y desestrés, no competir, así que no hay test: todo va por RPE. 3-4 = puedes platicar, 6-7 = solo frases cortas, 8-9 = pocas palabras, 10 = no puedes más; por ahora no pasamos de 5-6. Empezamos el martes 20, así que la semana 1 tiene tres sesiones: miércoles, viernes y domingo. Tu tope de 45 min lo respetamos y dejamos el lunes libre al inicio.

#### Semana 1 · 3 sesiones de rodillo · 2.1 h · TSS ≈ 77

- **miércoles 21 oct — Rodada con cambios suaves** · 43 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→62%
  - 5× (4' @ 68% + 2' @ 58%)
  - Enfriamiento 5' @ 50%
  - _Hoy arrancamos suave para conocer tu rodillo: rueda con el ERG apagado, por sensación, con el RPE en 3-4 y pudiendo platicar en frases completas. Si no puedes, baja el ritmo sin pena. Come algo antes de subirte y ten a la mano algo dulce. Al terminar sentirás las piernas sueltas y con ganas de más._

- **viernes 23 oct — Fondo constante** · 43 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 30' @ 62%
  - Enfriamiento 5' @ 50%
  - _Un fondo parejo y conversacional, con RPE 3-4 y la cadencia que te salga natural; la app la irá observando, así que no te preocupes por forzarla. Te recomiendo dejar el ERG apagado y rodar por sensación, pero si prefieres prenderlo con el botón ⚡ también está bien. Ponle tu propia música y disfrútalo: es de esos días que dejan la cabeza despejada._

- **domingo 25 oct — Clase suave con cambios de ritmo** · 42 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→62%
  - 3× (6' libre, por sensación y sin ERG (referencia ~75%) + 3' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Piensa en una clase de spinning, pero aquí tú mandas el ritmo. El ERG va apagado y te recomiendo rodar por sensación: en los bloques medios busca un RPE 5-6, con frases cortas y una respiración más marcada, y en la recuperación vuelve a un RPE 2-3 para bajar. Nunca vayas al límite; si algo se siente raro, baja y anótalo para tu coach. Terminas con las piernas activadas para el resto de la semana._

#### Semana 2 · 3 sesiones de rodillo · 2.2 h · TSS ≈ 81

- **miércoles 28 oct — Rodada con cambios suaves** · 43 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→62%
  - 5× (4' @ 68% + 2' @ 58%)
  - Enfriamiento 5' @ 50%
  - _Miércoles de rodada tranquila: la idea es la misma que la semana pasada, pero con un poco más de tiempo en el bloque cómodo. Va por sensación, sin ERG, así que ajusta tú los cambios; si prefieres ERG, lo prendes con el botón ⚡. Come algo antes de salir y lleva algo dulce. Vas a sentir las piernas sueltas y podrás platicar sin problema, así que disfrútalo y deja que el ritmo fluya. Esto te deja fresca y lista para el jueves._

- **viernes 30 oct — Fondo constante** · 45 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 32' @ 62%
  - Enfriamiento 5' @ 50%
  - _Viernes de fondo parejo: rueda con una cadencia natural y mantén un esfuerzo constante durante los 32 minutos centrales. Va sin ERG, por sensación; si prefieres ERG, lo prendes con el botón ⚡. Tu referencia es poder hablar en frases completas, que sientas la respiración tranquila y las piernas cómodas. Si notas que la respiración se te acelera, baja un poco y sigue. Así sumas volumen sin desgastarte para el fin de semana._

- **domingo 1 nov — Clase con cambios de ritmo** · 45 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→62%
  - 4× (5' libre, por sensación y sin ERG (referencia ~75%) + 3' @ 58%)
  - Enfriamiento 5' @ 50%
  - _Domingo de clase con cambios de ritmo: cuatro bloques medios donde vas a sentir las piernas trabajar, pero sin ahogarte; frases cortas están bien. Va sin ERG, así que tú marcas el ritmo, y si prefieres ERG lo prendes con el botón ⚡. Recupera de verdad entre bloques, en un esfuerzo suave que te permita respirar. Elige canciones que te animen y llega con ganas. Terminas con las piernas bien trabajadas, y eso te deja lista para cerrar la semana._

#### Semana 3 · 3 sesiones de rodillo · 1.7 h · TSS ≈ 56

- **miércoles 4 nov — Rodada de descarga** · 31 min · TSS ≈ 17 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 18' @ 60%
  - Enfriamiento 5' @ 50%
  - _Hoy toca descansar con la bici: una rodada suave de unos 30 minutos para asimilar lo que llevas. Sin buscar nada, todo fácil, a RPE 2-3, y sin ERG, por sensación con tus cambios; si prefieres ERG, lo prendes con el botón ⚡. Ten el ritmo tan cómodo que puedas hablar en frases completas en todo momento. Es de esas sesiones que te dejan lista para la semana siguiente sin que sientas que hiciste nada._

- **viernes 6 nov — Fondo suave** · 31 min · TSS ≈ 17 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 18' @ 60%
  - Enfriamiento 5' @ 50%
  - _Una rodada conversacional para disfrutar la bici con música y la cadencia que te salga natural. Va a unos 30 minutos a RPE 3, sin ERG; ruedas por sensación y, si quieres el control del rodillo, lo prendes con el botón ⚡. Tu referencia es poder hablar en frases completas durante todo el fondo. Si todo sale así, llegas al resto de la semana con las piernas sueltas y la cabeza tranquila._

- **domingo 8 nov — Clase ligera** · 37 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→62%
  - 3× (5' libre, por sensación y sin ERG (referencia ~72%) + 3' @ 58%)
  - Enfriamiento 5' @ 50%
  - _Unos cambios de ritmo cortos a RPE 5, sin ERG: vas por sensación, y si prefieres el control del rodillo, lo prendes con el botón ⚡. Los bloques de ritmo medio son para sentirte cómoda y firme, no para apretar; recupera completo en cada pausa para llegar entera al siguiente. Si al final sientes que podrías seguir, es la señal de que el trabajo salió bien y te deja lista para el resto de la semana._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero y metabolismo primero:** diabetes tipo 2 con metformina. Fondo y ritmo suave parejos, sin picos, ≤68%, por RPE (no más de 5–6).
- **Parte de lo que ya hace** (~2 h por semana) y sube poco a poco; yoga martes y jueves sin bici.
- **«Come algo antes de rodar y lleva algo dulce»:** es una regla escrita del método (prompt), no algo inventado.
- **Semana 3 de descarga** (1.6 h).

**Qué cambió desde la corrida 1:** Antes: un extra «Sin gimnasio hoy» y una frase de técnica de montaña que no aplicaban, y descripciones en masculino. Ahora no hay nada de eso. Arranca con 3 sesiones en lugar de 4.

**Para revisar:**

- ¿Descarga en la semana 3 después de solo 2 semanas de ~2.2 h?

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
- Corrida: `node scripts/coach-sim/perfiles.mjs` contra producción con la cuenta de pruebas. Todo lo que contestó la IA (contexto enviado, respuesta, plan y cada sesión con sus intervalos) está en `docs/evaluaciones/planes-ia-para-joe-datos/` (corrida 2) y `…-datos/v1/` (corrida 1, antes de los cambios de #54).
- Análisis: `scripts/coach-sim/perfiles-analisis.mjs`.
- Validación sin IA: `perfiles-check.ts` (mismo schema del servidor y perfil de arranque).