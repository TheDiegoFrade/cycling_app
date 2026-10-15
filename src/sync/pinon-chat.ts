// Llamada a la función pinon-chat (Haiku). Solo para lo que la app no pudo
// contestar sola (ver core/pinon-chat.ts).
import { supabase } from '../supabase/client';
import type { PinonChatData } from '../core/pinon-chat';
import type { PinonTurn } from '../core/pinon-chat-request';

export type PinonChatError = 'not_available' | 'daily_limit' | 'offline' | 'failed';

export async function askPinon(message: string, history: PinonTurn[], context: PinonChatData): Promise<{ reply: string } | { error: PinonChatError }> {
  if (!supabase) return { error: 'offline' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('pinon-chat', { body: { message, history, context } });
    if (!error && typeof data?.reply === 'string') return { reply: data.reply };
    let code: string | undefined = data?.error;
    if (!code && error && 'context' in error) {
      code = await (error as unknown as { context: Response }).context
        .json()
        .then((j: { error?: string }) => j?.error)
        .catch(() => undefined);
    }
    if (code === 'not_available' || code === 'daily_limit') return { error: code };
    return { error: 'failed' };
  } catch {
    return { error: 'failed' };
  }
}
