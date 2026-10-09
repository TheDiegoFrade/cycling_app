import { describe, expect, it } from 'vitest';
import { callRow, costUsd } from './usage-log.ts';

describe('costUsd', () => {
  it('suma entrada, salida y caché con el precio de cada modelo', () => {
    // 10k entrada ($0.02) + 6k salida ($0.06) + 8k leídos de caché ($0.0016)
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 10_000, output_tokens: 6_000, cache_read_input_tokens: 8_000 })).toBeCloseTo(0.0816, 6);
    expect(costUsd('claude-haiku-5-5', { input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.225, 6);
  });

  it('reconoce el modelo con fecha y devuelve null si no lo conoce', () => {
    expect(costUsd('claude-haiku-4-5-20251001', { output_tokens: 1_000_000 })).toBe(5);
    expect(costUsd('otro-modelo', { output_tokens: 1 })).toBeNull();
  });
});

describe('callRow', () => {
  it('fila con costo, o sin costo y con el error si falló', () => {
    const base = { userId: 'u', mode: 'weekly_eval', step: 'main' as const, model: 'claude-sonnet-5-5', startedMs: Date.now() - 1500 };
    const ok = callRow(base, { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 7 });
    expect(ok).toMatchObject({ input_tokens: 100, output_tokens: 50, cache_read_tokens: 7, cache_write_tokens: 0, ok: true, error: null });
    expect(ok.duration_ms).toBeGreaterThanOrEqual(1500);
    expect(callRow(base, null, 'timeout')).toMatchObject({ cost_usd: null, ok: false, error: 'timeout' });
  });
});
