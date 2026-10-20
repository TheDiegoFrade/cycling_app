# Genera el Word para Joe (celdas amarillas para calificar) desde planes-ia-para-joe-ENVIAR.md.
# Uso: python3 build-docx.py scripts/coach-sim/word docs/evaluaciones/planes-ia-para-joe-ENVIAR.md "docs/evaluaciones/Planes coach IA Torq - para Joe.docx"
# (el primer argumento es la carpeta con plantilla-torq.docx; necesita pandoc).
import re, subprocess, sys, zipfile, shutil, os
S, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
md = open(SRC).read()
md = re.sub(r'(?m)^<a id="p\d\d"></a>\n', '', md)
md = re.sub(r'\[([^\]]+)\]\(#p\d\d\)', r'\1', md)
md = md.replace('# Planes del coach IA para que Joe los evalúe\n',
  '# Planes del coach IA para que Joe los evalúe\n\n**Cómo responder:** escribe directo en este documento. En cada persona hay una tabla con celdas **amarillas** para tu calificación (1 a 5) y tu comentario, y un recuadro para lo que cambiarías. Arriba hay otro recuadro para tus respuestas a las preguntas generales. Guarda y mándalo de regreso.\n\n', 1)
# recuadro de respuestas a las preguntas generales (antes del Resumen)
md = md.replace('\n## Resumen\n', '\n| ✍️ Tus respuestas a estas preguntas |\n|---|\n| RESPUESTA_GRANDE |\n\n## Resumen\n', 1)
# tabla de evaluación: columnas 55 / 12 / 33
md = md.replace('| Pregunta | Calificación (1–5) | Comentario |\n|---|---|---|', '| Pregunta | Calif. (1 a 5) | Tu comentario |\n|-------------------------|-------|-------------------|')
md = md.replace('| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |\n|---|---|---|---|---|---|', '| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |\n|----|-------|-----------|---------|---------|------|')
md = re.sub(r'\*\*¿Qué cambiarías\?\*\*\n\n&nbsp;', '| ✍️ ¿Qué cambiarías? |\n|---|\n| RESPUESTA_GRANDE |', md)
open(f'{S}/.joe-tmp.md', 'w').write(md)
subprocess.run(['pandoc', f'{S}/.joe-tmp.md', '-f', 'markdown-auto_identifiers', '-o', OUT, f'--reference-doc={S}/plantilla-torq.docx', '--columns=72'], check=True)

# ── post-proceso del XML ──
tmp = f'{S}/.out-tmp'
shutil.rmtree(tmp, ignore_errors=True)
with zipfile.ZipFile(OUT) as z: z.extractall(tmp)
p = f'{tmp}/word/document.xml'
x = open(p, encoding='utf-8').read()
YELLOW = '<w:shd w:val="clear" w:color="auto" w:fill="FFF4C2"/>'
def shade_cell(tc):
    # orden del esquema: el sombreado va después de tcW/bordes y antes de vAlign
    if '<w:tcPr />' in tc: return tc.replace('<w:tcPr />', '<w:tcPr>' + YELLOW + '</w:tcPr>', 1)
    m = re.search(r'<w:tcPr>(.*?)</w:tcPr>', tc, re.S)
    if not m: return tc.replace('<w:tc>', '<w:tc><w:tcPr>' + YELLOW + '</w:tcPr>', 1)
    inner = m.group(1)
    k = inner.find('<w:vAlign')
    inner = inner + YELLOW if k < 0 else inner[:k] + YELLOW + inner[k:]
    return tc[:m.start(1)] + inner + tc[m.end(1):]
def fix_table(t):
    if 'Calif. (1 a 5)' in t:
        t = t.replace('<w:tr><w:trPr>', '<w:tr><w:trPr><w:cantSplit/>').replace('<w:tr><w:tc>', '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc>')
        rows = re.findall(r'<w:tr>.*?</w:tr>|<w:tr .*?</w:tr>', t, re.S)
        for r in rows[1:]:
            cells = re.findall(r'<w:tc>.*?</w:tc>', r, re.S)
            nr = r
            for c in cells[1:]: nr = nr.replace(c, shade_cell(c), 1)
            t = t.replace(r, nr, 1)
    if 'RESPUESTA_GRANDE' in t:
        rows = re.findall(r'<w:tr>.*?</w:tr>|<w:tr .*?</w:tr>', t, re.S)
        r = rows[-1]
        cells = re.findall(r'<w:tc>.*?</w:tc>', r, re.S)
        nr = r.replace(cells[0], shade_cell(cells[0]), 1)
        h = '<w:trPr><w:trHeight w:val="3400" w:hRule="atLeast"/></w:trPr>'
        nr = re.sub(r'<w:tr>(?!<w:trPr>)', '<w:tr>' + h, nr, count=1) if '<w:trPr>' not in nr else nr.replace('<w:trPr>', '<w:trPr><w:trHeight w:val="3400" w:hRule="atLeast"/>', 1)
        t = t.replace(r, nr, 1)
        t = re.sub(r'<w:t[^>]*>RESPUESTA_GRANDE</w:t>', '<w:t></w:t>', t)
    return t
x = re.sub(r'<w:tbl>.*?</w:tbl>', lambda m: fix_table(m.group(0)), x, flags=re.S)
# cada persona en página nueva (títulos 2 que empiezan con número)
def pb(m):
    para = m.group(0)
    txt = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', para))
    if re.match(r'\d\d\. ', txt) or txt.startswith('Resumen'):
        return para.replace('<w:pStyle w:val="Heading2" />', '<w:pStyle w:val="Heading2" /><w:pageBreakBefore/>', 1)
    return para
x = re.sub(r'<w:p>(?:(?!</w:p>).)*?<w:pStyle w:val="Heading2" />.*?</w:p>', pb, x, flags=re.S)
# la evaluación de cada persona en su propia página
def ev(m):
    para = m.group(0)
    if 'Evaluación de Joe' not in ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', para)): return para
    if '<w:pStyle' in para: return re.sub(r'(<w:pStyle [^>]*/>)', r'\1<w:pageBreakBefore/>', para, count=1)
    if '<w:pPr>' in para: return para.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>', 1)
    return para.replace('<w:p>', '<w:p><w:pPr><w:pageBreakBefore/></w:pPr>', 1)
x = re.sub(r'<w:p>(?:(?!</w:p>).)*?</w:p>', ev, x, flags=re.S)
# pandoc deja <w:jc> después de <w:tblLook>; el esquema lo pide antes
x = re.sub(r'(<w:tblLook [^>]*/>)(<w:jc [^>]*/>)', r'\2\1', x)
open(p, 'w', encoding='utf-8').write(x)
os.remove(OUT)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(tmp):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, tmp))
print('ok', x.count('FFF4C2'), 'celdas amarillas,', x.count('pageBreakBefore'), 'saltos')
