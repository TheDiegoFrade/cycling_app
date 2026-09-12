import type { Profile, Sample } from '../core/types';
import { computeSessionAnalytics } from '../engine/analytics';
import { fitCrc16 } from './fit-crc';
import { BASE_TYPE, FitWriter } from './fit-writer';
import type { FitFieldDef } from './fit-writer';

/** Época FIT: segundos UTC desde 1989-12-31T00:00:00Z. */
const FIT_EPOCH_S = 631065600;

function toFitTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000) - FIT_EPOCH_S;
}

const FILE_ID_FIELDS: FitFieldDef[] = [
  { num: 0, baseType: BASE_TYPE.enum }, // type: 4 = activity
  { num: 1, baseType: BASE_TYPE.uint16 }, // manufacturer: 255 = development
  { num: 2, baseType: BASE_TYPE.uint16 }, // product
  { num: 4, baseType: BASE_TYPE.uint32 }, // time_created
];

const RECORD_FIELDS: FitFieldDef[] = [
  { num: 253, baseType: BASE_TYPE.uint32 }, // timestamp
  { num: 3, baseType: BASE_TYPE.uint8 }, // heart_rate
  { num: 4, baseType: BASE_TYPE.uint8 }, // cadence
  { num: 7, baseType: BASE_TYPE.uint16 }, // power
];

const LAP_FIELDS: FitFieldDef[] = [
  { num: 253, baseType: BASE_TYPE.uint32 }, // timestamp (fin del lap)
  { num: 2, baseType: BASE_TYPE.uint32 }, // start_time
  { num: 7, baseType: BASE_TYPE.uint32 }, // total_elapsed_time (escala 1000)
  { num: 8, baseType: BASE_TYPE.uint32 }, // total_timer_time (escala 1000)
  { num: 15, baseType: BASE_TYPE.uint8 }, // avg_heart_rate
  { num: 16, baseType: BASE_TYPE.uint8 }, // max_heart_rate
  { num: 17, baseType: BASE_TYPE.uint8 }, // avg_cadence
  { num: 18, baseType: BASE_TYPE.uint8 }, // max_cadence
  { num: 19, baseType: BASE_TYPE.uint16 }, // avg_power
  { num: 20, baseType: BASE_TYPE.uint16 }, // max_power
];

const SESSION_FIELDS: FitFieldDef[] = [
  { num: 253, baseType: BASE_TYPE.uint32 }, // timestamp
  { num: 2, baseType: BASE_TYPE.uint32 }, // start_time
  { num: 7, baseType: BASE_TYPE.uint32 }, // total_elapsed_time (escala 1000)
  { num: 8, baseType: BASE_TYPE.uint32 }, // total_timer_time (escala 1000)
  { num: 5, baseType: BASE_TYPE.enum }, // sport: 2 = cycling
  { num: 26, baseType: BASE_TYPE.uint16 }, // num_laps
  { num: 16, baseType: BASE_TYPE.uint8 }, // avg_heart_rate
  { num: 17, baseType: BASE_TYPE.uint8 }, // max_heart_rate
  { num: 18, baseType: BASE_TYPE.uint8 }, // avg_cadence
  { num: 19, baseType: BASE_TYPE.uint8 }, // max_cadence
  { num: 20, baseType: BASE_TYPE.uint16 }, // avg_power
  { num: 21, baseType: BASE_TYPE.uint16 }, // max_power
  { num: 34, baseType: BASE_TYPE.uint16 }, // normalized_power
  { num: 35, baseType: BASE_TYPE.uint16 }, // training_stress_score (escala 10)
  { num: 36, baseType: BASE_TYPE.uint16 }, // intensity_factor (escala 1000)
];

const ACTIVITY_FIELDS: FitFieldDef[] = [
  { num: 253, baseType: BASE_TYPE.uint32 }, // timestamp
  { num: 0, baseType: BASE_TYPE.uint32 }, // total_timer_time (escala 1000)
  { num: 1, baseType: BASE_TYPE.uint16 }, // num_sessions
  { num: 2, baseType: BASE_TYPE.enum }, // type: 0 = manual
  { num: 3, baseType: BASE_TYPE.enum }, // event: 26 = activity
  { num: 4, baseType: BASE_TYPE.enum }, // event_type: 1 = stop
];

const LOCAL_TYPE = { fileId: 0, record: 1, lap: 2, session: 3, activity: 4 } as const;
const GLOBAL_MESG = { fileId: 0, record: 20, lap: 19, session: 18, activity: 34 } as const;

interface Lap {
  intervalIndex: number;
  startS: number;
  endS: number; // segundo del último sample del lap (inclusive)
  samples: Sample[];
}

