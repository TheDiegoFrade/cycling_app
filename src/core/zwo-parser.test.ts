import { describe, expect, it } from 'vitest';
import { parseZwo } from './zwo-parser';

const SAMPLE_ZWO = `<workout_file>
<author>Test</author>
<name>VO2 4x4</name>
<description>Cuatro repeticiones a 115%</description>
<sportType>bike</sportType>
<workout>
<Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75" Cadence="85"/>
<SteadyState Duration="300" Power="0.75" Cadence="90"/>
<IntervalsT Repeat="4" OnDuration="240" OffDuration="180" OnPower="1.15" OffPower="0.5" Cadence="95" CadenceResting="85"/>
<Ramp Duration="120" PowerLow="0.6" PowerHigh="0.8"/>
<FreeRide Duration="300" Cadence="90"/>
<Cooldown Duration="300" PowerLow="0.75" PowerHigh="0.5"/>
<textevent timeoffset="20" message="Hoy el foco es cadencia"/>
</workout>
</workout_file>`;

describe('parseZwo', () => {
  it('lee name y description del workout_file', () => {
    const result = parseZwo(SAMPLE_ZWO);
    expect(result.name).toBe('VO2 4x4');
    expect(result.description).toBe('Cuatro repeticiones a 115%');
    expect(result.errors).toEqual([]);
  });

  it('expande Warmup, SteadyState, Ramp, FreeRide y Cooldown a un intervalo cada uno', () => {
    const result = parseZwo(SAMPLE_ZWO);
    expect(result.intervals[0]).toMatchObject({ type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 75, cadence_min: 85 });
    expect(result.intervals[1]).toMatchObject({ type: 'steady', duration_s: 300, power_pct: 75, cadence_min: 90 });
  });

  it('expande IntervalsT en pares on/off numerados desde 1, en orden', () => {
    const result = parseZwo(SAMPLE_ZWO);
    // índices 2..9 corresponden a los 4 pares on/off de IntervalsT (tras warmup y steadystate)
    const onOff = result.intervals.slice(2, 10);
    expect(onOff).toHaveLength(8);
    expect(onOff[0]).toMatchObject({ name: 'Intervalo 1', type: 'interval', duration_s: 240, power_pct: 115, cadence_min: 95 });
    expect(onOff[1]).toMatchObject({ name: 'Recuperación 1', type: 'recovery', duration_s: 180, power_pct: 50, cadence_min: 85 });
    expect(onOff[6]).toMatchObject({ name: 'Intervalo 4', type: 'interval' });
    expect(onOff[7]).toMatchObject({ name: 'Recuperación 4', type: 'recovery' });
  });

  it('la numeración final de bloques es simplemente la posición en el arreglo, tras expandir', () => {
    const result = parseZwo(SAMPLE_ZWO);
    // warmup(1) + steady(1) + intervalsT(8) + ramp(1) + freeride(1) + cooldown(1) = 13
    expect(result.intervals).toHaveLength(13);
    expect(result.intervals[10]).toMatchObject({ type: 'steady', power_pct: 60, ramp_to_pct: 80 }); // Ramp
    expect(result.intervals[11]).toMatchObject({ type: 'free', duration_s: 300, cadence_min: 90 }); // FreeRide
    expect(result.intervals[12]).toMatchObject({ type: 'cooldown', power_pct: 75, ramp_to_pct: 50 }); // Cooldown
  });

  it('convierte <textevent> en Comment', () => {
    const result = parseZwo(SAMPLE_ZWO);
    expect(result.comments).toEqual([{ at_s: 20, message: 'Hoy el foco es cadencia' }]);
  });

  it('reporta un error claro si falta <workout>', () => {
    const result = parseZwo('<workout_file><name>x</name></workout_file>');
    expect(result.errors.some((e) => e.includes('<workout>'))).toBe(true);
    expect(result.intervals).toEqual([]);
  });

  it('reporta y descarta etiquetas no soportadas, sin abortar el resto del parseo', () => {
    const xml = `<workout_file><name>x</name><workout>
      <SteadyState Duration="60" Power="0.5"/>
      <UnknownBlock Duration="30"/>
    </workout></workout_file>`;
    const result = parseZwo(xml);
    expect(result.errors.some((e) => e.includes('UnknownBlock'))).toBe(true);
    expect(result.intervals).toHaveLength(1);
  });

  it('reporta error si a un SteadyState le falta Duration', () => {
    const xml = `<workout_file><name>x</name><workout>
      <SteadyState Power="0.5"/>
    </workout></workout_file>`;
    const result = parseZwo(xml);
    expect(result.errors.some((e) => e.includes('Duration'))).toBe(true);
    expect(result.intervals).toEqual([]);
  });

  it('reporta error si a un textevent le falta message', () => {
    const xml = `<workout_file><name>x</name><workout>
      <textevent timeoffset="10"/>
    </workout></workout_file>`;
    const result = parseZwo(xml);
    expect(result.errors.some((e) => e.includes('textevent'))).toBe(true);
    expect(result.comments).toEqual([]);
  });

  it('usa un nombre por defecto si falta <name>', () => {
    const xml = '<workout_file><workout><SteadyState Duration="60" Power="0.5"/></workout></workout_file>';
    const result = parseZwo(xml);
    expect(result.name).toBe('Workout importado');
  });
});
