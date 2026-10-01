import type { Session } from '@supabase/supabase-js';
import type { Profile, Workout } from '../core/types';
import type { HrAdapter, TrainerAdapter } from '../devices/types';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../storage/profile-store';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings-store';
import type { AppSettings } from '../storage/settings-store';
import { listSessions } from '../storage/session-store';
import type { SessionRecord } from '../storage/session-store';
import { listWorkouts, saveWorkout } from '../storage/workout-store';
import { ensureLocalDataOwnership } from '../storage/local-owner';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { listCloudSessions, pushSessionToCloud } from '../sync/cloud-sync';
import type { CloudSessionSummary } from '../sync/cloud-sync';
import { fetchCloudProfile, pushProfileToCloud } from '../sync/profile-sync';
import { fetchCloudSettings, pushSettingsToCloud } from '../sync/settings-sync';
import { fetchCloudWorkouts, pushWorkoutToCloud } from '../sync/workout-sync';

export interface AuthUser {
  id: string;
  email: string;
}

function toAuthUser(session: Session | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? '' } : null;
}

/** Estado compartido entre pantallas. No hay framework de reactividad: cada
 * pantalla se redibuja entera al navegar y lee este objeto directamente. */
class AppState {
  profile: Profile = DEFAULT_PROFILE;
  settings: AppSettings = DEFAULT_SETTINGS;
  workouts: Workout[] = [];
  selectedWorkoutId: string | null = null;
  /** Id de un borrador de sesión (ver storage/session-draft) a retomar en
   * Entrenar en vez de arrancar desde 0 — lo consume train.ts y lo limpia. */
  resumeDraftId: string | null = null;
  trainer: TrainerAdapter | null = null;
  hr: HrAdapter | null = null;
  /** true solo cuando se entró a Entrenar por el link explícito "Probar sin
   * rodillo (modo demo, no se graba)" de Antes de empezar — evita que Entrenar
   * conecte simuladores por su cuenta y grabe una sesión falsa (ver
   * TORQ_DESIGN.md, bug #1). Se resetea al entrar de nuevo a Antes de empezar. */
  demoSession = false;
  /** true solo entre terminar un entrenamiento real (no demo) y que Resumen
   * lo consuma — dispara el chequeo de logros nuevos ahí, y solo ahí: así
   * revisar una sesión vieja desde Historial nunca celebra nada "de nuevo". */
  justFinishedSession = false;
  lastSession: SessionRecord | null = null;
  /** Resumen (sin samples) de una sesión que solo existe en la nube — ver
   * Resumen, que renderiza una vista reducida cuando esto está poblado en
   * vez de lastSession. */
  lastCloudSession: CloudSessionSummary | null = null;
  user: AuthUser | null = null;
  readonly cloudEnabled: boolean = isSupabaseConfigured();
  /** Resúmenes desde Supabase — incluye sesiones grabadas en OTRO
   * dispositivo que nunca llegaron a este IndexedDB. Ver storage/session-store
   * para las locales (con samples completos) y sync/cloud-sync para el porqué
   * de la separación. */
  cloudSessions: CloudSessionSummary[] = [];
  private readonly authListeners = new Set<() => void>();

  get selectedWorkout(): Workout | null {
    return this.workouts.find((w) => w.id === this.selectedWorkoutId) ?? null;
  }