function buildLaps(samples: readonly Sample[]): Lap[] {
  const laps: Lap[] = [];
  for (const sample of samples) {
    const current = laps[laps.length - 1];
    if (!current || current.intervalIndex !== sample.interval_index) {
      laps.push({ intervalIndex: sample.interval_index, startS: sample.t, endS: sample.t, samples: [sample] });
    } else {
      current.endS = sample.t;
      current.samples.push(sample);
    }
  }
  return laps;
}

/** Genera un .fit de actividad (tipo ciclismo) con un lap por intervalo y
 * las métricas de core/analytics.ts (potencia normalizada, IF, TSS,
 * promedios/máximos) en el mensaje session y por lap, a partir de las
 * muestras grabadas a 1 Hz. No verificado contra un parser FIT real
 * (Garmin Connect / Strava / intervals.icu) — antes de confiar en el
 * archivo, súbelo a alguno de esos servicios como prueba. */
export function encodeFitActivity(startedAt: Date, samples: readonly Sample[], profile: Profile): Uint8Array {
  const w = new FitWriter();
  const startTs = toFitTimestamp(startedAt);
  const laps = buildLaps(samples);
  const totalS = samples.length;
  const overall = computeSessionAnalytics(samples, profile);

  w.writeDefinition(LOCAL_TYPE.fileId, GLOBAL_MESG.fileId, FILE_ID_FIELDS);
  w.writeData(LOCAL_TYPE.fileId, FILE_ID_FIELDS, [4, 255, 0, startTs]);

  w.writeDefinition(LOCAL_TYPE.record, GLOBAL_MESG.record, RECORD_FIELDS);
  for (const s of samples) {
    w.writeData(LOCAL_TYPE.record, RECORD_FIELDS, [startTs + s.t, s.hr, s.cadence, s.power]);
  }

  w.writeDefinition(LOCAL_TYPE.lap, GLOBAL_MESG.lap, LAP_FIELDS);
  for (const lap of laps) {
    const elapsedS = lap.endS - lap.startS + 1;
    const a = computeSessionAnalytics(lap.samples, profile);
    w.writeData(LOCAL_TYPE.lap, LAP_FIELDS, [
      startTs + lap.endS + 1,
      startTs + lap.startS,
      elapsedS * 1000,
      elapsedS * 1000,
      Math.round(a.avgHr),
      Math.round(a.maxHr),
      Math.round(a.avgCadence),
      Math.round(a.maxCadence),
      Math.round(a.avgPower),
      Math.round(a.maxPower),
    ]);
  }

  w.writeDefinition(LOCAL_TYPE.session, GLOBAL_MESG.session, SESSION_FIELDS);
  w.writeData(LOCAL_TYPE.session, SESSION_FIELDS, [
    startTs + totalS,
    startTs,
    totalS * 1000,
    totalS * 1000,
    2,
    laps.length,
    Math.round(overall.avgHr),
    Math.round(overall.maxHr),
    Math.round(overall.avgCadence),
    Math.round(overall.maxCadence),
    Math.round(overall.avgPower),
    Math.round(overall.maxPower),
    Math.round(overall.normalizedPower),
    Math.round((overall.trainingStressScore ?? 0) * 10),
    Math.round((overall.intensityFactor ?? 0) * 1000),
  ]);

  w.writeDefinition(LOCAL_TYPE.activity, GLOBAL_MESG.activity, ACTIVITY_FIELDS);
  w.writeData(LOCAL_TYPE.activity, ACTIVITY_FIELDS, [startTs + totalS, totalS * 1000, 1, 0, 26, 1]);

  const dataBytes = w.toUint8Array();

  const header = new Uint8Array(14);
  header[0] = 14; // header_size
  header[1] = 0x10; // protocol_version 1.0
  header[2] = 100; // profile_version (bytes 2-3, LE)
  header[3] = 0;
  header[4] = dataBytes.length & 0xff;
  header[5] = (dataBytes.length >> 8) & 0xff;
  header[6] = (dataBytes.length >> 16) & 0xff;
  header[7] = (dataBytes.length >> 24) & 0xff;
  header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  const headerCrc = fitCrc16(header.subarray(0, 12));
  header[12] = headerCrc & 0xff;
  header[13] = (headerCrc >> 8) & 0xff;

  const withoutCrc = new Uint8Array(header.length + dataBytes.length);
  withoutCrc.set(header, 0);
  withoutCrc.set(dataBytes, header.length);

  const fileCrc = fitCrc16(withoutCrc);
  const file = new Uint8Array(withoutCrc.length + 2);
  file.set(withoutCrc, 0);
  file[withoutCrc.length] = fileCrc & 0xff;
  file[withoutCrc.length + 1] = (fileCrc >> 8) & 0xff;

  return file;
}
