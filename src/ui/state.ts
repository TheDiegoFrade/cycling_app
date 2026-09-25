import type { Session } from '@supabase/supabase-js';
import type { Profile, Workout } from '../core/types';
import type { HrAdapter, TrainerAdapter } from '../devices/types';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../storage/profile-store';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings-store';
import type { AppSettings } from '../storage/settings-store';
import type { SessionRecord } from '../storage/session-store';
import { listWorkouts } from '../storage/workout-store';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { listCloudSessions } from '../sync/cloud-sync';
import type { CloudSessionSummary } from '../sync/cloud-sync';

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
  trainer: TrainerAdapter | null = null;
  hr: HrAdapter | null = null;
  lastSession: SessionRecord | null = null;
  user: AuthUser | null = null;
  readonly cloudEnabled: boolean = isSupabaseConfigured();
  /** Resúmenes desde Supabase — incluye sesiones grabadas en OTRO
   * dispositivo que nunca llegaron a este IndexedDB. Ver storage/session-store
   * para las locales (con samples completos) y sync/cloud-sync para el porqué
   * de la separación. */
  cloudSessions: CloudSessionSummary[] = [];

  get selectedWorkout(): Workout | null {
    return this.workouts.find((w) => w.id === this.selectedWorkoutId) ?? null;
  }

  async boot(): Promise<void> {
    const [profile, settings, workouts] = await Promise.all([loadProfile(), loadSettings(), listWorkouts()]);
    this.profile = profile;
    this.settings = settings;
    this.workouts = workouts;

    if (supabase) {
      const { data } = await supabase.auth.getSession();
      this.user = toAuthUser(data.session);
      if (this.user) this.cloudSessions = await listCloudSessions(this.user.id);
      supabase.auth.onAuthStateChange(async (_event, session) => {
        this.user = toAuthUser(session);
        this.cloudSessions = this.user ? await listCloudSessions(this.user.id) : [];
      });
    }
  }

  async signOut(): Promise<void> {
    if (supabase) await supabase.auth.signOut();
    this.user = null;
    this.cloudSessions = [];
  }

  async persistProfile(): Promise<void> {
    await saveProfile(this.profile);
  }

  async persistSettings(): Promise<void> {
    await saveSettings(this.settings);
  }
}

export const appState = new AppState();
