import { describe, expect, it } from 'vitest';
import { isRemoteCode, newRemoteCode, parseRemoteCommand, parseRemoteState, remoteUrl, sameRemoteState } from './remote-protocol';
import type { RemoteState } from './remote-protocol';

describe('control remoto: protocolo', () => {
  it('genera códigos de 26 caracteres, distintos y válidos', () => {
    const a = newRemoteCode();
    const b = newRemoteCode();
    expect(a).toHaveLength(26);
    expect(isRemoteCode(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isRemoteCode('ABC')).toBe(false);
    expect(isRemoteCode(null)).toBe(false);
  });

  it('arma la liga del celular', () => {
    expect(remoteUrl('https://ridetorq.app', '/', 'x'.repeat(26))).toBe(`https://ridetorq.app/#/remote/${'x'.repeat(26)}`);
  });

  it('solo acepta comandos bien formados', () => {
    expect(parseRemoteCommand({ kind: 'harder', id: 1 })).toEqual({ kind: 'harder', id: 1 });
    expect(parseRemoteCommand({ kind: 'rpe', id: 2, value: 8 })).toEqual({ kind: 'rpe', id: 2, value: 8 });
    expect(parseRemoteCommand({ kind: 'rpe', id: 2, value: 11 })).toBeNull();
    expect(parseRemoteCommand({ kind: 'rpe', id: 2, value: 7.5 })).toBeNull();
    expect(parseRemoteCommand({ kind: 'borrar-todo', id: 3 })).toBeNull();
    expect(parseRemoteCommand({ kind: 'harder' })).toBeNull();
    expect(parseRemoteCommand('harder')).toBeNull();
  });

  it('valida el estado y detecta cuándo cambió', () => {
    const s: RemoteState = { run: 'running', mode: 'sim', level: '+1.0%', levelLabel: 'pendiente', block: 'Test 20 min', blockLeftS: 600, targetW: 250, rpeAsk: null, ramp: false, ackId: 4 };
    expect(parseRemoteState(s)).toEqual(s);
    expect(parseRemoteState({ ...s, run: 'volando' })).toBeNull();
    expect(sameRemoteState(s, { ...s, blockLeftS: 590 })).toBe(true);
    expect(sameRemoteState(s, { ...s, level: '+1.5%' })).toBe(false);
    expect(sameRemoteState(null, s)).toBe(false);
  });
});
