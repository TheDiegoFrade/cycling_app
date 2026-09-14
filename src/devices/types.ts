export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface TrainerReading {
  power: number;
  cadence: number;
}

/** Interfaz común para el rodillo: engine/ y ui/ solo ven esto, nunca
 * Web Bluetooth directo. Implementada por el adaptador simulado (M3) y por
 * el adaptador FTMS real (M4) detrás del mismo contrato. */
export interface TrainerAdapter {
  readonly state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): void;
  /** Manda el objetivo ERG en watts. Se debe llamar en cada cambio de
   * bloque y en cada cambio de intensidad. */
  setTarget(watts: number): void;
  /** Saca al rodillo de modo ERG y lo deja en resistencia fija (0–100):
   * dejar de llamar a `setTarget` no alcanza, el rodillo se queda pegado
   * al último objetivo para siempre hasta que se le pida explícitamente
   * otro modo de control. */
  setResistance(percent: number): void;
  onReading(cb: (reading: TrainerReading) => void): () => void;
  onStateChange(cb: (state: ConnectionState) => void): () => void;
}

/** Interfaz común para la banda de pulso. */
export interface HrAdapter {
  readonly state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): void;
  onReading(cb: (hr: number) => void): () => void;
  onStateChange(cb: (state: ConnectionState) => void): () => void;
}
