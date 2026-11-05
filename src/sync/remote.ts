// Canal del control remoto (celular ↔ laptop) sobre Supabase Realtime
// Broadcast: no toca la base de datos ni necesita sesión en el celular. El
// protocolo y sus validaciones viven en core/remote-protocol.ts.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { REMOTE_EVENT_CMD, REMOTE_EVENT_STATE, parseRemoteCommand, parseRemoteState, remoteChannelName } from '../core/remote-protocol';
import type { RemoteCommand, RemoteState } from '../core/remote-protocol';

export type RemoteLinkStatus = 'connecting' | 'online' | 'offline';

export interface RemoteLink<Out> {
  send(payload: Out): void;
  close(): void;
}

/** Solo en desarrollo y sin Supabase: celular y laptop simulados en dos
 * pestañas del mismo navegador (BroadcastChannel). Se prende con
 * localStorage['torq.remote.local'] = '1'. Nunca corre en producción. */
function localBusEnabled(): boolean {
  return import.meta.env.DEV && !supabase && typeof BroadcastChannel !== 'undefined' && localStorage.getItem('torq.remote.local') === '1';
}

/** ¿Se puede usar el control con el celular en esta instalación? */
export function remoteAvailable(): boolean {
  return !!supabase || localBusEnabled();
}

function openLocal<Out>(code: string, listenFor: string, sendAs: string, onMessage: (p: unknown) => void, onStatus: (s: RemoteLinkStatus) => void): RemoteLink<Out> {
  let bc: BroadcastChannel | null = new BroadcastChannel(remoteChannelName(code));
  bc.onmessage = (e: MessageEvent<{ event: string; payload: unknown }>) => {
    if (e.data?.event === listenFor) onMessage(e.data.payload);
  };
  setTimeout(() => onStatus('online'), 0);
  return {
    send: (payload) => bc?.postMessage({ event: sendAs, payload }),
    close: () => {
      bc?.close();
      bc = null;
    },
  };
}

function open<Out>(
  code: string,
  listenFor: string,
  sendAs: string,
  onMessage: (payload: unknown) => void,
  onStatus: (s: RemoteLinkStatus) => void,
): RemoteLink<Out> | null {
  if (localBusEnabled()) return openLocal<Out>(code, listenFor, sendAs, onMessage, onStatus);
  if (!supabase) return null;
  const client = supabase;
  let channel: RealtimeChannel | null = client.channel(remoteChannelName(code), { config: { broadcast: { self: false, ack: false } } });
  onStatus('connecting');
  channel.on('broadcast', { event: listenFor }, ({ payload }) => onMessage(payload));
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') onStatus('online');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('offline');
  });
  return {
    send(payload) {
      // Si todavía no termina de conectar, el SDK lo manda por REST: igual llega.
      void channel?.send({ type: 'broadcast', event: sendAs, payload: payload as Record<string, unknown> });
    },
    close() {
      if (channel) void client.removeChannel(channel);
      channel = null;
    },
  };
}

/** Laptop: escucha los botones del celular y le manda su estado. */
export function hostRemote(code: string, onCommand: (c: RemoteCommand) => void, onStatus: (s: RemoteLinkStatus) => void): RemoteLink<RemoteState> | null {
  return open<RemoteState>(code, REMOTE_EVENT_CMD, REMOTE_EVENT_STATE, (p) => {
    const cmd = parseRemoteCommand(p);
    if (cmd) onCommand(cmd);
  }, onStatus);
}

/** Celular: manda botones y escucha el estado de la laptop. */
export function joinRemote(code: string, onState: (s: RemoteState) => void, onStatus: (s: RemoteLinkStatus) => void): RemoteLink<RemoteCommand> | null {
  return open<RemoteCommand>(code, REMOTE_EVENT_STATE, REMOTE_EVENT_CMD, (p) => {
    const st = parseRemoteState(p);
    if (st) onState(st);
  }, onStatus);
}
