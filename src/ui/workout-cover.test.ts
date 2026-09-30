import { describe, expect, it } from 'vitest';
import type { Interval } from '../core/types';
import { renderWorkoutCover } from './workout-cover';

function iv(power_pct: number): Interval {
  return { name: 'x', type: 'steady', duration_s: 60, power_pct };
}

describe('renderWorkoutCover', () => {
  it('emite una barra por bloque, con la altura y el color de su zona', () => {
    const html = renderWorkoutCover([iv(40), iv(65), iv(160)]);
    expect(html).toContain('height:25%;background:var(--z1)');
    expect(html).toContain('height:40%;background:var(--z2)');
    expect(html).toContain('height:100%;background:var(--z6)'); // >120% -> Z6, no ámbar
    expect((html.match(/workout-cover-bar/g) ?? []).length).toBe(3);
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
