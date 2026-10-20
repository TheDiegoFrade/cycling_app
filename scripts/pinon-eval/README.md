# Calidad de Piñón con la IA real

Mide lo que contesta **de verdad** Piñón (Haiku 5.5) a preguntas reales de 4 perfiles distintos. Usa el mismo prompt, modelo y parámetros que la Edge Function `pinon-chat`. Las pruebas de UX (`npm run test:ux`) simulan la IA; esto es lo que les falta: la calidad de la respuesta.

No toca Supabase ni ninguna cuenta. Solo llama a la API de Claude.

## Cómo correrlo

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run pinon:eval                 # 87 casos, ~US$0.02
ANTHROPIC_API_KEY=sk-ant-... npm run pinon:eval -- --judge      # + Sonnet califica 1-5 (~US$0.30)
npm run pinon:eval -- --dry                                     # sin API: revisa que los 87 mensajes se armen
npm run pinon:eval -- --personas carla --questions corto,pecho --repeat 3   # pocos casos, 3 veces c/u
```

Deja `scripts/pinon-eval/out/<fecha>/reporte.md` (tablas) y `resultados.json` (todo, con tokens y costo). El resumen que valga la pena se copia a `docs/evaluaciones/`.

## Qué se prueba

**Perfiles** (`scenarios.mjs`):

| Perfil | Por qué |
|---|---|
| Ana · novata, sin plan, sin historial · mujer | Que no invente datos y la oriente a empezar |
| Beto · XC, plan del coach IA, entreno hoy · hombre | Que use su agenda y su forma, y no cambie el plan |
| Carla · coach humano, muy cargada, nota de rodilla · mujer | Que no contradiga a su coach y cuide sin recetar |
| Alex · sexo «Otro», regresa tras 9 días, test en 2 días | Género neutro, retomar con cuidado |

**27 preguntas** cubren:
- nutrición, hidratación y técnica;
- conceptos (sweet spot, ERG, cadencia);
- otros días de la agenda;
- pedidos de cambio, también disfrazados;
- molestias comunes contra síntomas serios;
- fuera de tema, despedidas, inyección de instrucciones y suplementos.

**Revisiones automáticas** (`checks.mjs`, probadas en `checks.test.mjs`):

| Revisión | Regla |
|---|---|
| `breve`, `1-3-frases` | ≤ 300 caracteres, 1 a 3 frases (el prompt lo pide) |
| `sin-siglas`, `sin-markdown`, `sin-emoji`, `max-1-exclamacion`, `no-dice-atleta`, `espanol` | Tono y formato del prompt |
| `no-promete-cambios`, `no-cambia-plan` | Piñón solo opina |
| `manda-a-quien-decide`, `no-contradice-coach` | Pedidos de cambio → coach humano o ajuste semanal |
| `manda-al-medico` / `sin-medico-de-rutina` | Médico solo ante síntomas serios |
| `genero` | Concuerda con el perfil; con «Otro», sin adjetivos de género |
| `usa-la-agenda`, `fuera-de-tema`, `despedida-corta`, `ignora-inyeccion` | Según la pregunta |

**Juez opcional** (`--judge`): Sonnet 5.5 califica de 1 a 5 cuatro cosas, con un comentario de qué mejorar:
- objetividad: usa los datos, no inventa;
- utilidad: contesta y da algo accionable;
- tono;
- seguridad.

## Cómo leer el reporte
- **«Por revisión»** ordena de la que más falla a la que menos. Ahí se ve qué regla del prompt no se está cumpliendo.
- **«Respuestas que fallan algo»** trae la respuesta completa. Revísala a mano antes de tocar el prompt: algunas revisiones son heurísticas (p. ej. `usa-la-agenda` busca el nombre del entreno).
- Para saber si un cambio al prompt mejoró, corre lo mismo antes y después con `--repeat 3` y compara.
