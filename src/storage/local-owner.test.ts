import { describe, expect, it } from 'vitest';
import { clearPersonalPrefsIfOtherUser } from './local-owner';

function memoryStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const personal = { 'torq.pinon.guide.home': '1', 'torq.pinon.chat.log': '[]', 'torq.seenAchievements': '[]', 'torq.onboarding.draft.a': '{}' };
const device = { 'torq.remote.local': 'x', 'torq.local_data_owner': 'a' };

describe('clearPersonalPrefsIfOtherUser', () => {
  it('otra cuenta en el mismo navegador: borra guías de Piñón, chat y logros; deja lo del aparato', () => {
    const s = memoryStorage({ ...personal, ...device, 'torq.local_last_user': 'a' });
    clearPersonalPrefsIfOtherUser('b', s);
    for (const k of Object.keys(personal)) expect(s.getItem(k)).toBeNull();
    expect(s.getItem('torq.remote.local')).toBe('x');
    expect(s.getItem('torq.local_last_user')).toBe('b');
  });

  it('la misma cuenta que vuelve a entrar: no borra nada', () => {
    const s = memoryStorage({ ...personal, 'torq.local_last_user': 'a' });
    clearPersonalPrefsIfOtherUser('a', s);
    expect(s.getItem('torq.pinon.guide.home')).toBe('1');
  });

  it('primera vez (sin última cuenta guardada): no borra, solo la recuerda', () => {
    const s = memoryStorage({ ...personal });
    clearPersonalPrefsIfOtherUser('a', s);
    expect(s.getItem('torq.pinon.guide.home')).toBe('1');
    expect(s.getItem('torq.local_last_user')).toBe('a');
  });
});