  /** Se llama cada vez que `user` cambia (login, logout, sesión restaurada
   * de otra pestaña) — usado por main.ts para re-renderizar la pantalla
   * actual sin que router.ts tenga que saber nada de autenticación. */
  onAuthChange(cb: () => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  private setUser(user: AuthUser | null): void {
    this.user = user;
    this.authListeners.forEach((cb) => cb());
  }

  async boot(): Promise<void> {
    let session = null;
    if (supabase) ({ data: { session } } = await supabase.auth.getSession());
    const initialUser = toAuthUser(session);
    // Debe correr ANTES de leer IndexedDB: si el dueño guardado no coincide
    // con este usuario (otra persona usó este mismo navegador), borra todo
    // lo local primero para no cargar ni, peor, migrar a la nube datos de
    // quien entró antes. Ver storage/local-owner.ts.
    await ensureLocalDataOwnership(initialUser?.id ?? null);

    const [profile, settings, workouts] = await Promise.all([loadProfile(), loadSettings(), listWorkouts()]);
    this.profile = profile;
    this.settings = settings;
    this.workouts = workouts;

    if (supabase) {
      this.user = initialUser; // set directo: todavía no hay listeners ni pantalla montada
      if (this.user) await this.syncFromCloud(this.user.id);
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        const user = toAuthUser(newSession);
        // Supabase dispara este callback también en TOKEN_REFRESHED (renovación
        // silenciosa en segundo plano, sin que el usuario haga nada) — si
        // notificáramos a los listeners en cada uno de esos eventos, cualquier
        // pantalla activa (p. ej. Entrenar, a mitad de una sesión) se
        // re-renderiza entera vía refresh() y pierde su estado en memoria sin
        // ningún error visible ni recarga de página. Solo importa cuando el
        // usuario realmente cambia (login, logout, o cambio de cuenta).
        if (user?.id === this.user?.id) return;
        await ensureLocalDataOwnership(user?.id ?? null);
        if (user) {
          const [profile, settings, workouts] = await Promise.all([loadProfile(), loadSettings(), listWorkouts()]);
          this.profile = profile;
          this.settings = settings;
          this.workouts = workouts;
          await this.syncFromCloud(user.id);
        } else {
          this.cloudSessions = [];
        }
        this.setUser(user);
      });
    }
  }

  /** Se llama al iniciar sesión (boot con sesión restaurada, o login nuevo).
   * La nube manda: si ya tiene perfil/ajustes/workouts, los usa y refresca la
   * caché local (IndexedDB) con ellos. Si la nube está confirmada vacía (no
   * es error/offline — ver el patrón de 3 estados en sync/*-sync.ts), sube lo
   * que había local una sola vez, cubriendo tanto usuarios nuevos como la
   * migración de quien ya usaba la app solo en este navegador. */
  private async syncFromCloud(userId: string): Promise<void> {
    const [cloudSessions, cloudProfile, cloudSettings, cloudWorkouts] = await Promise.all([
      listCloudSessions(userId),
      fetchCloudProfile(userId),
      fetchCloudSettings(userId),
      fetchCloudWorkouts(userId),
    ]);
    this.cloudSessions = cloudSessions;

    if (cloudProfile) {
      this.profile = cloudProfile;
      await saveProfile(cloudProfile);
    } else if (cloudProfile === null) {
      await pushProfileToCloud(this.profile, userId);
    }

    if (cloudSettings) {
      this.settings = cloudSettings;
      await saveSettings(cloudSettings);
    } else if (cloudSettings === null) {
      await pushSettingsToCloud(this.settings, userId);
    }

    if (cloudWorkouts) {
      if (cloudWorkouts.length > 0) {
        this.workouts = cloudWorkouts;
        await Promise.all(cloudWorkouts.map((w) => saveWorkout(w)));
      } else if (this.workouts.length > 0) {
        await Promise.all(this.workouts.map((w) => pushWorkoutToCloud(w, userId)));
      }
    }

    // Salvavidas: si una sesión se grabó sin internet (o el push al terminar
    // falló por cualquier otra razón), se queda local para siempre sin esto
    // — y el histórico de Forma/PMC en OTRO dispositivo nunca la contaría.
    // Reintenta subir cualquier sesión local que no aparezca todavía en la
    // lista que sí llegó a la nube.
    const localSessions = await listSessions();
    const cloudIds = new Set(cloudSessions.map((s) => s.id));
    const unsynced = localSessions.filter((s) => !cloudIds.has(s.id));
    if (unsynced.length > 0) await Promise.all(unsynced.map((s) => pushSessionToCloud(s, this.profile, userId)));
  }

  async signOut(): Promise<void> {
    if (supabase) await supabase.auth.signOut();
    // No depende del evento onAuthStateChange para borrar lo local: ese
    // handler compara contra this.user, que el setUser(null) de abajo ya deja
    // en null antes de que el evento llegue, así que el guard de "usuario sin
    // cambios" lo saltaría. Se borra aquí mismo, sin esperar al evento.
    await ensureLocalDataOwnership(null);
    this.profile = DEFAULT_PROFILE;
    this.settings = DEFAULT_SETTINGS;
    this.workouts = [];
    this.cloudSessions = [];
    this.setUser(null);
  }

  async persistProfile(): Promise<void> {
    await saveProfile(this.profile);
    if (this.user) void pushProfileToCloud(this.profile, this.user.id);
  }

  async persistSettings(): Promise<void> {
    await saveSettings(this.settings);
    if (this.user) void pushSettingsToCloud(this.settings, this.user.id);
  }
}

export const appState = new AppState();
