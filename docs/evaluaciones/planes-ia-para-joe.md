# Planes del coach IA para que Joe los evalúe
20 de octubre de 2026 · 10 personas con el cuestionario completo, como lo llena la app hoy. Cada plan lo creó el **coach IA real de producción** (`coach-chat`, modo crear plan) con la cuenta de pruebas. Es exactamente lo que vería una persona nueva en Torq, sin historial.

**Cómo leer cada sesión:** los porcentajes son del FTP (entre paréntesis, los watts si la persona tiene FTP). «3× (5' @ 90% + 3' @ 55%)» = 3 repeticiones de 5 min al 90% con 3 min al 55%. TSS ≈ estimado. El texto en cursiva es la descripción que ve el atleta.

**Perfil de arranque:** antes de llamar a la IA, el código de Torq aplica tus reglas de la evaluación de salud y hábitos (`src/core/intake.ts`): si va primero el médico, si puede hacer un esfuerzo máximo, qué test toca y si arranca conservador. La IA está obligada a respetarlo. Va en cada perfil para que veas si la regla y el plan cuadran.

**Qué es de quién:** el plan, las sesiones y la nota al atleta los escribió el coach IA (textual). Las secciones «Por qué tomó estas decisiones» y «Hallazgos» son un análisis aparte, hecho leyendo cada plan contra el perfil: la IA no entrega un razonamiento propio además de su nota.

## Hallazgos y preguntas (análisis de la corrida del 20 de octubre de 2026)

**Lo que hace bien en los 10:**

- **Respeta las reglas de arranque.** Las tres personas con condición de salud (Roberto, Lucía y Paola) no tienen test ni esfuerzos máximos: nada pasa de ~76% de FTP y todo va por sensación, con la indicación de ir con su médico. Ana y Daniel, que vienen de estar sedentarios y no saben usar RPE, van sin test, por sensación y con la escala de esfuerzo explicada. Los que vienen entrenando con intensidad (Mariana y Fernando) arrancan con umbral y arranques desde la semana 1, sin rehacer base.
- **Nunca se pasa de la disponibilidad**, ni de días ni de minutos por sesión, y cuenta las otras actividades (gym, carrera, natación, yoga) para no poner un día duro junto a ellas.
- **Usa la salida larga afuera** cuando el objetivo es largo y hay fin de semana (Carlos, Sofía, Javier, Fernando, Lucía, y Roberto desde la semana 3). Agenda técnica afuera para XCO (Fernando).
- **Pone el test donde tiene sentido:** de 20 min para quien sabe dosificarse (Carlos, Sofía, Mariana, Fernando), casi siempre después de una descarga; rampa para Javier; nada para los demás.
- **Explica sus decisiones** en la nota al atleta: demanda del evento, por qué esos días, qué cuenta en la carga.

**Problemas que encontré (para corregir en Torq, no para Joe):**

1. **Género en las descripciones de las sesiones.** A 4 de las 5 mujeres les habla en masculino en algunas sesiones: «listo para el fin de semana», «sentirte cómodo», «llegar entero» (Ana, Sofía, Lucía y Paola). Las notas del coach están bien. El error viene del redactor de descripciones (Haiku), que sí recibe el sexo.
2. **Un extra sin sentido:** a Paola le agenda «Sin gimnasio hoy» (15 min).
3. **Frases que no aplican:** a Paola (que no es de montaña) le dice que «el rodillo no entrena técnica de montaña», y que «ve una prueba sin competencia».
4. **Consejo médico:** a Paola, con metformina, le dice «come antes de rodar y lleva algo dulce». Es prudente, pero es una indicación médica.

**Limitación de la prueba:** las fechas de los eventos caen en martes porque los calculé como «hoy + N semanas» y hoy es martes. Es un error mío en los datos de prueba, no de la IA.

**Preguntas para Joe:**

- **Volumen corto.** El plan siempre se queda por debajo de lo disponible: Mariana (élite, venía de 12 h) arranca con 6.3 h de 11 posibles; Fernando ~7 de 9; Sofía ~4 de 5; Ana 2 de 2.5. ¿Así arrancarías, o está siendo demasiado prudente?
- **Tope de 90 min en rodillo.** Aunque la persona no ponga límite, la IA no pasa de 90 min por sesión de rodillo. A Mariana (ruta) no le pone salida larga afuera: su sesión más larga es de 90 min. ¿Está bien para una élite de ruta?
- **Alcohol 1–2 veces por semana.** Hoy cuenta igual que tomar seguido: sube el estrés un nivel y pone «base antes de intensidad». Por eso Carlos (Master 40, con experiencia, duerme bien) pasa 3 semanas sin nada arriba de tempo (82%). ¿Así lo quieres, o solo a partir de 3 veces por semana? (La regla está marcada como provisional.)
- **Sueño de 6 h exactas** no cuenta como «poco sueño» (el corte es menos de 6 h); sí cuenta si la calidad es mala. ¿El corte está bien?
- **Test en semana 1 con sueño malo.** Javier duerme mal y tiene estrés alto (arranque conservador), pero como sí puede dar un máximo, le toca la rampa el jueves de la primera semana. ¿Lo harías tan pronto?

## Resumen

| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |
|---|---|---|---|---|---|
| 01 | [Ana López](#p01) | Oficinista sin experiencia, quiere bajar de peso y tener energía | sin test · arranque conservador · base primero | Primeros pedales: base y hábito | 2 sesiones · 1.3 h |
| 02 | [Carlos Méndez](#p02) | MTB Master 40, primera carrera larga (Chupacabras 60 km) | test de 20 min · arranque conservador · base primero | Chupacabras 60 km: base sólida y subida final con piernas | 3 sesiones · 3.1 h |
| 03 | [Sofía Ramírez](#p03) | Triatleta: la bici es su punto débil para un 70.3 | test de 20 min · en temporada | Camino a Cozumel 70.3: bici fuerte para correr bien | 2 sesiones · 1.8 h |
| 04 | [Roberto García](#p04) | Retoma después de 3 años, hipertensión controlada, gran fondo 80 km | médico primero · sin test · arranque conservador · base primero | Gran fondo 80 km: de vuelta a la bici con calma | 3 sesiones · 2.3 h |
| 05 | [Mariana Torres](#p05) | Ciclista élite, selectivo nacional en 8 semanas | test de 20 min · en temporada | Selectivo nacional: más umbral y mejores arranques | 5 sesiones · 6.3 h |
| 06 | [Javier Hernández](#p06) | Papá con poco tiempo, gravel de 100 km, FTP provisional | test de rampa · arranque conservador | Gravel Sierra Gorda 100 km | 3 sesiones · 2.1 h |
| 07 | [Lucía Fernández](#p07) | MTB recreativa con asma, quiere subir el Ajusco sin bajarse | médico primero · sin test | Subir el Ajusco con tus amigas | 2 sesiones · 2 h |
| 08 | [Daniel Ortiz](#p08) | Exfutbolista con sobrepeso y molestia de rodilla | sin test · arranque conservador · base primero | Volver a moverte: base y peso | 3 sesiones · 2.2 h |
| 09 | [Fernando Ruiz](#p09) | XCO Master 50 a media temporada, Copa Nacional en 8 semanas | test de 20 min · en temporada | Chispa para la Copa Nacional XCO | 2 sesiones · 2.1 h |
| 10 | [Paola Jiménez](#p10) | Diabetes tipo 2 controlada, entrena por salud y diversión | médico primero · sin test · arranque conservador · metabólico primero | Movimiento constante para tu glucosa y tu calma | 3 sesiones · 2.2 h |

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

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

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

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Sin test, sin ERG y por sensación (RPE 3–4):** viene de estar sedentaria y no sabe usar RPE, así que las reglas la marcan como «no puede dar un máximo» y «hay que enseñarle RPE». El coach le explica la escala en la nota.
- **Arranque conservador:** estrés alto (sube por el alcohol semanal) y sueño de 6.5 h regular.
- **Volumen:** 1.2 h → 2.0 h → 2.0 h, contra 2.5 h disponibles. Le explica que 3 días de 45 min (2.25 h) no alcanzan las 2.5 h que puso.
- **Intensidad:** solo fondo al 60% y, desde la semana 2, cambios de 2 min al 70%. Lo más alto (RPE 6–7) llega hasta la semana 7.
- **Peso:** no promete kilos; manda la parte de la comida con un nutriólogo.

**Para revisar:**

- Para alguien que quiere bajar de peso, ¿meterías más estímulo antes de la semana 7?
- Las descripciones le hablan en masculino («sentirte cómodo», «listo»).

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
| **FTP** | 235 W — lo escribió (medido), hace 21 días (2.8 W/kg) |
| **FC máxima** | 182 lpm (medida) · reposo: 56 lpm |
| **Últimas 4 semanas** | rodadas suaves, ~5 h/sem |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés medio · fuma: no · alcohol: 1–2 veces por semana |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Gym / fuerza 2×/sem de 60 min (lunes, miércoles) |
| **Disponibilidad** | 6 h/sem · martes, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Correr el Chupacabras 60 km (MTB) el 12 de enero de 2027. Quiero terminar en menos de 4 horas y no tronarme en la subida final. Voy al gym lunes y miércoles.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · arranque conservador · base aeróbica antes de intensidad (tabaco/alcohol) · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Chupacabras 60 km: base sólida y subida final con piernas · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base | 4 | 5.5 | Fondo y tempo suave, con bloques de tempo cada semana más largos. Salida larga afuera de 2 h a 2 h 30 min con comida desde el minuto 30. La semana 4 es de descarga. |
| Construcción | 4 | 6 | Retest de 20 min al abrir el bloque. Sweet spot y umbral largos, tempo sostenido y fuerza a cadencia baja. Salida larga afuera de 2 h 30 min a 3 h. |
| Específico | 4 | 6 | Ritmo de maratón MTB: bloques largos de tempo y umbral, subida final simulada al final de una sesión. Salida larga afuera de 3 h a 3 h 30 min, con descarga a mitad del bloque. |
| Carrera | 1 | 3 | Descarga final: poco volumen, activaciones cortas y llegar fresco al martes 12 de enero. |

**Próximo test:** test20 · Tienes FTP de 235 W y sabes dosificarte. Lo medimos al abrir el segundo bloque, después de una semana de descarga, para llegar fresco y revisar tus zonas.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Carlos, la demanda de tu carrera es un maratón MTB de menos de 4 h: mucho tiempo en tempo y subidas sostenidas, así que priorizo base con tempo suave y salida larga afuera; el sweet spot llega en el segundo bloque. Tus 6 h incluyen salidas largas afuera los domingos, que el rodillo no sustituye (90 min de rodillo no equivalen a 3 h afuera). Tus lunes y miércoles de gym cuentan en la carga: por eso martes y jueves van suaves y la sesión clave de tempo cae el sábado. El rodillo no entrena técnica, así que usa las salidas del domingo para practicar bajadas. Vienes con 6 años en bici y 2 de estructura, y en cuanto vea tus primeras sesiones ajusto. Te pondré a prueba con un test de 20 min al abrir el segundo bloque.

#### Semana 1 · 3 sesiones de rodillo · 3.1 h · TSS ≈ 137

- **martes 20 oct — Fondo base** · 60 min · TSS ≈ 39
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 45' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Arranca la semana con un fondo tranquilo: 60 minutos para rodar a gusto, con RPE 3-4 y la capacidad de sostener una charla completa en todo momento. Te recomiendo dejar el ERG prendido para que el rodillo mantenga los watts suaves mientras tú buscas una cadencia natural; si en algún momento no puedes hablar en frases completas, baja la potencia y no te preocupes por cumplir el número. Es una rodada para llegar fresco y con ganas, y para que las piernas se acostumbren otra vez al ritmo de la semana._

- **jueves 22 oct — Tempo suave** · 60 min · TSS ≈ 46
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 2× (10' @ 80% (188 W) + 5' @ 55% (129 W))
  - Constante 15' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Hoy llega tu primer contacto con el tempo, la base de un maratón MTB, así que vamos con calma y control. Te recomiendo ERG prendido para sostener los dos bloques al 80 % sin salirte de ritmo: sentirás RPE 5, respiración agitada pero controlada, con frases cortas que no te ahoguen. Entre bloques baja de verdad en la recuperación, porque ahí se construye el siguiente esfuerzo. Esta sesión deja las piernas listas para el sábado._

- **sábado 24 oct — Tempo 3x10** · 65 min · TSS ≈ 52
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 3× (10' @ 82% (193 W) + 5' @ 55% (129 W))
  - Enfriamiento 8' @ 50% (118 W)
  - _Esta es la sesión clave de la semana, y la idea es construir base, no salir como cohete. Te recomiendo ERG prendido para tres bloques de 10 minutos al 82 %: busca un RPE de 5-6, con frases cortas pero sin perder el control, y mantén el mismo esfuerzo de principio a fin. Si al tercer bloque sientes que se te escapa la respiración, es señal de bajar un poco y no de aguantar a la fuerza. Llega descansado y con ganas, porque después de esto el resto de la semana va a sentirse más fácil._
- _Fuera del rodillo:_ **miércoles 21 oct — Gym: pierna ligera** (60 min): Pierna sin llevarla al límite y core. El jueves rodamos tempo y el sábado hay tempo largo, así que llega con piernas.
- _Fuera del rodillo:_ **domingo 25 oct — Salida larga afuera** (120 min): Rodada en ruta o montaña a RPE 3-4, platicando. Come algo desde el minuto 30 y cada 30-40 min.

#### Semana 2 · 3 sesiones de rodillo · 3.3 h · TSS ≈ 147

- **martes 27 oct — Fondo base** · 60 min · TSS ≈ 39
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 45' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Fondo suave para sacudirte las piernas después del gym del lunes. Ve con RPE 3-4, de los que te dejan hablar en frases completas, y con cadencia natural, sin forzar. ERG lo puedes prender si quieres que el rodillo sostenga los watts, pero para este fondo va bien con tu sensación: si las piernas vienen pesadas, baja un poco la potencia. Al final sales con las piernas un poco más sueltas para lo que viene en la semana._

- **jueves 29 oct — Tempo 2x12** · 64 min · TSS ≈ 50
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 2× (12' @ 80% (188 W) + 5' @ 55% (129 W))
  - Constante 15' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Misma sesión de tempo que ya conoces, pero con bloques más largos de 12 minutos; ese es el único cambio, así que el ritmo es el de siempre. Te recomiendo dejar el ERG prendido para sostener el 80 % en cada bloque sin salirte. Busca un RPE 5-6, constante de principio a fin, y no arranques fuerte en el primer bloque. Si al cierre de los bloques sientes que puedes hablar con frases cortas, vas bien; si no, es señal de aflojar un poco. Llegas al jueves con buen trabajo de umbral sin sentirte destrozado._

- **sábado 31 oct — Tempo 3x12** · 71 min · TSS ≈ 58
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 3× (12' @ 82% (193 W) + 5' @ 55% (129 W))
  - Enfriamiento 8' @ 50% (118 W)
  - _Aquí el reto son los tres bloques de 12 minutos al 82 %, con RPE 5-6. Te recomiendo ERG prendido para que el rodillo mantenga la potencia y tú te concentres en la cadencia. Los últimos 3 minutos del tercer bloque son los que cuentan, así que guarda algo de energía y no salgas fuerte en los primeros; un arranque explosivo que luego cae deja peor promedio. Si no logras completar el tercer bloque, baja 3-5 puntos de potencia y anótalo para tu coach. Cuando termines, tendrás una base sólida de tempo para el resto de la semana._
- _Fuera del rodillo:_ **lunes 26 oct — Gym: tren superior y core** (60 min): Enfoca tren superior y core. Mañana toca fondo, así que no vacíes la pierna.
- _Fuera del rodillo:_ **miércoles 28 oct — Gym: pierna ligera** (60 min): Pierna ligera, sin llegar a la falla. El jueves hay tempo y el sábado tempo largo.
- _Fuera del rodillo:_ **domingo 1 nov — Salida larga afuera** (135 min): Salida de 2 h 15 min a RPE 3-4, platicando. Come desde el minuto 30. Si sube el pulso, baja el ritmo.

#### Semana 3 · 3 sesiones de rodillo · 3.3 h · TSS ≈ 153

- **martes 3 nov — Fondo base** · 60 min · TSS ≈ 39
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 45' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Martes de fondo suave para soltar las piernas después del gym y preparar la semana. Déjalo en ERG prendido si quieres que el rodillo marque el ritmo, o apágalo y rueda por sensación; los dos sirven hoy. Tu referencia es poder hablar en frases completas durante casi toda la hora. Cadencia natural, sin forzar: si terminas sintiéndote mejor que al empezar, el objetivo está cumplido._

- **jueves 5 nov — Tempo 2x15** · 65 min · TSS ≈ 53
  - Calentamiento 10' @ 55→70% (129→165 W)
  - 2× (15' @ 80% (188 W) + 5' @ 55% (129 W))
  - Constante 10' @ 65% (153 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Jueves de tempo: dos bloques de 15 minutos al 80 % con 5 minutos suaves de recuperación entre ellos. Te recomiendo ERG prendido para sostener un ritmo parejo, como lo harás en la carrera; tú solo mantén la cadencia. Los bloques deben sentirse fuertes pero controlados, RPE 5-6, y los 5 minutos suaves son de verdad para recuperar, no para acelerar. Llegas con buenas piernas para el fin de semana._

- **sábado 7 nov — Tempo 2x20** · 72 min · TSS ≈ 61
  - Calentamiento 12' @ 50→70% (118→165 W)
  - 2× (20' @ 82% (193 W) + 6' @ 55% (129 W))
  - Enfriamiento 8' @ 50% (118 W)
  - _Sábado de tempo largo: dos bloques de 20 minutos al 82 %, parecidos a una subida sostenida. Te recomiendo ERG prendido para que el rodillo sostenga el ritmo mientras tú trabajas la cadencia y la respiración. Busca un esfuerzo parejo, RPE 5-6; el segundo bloque se va a sentir más pesado, y es normal si tu pulso sube, pero si se dispara, baja un poco y anótalo en tu nota para tu coach. Aguantar el bloque largo y parejo es lo que te va a servir en la subida final._
- _Fuera del rodillo:_ **lunes 2 nov — Gym: tren superior y core** (60 min): Tren superior y core. Mañana fondo suave y la pierna debe estar fresca.
- _Fuera del rodillo:_ **miércoles 4 nov — Gym: pierna ligera** (60 min): Pierna ligera, sin dejar las piernas vacías. El sábado hay tempo largo.
- _Fuera del rodillo:_ **domingo 8 nov — Salida larga afuera** (150 min): Salida de 2 h 30 min a RPE 3-4, de preferencia con algo de subida a ritmo cómodo. Come cada 30-40 min.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Base antes de intensidad:** la regla del alcohol (1–2 veces por semana) lo pone en «base primero» y arranque conservador. Por eso nada pasa de 82% en 3 semanas; el sweet spot llega hasta el bloque 2.
- **Tempo progresivo los sábados:** 3×10 → 3×12 → 2×20 min a ~80%, para la demanda de maratón MTB (tempo y subidas sostenidas).
- **Gym lunes y miércoles respetado:** martes fondo y jueves tempo suave; la sesión clave es el sábado. Además le agenda contenido para el gym («pierna ligera», «tren superior y core»).
- **Salida larga afuera los domingos:** 2 h → 2 h 15 → 2 h 30, con comida desde el minuto 30.
- **Test de 20 min en la semana 5,** después de la descarga: tiene FTP medido y sabe dosificarse.

**Para revisar:**

- Con 12 semanas y experiencia, ¿3 semanas sin nada arriba de tempo es demasiado? Es efecto de la regla del alcohol.
- ¿Está bien que la IA le diga qué hacer en su gym?

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
| **FTP** | 190 W — lo escribió (medido), hace 40 días (3.3 W/kg) |
| **FC máxima** | 189 lpm (medida) · reposo: 50 lpm |
| **Últimas 4 semanas** | con intensidad, ~9 h/sem |
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7.5 h (calidad buena) · estrés medio · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Correr 3×/sem de 50 min (martes, jueves, domingo); Natación 2×/sem de 60 min (lunes, viernes) |
| **Disponibilidad** | 5 h/sem · miércoles, viernes, sábado |
| **Su objetivo (textual)** | «Medio Ironman 70.3 en Cozumel el 9 de febrero de 2027. Corro y nado bien; la bici (90 km) es mi punto débil y quiero llegar a correr el medio maratón sin morirme.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Camino a Cozumel 70.3: bici fuerte para correr bien · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y tempo | 5 | 4 | Base aeróbica con tempo sostenido en rodillo y salida larga afuera que sube de 2 h a 2.5 h (descarga en la semana 4). Las 3 carreras y 2 nataciones semanales cuentan en la carga. |
| Construcción | 5 | 4.5 | Sweet spot y tempo largo, con retest de 20 min al abrir el bloque. Salida larga de 2.5 a 3 h con comida. |
| Específico 70.3 | 5 | 5 | Ritmo de carrera de 75-85 % en bloques largos, brick corto (bici + trote) y salida larga de hasta 3 h. |
| Afinación | 2 | 3 | Volumen a la baja, ritmo de carrera corto y llegar fresca. La última semana contiene el 9 de febrero. |

**Próximo test:** test20 · Al abrir el segundo bloque, tras 5 semanas con estructura y con tu FTP manual de septiembre como referencia; llegas fresca tras la descarga.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Sofía, la demanda de un 70.3 es ritmo sostenido largo en bici sin vaciar las piernas para el medio maratón; por eso priorizo tempo y salida larga afuera, no intervalos cortos. Traes motor de nadadora y corredora y 3 años de estructura: partimos de tu FTP de 190 W con el umbral conservador las primeras 2 semanas y retest de 20 min en la semana 6. Tus 5 h no caben en rodillo de 3 días (3 × 90 min = 4.5 h), así que la salida larga de sábado va afuera y completa las horas; tus carreras (mar, jue, dom) y nataciones (lun, vie) cuentan en la carga, y por eso el viernes es suave. Dime qué días de carrera son fuertes o largas para ajustar el miércoles, que hoy queda entre dos carreras.

#### Semana 1 · 2 sesiones de rodillo · 1.8 h · TSS ≈ 82

- **miércoles 21 oct — Tempo en bloques** · 65 min · TSS ≈ 55
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 3× (12' @ 82% (156 W) + 4' @ 55% (105 W))
  - Enfriamiento 7' @ 55→45% (105→86 W)
  - _Hoy toca tempo en bloques: tres tramos de 12 minutos a ritmo sostenido, con 4 minutos suaves entre cada uno para recuperar. Deja el ERG prendido y deja que el rodillo marque la potencia; tu trabajo es sostener la cadencia y mantener el esfuerzo parejo de principio a fin, en un RPE de 5 a 6, con frases cortas. Es un buen momento para construir ritmo sin cargar las piernas, que llegan con margen para la carrera del jueves. Las dos primeras semanas el número va conservador, así que no te preocupes si al principio se siente fácil._

- **viernes 23 oct — Rodada suave** · 45 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 5' @ 50→60% (95→114 W)
  - Constante 35' @ 62% (118 W)
  - Enfriamiento 5' @ 55→45% (105→86 W)
  - _Rodada suave para soltar las piernas el mismo día de la natación. Va sin ERG, en modo calle plana, así que pedalea por sensación y ajusta tú los cambios; si prefieres ERG, actívalo con el botón ⚡. Busca una cadencia que te salga natural y un RPE de 3 a 4: deberías poder hablar en frases completas durante toda la rodada. Si notas que no puedes hablar, baja la potencia un poco y sigue rodando._
- _Fuera del rodillo:_ **sábado 24 oct — Salida larga afuera** (120 min): Ruta a RPE 3-4, platicando. Come desde el minuto 30 (carbohidrato cada 20-30 min) y ensaya tu hidratación de carrera.

#### Semana 2 · 2 sesiones de rodillo · 2.1 h · TSS ≈ 95

- **miércoles 28 oct — Tempo en bloques largos** · 74 min · TSS ≈ 65
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 3× (15' @ 82% (156 W) + 4' @ 55% (105 W))
  - Enfriamiento 7' @ 55→45% (105→86 W)
  - _Sofía, esta semana el tempo se alarga: mismos bloques de siempre, pero cada uno dura 15 minutos. Tu objetivo es sostener el 82 % de tu FTP sin arrancar fuerte; progresamos en tiempo, no en intensidad. Te recomiendo ERG prendido para que el rodillo mantenga la potencia y tú solo cuides la cadencia, cómoda y constante. Sientes un esfuerzo de RPE 5-6, con respiración que te deja hablar en frases cortas pero no cantar, y si al tercer bloque las piernas empiezan a pesar, es normal: lo que importa es que termines parejo. Llegarás al jueves con las piernas trabajadas pero listas para descansar bien._

- **viernes 30 oct — Rodada suave** · 50 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 5' @ 50→60% (95→114 W)
  - Constante 40' @ 62% (118 W)
  - Enfriamiento 5' @ 55→45% (105→86 W)
  - _Rodada suave para soltar las piernas antes de la salida larga. Va por sensación, así que el ERG viene apagado: ve a tu ritmo y, si prefieres que el rodillo marque la potencia, lo prendes con el botón ⚡. La idea es rodar a RPE 3-4, con respiración tranquila y sin meterte en tempo, aunque te sientas con energía. Si al final te sientes con las piernas pesadas en vez de sueltas, baja un poco más y anótalo para tu coach. Con esto llegas fresca al fin de semana._
- _Fuera del rodillo:_ **sábado 31 oct — Salida larga afuera** (135 min): RPE 3-4 constante, con comida desde el minuto 30. Procura terreno parejo para pedalear sin pausas largas.

#### Semana 3 · 2 sesiones de rodillo · 2 h · TSS ≈ 92

- **miércoles 4 nov — Tempo alto** · 67 min · TSS ≈ 62
  - Calentamiento 10' @ 50→65% (95→124 W)
  - 2× (20' @ 85% (162 W) + 5' @ 55% (105 W))
  - Enfriamiento 7' @ 55→45% (105→86 W)
  - _Hoy toca subirle un poco al ritmo del tempo: dos bloques de 20 minutos sostenidos con una recuperación corta entre ellos. Prende el ERG para que el rodillo marque la potencia y tú te concentres en mantener la cadencia. Te vas a sentir cargado, pero en tempo debes poder decir frases cortas sin ahogarte; si en el último bloque ya no te alcanza, baja 3 a 5 puntos de esfuerzo y avísame para ajustar. Esta sesión deja buenas piernas para el fondo del fin de semana._

- **viernes 6 nov — Rodada suave** · 50 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 5' @ 50→60% (95→114 W)
  - Constante 40' @ 62% (118 W)
  - Enfriamiento 5' @ 55→45% (105→86 W)
  - _Una rodada tranquila para soltar el cuerpo después de natación. Va en modo calle plana, sin ERG: rueda por sensación, con cadencia natural y un RPE de 3 a 4. Si prefieres usar ERG, lo prendes con el botón ⚡, pero no hace falta. La referencia es poder hablar en frases completas todo el tiempo; si no puedes, baja el ritmo y anótalo para tu coach. Sales con las piernas más ligeras y listo para descansar bien._
- _Fuera del rodillo:_ **sábado 7 nov — Salida larga afuera** (150 min): RPE 3-4, comiendo desde el minuto 30. Es tu sesión principal de la semana: llega descansada y sin forzar.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Tempo y salida larga, no intervalos cortos:** la demanda de un 70.3 es ritmo sostenido largo sin vaciar las piernas para la carrera a pie. Aunque viene entrenando con intensidad, no le mete umbral todavía.
- **Encaja la bici entre carrera y natación:** miércoles tempo (entre dos días de carrera), viernes suave (día de natación) y sábado largo afuera, 2 h → 2.5 h. Le pregunta qué días de carrera son fuertes para ajustar el miércoles.
- **FTP 190 W con umbral conservador** las primeras semanas; test de 20 min en la semana 6.
- **Volumen:** ~3.8–4.4 h de bici de 5 disponibles, más sus 5 sesiones de carrera y natación.

**Para revisar:**

- ¿Meterías un brick (bici + trote) antes del bloque específico?
- Una descripción le dice «listo».

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
| **Su objetivo (textual)** | «Rodar un gran fondo de 80 km el 26 de enero de 2027 con mis amigos. Dejé la bici hace 3 años y subí de peso. Tengo la presión alta controlada con medicamento.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · arranque conservador · base aeróbica antes de intensidad (tabaco/alcohol) · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico; viene de estar sedentario · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Gran fondo 80 km: de vuelta a la bici con calma · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base | 6 | 2.5 | Volver al rodillo con constancia: 3 a 4 sesiones de 45-60 min en fondo suave por sensación. Desde la semana 3 sumamos una salida larga afuera de unos 75 min, que va creciendo. |
| Construcción | 5 | 3.5 | Subimos el volumen despacio. La salida larga afuera pasa de 90 min a 2 h. Entran bloques de tempo suave y los primeros esfuerzos por sensación, cuando tu médico dé luz verde. |
| Específico | 3 | 4 | Ritmo de gran fondo: salida larga afuera de 2 a 2.5 h con comida desde el minuto 30, y en rodillo tempo sostenido de 60 min. |
| Descarga y evento | 1 | 2 | Bajamos volumen para llegar fresco. Dos rodadas suaves cortas y el gran fondo el martes 26 de enero. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Roberto, tu meta de 80 km el 26 de enero es muy alcanzable: traes 10 años de oficio en bici y vamos a reconstruir el motor. Antes de apretar, que tu médico te dé luz verde por la presión y el losartán; mientras, construimos con cuidado y sin esfuerzos fuertes. Un gran fondo pide base aeróbica y ritmo sostenido, así que priorizo fondo y una salida larga afuera, porque en rodillo no conviene pasar de 60 min (tu tope). La intensidad va por sensación: RPE 3-4 es poder platicar, 6-7 solo frases cortas, 8-9 pocas palabras, 10 no puedes más. No hay test por ahora y no hay FTP: hasta nuevo aviso todo va por sensación. Con tus 4 días y 60 min, 4 horas por semana es el techo y solo llegaremos ahí poco a poco.

#### Semana 1 · 3 sesiones de rodillo · 2.3 h · TSS ≈ 76

- **miércoles 21 oct — Rodada suave 1** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 29' @ 60%
  - Enfriamiento 8' @ 55→45%
  - _Hoy es tu primer contacto con el rodillo, así que la idea es simple: pedalear cómodo y disfrutar. Va por sensación, con ERG apagado; si prefieres prenderlo, usa la potencia que ya conoces de tu perfil. El control es tu respiración: deberías poder hablar en frases completas. Si no puedes, baja un poco. Usa la cadencia que te salga natural, la app la va a observar para conocerte mejor. Con esto arrancas la semana con buen pie._

- **viernes 23 oct — Rodada suave 2** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Una rodada corta y cómoda para que el cuerpo se vaya acostumbrando al ritmo de la semana. Ve por sensación, sin perseguir números: respiración tranquila y capaz de hablar en frases completas. Pedalea con la cadencia que te salga natural. Sal con ganas, pero sin forzar, y deja que el cuerpo se acomode._

- **sábado 24 oct — Fondo del sábado** · 50 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 30' @ 62%
  - Enfriamiento 10' @ 55→45%
  - _Una salida un poco más larga, pero siempre a ritmo conversacional. Tu referencia es poder hablar en frases completas durante todo el fondo. Toma agua desde el inicio y mantén el ritmo parejo; si notas que el pulso se va subiendo, baja la potencia sin pena. Terminar fresco y constante vale más que apretar al final. Esto deja las piernas listas para la semana que viene._

#### Semana 2 · 3 sesiones de rodillo · 2.6 h · TSS ≈ 89

- **lunes 26 oct — Fondo suave** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 32' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Lunes de rodada tranquila: 45 minutos para salir a pedalear sin prisa, a un ritmo en el que puedas platicar sin esfuerzo. Va por sensación, así que el ERG está apagado; si prefieres ERG lo prendes con el botón ⚡, pero aquí lo que manda es cómo te sientes. Si notas que el pulso se va subiendo en la segunda mitad, baja un poco y listo. Con esto arrancas la semana con las piernas frescas y sin prisa._

- **miércoles 28 oct — Cambios de ritmo suaves** · 50 min · TSS ≈ 29 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - 5× (3' @ 68% + 3' @ 55%)
  - Constante 7' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Miércoles de cambios de ritmo suaves: la idea es que tu cuerpo aprenda a subir y bajar de ritmo sin cansarse. Alterna 3 minutos un poco más firmes, con esfuerzo de 4 a 5 sobre 10 y todavía con aire para hablar, con 3 minutos muy suaves para recuperarte. El ERG va apagado, así que regula tú los cambios; si prefieres ERG lo prendes con el botón ⚡. Si en los firmes ya no puedes hablar, baja un poco. Esto te deja con buenas piernas para el fin de semana._

- **sábado 31 oct — Fondo del sábado** · 60 min · TSS ≈ 35 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 40' @ 62%
  - Enfriamiento 10' @ 55→45%
  - _Sábado de fondo largo: hoy es tu rodada más larga hasta ahora, una hora completa. Busca un ritmo parejo, con esfuerzo suave de 3 a 4 sobre 10, y mantén el agua a la mano. La cadencia que te salga natural. El ERG va apagado, así que vas por sensación; si prefieres ERG lo prendes con el botón ⚡. Si puedes hablar en frases completas, vas bien. Es un buen cierre de semana para ganar resistencia._

#### Semana 3 · 2 sesiones de rodillo · 1.7 h · TSS ≈ 59

- **lunes 2 nov — Fondo suave** · 50 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - Constante 37' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Hoy toca rodar largo y cómodo: 50 minutos de fondo para construir base sin desgastarte. Déjalo en modo calle plana, sin ERG, y ve por sensación; si prefieres ERG, lo prendes con el botón ⚡. Anda en un ritmo donde puedas hablar en frases completas, y si se siente fácil, no subas la potencia, porque la ganancia viene de la constancia. Lo esperable es ir con RPE 3-4, piernas sueltas y respiración tranquila; si notas que te cuesta hablar, baja un poco. Sales con buenas piernas para encarar la semana._

- **miércoles 4 nov — Cambios de ritmo suaves** · 53 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 8' @ 50→60%
  - 5× (3' @ 68% + 3' @ 55%)
  - Constante 10' @ 60%
  - Enfriamiento 5' @ 55→45%
  - _Hoy hay cambios de ritmo suaves con un poco más de fondo al final. Va sin ERG, en modo calle plana: ve por sensación y, si prefieres ERG, lo prendes con el botón ⚡. En los tramos firmes mantén RPE 4-5 y frases cortas pero cómodas; en los suaves, recupera de verdad. Lo que debes sentir es un esfuerzo parejo y controlado, sin llegar a ahogarte. Si en algún tramo no puedes ni decir una frase corta, baja y anótalo para tu coach. Es una buena forma de sumar trabajo sin cargarte de más antes del fin de semana._
- _Fuera del rodillo:_ **sábado 7 nov — Primera salida afuera** (75 min): Rueda por ruta llana y tranquila, RPE 3-4, de modo que puedas platicar todo el camino. Lleva agua y algo de comer, y empieza a tomar desde el minuto 30.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero:** hipertensión con losartán. Sin test, sin FTP, todo por sensación y nada arriba de 68%. Le pide luz verde de su médico «antes de apretar».
- **Tope de 60 min respetado:** sesiones de 40–60 min. Como en rodillo no puede pasar de 60, para el gran fondo usa una salida larga afuera desde la semana 3 (75 min), que crece en los bloques siguientes.
- **Volumen:** 2.2 h → 2.6 h de rodillo. En la semana 3 quita el viernes y deja 2 de rodillo más la primera salida afuera.

**Para revisar:**

- ¿Le pedirías valoración médica (o prueba de esfuerzo) antes de empezar, no solo antes de subir la intensidad?
- ¿Por qué baja a 2 sesiones de rodillo en la semana 3? No lo explica.

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
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 8 h (calidad buena) · estrés bajo · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Gym / fuerza 2×/sem de 45 min (lunes, jueves) |
| **Disponibilidad** | 11 h/sem · lunes, martes, miércoles, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Selectivo nacional de ruta (criterium y contrarreloj) el 15 de diciembre de 2026. Quiero mejorar mis arranques y aguantar más tiempo en umbral.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: bajo

### Lo que armó el coach IA

**Plan:** Selectivo nacional: más umbral y mejores arranques · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Construcción de umbral | 3 | 7 | Semanas 1 a 3: umbral en ERG (3×8 min, luego 3×10 y 3×12 min) y arranques de 10 s con recuperación completa. Unas 6.3 a 7.7 h de bici por semana, más tus dos sesiones de fuerza. La semana 4 es de descarga con retest. |
| Específico de criterium y CRI | 4 | 8 | Semanas 4 a 7: umbral largo con picos, salidas simuladas, anaeróbico de 30 s a 1 min y un bloque de ritmo de contrarreloj. Una descarga a mitad del bloque. |
| Semana de carrera | 1 | 4 | Semana 8: llegar fresca el martes 15 de diciembre con activaciones cortas y mucho descanso. |

**Próximo test:** test20 · Será al final de la semana 4, que es de descarga, con 4 semanas desde tu último test y fresca, para ajustar tus zonas al abrir el bloque específico.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Mariana, aterrizo tu perfil: vienes de unas 12 h semanales con intensidad, así que no arrancamos desde base y entramos con umbral y arranques desde la semana 1. La prueba pide dos cosas: aguantar en umbral para la contrarreloj y repetir arranques de 10 s para el criterium; eso priorizo. Con 6 días × 90 min caben 9 h; planeo 6.3 a 7.7 h de bici para que sumadas a tu fuerza del lunes y jueves (que cuenta en la carga) lleguen bien. Por eso lunes y jueves van suaves y las sesiones duras son el miércoles y el sábado. Tu FTP de 235 W, medido el 6 de octubre, se queda así: lo revisamos en un retest al final de la semana 4, después de una descarga.

#### Semana 1 · 5 sesiones de rodillo · 6.3 h · TSS ≈ 262

- **martes 20 oct — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Mariana, este es un fondo para volver a sentir el ritmo después de tu fin de semana. Va con ERG apagado, así que ve por sensación: RPE 3-4, con plática en frases completas. Si sientes que el pulso se va subiendo, baja un poco la potencia y no persigas números. Si prefieres ERG, lo prendes con el botón ⚡, pero aquí manda la sensación. Lo que ganas hoy son piernas listas para lo que viene en la semana._

- **miércoles 21 oct — Umbral 3×8** · 58 min · TSS ≈ 55
  - Calentamiento 12' @ 50→75% (118→176 W)
  - 3× (8' @ 96% (226 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Hoy empieza el trabajo de umbral del bloque, y te lo recomiendo con ERG prendido al 96 %: el rodillo marca el ritmo y tú sostienes la cadencia en cada intervalo. Va algo conservador estas dos primeras semanas a propósito, así que no tienes que ir al límite. Debe sentirse RPE 7, con frases cortas. Si no logras completar el último intervalo o te pasas de RPE 8, baja 3-5 puntos y anótalo para tu coach. Esta sesión te enseña cómo se siente el umbral antes de que se ponga más difícil._

- **jueves 22 oct — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Jueves de fuerza: la bici va suave para que tus piernas lleguen frescas al sábado. Va con ERG apagado, por sensación, a RPE 3-4 y sin forzar la cadencia. Platica en frases completas y deja que el ritmo salga solo. Si prefieres ERG, lo prendes con el botón ⚡, pero la idea es rodar tranquila. Piensa en esta rodada como la que cuida lo que viene después._

- **sábado 24 oct — Arranques y umbral** · 81 min · TSS ≈ 56
  - Calentamiento 15' @ 50→75% (118→176 W)
  - 8× (10" libre, por sensación y sin ERG (referencia ~150% (353 W)) + 3.8' @ 50% (118 W))
  - 2× (8' @ 95% (223 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Este es el día fuerte de la semana, y tiene dos partes distintas. Los arranques van sin ERG y a tope: ocho de 10 segundos, sentada o parada como en carrera, con casi 4 minutos de recuperación completa. Cuida que la última salida salga igual que la primera, porque eso es lo que de verdad importa. Después vienen dos bloques de umbral con ERG prendido al 95 %, donde el rodillo marca el ritmo y tú sostienes la cadencia. Llega descansada y con la cabeza puesta en cada arranque._

- **domingo 25 oct — Fondo largo** · 90 min · TSS ≈ 59 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 70' @ 65% (153 W)
  - Enfriamiento 10' @ 50% (118 W)
  - _Esta es tu rodada larga de la semana: 90 minutos a RPE 3-4, con ERG apagado y por sensación. Ve cómoda, con frases completas, y procura que la FC no se vaya subiendo en la segunda mitad; si pasa, baja la potencia un poco. Come y toma líquido durante la sesión, que aquí el combustible importa tanto como las piernas. Terminar fresca y con ganas de repetir es la meta, no llegar agotada._
- _Fuera del rodillo:_ **jueves 22 oct — Fuerza: pierna ligera** (45 min): Mañana no hay bici dura y el sábado toca arranques, así que mantén la pierna ligera y enfócate en core y tren superior. Debes salir con energía, no vacía.

#### Semana 2 · 6 sesiones de rodillo · 7.5 h · TSS ≈ 314

- **lunes 26 oct — Fondo suave** · 60 min · TSS ≈ 36 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 45' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Lunes de rodar suave para activar las piernas: 60 minutos a RPE 3-4, sin ERG, a tu ritmo y con sensación. Si hoy te toca pierna pesada, hazla después de la rodada, no antes. Vas a terminar con las piernas despiertas y sin cansancio de más, lista para lo que sigue._

- **martes 27 oct — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Martes de recuperación activa antes del umbral. Son 75 minutos sin ERG, a RPE 3-4, en un ritmo en el que puedas platicar sin cortar la frase. Si al rodar sientes que te estás esforzando de más, baja un poco; el objetivo es llegar fresca al miércoles._

- **miércoles 28 oct — Umbral 3×10** · 64 min · TSS ≈ 65
  - Calentamiento 12' @ 50→75% (118→176 W)
  - 3× (10' @ 97% (228 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Hoy subimos el umbral a 10 minutos por bloque. Prende el ERG para que el rodillo marque los 97 % y tú sostengas la cadencia. En los bloques deberías sentir RPE 7, fuerte pero controlado. Si en el último bloque te pasas de RPE 8, la próxima vez baja 3-5 puntos. Es un día duro, pero bien hecho te deja muy bien parada para el fin de semana._

- **jueves 29 oct — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Jueves de rodada suave, 75 minutos a RPE 3-4 y sin ERG. Va por sensación, en un ritmo cómodo que te permita ir platicando. La idea es que el sábado llegues con piernas frescas, así que no te exijas de más._

- **sábado 31 oct — Arranques y umbral 2×10** · 85 min · TSS ≈ 62
  - Calentamiento 15' @ 50→75% (118→176 W)
  - 8× (10" libre, por sensación y sin ERG (referencia ~150% (353 W)) + 3.8' @ 50% (118 W))
  - 2× (10' @ 95% (223 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Sábado de arranques y umbral. Después de calentar, haz ocho arranques de 10 segundos al máximo, sin ERG, con recuperación completa entre cada uno; dales todo, pero sin pasarte de tu control. Luego prende el ERG para los dos bloques de 10 minutos al 95 %: el rodillo marca el ritmo y tú sostienes la cadencia. Si sientes que el primer bloque sale muy cargado, respira y lleva el segundo parejo. Llegar con ganas al final es la meta._

- **domingo 1 nov — Fondo largo** · 90 min · TSS ≈ 59 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 70' @ 65% (153 W)
  - Enfriamiento 10' @ 50% (118 W)
  - _Domingo de rodada larga: 90 minutos a RPE 3-4, sin ERG, con comida e hidratación a la mano. Va por sensación y puedes ir platicando durante todo el recorrido. Terminas cuando sientas que todavía podrías seguir, y eso es justo lo que buscamos para cerrar la semana._
- _Fuera del rodillo:_ **lunes 26 oct — Fuerza: pierna moderada** (45 min): El martes y el jueves van suaves, así que puedes cargar pierna con control. Evita llegar a la falla.
- _Fuera del rodillo:_ **jueves 29 oct — Fuerza: tren superior y core** (45 min): El sábado hay arranques, así que hoy enfócate en tren superior y core. Pierna muy ligera.

#### Semana 3 · 6 sesiones de rodillo · 7.7 h · TSS ≈ 329

- **lunes 2 nov — Fondo suave** · 60 min · TSS ≈ 36 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 45' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Hoy toca rodar sin prisa para activar las piernas, un día de fuerza de por medio. Va sin ERG, en modo calle plana: ve por sensación y sube o baja según cómo te sientas. Si prefieres ERG, prende el botón ⚡ cuando quieras. La referencia es poder platicar en frases completas, con RPE 3-4. No te preocupes por el ritmo; el objetivo es terminar con las piernas ligeras._

- **martes 3 nov — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Una rodada tranquila para recuperar antes del umbral de mañana. Va sin ERG, así que maneja por sensación y, si prefieres ERG, lo prendes con el botón ⚡. Mantén una conversación fluida todo el tiempo, con RPE 3-4: si te cuesta hablar, baja el ritmo. Llega con la cabeza tranquila y disfruta el rodar._

- **miércoles 4 nov — Umbral 3×12** · 70 min · TSS ≈ 74
  - Calentamiento 12' @ 50→75% (118→176 W)
  - 3× (12' @ 97% (228 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Es la sesión clave de umbral de la semana, así que llega descansada y con ganas. Te recomiendo prender el ERG: el rodillo marca la potencia en los bloques de 12 min y tú sostienes la cadencia. Reparte el esfuerzo desde el primer bloque y no arranques fuerte, porque el último intervalo es el que más pesa. Debe sentirse RPE 7, con respiración controlada y piernas firmes pero estables._

- **jueves 5 nov — Fondo suave** · 75 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 60' @ 62% (146 W)
  - Enfriamiento 5' @ 50% (118 W)
  - _Rodada suave en día de fuerza para soltar las piernas y prepararte para el sábado. Va sin ERG: rueda por sensación y, si quieres usar ERG, prende el botón ⚡. La referencia es RPE 3-4, con frases completas sin jadear. Entre más relajado salgas de aquí, mejor llegas al fin de semana._

- **sábado 7 nov — Arranques y umbral 2×12** · 89 min · TSS ≈ 68
  - Calentamiento 15' @ 50→75% (118→176 W)
  - 8× (10" libre, por sensación y sin ERG (referencia ~150% (353 W)) + 3.8' @ 50% (118 W))
  - 2× (12' @ 95% (223 W) + 4' @ 55% (129 W))
  - Enfriamiento 10' @ 55→45% (129→106 W)
  - _Hoy combinamos explosividad y umbral, y la clave está en los arranques. Los ocho sprints de 10 s van sin ERG y al máximo, con recuperación completa; no los hagas a medias. Después, los dos bloques de 12 min al 95 % los haces con ERG prendido, así que tú sostienes la cadencia y el rodillo marca la potencia. Debe sentirse RPE 7 en el umbral, con piernas pesadas pero controladas._

- **domingo 8 nov — Fondo largo** · 90 min · TSS ≈ 59 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→65% (118→153 W)
  - Constante 70' @ 65% (153 W)
  - Enfriamiento 10' @ 50% (118 W)
  - _Hoy es la rodada larga de la semana: 90 minutos a RPE 3-4, sin prisa y comiendo y tomando líquido durante el recorrido. Va sin ERG, así que ve por sensación; si prefieres ERG, prende el botón ⚡. La referencia es poder hablar en frases completas todo el tiempo. Termina con la sensación de haber trabajado sin desgastarte, porque después de esta semana viene la descarga._
- _Fuera del rodillo:_ **lunes 2 nov — Fuerza: pierna moderada** (45 min): El martes es suave, así que puedes trabajar pierna con control. Termina con energía.
- _Fuera del rodillo:_ **jueves 5 nov — Fuerza: tren superior y core** (45 min): El sábado toca arranques y umbral, así que hoy tren superior y core, con la pierna muy ligera.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **En temporada:** venía de 12 h con intensidad, así que entra directo con umbral (3×8 → 3×10 → 3×12 min al 95–97%) y arranques de 10 s a tope sin ERG (referencia ~150%), sin rehacer base.
- **2 sesiones duras por semana:** miércoles y sábado. Lunes y jueves suaves por sus días de fuerza.
- **Volumen:** 6.3 → 7.5 → 7.7 h de 11 disponibles. Le dice que es para que sume bien con la fuerza.
- **Test de 20 min al final de la semana 4 (descarga):** 4 semanas después de su último test.
- **Sin salida larga afuera:** su sesión más larga es un fondo de 90 min en rodillo.

**Para revisar:**

- ¿Bajarías de 12 h a 6.3 h la primera semana de una élite a 8 semanas del selectivo?
- ¿Le falta una salida larga en ruta?
- Los arranques de 10 s están desde la semana 1, pero los esfuerzos de 30 s a 1 min (clave en criterium) llegan hasta el bloque 2. ¿Es tarde?

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
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 6 h (calidad mala) · estrés alto · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: más o menos · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 4 h/sem · martes, miércoles, jueves, sábado · máx 120 min por sesión |
| **Su objetivo (textual)** | «Gravel de 100 km en la Sierra Gorda el 12 de enero de 2027. Tengo dos hijos chicos: entre semana solo puedo 40 minutos temprano y el sábado hasta 2 horas. Duermo mal.» |

**Perfil de arranque (reglas de Torq):** test de rampa · arranque conservador · enseñarle a usar RPE · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Gravel Sierra Gorda 100 km · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y rampa | 5 | 3.3 | Base aeróbica con 1 sesión por RPE a la semana. Salida larga afuera del sábado: de 1 h 30 a 2 h. Descarga en la semana 4. |
| Construcción gravel | 4 | 3.8 | Tempo y sweet spot en bloques con los watts de la rampa. Salida larga de 2 h el sábado, con comida desde el minuto 30. Descarga en la semana 8. |
| Específico gravel | 3 | 4 | Ritmo sostenido con cambios de ritmo. Sábado de 2 h afuera, con comida y el ritmo del evento. |
| Descarga y carrera | 1 | 2 | Volumen bajo y piernas frescas. El martes 12 de enero es el gravel de 100 km. |

**Próximo test:** ramp · Después de 2 rodadas por sensación y con un día suave antes, el jueves de la semana 1 es el mejor momento para medir tus zonas con la rampa.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Javier, con 4 h a la semana y 40 min entre semana, cada sesión cuenta: 3 de rodillo de 40 min y el sábado largo afuera, que va en tu calendario. La demanda del gravel de 100 km es ritmo sostenido largo con cambios de ritmo, así que priorizo la salida larga y la base antes que muchos intervalos. Traes 5 años en bici y 1 de entrenamiento estructurado: eso es buen oficio y vamos a construir la estructura juntos. Con el sueño y el estrés en contra, arranco prudente y voy ajustando con tus primeras sesiones. Hasta el test del jueves 22 la intensidad va por sensación (RPE); el test te da tus zonas en watts. Nada de números provisionales.

#### Semana 1 · 3 sesiones de rodillo · 2.1 h · TSS ≈ 46 (sin contar el test)

- **martes 20 oct — Rodada suave por sensación** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Javier, este es tu primer contacto con el rodillo, así que hoy va por sensación y con ERG apagado: pedalea con la cadencia que te salga natural, que la app la va a observar. Busca un esfuerzo en el que puedas platicar en frases completas, un RPE de 3 a 4. Si prefieres tenerlo prendido, activa el botón ⚡ y el rodillo marcará la potencia. Si en algún momento no puedes hablar en frases completas, baja el ritmo sin pena. Es una rodada tranquila para agarrarle la mano a la bici._

- **miércoles 21 oct — Rodada suave por sensación** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Rodada suave de preparación con ERG apagado, por sensación. Mantén un esfuerzo en el que puedas platicar en frases completas, con RPE de 3 a 4, y pedalea con la cadencia que te salga natural. Mañana es el test, así que la idea es llegar fresco y sin cansancio extra. Si prefieres ERG, puedes prenderlo con el botón ⚡. Si no puedes hablar cómodo, baja la intensidad y anótalo para tu coach._

- **jueves 22 oct — Test de rampa** · 48 min · 🧪 test hasta el fallo (la duración es el máximo posible)
  - Rampa: escalones de 2' subiendo ~12.5% cada uno, de 25% hasta 313% o hasta no poder más (24 escalones como máximo)
  - _Hoy toca tu primer test de rampa, con ERG prendido: el rodillo sube la potencia cada 2 minutos y tú sostienes la cadencia. Llega descansado y con ventilador, porque el objetivo es darle todo lo que tengas en cada escalón. Al final de cada escalón te va a preguntar tu RPE: contesta con honestidad y detente en RPE 8, no en 10. Es un test de familiarización, así que aprender cómo se siente y cómo responder va a ayudarte a que el siguiente salga mejor. Este test deja tu referencia lista para la semana._
- _Fuera del rodillo:_ **sábado 24 oct — Salida larga afuera** (90 min): Rodada continua en ruta o gravel a RPE 3-4, platicando todo el tiempo. Come algo desde el minuto 30.

#### Semana 2 · 3 sesiones de rodillo · 2 h · TSS ≈ 68

- **martes 27 oct — Intervalos por RPE 7** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 8' @ 55%
  - 3× (5' libre, por sensación y sin ERG (referencia ~90%) + 3' @ 50%)
  - Enfriamiento 8' @ 50%
  - _Martes es día de intervalos por sensación, así que apágale al ERG y deja que el esfuerzo lo marque tu cuerpo: tres bloques de 5 minutos a RPE 7, duros pero sostenibles, con recuperaciones suaves entre cada uno. Durante los intervalos piensa en frases cortas; si ya no puedes decir ni eso, baja un poco. Empieza el primero más contenido de lo que te pide el cuerpo, porque si el último sale mucho más flojo que el primero, saliste demasiado fuerte. Si sientes las piernas pesadas desde el segundo bloque, es normal; lo importante es terminar el tercero con control. Este trabajo le da a tus piernas el estímulo que necesitan para los días de rodaje que siguen, Javier._

- **miércoles 28 oct — Fondo suave** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Miércoles es día de rodar tranquilo para soltar las piernas. Va en modo calle plana, sin ERG, así que pedalea por sensación con cadencia natural y sin prisa. El objetivo es que pases 30 minutos cómodo, a RPE 3-4, platicando sin esfuerzo. Si notas que te cuesta hablar en frases completas, baja la potencia y anótalo para tu coach. Sentirás las piernas ligeras y la respiración tranquila, y eso es exactamente lo que buscamos hoy. Esta rodada sirve para recuperar de martes y llegar fresco al jueves._

- **jueves 29 oct — Fondo suave** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Jueves es otro fondo a ritmo cómodo, sin ERG, que puedes llevar por sensación. Mantente en RPE 3-4, con la respiración tranquila y la posibilidad de conversar mientras pedaleas. Vigila tu pulso: si empieza a subir sin que lo pidas, baja un poco la potencia para que el esfuerzo siga siendo fácil. Lo que esperas sentir es una rodada cómoda, con piernas que se van calentando y se sienten suaves. Si prefieres usar ERG, puedes prenderlo con el botón ⚡, pero el objetivo es mantener el mismo ritmo relajado. Este fondo te deja con buenas piernas para lo que venga después en la semana._
- _Fuera del rodillo:_ **sábado 31 oct — Salida larga afuera** (100 min): Rodada continua a RPE 3-4, sin picos. Come desde el minuto 30 y practica lo que vas a comer en el gravel.

#### Semana 3 · 3 sesiones de rodillo · 2 h · TSS ≈ 69

- **martes 3 nov — Intervalos por RPE 7** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 8' @ 55%
  - 3× (6' libre, por sensación y sin ERG (referencia ~90%) + 3' @ 50%)
  - Enfriamiento 5' @ 50%
  - _Hoy toca subir la intensidad con intervalos de 6 minutos a RPE 7: duro, pero sostenible. Déjalo con ERG apagado y ve por sensación; si prefieres que el rodillo marque la potencia, puedes prenderlo con el botón ⚡, aunque aquí el esfuerzo lo regulas tú. Mantén el mismo ritmo en los tres bloques, sin salir disparado en el primero. Lo sabrás bien si puedes decir frases cortas: si ya no puedes, baja un poco y anótalo para tu coach. Al terminar, las piernas quedan trabajadas pero listas para rodar suave mañana._

- **miércoles 4 nov — Fondo suave** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Día de recuperar lo del martes: una rodada tranquila a RPE 3-4, de esas en las que vas platicando sin esfuerzo. Va con ERG apagado, por sensación; si prefieres marcar la potencia, puedes prenderlo con el botón ⚡, pero no hace falta. Si al pedalear sientes que se te va el aire en medio de una frase, baja un cambio. Sal con calma, disfruta el camino y deja las piernas frescas para el jueves._

- **jueves 5 nov — Fondo suave** · 40 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 5' @ 55%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Otra rodada de fondo a RPE 3-4, pensada para sumar kilómetros sin fatigarte. Va con ERG apagado y a tu sensación; si quieres usar el ERG, lo prendes con el botón ⚡. Si dormiste mal, no le añadas nada: solo rueda cómodo y platica mientras avanzas. Si puedes hablar en frases completas, vas en el punto justo._
- _Fuera del rodillo:_ **sábado 7 nov — Salida larga afuera** (110 min): Rodada continua a RPE 3-4 con comida desde el minuto 30. Si sientes que se te va el pulso en la segunda mitad, baja el ritmo.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Ignora su FTP provisional (250 W):** le dice «nada de números provisionales»; todo va por sensación hasta el test.
- **Test de rampa el jueves de la semana 1,** después de dos rodadas suaves. Sí puede dar un máximo, pero no tiene la experiencia completa para el de 20 min.
- **Su tiempo real:** 3 sesiones de 40 min entre semana y el sábado largo afuera, 90 → 100 → 110 min (su tope es 120).
- **Arranque conservador:** sueño malo y estrés alto. Semanas 2 y 3: un día de intervalos por RPE 7 y dos de fondo.

**Para revisar:**

- ¿Test máximo en la semana 1 con sueño malo y estrés alto?
- Las semanas 2 y 3 siguen por RPE aunque la rampa ya le dio watts (se armaron antes del test; la evaluación semanal debería pasarlas a watts).

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
| **Salud** | Condiciones: asma · medicamento: Inhalador (salbutamol) antes de rodar · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés medio · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: no · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Yoga / movilidad 1×/sem de 60 min (miércoles) |
| **Disponibilidad** | 4 h/sem · martes, jueves, sábado |
| **Su objetivo (textual)** | «Subir el Ajusco sin bajarme de la bici en las rodadas con mis amigas. Martes y jueves rodillo; el sábado salgo a rodar con ellas. No compito.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: medio

### Lo que armó el coach IA

**Plan:** Subir el Ajusco con tus amigas · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base y confianza | 4 | 3.5 | Fondo y tempo suave por sensación, aprendiendo la escala de esfuerzo. Rodillo martes y jueves de 55-60 min; el sábado salida con tus amigas. |
| Construcción de subida | 4 | 4 | Bloques sostenidos de tempo y esfuerzos de 6-10 min a RPE 6-7 para sostener una subida larga. Rodillo de 60-70 min y salida del sábado. |
| Específico Ajusco | 4 | 4 | Subidas largas simuladas en el rodillo y repeticiones por RPE; el sábado cada vez más tiempo subiendo constante. Descarga en la última semana. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Lucía, tu meta es subir el Ajusco sin bajarte: la demanda es subida sostenida, así que priorizo base aeróbica y tempo suave por sensación. Como vives con asma y usas inhalador, antes de apretar conviene que tu médico te dé luz verde; mientras, construimos con cuidado y sin esfuerzos máximos ni test. Escala de esfuerzo: 3-4 = puedes platicar, 6-7 = solo frases cortas, 8-9 = pocas palabras, 10 = no puedes más. Tu yoga/movilidad de los miércoles cuenta en la carga y por eso martes y jueves quedan separados de él. El rodillo no entrena el manejo en montaña: las rodadas del sábado sí. Con 4 h a la semana y 3 días, lo que cabe son ~2 h el sábado más dos sesiones de ~1 h.

#### Semana 1 · 2 sesiones de rodillo · 2 h · TSS ≈ 77

- **martes 20 oct — Fondo para aprender el esfuerzo** · 55 min · TSS ≈ 33 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 40' @ 62% · 60–100 rpm
  - Enfriamiento 5' @ 50%
  - _Martes es día de rodar tranquila para conocer tu rodillo. Son 55 minutos por sensación, sin ERG: va en calle plana y tú decides el ritmo. Si prefieres que el rodillo marque la potencia, lo prendes con el botón ⚡, pero hoy la idea es que sientas tu propio paso. Mantén un esfuerzo suave en el que puedas platicar en frases completas; si no puedes, baja un poco y anótalo para tu coach. La cadencia que te salga natural está bien, la app la irá observando. Antes de salir, usa tu inhalador como acostumbras. Te deja las piernas frescas y listas para el jueves._

- **jueves 22 oct — Fondo con cambios de ritmo** · 64 min · TSS ≈ 44 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (8' @ 75% · 60–100 rpm + 5' @ 55%)
  - Constante 10' @ 62%
  - Enfriamiento 5' @ 50%
  - _Hoy el jueves trae tres bloques más firmes dentro de un fondo. Son 64 minutos sin ERG, así que vas por sensación: en los bloques de tempo suave, la respiración debe quedarse en frases cortas pero sin ahogarte, sin llegar a un esfuerzo que te corte la plática. Entre bloques, pedalea fácil y recupera el aire antes del siguiente. Si quieres que el rodillo sostenga la potencia, puedes prender ERG con el botón ⚡, pero tú decides. Después del martes, esto pone a prueba tu ritmo y te deja con buenas sensaciones para el fin de semana._
- _Fuera del rodillo:_ **sábado 24 oct — Rodada con tus amigas** (120 min): Tu salida de siempre a ritmo cómodo, RPE 3-4 en lo plano y sin pasarte en las subidas. Come algo desde el minuto 30 y lleva tu inhalador.

#### Semana 2 · 2 sesiones de rodillo · 2.1 h · TSS ≈ 82

- **martes 27 oct — Fondo y cadencia libre** · 60 min · TSS ≈ 36 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 45' @ 62% · 60–100 rpm
  - Enfriamiento 5' @ 50%
  - _Hoy toca un fondo tranquilo para llenar el tanque: 45 minutos a ritmo cómodo, de esos en los que puedes platicar sin problema. Déjate la cadencia natural; la app la va observando y no tienes que forzarla. Con ERG apagado vas por sensación, y si prefieres que el rodillo marque la potencia, lo prendes con el botón ⚡. Tu referencia es el RPE 3-4: si puedes decir frases completas, vas perfecto. Es la base que hace que el resto de la semana rinda mejor._

- **jueves 29 oct — Tempo por sensación** · 65 min · TSS ≈ 46 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (10' @ 75% · 60–100 rpm + 5' @ 55%)
  - Constante 5' @ 62%
  - Enfriamiento 5' @ 50%
  - _Hoy subimos un poco el ritmo, pero sin pasarte: tres bloques de 10 minutos a ritmo de subida tranquila, con recuperaciones fáciles entre ellos. Ve por sensación con ERG apagado; si quieres que el rodillo marque la potencia, lo prendes con el botón ⚡, aunque aquí el esfuerzo lo regulas tú mejor. Tu referencia es hablar en frases cortas (RPE 5-6): si te cuesta, baja un poco sin culpa. Llega al jueves con las piernas frescas y disfruta el trabajo._
- _Fuera del rodillo:_ **sábado 31 oct — Rodada con tus amigas** (130 min): Misma salida con un poco más de tiempo. Sube a tu ritmo, RPE 5-6 máximo en las subidas, y baja la intensidad antes de tener que bajarte.

#### Semana 3 · 2 sesiones de rodillo · 2.2 h · TSS ≈ 89

- **martes 3 nov — Fondo estable** · 65 min · TSS ≈ 39 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 50' @ 62% · 60–100 rpm
  - Enfriamiento 5' @ 50%
  - _Hoy toca un fondo largo y tranquilo, de esos que construyen base sin desgastarte: unos 50 minutos constantes con cadencia suave entre 60 y 100 rpm. Va por sensación, así que puedes dejar el ERG apagado; si prefieres que el rodillo sostenga la potencia, lo prendes con el botón ⚡. Ritmo de conversación: deberías poder hablar en frases completas todo el tiempo. Si notas que la respiración se acelera, baja el ritmo sin culpa, que aquí lo importante es cuidar tu asma y sumar kilómetros de calidad. Al terminar sentirás las piernas con un trabajo parejo y sin pesadez, lo que deja buena base para lo que viene._

- **jueves 5 nov — Tempo en bloques** · 68 min · TSS ≈ 50 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (12' @ 76% · 60–100 rpm + 5' @ 55%)
  - Enfriamiento 7' @ 50%
  - _Hoy te toca trabajo en bloques de tempo: tres tramos de 12 minutos con 5 de recuperación entre cada uno. Va por sensación, así que puedes dejar el ERG apagado; si prefieres que el rodillo sostenga la potencia, lo prendes con el botón ⚡. Busca un esfuerzo constante de principio a fin, RPE alrededor de 6, en el que puedas decir frases cortas. Lo más difícil va a ser no arrancar demasiado fuerte en el primer bloque: parejo gana. Espera sentir las piernas cargadas hacia el tercer bloque, eso es lo esperado; si aparece ahogo o dolor, para y avisa a tu coach. Este bloque largo te deja listo para el fin de semana con más aguante._
- _Fuera del rodillo:_ **sábado 7 nov — Rodada con tus amigas** (140 min): Salida cómoda, RPE 3-4 en plano y RPE 5-6 en subidas. Come desde el minuto 30 y lleva tu inhalador.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero:** asma con salbutamol. Sin test ni máximos, por sensación y nada arriba de 76%; le pide luz verde de su médico.
- **Sus días:** martes y jueves rodillo de 55–68 min; el sábado, su rodada con amigas (2 h → 2 h 20), que es donde se entrena la subida real. Respeta el yoga del miércoles.
- **Hacia el Ajusco:** fondo y tempo por sensación ahora; los bloques sostenidos de 6–10 min a RPE 6–7 llegan en el bloque 2.
- **El inhalador:** le recuerda usarlo antes de rodar y llevarlo en las salidas del sábado.

**Para revisar:**

- Para subir el Ajusco sin bajarse, ¿meterías trabajo de fuerza en subida (cadencia baja) antes del bloque 2?
- Una descripción le dice «listo».

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

**Perfil de arranque (reglas de Torq):** sin test: por sensación, subiendo de a poco · arranque conservador · base aeróbica antes de intensidad (tabaco/alcohol) · enseñarle a usar RPE · no hace máximos porque: viene de estar sedentario; todavía no sabe medir su esfuerzo (RPE) · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Volver a moverte: base y peso · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base 1: acostumbrar el cuerpo | 4 | 2.3 | Rodadas suaves por sensación, 3 sesiones de 40-50 min y un día extra de descanso. Aprendemos la escala de esfuerzo (RPE) y cuidamos la rodilla derecha. |
| Base 2: más volumen | 4 | 3.2 | Subimos duración de a poco, 4 sesiones de hasta 60 min y primeros cambios de ritmo suaves por RPE. |
| Construcción | 4 | 3.8 | Esfuerzos de RPE 7 por bloques cortos, una sola sesión exigente por semana, descarga cada 3 semanas. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Daniel, vienes con motor de futbolista pero sin oficio en la bici ni rodaje reciente: construimos base con calma y ajusto en cuanto vea tus primeras sesiones. Tu meta de 12 kg es realista a mediano plazo si sumamos constancia semana a semana; lo medimos con tus sesiones cumplidas, tu RPE y cómo baja tu pulso a la misma sensación, y del peso y la alimentación que se encargue un nutriólogo. Tu rodilla operada manda: cadencia cómoda, nada de fuerza a cadencia baja ni arrancadas, y si el dolor altera el pedaleo, para y que la vea un fisioterapeuta. Con 4 h declaradas y tope de 60 min por sesión, cuatro días caben pero empezamos con 3 sesiones (unas 2 h) y sumamos tiempo de a poco. Aún no mides tu esfuerzo, así que aprende la escala: RPE 3-4 puedes platicar, 6-7 solo frases cortas, 8-9 pocas palabras, 10 no puedes más. No hay test ni número de FTP por ahora: todo va por sensación (RPE), metiendo esfuerzos un poco más altos de a poco.

#### Semana 1 · 3 sesiones de rodillo · 2.2 h · TSS ≈ 77

- **martes 20 oct — Rodada suave 1** · 40 min · TSS ≈ 22 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 25' @ 60%
  - Enfriamiento 5' @ 50%
  - _Tu primera rodada en el rodillo, para tomarle la medida con calma. Pedalea por sensación, con la cadencia que te salga natural; no hace falta forzar nada. Te recomiendo dejar el ERG apagado para que tú controles la resistencia, y si prefieres ver la potencia fija, lo prendes con el botón ⚡. Ve a un ritmo en el que puedas platicar en frases completas: si no puedes, baja un poco y anótalo para tu coach. Con esto arrancas el martes sin prisa, con las piernas despiertas para lo que sigue._

- **jueves 22 oct — Rodada suave 2** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Misma sensación que el martes, pero un poco más larga. Mantén un esfuerzo suave, RPE 3-4, con una conversación fácil. Te recomiendo dejar el ERG apagado y rodar por sensación; si prefieres ERG, lo prendes con el botón ⚡. Si la rodilla derecha te molesta, baja la resistencia y avísalo en tu nota, sin aguantarte. Es una rodada para sumar kilómetros de base y dejar las piernas listas para el fin de semana._

- **sábado 24 oct — Rodada con cambios suaves** · 49 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - 4× (3' @ 72% + 3' @ 58%)
  - Constante 10' @ 60%
  - Enfriamiento 5' @ 50%
  - _Aquí empiezas a sentir la diferencia entre esfuerzos. Alternarás tramos de 3 minutos un poco más firmes, RPE 5, con frases cortas pero cómodas, y tramos fáciles para recuperar. No aprietes de más: la idea es aprender a sentir el cambio, no a sufrir. Te recomiendo dejar el ERG apagado para regular tú los cambios; si prefieres ERG, lo prendes con el botón ⚡. Mantén la resistencia ligera y una cadencia alta, sobre todo por tu rodilla. Si en los tramos firmes sientes que no puedes hablar ni en frases cortas, baja y anótalo para tu coach._

#### Semana 2 · 3 sesiones de rodillo · 2.5 h · TSS ≈ 87

- **martes 27 oct — Rodada suave 1** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 30' @ 60%
  - Enfriamiento 5' @ 50%
  - _Martes, rodada suave para arrancar la semana con las piernas sueltas. Son 45 minutos a ritmo tranquilo, sin ERG: vas por sensación y ajustas tú, y si prefieres ERG lo prendes con el botón ⚡. Busca un RPE de 3 a 4, con respiración tranquila y una cadencia que salga natural. Si puedes charlar sin esfuerzo, vas exactamente donde debes. Es igual que la semana pasada, con 5 minutos más de fondo, así que disfruta la constancia y sal con ganas de repetirla el jueves._

- **jueves 29 oct — Rodada suave 2** · 50 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 35' @ 60%
  - Enfriamiento 5' @ 50%
  - _Jueves, fondo continuo por sensación. Son 50 minutos sin ERG: tú marcas el ritmo y, si quieres el control del rodillo, lo prendes con el ⚡. La clave es que puedas hablar en frases completas durante casi todo el rodaje; si lo logras, vas bien. Al terminar, anota tu RPE para que tu coach vea cómo se sintió. Sentirás las piernas trabajando de forma pareja, sin picos, y eso deja la base lista para el sábado._

- **sábado 31 oct — Rodada con cambios suaves** · 55 min · TSS ≈ 34 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - 5× (3' @ 72% + 3' @ 58%)
  - Constante 10' @ 60%
  - Enfriamiento 5' @ 50%
  - _Sábado, rodada con cambios suaves para despertar las piernas sin cansarlas. Son 55 minutos sin ERG: vas por sensación y los cambios son de 3 minutos firmes a RPE 5 seguidos de 3 minutos fáciles, cinco veces. Si prefieres ERG, lo prendes con el ⚡ y lo usas para sostener los cambios. Lo que buscas es sentir el esfuerzo firme sin que se vuelva pesado, y terminar con ganas de más, no vacío. Así cierras la semana con buen volumen y frescura._

#### Semana 3 · 3 sesiones de rodillo · 2.6 h · TSS ≈ 93

- **martes 3 nov — Rodada suave 1** · 50 min · TSS ≈ 28 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 35' @ 60%
  - Enfriamiento 5' @ 50%
  - _Martes de fondo tranquilo, de esos que construyen base sin desgastarte. Vas en modo calle plana, por sensación, con cadencia natural y hombros y manos sueltos; si prefieres ERG lo prendes con el botón ⚡, pero hoy no lo necesitas. La referencia es poder hablar en frases completas, con RPE 3-4. Si lo haces así, llegas fresco y listo para lo que sigue en la semana._

- **jueves 5 nov — Rodada suave 2** · 55 min · TSS ≈ 31 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - Constante 40' @ 60%
  - Enfriamiento 5' @ 50%
  - _Jueves con un fondo un poco más largo, pero el ritmo sigue siendo suave. Va en modo calle plana, sin ERG, y mantienes un esfuerzo que te permita hablar en frases completas, RPE 3-4. Si notas que el pulso se va subiendo o ya no puedes hablar, baja la resistencia y rueda más suave; ese es tu control. Así llegas con buenas piernas al fin de semana._

- **sábado 7 nov — Rodada con cambios de ritmo** · 53 min · TSS ≈ 34 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - 4× (4' @ 74% + 3' @ 58%)
  - Constante 10' @ 60%
  - Enfriamiento 5' @ 50%
  - _Sábado con cambios de ritmo: cuatro bloques firmes a RPE 5-6, donde deberías poder decir frases cortas, separados por tres minutos fáciles para recuperar. Va en modo calle plana, por sensación, sin ERG; si prefieres ERG, lo prendes con el botón ⚡. Dosifica desde el primer bloque, porque el último debe salir igual que el primero. Este trabajo deja las piernas listas para rodar con soltura la semana que viene._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **La rodilla manda:** cadencia cómoda, nada de fuerza a cadencia baja ni arranques; si duele, parar y que lo vea un fisioterapeuta.
- **Sin test:** viene de estar sedentario y no sabe usar RPE. Todo por sensación, nada arriba de 74%.
- **3 sesiones en vez de 4:** 2.2 h → 2.6 h de 4 disponibles; le explica que suma tiempo de a poco.
- **Base primero:** fuma de vez en cuando. El peso, con nutriólogo; su avance lo mide con sesiones cumplidas, RPE y pulso.

**Para revisar:**

- ¿Pondrías la 4ª sesión desde el inicio para la meta de peso?

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
| **Salud** | Condiciones: Ninguna · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad buena) · estrés bajo · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: sí · ¿ha hecho esfuerzos máximos?: sí |
| **Otras actividades** | Ninguna |
| **Disponibilidad** | 9 h/sem · lunes, martes, jueves, sábado, domingo |
| **Su objetivo (textual)** | «Copa Nacional de XCO (Master 50) el 15 de diciembre de 2026. Estoy a media temporada: corrí hace 2 semanas. Quiero llegar con más chispa en los arranques y en las subidas cortas.» |

**Perfil de arranque (reglas de Torq):** test de 20 min · viene entrenando con intensidad: no arranca desde cero · estrés ajustado: bajo

### Lo que armó el coach IA

**Plan:** Chispa para la Copa Nacional XCO · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base específica XCO | 3 | 7.5 | Arranque con 2 sesiones clave por semana: 40:20s para los arranques y umbral para las subidas cortas. Salida larga afuera los domingos (2.5 h a 3 h). Semana de descarga con retest al final. |
| Arranques y subidas cortas | 3 | 8 | Más trabajo por encima del umbral: 40:20s, salidas simuladas y umbral con picos. Salida larga de 2.5 h y una semana de descarga. |
| Afinado | 2 | 7 | Calidad sobre cantidad: el mismo estímulo con menos volumen. Salida larga corta de 2 h y mucha frescura. |
| Semana de carrera | 1 | 4 | Llegar fresco: activaciones cortas y descanso. Carrera el martes 15 de diciembre. |

**Próximo test:** test20 · Será la semana de descarga y cae a 4 semanas de tu rampa del 10 de octubre: llegarás fresco, sabes dosificarte y el número ya servirá como retest al abrir el segundo bloque.

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Fernando, vienes en plena temporada, así que no arrancamos desde base: la intensidad entra desde la semana 1. La demanda del XCO es repetir esfuerzos fuertes en 90 min, y tu límite son los arranques y las subidas cortas, por eso priorizo 40:20s y umbral. A los 51 dejo al menos 3 días entre las dos sesiones duras (martes y sábado) y una descarga cada 3 semanas. El rodillo no entrena la técnica: la agendo los jueves, afuera. Tu salida larga del domingo es la base de resistencia. Tu FTP de 265 W se queda tal cual hasta el retest de la semana 4.

#### Semana 1 · 2 sesiones de rodillo · 2.1 h · TSS ≈ 99

- **martes 20 oct — 40:20s: arranques** · 56 min · TSS ≈ 34
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 4' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Constante 15' @ 65% (172 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy toca trabajar la repetición de esfuerzos fuertes con arranques explosivos. Apaga el ERG y, en los 40 segundos fuertes, sal con potencia pero dosificada, en un esfuerzo que te deje con pocas palabras (RPE 8-9); los 20 segundos suaves son pedaleo tranquilo, sin parar. Si notas que la potencia cae mucho a mitad de la serie, saliste demasiado fuerte: la próxima vez arranca un poco más suave. Lo que sientas en las piernas en las últimas series es la señal de que el trabajo está haciendo su efecto._

- **sábado 24 oct — Umbral 3x10** · 70 min · TSS ≈ 65
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 3× (10' @ 92% (244 W) + 5' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Este es tu primer contacto con bloques sostenidos, y te recomiendo dejar el ERG prendido para que el rodillo sostenga el umbral conservador de estas dos semanas. Mantén una cadencia cómoda; los bloques deben sentirse duros pero controlados, cerca de un RPE 6-7, y puedes hablar con frases cortas. Si al tercer bloque no logras completarlo, baja 3 a 5 puntos y anótalo para tu coach. Terminar esta sesión bien te deja con buena base para lo que viene en la semana._
- _Fuera del rodillo:_ **jueves 22 oct — Técnica en montaña** (60 min): Bajadas, curvas, frenado y arrancadas en terreno técnico. Cardiovascularmente suave; el objetivo es soltura, no cansarte.
- _Fuera del rodillo:_ **domingo 25 oct — Salida larga** (150 min): Rodada afuera a RPE 3-4, de las que permiten platicar. Come desde el minuto 30.

#### Semana 2 · 3 sesiones de rodillo · 3.3 h · TSS ≈ 151

- **lunes 26 oct — Fondo suave** · 60 min · TSS ≈ 39
  - Calentamiento 10' @ 50→62% (133→164 W)
  - Constante 45' @ 65% (172 W)
  - Enfriamiento 5' @ 55→45% (146→119 W)
  - _Fernando, arrancamos la semana con una rodada tranquila para soltar las piernas del fin de semana. Deja el ERG prendido para que el rodillo sostenga los 65 % FTP del bloque central, y si lo prefieres puedes apagarlo, pero mantén la misma referencia. Ve a una cadencia que te salga natural y procura poder hablar en frases completas durante todo el rato; si no puedes, baja un poco. Al terminar vas a sentir las piernas más sueltas, no cansadas, y eso deja la base lista para el martes._

- **martes 27 oct — 40:20s: arranques** · 66 min · TSS ≈ 40
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 4' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 4' @ 50% (133 W)
  - 6× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Constante 15' @ 65% (172 W)
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy subimos una serie: tres bloques de seis repeticiones de 40 segundos fuertes con 20 suaves. Los 40 s van con el ERG apagado, a un esfuerzo fuerte pero parejo (RPE 8-9), sin salir disparado en el primero; medirte los primeros minutos te dará mejor promedio que arrancar explosivo y caer. Los 20 s suaves son de recuperación activa, sin parar a descansar. Espera que las últimas repeticiones pesen, con las piernas ardiendo pero la técnica firme; si sientes un dolor agudo o pierdes el control, baja y anótalo para tu coach. Tu potencia en la última serie es la mejor señal de cómo vas, así que guárdala._

- **sábado 31 oct — Umbral 3x12** · 73 min · TSS ≈ 72
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 3× (12' @ 92% (244 W) + 4' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Hoy toca un umbral con bloques más largos: tres de doce minutos a 92 % FTP, con cuatro de recuperación. La potencia es la misma que la semana pasada, así que el cambio está en aguantar más tiempo, no en apretar más. Deja el ERG prendido para que el rodillo marque la potencia y tú te concentras en sostener la cadencia. Busca un RPE 6-7 con respiración controlada; si llegas a sentir RPE 8, baja tres a cinco puntos de esfuerzo. Llega descansado de la semana para que el tercer bloque se sienta sólido y no a rastras._
- _Fuera del rodillo:_ **jueves 29 oct — Técnica en montaña** (75 min): Practica bajadas, curvas cerradas y arrancadas en pendiente. Suave de piernas y con la cabeza fresca.
- _Fuera del rodillo:_ **domingo 1 nov — Salida larga** (165 min): Rodada afuera a RPE 3-4 con la comida desde el minuto 30. Debes poder platicar todo el recorrido.

#### Semana 3 · 3 sesiones de rodillo · 3.1 h · TSS ≈ 145

- **lunes 2 nov — Fondo suave** · 60 min · TSS ≈ 39
  - Calentamiento 10' @ 50→62% (133→164 W)
  - Constante 45' @ 65% (172 W)
  - Enfriamiento 5' @ 55→45% (146→119 W)
  - _Lunes de rodar tranquilo para soltar el fin de semana: 45 minutos de fondo cómodo al 65 % de tu FTP, con ERG prendido para que el rodillo mantenga la potencia pareja mientras tú disfrutas el pedaleo. La referencia es sencilla: puedes hablar en frases completas todo el tiempo; si no puedes, baja la potencia un poco. Hoy no hay que apretar, solo asimilar y sentir las piernas ligeras para la semana._

- **martes 3 nov — 40:20s: 3x7** · 54 min · TSS ≈ 31
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 7× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 4' @ 50% (133 W)
  - 7× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Recuperación 4' @ 50% (133 W)
  - 7× (40" libre, por sensación y sin ERG (referencia ~125% (331 W)) + 20" @ 50% (133 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Martes de intervalos cortos y intensos: 3 bloques de 7 repeticiones de 40 segundos fuertes con 20 segundos suaves, con 4 minutos de descanso entre bloques. Aquí el esfuerzo lo regulas tú, así que el ERG va apagado durante los 40 segundos: sal fuerte pero parejo, cerca de RPE 9, y en los 20 segundos sigue pedaleando suave para recuperar. Lo que más cuenta es no salir como cohete en la primera serie; si en la tercera la potencia se cae mucho, anótalo para tu coach. Llega con buena energía y eso hará la diferencia._

- **sábado 7 nov — Umbral 3x12** · 73 min · TSS ≈ 75
  - Calentamiento 15' @ 55→75% (146→199 W)
  - 3× (12' @ 95% (252 W) + 4' @ 55% (146 W))
  - Enfriamiento 10' @ 55→45% (146→119 W)
  - _Sábado de umbral con ERG prendido: 3 bloques de 12 minutos al 95 % de tu FTP, con 4 minutos de recuperación entre ellos. El rodillo marca la potencia y tú sostienes la cadencia; si las dos semanas pasadas las completaste sin pasar de RPE 7, este ya es tu umbral real. Si sientes que sufres demasiado, baja 3 a 5 puntos sin dudarlo. Terminar esta sesión deja las piernas listas para cargar bien el resto de la semana._
- _Fuera del rodillo:_ **jueves 5 nov — Técnica en montaña** (75 min): Bajadas, raíces y curvas, con énfasis en frenar tarde y salir rápido. Cardiovascularmente suave.
- _Fuera del rodillo:_ **domingo 8 nov — Salida larga** (180 min): Tu salida más larga del bloque, a RPE 3-4. Come desde el minuto 30 y cuida el ritmo en las subidas.

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **En temporada:** intensidad desde el día 1, con 40:20 s por sensación (referencia ~125%) para los arranques y umbral 3×10–12 min al 92–95% para las subidas cortas.
- **Por edad (51),** 3 o más días entre las dos sesiones duras (martes y sábado) y una descarga cada 3 semanas.
- **Afuera:** técnica en montaña los jueves (60–75 min) y salida larga los domingos (2.5 h → 3 h).
- **FTP 265 W se queda** hasta el test de 20 min de la semana 4 (descarga).
- **Volumen:** ~5.6 → 7.3 h de 9 disponibles.

**Para revisar:**

- Le pone 40:20 s el mismo día que crea el plan. ¿Lo harías sin una rodada antes?
- ¿Le faltan arranques explosivos más cortos (10–15 s) para XCO?

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
| **Salud** | Condiciones: diabetes · medicamento: Metformina · lesión reciente: no |
| **Hábitos** | Duerme 7 h (calidad regular) · estrés alto · fuma: no · alcohol: nunca o rara vez |
| **Esfuerzo** | ¿Sabe usar RPE?: más o menos · ¿ha hecho esfuerzos máximos?: no |
| **Otras actividades** | Yoga / movilidad 2×/sem de 60 min (martes, jueves) |
| **Disponibilidad** | 3 h/sem · lunes, miércoles, viernes, domingo · máx 45 min por sesión |
| **Su objetivo (textual)** | «Quiero hacer ejercicio que me guste para controlar mi glucosa y bajar el estrés. Me gustan las clases con música; nada de competir.» |

**Perfil de arranque (reglas de Torq):** primero su médico (condición o medicamento) · sin test: por sensación, subiendo de a poco · arranque conservador · primero el metabolismo (fondo y tempo constantes) · enseñarle a usar RPE · no hace máximos porque: tiene una condición de salud: primero que lo vea su médico · estrés ajustado: alto

### Lo que armó el coach IA

**Plan:** Movimiento constante para tu glucosa y tu calma · empieza el 20 de octubre de 2026

**Estructura completa (bloques):**

| Bloque | Semanas | h/sem | Enfoque |
|---|---|---|---|
| Base metabólica | 4 | 2.5 | Sesiones frecuentes y parejas de 40-45 min en fondo y tempo suave, sin picos largos. Unas 2.5 h de bici por semana, con variedad tipo clase. |
| Constancia y variedad | 4 | 3 | Mismo patrón de 4 días, con cambios de ritmo y cadencia más largos y un poco más de tempo suave. Entre 2.5 y 3 h por semana. |

**Por qué, en palabras del coach IA** (su nota al atleta, textual):

> Paola, antes de apretar, que tu médico te dé luz verde para subir intensidad; mientras, construimos con cuidado. Veo una prueba sin competencia: priorizo constancia, sesiones frecuentes y parejas en fondo y tempo suave para tu metabolismo, sin picos largos. Por eso no hay test ni zonas en watts: todo va por RPE (3-4 puedes platicar, 6-7 solo frases cortas, 8-9 pocas palabras, 10 no puedes más). Tu movilidad de martes y jueves cuenta en la carga y por eso esos días no hay bici. Con 3 h por semana y 45 min por sesión, tus 4 días caben en unas 2.5 h de bici. Con metformina, come antes de rodar y lleva algo dulce. Tu estrés es alto: las rodadas son también tu desahogo, y el rodillo no entrena técnica de montaña.

#### Semana 1 · 3 sesiones de rodillo · 2.2 h · TSS ≈ 72

- **miércoles 21 oct — Rodada suave tipo clase** · 45 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→60%
  - 4× (5' @ 60% + 2' @ 50%)
  - Enfriamiento 7' @ 50%
  - _Paola, esta es tu primera rodada en el rodillo para conocerlo y conocer tu ritmo, así que todo se hace por sensación: busca un esfuerzo suave en el que puedas platicar en frases completas; si no puedes, baja un poco. Te recomiendo dejar el ERG apagado para rodar a tu propio ritmo, y usa la cadencia que te salga natural, la app la va a observar. Ponte tu música y disfruta. Al terminar sentirás las piernas activas pero frescas, una buena base para lo que viene en la semana._

- **viernes 23 oct — Fondo constante** · 42 min · TSS ≈ 24 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 25' @ 62%
  - Enfriamiento 7' @ 50%
  - _Un fondo parejo para disfrutar la bici sin presión. Te recomiendo dejar el ERG apagado y rodar por sensación, con un ritmo en el que puedas platicar sin esfuerzo (RPE 3-4). Antes de rodar come algo y ten a la mano algo dulce, como te indique tu médico con la metformina. Usa la cadencia que te salga natural. Lo que buscas es sentir las piernas estables y la respiración tranquila de principio a fin, y eso te deja listo para la rodada del domingo._

- **domingo 25 oct — Rodada con cambios de ritmo** · 42 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 5× (2' @ 72% + 3' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Una rodada con variedad, como en clase: alternarás ritmo cómodo con bloques un poco más animados, de esos en los que las frases se acortan pero todavía puedes hablar. Te recomiendo dejar el ERG apagado y manejar tú los cambios; si dudas, quédate en lo cómodo, no hace falta apretar. Usa la cadencia que te salga natural. Lo esperado es sentir los bloques animados como un empujón manejable, y si la respiración se te escapa por completo, baja y anótalo para tu coach._
- _Fuera del rodillo:_ **martes 20 oct — Sin gimnasio hoy** (15 min): Tu movilidad del martes va como la tienes; hoy no hay bici, así que respira y suelta tensión.

#### Semana 2 · 4 sesiones de rodillo · 2.9 h · TSS ≈ 108

- **lunes 26 oct — Rodada suave tipo clase** · 45 min · TSS ≈ 25 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 4× (5' @ 62% + 2' @ 52%)
  - Enfriamiento 7' @ 50%
  - _Arranca la semana con una rodada tranquila para soltar el estrés del lunes. Vas por sensación, con cambios suaves de cadencia cuando te apetezca, y el ERG va apagado para que tú lleves el ritmo. Si prefieres ERG, lo prendes con el botón ⚡. La referencia es simple: debes poder hablar en frases completas durante toda la sesión. Si en algún momento no puedes, baja un poco y anótalo para tu coach._

- **miércoles 28 oct — Tempo suave** · 44 min · TSS ≈ 30 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (6' @ 75% + 3' @ 55%)
  - Enfriamiento 7' @ 50%
  - _Hoy toca constancia, no examen. Son bloques de tempo suave que haces por sensación, con el ERG apagado, así que tú decides cuánto apretar. Sentirás un RPE de 5: frases un poco más cortas, pero todavía puedes platicar. Entre bloque y bloque recupera con calma, sin prisa por volver. Si no puedes hablar en frases completas, baja y anótalo para tu coach._

- **viernes 30 oct — Fondo constante** · 44 min · TSS ≈ 26 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 28' @ 62%
  - Enfriamiento 6' @ 50%
  - _Un fondo parejo para terminar la semana con buen ritmo y sin prisa. Vas por sensación con el ERG apagado; si prefieres ERG, lo prendes con el botón ⚡. Come algo antes y lleva algo dulce para el camino. Al terminar, marca tu RPE, porque con eso ajusto la semana siguiente. Debes sentir un RPE de 3 a 4 y poder hablar sin problema._

- **domingo 1 nov — Rodada con cambios de ritmo** · 42 min · TSS ≈ 27 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 5× (3' @ 74% + 2' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Una rodada divertida para cerrar la semana, con bloques animados y vueltas a un ritmo cómodo. Vas por sensación con el ERG apagado, así que tú marcas la intensidad de cada cambio. En los bloques animados sentirás un RPE de 5, y en los cómodos puedes recuperar la respiración. Mantén la respiración controlada y pon tu música favorita para disfrutarla._

#### Semana 3 · 4 sesiones de rodillo · 3 h · TSS ≈ 110

- **lunes 2 nov — Rodada suave tipo clase** · 43 min · TSS ≈ 23 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 4× (4.5' @ 62% + 2' @ 52%)
  - Enfriamiento 7' @ 50%
  - _Rodada suave para soltar las piernas al inicio de la semana, con cambios de cadencia como en una clase, sin forzar nada. Va con ERG apagado, por sensación: si prefieres ERG, puedes prenderlo con el botón ⚡, pero aquí lo que manda es cómo te sientes. Vas a sentir un esfuerzo de RPE 3-4, tan cómodo que puedas platicar sin cortar la frase. Si te cuesta trabajo hablar, baja un poco y anótalo para tu coach. Esto te deja fresca para el resto de la semana._

- **miércoles 4 nov — Tempo suave** · 45 min · TSS ≈ 32 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 3× (7' @ 75% + 3' @ 55%)
  - Enfriamiento 5' @ 50%
  - _Tres bloques de tempo suave para subir un poco el ritmo, un poco más largos que la semana pasada. Va con ERG apagado: rueda por sensación, con un RPE de 5, firme pero controlado. Recupera con calma entre bloques para llegar entero al último. Si sientes que te pasas, baja un poco; la respiración es tu guía._

- **viernes 6 nov — Fondo constante** · 45 min · TSS ≈ 26 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - Constante 29' @ 62%
  - Enfriamiento 6' @ 50%
  - _Fondo parejo y sin prisa, de esos que construyen base. Va con ERG apagado: busca un ritmo estable a RPE 3-4, donde puedas hablar en frases completas. Come antes de rodar y lleva algo dulce por si lo necesitas. Si prefieres ERG, puedes prenderlo con el botón ⚡._

- **domingo 8 nov — Rodada con cambios de ritmo** · 44 min · TSS ≈ 29 · por sensación (sin ERG)
  - Calentamiento 10' @ 50→62%
  - 6× (2.5' @ 74% + 2' @ 58%)
  - Enfriamiento 7' @ 50%
  - _Rodada divertida con cambios de ritmo tipo clase: lo animado a RPE 5 y luego vuelves a lo cómodo para recuperar. Va con ERG apagado, así que tú decides cuánto apretar en cada cambio; si prefieres ERG, lo prendes con el botón ⚡. No compitas contigo: termina con ganas de repetir la siguiente._

### Por qué tomó estas decisiones (análisis, no texto de la IA)

- **Médico primero y metabolismo primero:** diabetes tipo 2 con metformina. Fondo y tempo suave parejos (≤75%), sin picos largos, sin test ni watts: todo por RPE.
- **Lo que le gusta:** sesiones «tipo clase» con cambios de ritmo, 4 días de 42–45 min (su tope es 45).
- **Sin bici martes y jueves** por su yoga.
- **Volumen:** 2.1 → 2.9 → 3.0 h de 3 disponibles.

**Para revisar:**

- El consejo «come antes de rodar y lleva algo dulce» por la metformina: ¿debe darlo la IA?
- El extra «Sin gimnasio hoy» (15 min) sobra; la frase de técnica de montaña no aplica; las descripciones le hablan en masculino («listo», «entero»).

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
- Corrida: `node scripts/coach-sim/perfiles.mjs` contra producción con la cuenta de pruebas. Todo lo que contestó la IA (contexto enviado, respuesta, plan y cada sesión con sus intervalos) está en `docs/evaluaciones/planes-ia-para-joe-datos/`.
- Análisis: `scripts/coach-sim/perfiles-analisis.mjs`.
- Validación sin IA: `perfiles-check.ts` (mismo schema del servidor y perfil de arranque).