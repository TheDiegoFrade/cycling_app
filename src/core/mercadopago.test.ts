import { describe, expect, it } from 'vitest';
import { applyPayment, subscriptionStatusOf, verifyMpSignature } from './mercadopago';

const secret = 'clave-de-prueba';
const now = new Date('2026-11-15T12:00:00Z');
const ts = String(Math.floor(now.getTime() / 1000));
async function sign(manifest: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('verifyMpSignature', () => {
  it('acepta la firma correcta', async () => {
    const v1 = await sign(`id:abc123;request-id:req-1;ts:${ts};`);
    expect(await verifyMpSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: 'ABC123', secret, now })).toBe(true);
  });
  it('rechaza firma alterada, sin firma, o con otro id', async () => {
    const v1 = await sign(`id:abc123;request-id:req-1;ts:${ts};`);
    expect(await verifyMpSignature({ signature: `ts=${ts},v1=${v1.slice(0, -1)}${v1.endsWith('0') ? '1' : '0'}`, requestId: 'req-1', dataId: 'abc123', secret, now })).toBe(false);
    expect(await verifyMpSignature({ signature: null, requestId: 'req-1', dataId: 'abc123', secret, now })).toBe(false);
    expect(await verifyMpSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: 'otro', secret, now })).toBe(false);
  });
  it('rechaza avisos viejos (repetición)', async () => {
    const old = String(Math.floor(now.getTime() / 1000) - 3600);
    const v1 = await sign(`id:abc123;request-id:req-1;ts:${old};`);
    expect(await verifyMpSignature({ signature: `ts=${old},v1=${v1}`, requestId: 'req-1', dataId: 'abc123', secret, now })).toBe(false);
  });
});

describe('estados de Mercado Pago', () => {
  it('traduce el estado de la suscripción', () => {
    expect(subscriptionStatusOf('authorized')).toBe('authorized');
    expect(subscriptionStatusOf('cancelled')).toBe('cancelled');
    expect(subscriptionStatusOf('algo-raro')).toBe('pending');
  });
  it('cobro aprobado: pagado un mes (+2 días) y sin gracia', () => {
    expect(applyPayment({ id: 1, preapproval_id: 'p', payment: { status: 'approved' }, debit_date: '2026-11-15T10:00:00Z' }, now)).toEqual({
      paidUntil: '2026-12-17T10:00:00.000Z',
      graceUntil: null,
    });
  });
  it('cobro rechazado: abre 7 días de gracia', () => {
    expect(applyPayment({ id: 1, preapproval_id: 'p', payment: { status: 'rejected' } }, now)).toEqual({ graceUntil: '2026-11-22T12:00:00.000Z' });
  });
  it('cobro programado: no cambia nada', () => {
    expect(applyPayment({ id: 1, preapproval_id: 'p', status: 'scheduled' }, now)).toBeNull();
  });
});
