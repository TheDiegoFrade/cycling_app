# Fisiología y pruebas: del laboratorio al rodillo de casa

Investigación para el prompt del coach. **Supuesto de equipo:** el atleta solo
tiene un **smart trainer** (potencia, ERG) y **una banda de pulso o un Garmin**
(FC). No tiene lactato, gases, laboratorio ni medidor de potencia en exterior.
Cada sección traduce lo que mide un laboratorio a lo que se puede hacer con
eso, y termina en **reglas para el coach**, listas para pasar al prompt.

**Qué datos tiene Torq hoy:**
- Por sesión: potencia, FC, cadencia, NP, IF, TSS, `efficiency_factor`
  (NP/FC media), `hr_drift_pct` (desacople FC-potencia), RPE y nota del
  atleta.
- PMC (CTL/ATL/TSB).
- No graba intervalos RR, así que **no hay HRV ni DFA-α1**.

> **Sobre las fuentes que se pidieron.** Las 8 páginas (Leeds Beckett,
> Science for Sport, Vires Velo, Prologue Cycling, Fitness Lab, Watts Lab)
> están bloqueadas por la política de red de este entorno. No se pudieron
> leer directo. Lo de Leeds Beckett sale de búsquedas que citan su página. El
> resto se cubrió con estudios y guías equivalentes, enlazados en cada
> sección. Para completar con esas páginas, ver "Pendiente" al final.

---

## 1. Qué mide un perfil fisiológico de laboratorio

Un perfil típico (Leeds Beckett, Derby y similares) tiene dos partes:

- **Escalones submáximos.** De 6 a 8 escalones de unos 3-4 min, subiendo la
  potencia. Al final de cada uno se toma lactato capilar y RPE; FC y gases se
  registran todo el tiempo. De ahí salen los dos umbrales:
  - **LT1 / VT1**: primer aumento sostenido del lactato. Es el límite de lo
    realmente "fácil".
  - **LT2 / VT2**: el lactato se dispara; está cerca de MLSS, ~4 mmol·L⁻¹ y
    del FTP.
- **Rampa máxima.** Sube cada minuto (Leeds Beckett) o cada 2-3 s (Derby)
  hasta el agotamiento. De ahí salen el **VO₂máx** y la **MAP** (potencia
  aeróbica máxima, el último minuto de la rampa).
- **Informe al atleta**: zonas por FC, potencia y tiempo; VO₂máx; eficiencia
  ciclista; oxidación de grasas y carbohidratos.

