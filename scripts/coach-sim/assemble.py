#!/usr/bin/env python3
# Ensambla hallazgos_coach_torq.md a partir de report/*.md
import glob, os, re
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(H, 'report')
OUTF = os.path.join(H, 'out', 'hallazgos_coach_torq.md')
def rd(n, default=''):
    p = os.path.join(R, n)
    return open(p).read().strip() if os.path.exists(p) else default

secs = sorted(glob.glob(os.path.join(R, 's[0-9][0-9].md')))
rows, errs, details = [], [], []
eid = max([int(x) for x in re.findall(r'^\| E-(\d+)', rd('errors-base.md'), re.M)] or [0]) + 1
for p in secs:
    t = open(p).read()
    n = int(os.path.basename(p)[1:3])
    title = re.search(r'^###\s*\d+\.\s*(.+)$', t, re.M)
    title = title.group(1).strip() if title else f'Escenario {n}'
    m = re.search(r'<!-- SCORES: (.*?) -->', t)
    sc = dict(kv.split('=') for kv in m.group(1).split(';')) if m else {}
    f = re.search(r'<!-- FLAGS: (.*?) -->', t)
    def avg(keys):
        v = [float(sc[k]) for k in keys if k in sc and re.match(r'^\d+(\.\d+)?$', sc[k])]
        return f'{sum(v)/len(v):.1f}' if v else 'N/A'
    plan = [f'C{i}' for i in range(1, 11)]; mail = [f'C{i}' for i in range(11, 15)]
    rows.append(f"| {n} | {title} | " + ' | '.join(sc.get(k, '–') for k in plan) + ' | ' + ' | '.join(sc.get(k, '–') for k in mail) + f" | {avg(plan)} | {avg(mail)} | {f.group(1) if f else '–'} |")
    for line in re.findall(r'<!-- ERR: (.*?) -->', t):
        parts = [x.strip() for x in line.split('|')]
        while len(parts) < 5: parts.append('')
        errs.append(f"| E-{eid:02d} | {parts[0]} | {parts[1]} | {n} | {parts[2]} | {parts[3]} | {parts[4]} |")
        eid += 1
    details.append(re.sub(r'\n<!-- .*? -->', '', t).strip())

hdr = '| # | Escenario | ' + ' | '.join(f'C{i}' for i in range(1, 15)) + ' | Prom. plan | Prom. correos | Banderas rojas |'
sep = '|' + '---|' * 19
doc = f"""# Hallazgos: simulaciones del coach IA de Torq
{rd('00-meta.md')}

## Resumen ejecutivo
{rd('01-summary.md', '_(se completa al terminar todos los escenarios)_')}

## v3: qué se corrigió
{rd('06-v3.md', '_(pendiente)_')}

## Matriz de resultados
C1 especificidad · C2 adecuación al perfil · C3 FTP · C4 progresión · C5 coherencia · C6 adaptación · C7 seguridad · C8 honestidad plataforma · C9 claridad · C10 estabilidad · C11 exactitud correos · C12 utilidad y tono · C13 forma · C14 oportunidad

{hdr}
{sep}
{chr(10).join(rows)}

## Registro de errores
| ID | Área | Severidad | Escenario | Descripción | Pasos para reproducir | Esperado vs. obtenido |
|---|---|---|---|---|---|---|
{rd('errors-base.md')}
{chr(10).join(errs)}

## Patrones transversales
{rd('02-patterns.md', '_(pendiente)_')}

## Problemas de prompt vs problemas de plataforma
{rd('03-prompt-vs-platform.md', '_(pendiente)_')}

## Recomendaciones
{rd('04-recommendations.md', '_(pendiente)_')}

## Preguntas para el entrenador
{rd('05-questions.md', '_(pendiente)_')}

## Detalle por escenario
{(chr(10)*2).join(details)}
"""
os.makedirs(os.path.dirname(OUTF), exist_ok=True)
open(OUTF, 'w').write(doc)
print(OUTF, len(secs), 'escenarios', len(errs), 'errores nuevos')
