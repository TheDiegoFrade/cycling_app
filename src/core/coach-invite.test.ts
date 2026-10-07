import { describe, expect, it } from 'vitest';
import { generateInviteToken, inviteLink, inviteTokenHash, looksLikeInviteToken } from './coach-invite';

describe('generateInviteToken', () => {
  it('genera tokens base64url de 43 caracteres, distintos cada vez', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(looksLikeInviteToken(a)).toBe(true);
    expect(looksLikeInviteToken(b)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('inviteTokenHash', () => {
  it('es SHA-256 en hex minúsculas (mismo que sha256() de Postgres)', async () => {
    expect(await inviteTokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('looksLikeInviteToken', () => {
  it('rechaza lo que no generamos', () => {
    expect(looksLikeInviteToken(null)).toBe(false);
    expect(looksLikeInviteToken('')).toBe(false);
    expect(looksLikeInviteToken('abc')).toBe(false);
    expect(looksLikeInviteToken('a'.repeat(42) + '/')).toBe(false);
  });
});

describe('inviteLink', () => {
  it('usa hash routing', () => {
    expect(inviteLink('https://torq.app', 'x'.repeat(43))).toBe(`https://torq.app/#/invite/${'x'.repeat(43)}`);
  });
});