Fuentes: [Leeds Beckett — cycling](https://www.leedsbeckett.ac.uk/carnegie-school-of-sport/health-and-performance-hub/physiological-profiling-cycling/),
[Leeds Beckett — triathlon](https://www.leedsbeckett.ac.uk/carnegie-school-of-sport/health-and-performance-hub/physiological-profiling-triathlon/),
[Derby — cycling](https://www.derby.ac.uk/business-services/facilities/human-performance-unit/packages/cycling/).

**Idea clave para el coach:** el laboratorio no da "un número". Da **dos
umbrales** (dónde empieza lo duro y dónde ya no se sostiene) y **un techo**
(VO₂máx/MAP). Un plan bien hecho necesita saber al menos dónde está el primer
umbral y el segundo. El FTP solo aproxima el segundo.

## 2. Equivalentes de campo con smart trainer + banda

| Laboratorio | Equivalente en casa | Qué tan bueno es |
|---|---|---|
| LT2 / MLSS (umbral) | **Test de 20 min** × ~0.95 = FTP | Confiable test-retest (CV 2.9 %, ICC 0.97), pero el ×0.95 sobreestima a muchos: en un estudio, a 95 % del FTP20 la gente aguantó **42 ± 17 min**, no 60. ([estudio 2025](https://www.preprints.org/manuscript/202502.0505/v1)) |
| MAP / techo aeróbico | **Rampa en rodillo** (sube cada 1 min hasta no poder), FTP ≈ 75 % del mejor minuto | Buena para MAP. El 75 % es una convención: el cociente real va de ~0.70 a 0.80 según la persona, y falla más en VO₂máx muy alto o muy bajo. ([TrainerRoad](https://www.trainerroad.com/forum/t/best-ftp-test-ramp-or-20-min/16402?page=2), [TrainerDay](https://trainerday.com/blog/why-the-ramp-test-is-the-best-ftp-test)) |
| Potencia crítica (CP) | 2-3 esfuerzos máximos (p. ej. 3 y 12 min, o 3-7-12) con descanso largo | Más "fisiológico" que el FTP, pero la versión de 3 min tiene mala fama y exige saber dosificar. ([Karsten et al., Front Physiol](https://public-pages-files-2025.frontiersin.org/journals/physiology/articles/10.3389/fphys.2020.613151/text)) |
| LT1 / VT1 (fin de lo fácil) | **Prueba de deriva de FC**: 45-60 min a potencia constante; si la FC sube < ~3-5 % en la 2.ª mitad, se está bajo VT1 | Útil y Torq ya calcula `hr_drift_pct`. No es exacta y depende de calor, hidratación y fatiga. ([Uphill Athlete](https://uphillathlete.com/heart-rate-drift/)) |
| LT1 por percepción | **Test del habla**: si puede hablar en frases completas, está bajo VT1 | Barato y razonable como ancla, sin validación fuerte. ([TrainerRoad](https://www.trainerroad.com/forum/t/calculating-lt1-and-lt2-approximately-without-a-blood-test/55533?page=8)) |
| LT1 por HRV | DFA-α1 ≈ 0.75 en VT1 | **No disponible en Torq** (no hay RR). Además es ruidosa y con retraso. ([Frontiers](https://www.frontiersin.org/articles/10.3389/fphys.2020.596567/abstract)) |
| VO₂máx | No se mide; la MAP de la rampa es su proxy útil | — |
| Eficiencia | `efficiency_factor` (NP/FC) en rodadas estables comparables | Sirve como tendencia de la base aeróbica, no como valor absoluto. |

**Reglas para el coach:**
- El FTP de un test es una **estimación con error de ±5-10 %**. Las primeras
  1-2 semanas después de un test, las sesiones de umbral se validan con la
  sensación (RPE) y la FC, y se ajusta si no cuadran.
- Para atletas sin experiencia en dosificar, la **rampa** es más segura y
  repetible que un 20 min, porque no exige saber pacing. Para alguien con
  experiencia, el **20 min** da un FTP más directo.
- Después de un test de 20 min, considerar el FTP como **90-95 %** del
  promedio, no 95 % fijo, sobre todo en atletas menos entrenados. Si en las
  primeras sesiones de umbral la deriva de FC es alta o el RPE pasa de 8,
  bajar el FTP.
- El FTP solo no basta. El límite de lo fácil (LT1) se estima con **FC y
  deriva**, no con %FTP: un plan de base se ancla en "conversacional / deriva
  baja", no en "65 % de un FTP que no sabemos".

## 3. Cómo arrancar con alguien sin FTP y sin base conocida

Lo que haría un coach con este equipo:

1. **Semanas 1-2: calibrar sin test máximo.** Todo fácil, anclado en RPE 3-4/10
   y test del habla, con la FC registrada.
   - Una sesión estable de 45-60 min a potencia constante sirve de **prueba de
     deriva**: si `hr_drift_pct` < ~5 % y puede hablar, esa potencia está bajo
     LT1 y es su "endurance" real.
   - ERG off o en potencia baja fija. Nada de intervalos sobre umbral
     "estimados".
2. **Primer test cuando ya tolera el rodillo**: semana 2-3 en principiantes;
   semana 1 en ciclistas experimentados con CTL decente.
   - Rampa para nuevos.
   - 20 min o rampa para experimentados.
   - Con 48 h sin esfuerzos duros antes, mismo calentamiento y misma hora.
3. **Recalibrar todo** con el resultado y decirle al atleta que el número se
   afina las siguientes 2 semanas (ver §2).
4. **Retest** cada 4-8 semanas o al cerrar un bloque. No antes: en tan poco
   tiempo la adaptación es pequeña y gana el error de medición.

Por qué: en principiantes, lo que más rinde las primeras semanas es el
volumen constante y fácil. Una guía de coaching propone **4-6 semanas solo de
Z2** antes de meter estructura ([Roadman](https://roadmancycling.com/answers/how-to-build-cycling-fitness-from-scratch)).
Otros planes meten algo de Z4 al final del primer bloque ([TrainingPeaks](https://www.trainingpeaks.com/training-plans/cycling/road-cycling/tp-106946/beginner-cyclist-build-fitness-endurance-in-6-weeks-2-5-4hrs-wk-phase-1)).
La evidencia polarizado vs. umbral es en ciclistas **entrenados**: 6 semanas
polarizadas (80/0/20) dieron más mejora que umbral (57/43/0), con +9 % vs. +2 %
en umbral de lactato y +8 % vs. +3 % en potencia pico ([Neal et al. 2013](https://dspace.stir.ac.uk/handle/1893/11417?mode=full)).

**Reglas para el coach:**
- Sin FTP **y** sin experiencia → nada en %FTP con ERG fijo antes del primer
  test. Todo por RPE/FC.
- Sin FTP **y** experimentado con historial → test en la semana 1; antes,
  solo sesiones fáciles.
- El primer test nunca va en la semana de arranque de un sedentario.
- Si el perfil se contradice (p. ej. "experienced" con 0 años en bici), tratar
  la experiencia en bici como baja y decirlo.

## 4. Carga, progresión y fatiga solo con potencia + FC

- **Subida de CTL**: 3-5 puntos por semana es sostenible; 5-8 es tope para
  experimentados, y más de eso solo una semana antes de descargar
  ([TrainingPeaks](https://www.trainingpeaks.com/learn/articles/why-ramp-rate-is-an-important-training-metric/),
  [Couzens](https://alancouzens.com/blog/CTLramp.html)).
- **Señales de fatiga sin laboratorio**:
  - **FC más alta a la misma potencia**, o `efficiency_factor` bajando en
    rodadas comparables. En profesionales, después de > 3 000 kJ la FC y el
    RPE suben a la misma potencia
    ([estudio](https://lida.sport-iat.de/ta/Record/4084768?lng=en)).
  - **RPE de sesión más alto** para la misma carga planeada; el sRPE refleja
    la fatiga acumulada
    ([PMC7739316](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7739316/)).
  - **`hr_drift_pct` alto** en sesiones que antes eran estables.
  - **No poder alcanzar la FC habitual** en intervalos duros (FC "plana") y
    piernas que no responden. Es una señal clásica de sobrecarga.
  - Nota del atleta: sueño, estrés, enfermedad.
- **Cada señal sola es solo tendencia**: hay que confirmarla con otra antes
  de cambiar el plan.

**Reglas para el coach:**
- TSB ≤ −25 o dos señales de fatiga juntas → semana de absorción, sin VO₂ ni
  umbral.
- Subida de CTL > 7/semana dos semanas seguidas → descarga.
- Bloques de 2-3 semanas de carga + 1 de descarga, ajustando por señales, no
  por calendario fijo.

## 5. XCO / XC MTB: qué exige y cómo se entrena en rodillo

- Más del **80 % del tiempo de carrera sobre el umbral de lactato**: salida
  rápida, subidas, resistencia del terreno y trabajo isométrico de manejo
  ([Impellizzeri & Marcora](https://sponet.de/sponet/Record/4010154?lng=en)).
- Muy intermitente: **un pico de potencia cada ~32 s** y **un esfuerzo
  supramáximo cada ~106 s**.
  - Salida: **481 ± 122 W** durante ~68 s, con ~32 % de aporte anaeróbico.
  - Subidas a ~71 % de Wmax; bajadas a ~41 %.
  - Mucha fuerza a cadencia baja (n = 7, indicativo)
    ([Massey](https://mro.massey.ac.nz/bitstreams/b86cd337-2cb0-4f3f-8596-279e406a0613/download)).
- Comparado con ruta: más torque, esfuerzo más constante y más picos.
  Potencia/peso alta y VO₂máx > 70 ml/kg/min en élite.

**Reglas para el coach (MTB):**
- La base aeróbica sigue siendo lo primero. Después, el específico es
  **over/unders y bloques sobre umbral con picos cortos** (p. ej. 10-20 s
  fuertes cada 1-2 min dentro de un bloque a ~90-95 %), **arranques
  simulados** (~1 min muy fuerte y luego sostener el umbral) y **fuerza a
  cadencia baja** (60-70 rpm a sweet spot).
- En rodillo, el manejo técnico y la parte isométrica no se entrenan. Hay
  que decirlo y sugerir rodar afuera cuando se pueda.
- Para gran fondo de MTB (no XCO), menos picos y más subida sostenida: sweet
  spot y umbral largos.

## 6. Estandarizar un test en casa

Se llega mejor al número verdadero si cada test se hace igual
([reliability FTP20](https://thieme-connect.de/products/ejournals/html/10.1055/a-1018-1965)):

- **48 h sin esfuerzos duros** antes.
- **Mismo calentamiento** cada vez. Variar el calentamiento cambia el
  resultado más que el test mismo (CV 5.5 % vs. 2.9 %).
- Misma hora del día, mismo ventilador y temperatura, misma comida y misma
  cafeína.
- La primera vez es **familiarización**: el segundo test suele salir mejor
  solo por saber dosificar.

## Qué cambiaría en el prompt y en los datos

**Prompt (`prompt.ts` / `message.ts`):**
1. Reemplazar el arranque sin FTP que mete Over/Unders a un FTP estimado por
   la secuencia de §3: calibrar por RPE/FC y deriva → test según perfil →
   recalibrar → retest cada 4-8 semanas.
2. Definir zonas con dos anclas: **lo fácil por FC/RPE/deriva (LT1)** y **lo
   duro por %FTP (LT2)**.
3. Reglas de fatiga de §4, también en las instrucciones cortas de
   `coach_week`, que corre en Haiku.
4. Bloque de especificidad por disciplina (§5): XCO, gran fondo MTB y ruta.
5. Tratar el FTP como estimación (±5-10 %) y ajustar con señales.

**Datos que hoy no llegan al coach** (necesitan código):
- `efficiency_factor` y `hr_drift_pct` de las sesiones recientes (ya se
  guardan en `sessions`), para `weekly_eval` y `create_plan`.
- RPE de cada sesión vs. lo planeado (sRPE).
- `injuries` del perfil, para `create_plan` y `weekly_eval`.
- Si el FTP viene de un test y de qué tipo (rampa o 20 min), y cuándo fue.

## Pendiente

- Leer directo las 8 páginas originales. Hay que agregar a Allowed domains
  del entorno: `www.leedsbeckett.ac.uk`, `www.sciencetosport.com`,
  `viresvelo.com`, `www.prologuecycling.co.uk`, `fitnesslabco.com` y
  `wattslab.cc`. Otra opción es pegarlas en el chat con Fable.
- Guía BASES de pruebas fisiológicas (capítulo de ciclismo, Hopker et al.):
  estándar británico de protocolos, no encontrado en abierto.
- [Guías de AusCycling 2026](https://admin.platform.auscycling.org.au/uploads/2026-ac-physiology-endurance-testing-guidelines-may-2026.pdf):
  protocolos de pruebas de una federación nacional, para contrastar.
