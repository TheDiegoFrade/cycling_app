import type { Profile, Workout } from '../core/types';
import type { HrAdapter, TrainerAdapter } from '../devices/types';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../storage/profile-store';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings-store';
import type { AppSettings } from '../storage/settings-store';
import type { SessionRecord } from '../storage/session-store';
import { listWorkouts } from '../storage/workout-store';

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

  get selectedWorkout(): Workout | null {
    return this.workouts.find((w) => w.id === this.selectedWorkoutId) ?? null;
  }

  async boot(): Promise<void> {
    const [profile, settings, workouts] = await Promise.all([loadProfile(), loadSettings(), listWorkouts()]);
    this.profile = profile;
    this.settings = settings;
    this.workouts = workouts;
  }

  async persistProfile(): Promise<void> {
    await saveProfile(this.profile);
  }

  async persistSettings(): Promise<void> {
    await saveSettings(this.settings);
  }
}

export const appState = new AppState();
