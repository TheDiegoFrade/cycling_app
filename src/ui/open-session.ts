// Abrir el detalle de una sesión completada — el mismo camino desde
// Historial › Actividad y desde un día "Hecho" en Plan.
import { listSessions } from '../storage/session-store';
import { navigate } from './router';
import { appState } from './state';

export async function openSessionDetail(id: string, origin: 'local' | 'cloud'): Promise<void> {
  if (origin === 'cloud') {
    const cloud = appState.cloudSessions.find((s) => s.id === id);
    if (!cloud) return;
    appState.lastSession = null;
    appState.lastCloudSession = cloud;
    navigate('session');
    return;
  }
  const session = (await listSessions()).find((s) => s.id === id);
  if (!session) return;
  appState.lastSession = session;
  appState.lastCloudSession = null;
  navigate('session');
}
