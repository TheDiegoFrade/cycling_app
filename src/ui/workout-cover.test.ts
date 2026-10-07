import { describe, expect, it } from 'vitest';
import type { Interval } from '../core/types';
import { powerPctToHeightPct } from '../core/zones';
import { renderWorkoutCover } from './workout-cover';

function iv(power_pct: number): Interval {
  return { name: 'x', type: 'steady', duration_s: 60, power_pct };
}

describe('renderWorkoutCover', () => {
  it('emite una barra por bloque, con el color de su zona y la altura continua de su %FTP (no aplanada por zona)', () => {
    const html = renderWorkoutCover([iv(40), iv(65), iv(160)]);
    expect(html).toContain(`height:${powerPctToHeightPct(40)}%;background:var(--z1)`);
    expect(html).toContain(`height:${powerPctToHeightPct(65)}%;background:var(--z2)`);
    expect(html).toContain('height:100%;background:var(--z6)'); // >150% -> techo 100%, no ámbar
    expect((html.match(/workout-cover-bar/g) ?? []).length).toBe(3);
  });

  it('da alturas distintas a dos bloques de la misma zona pero distinta potencia', () => {
    // ambos Z2 (55-75%) — antes se veían como la misma barra plana
    const html = renderWorkoutCover([iv(58), iv(72)]);
    expect(html).toContain(`height:${powerPctToHeightPct(58)}%;background:var(--z2)`);
    expect(html).toContain(`height:${powerPctToHeightPct(72)}%;background:var(--z2)`);
    expect(powerPctToHeightPct(58)).not.toBe(powerPctToHeightPct(72));
  });

  it('aplica la clase del tamaño pedido, "md" por default', () => {
    expect(renderWorkoutCover([iv(50)])).toContain('workout-cover workout-cover-md');
    expect(renderWorkoutCover([iv(50)], 'lg')).toContain('workout-cover workout-cover-lg');
    expect(renderWorkoutCover([iv(50)], 'sm')).toContain('workout-cover workout-cover-sm');
  });

  it('escapa el título para evitar HTML injection desde el nombre del workout', () => {
    const html = renderWorkoutCover([iv(50)], 'md', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
