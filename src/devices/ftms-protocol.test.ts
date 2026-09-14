import { describe, expect, it } from 'vitest';
import {
  buildRequestControl,
  buildSetResistanceLevel,
  buildSetTargetPower,
  buildStart,
  CONTROL_POINT_RESULT,
  parseControlPointResponse,
  parseIndoorBikeData,
} from './ftms-protocol';

function dv(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseIndoorBikeData', () => {
  it('lee cadencia y potencia cuando ambas están presentes (bits 2 y 6)', () => {
    // flags: bit0=0 (speed presente), bit2=1 (cadencia), bit6=1 (potencia)
    const flags = (1 << 2) | (1 << 6);
    const speed = 2500; // 25.00 km/h, se ignora
    const cadence = 190; // 95.0 rpm (190 * 0.5)
    const power = 220;
    const bytes: number[] = [];
    const push16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
    push16(flags);
    push16(speed);
    push16(cadence);
    push16(power);
    const { power: p, cadence: c } = parseIndoorBikeData(dv(bytes));
    expect(c).toBe(95);
    expect(p).toBe(220);
  });

  it('salta instantaneous speed cuando more-data (bit0) está en 1', () => {
    const flags = 1 << 0; // more data: sin speed
    const bytes = [flags & 0xff, (flags >> 8) & 0xff];
    const { power, cadence } = parseIndoorBikeData(dv(bytes));
    expect(power).toBeNull();
    expect(cadence).toBeNull();
  });

  it('interpreta la potencia como int16 con signo', () => {
    const flags = 1 << 6;
    const bytes: number[] = [];
    const push16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
    push16(flags);
    push16(2); // instantaneous speed (bit0=0, presente)
    bytes.push(0xce, 0xff); // -50 en int16 LE
    const { power } = parseIndoorBikeData(dv(bytes));
    expect(power).toBe(-50);
  });

  it('respeta el orden y tamaño de los campos anteriores a potencia (resistencia, distancia)', () => {
    const flags = (1 << 4) | (1 << 5) | (1 << 6); // total distance (3B), resistance (2B), power (2B)
    const bytes: number[] = [];
    const push16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
    push16(flags);
    push16(1000); // speed (bit0=0, presente)
    bytes.push(0x01, 0x02, 0x03); // total distance uint24
    push16(10); // resistance
    push16(150); // power
    const { power } = parseIndoorBikeData(dv(bytes));
    expect(power).toBe(150);
  });
});

describe('mensajes del control point', () => {
  it('request control es un solo byte 0x00', () => {
    expect(Array.from(buildRequestControl())).toEqual([0x00]);
  });

  it('start es un solo byte 0x07', () => {
    expect(Array.from(buildStart())).toEqual([0x07]);
  });

  it('set target power es 0x05 + int16 little-endian', () => {
    expect(Array.from(buildSetTargetPower(250))).toEqual([0x05, 0xfa, 0x00]);
  });

  it('set target power redondea watts fraccionarios', () => {
    expect(Array.from(buildSetTargetPower(199.6))).toEqual([0x05, 0xc8, 0x00]);
  });

  it('set resistance level es 0x04 + int16 little-endian con resolución 0.1', () => {
    expect(Array.from(buildSetResistanceLevel(50))).toEqual([0x04, 0xf4, 0x01]); // 50 * 10 = 500 = 0x01F4
  });

  it('set resistance level en 0 manda 0', () => {
    expect(Array.from(buildSetResistanceLevel(0))).toEqual([0x04, 0x00, 0x00]);
  });
});

describe('parseControlPointResponse', () => {
  it('lee el opcode respondido y el código de resultado', () => {
    const response = parseControlPointResponse(dv([0x80, 0x05, CONTROL_POINT_RESULT.success]));
    expect(response).toEqual({ requestOpCode: 0x05, resultCode: CONTROL_POINT_RESULT.success });
  });

  it('reconoce un rechazo de control (controlNotPermitted)', () => {
    const response = parseControlPointResponse(dv([0x80, 0x05, CONTROL_POINT_RESULT.controlNotPermitted]));
    expect(response?.resultCode).toBe(CONTROL_POINT_RESULT.controlNotPermitted);
  });

  it('devuelve null si no empieza con el marcador 0x80', () => {
    expect(parseControlPointResponse(dv([0x00, 0x05, 0x01]))).toBeNull();
  });

  it('devuelve null si el mensaje es más corto de 3 bytes', () => {
    expect(parseControlPointResponse(dv([0x80, 0x05]))).toBeNull();
  });
});
