import { afterEach, describe, expect, it, vi } from 'vitest';
import { BleTrainerAdapter } from './ftms';
import { CONTROL_POINT_OPCODE, CONTROL_POINT_RESULT } from './ftms-protocol';

/** Rodillo FTMS falso: guarda cada comando del control point y deja
 * responderle con un código de resultado, como lo haría uno real. */
function fakeTrainer(opts: { simulation: boolean | null }) {
  const writes: number[][] = [];
  const control = Object.assign(new EventTarget(), {
    value: null as DataView | null,
    async writeValueWithResponse(v: Uint8Array) {
      writes.push(Array.from(v));
    },
    async startNotifications() {
      return control;
    },
  });
  const plain = () =>
    Object.assign(new EventTarget(), {
      value: null,
      async startNotifications() {
        return this;
      },
    });
  const features = {
    async readValue() {
      const target = (1 << 2) | (1 << 3) | (opts.simulation ? 1 << 13 : 0);
      return new DataView(new Uint8Array([0, 0, 0, 0, target & 0xff, (target >> 8) & 0xff, 0, 0]).buffer);
    },
  };
  const service = {
    async getCharacteristic(name: string) {
      if (name === 'fitness_machine_control_point') return control;
      if (name === 'fitness_machine_feature') {
        if (opts.simulation === null) throw new Error('no expuesta');
        return features;
      }
      return plain();
    },
  };
  const device = Object.assign(new EventTarget(), {
    gatt: { async connect() { return { async getPrimaryService() { return service; } }; }, disconnect() {} },
  });
  const respond = (opCode: number, result: number) => {
    control.value = new DataView(new Uint8Array([0x80, opCode, result]).buffer);
    control.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  return { device, writes, respond };
}

async function connected(opts: { simulation: boolean | null }) {
  const fake = fakeTrainer(opts);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => fake.device } });
  const trainer = new BleTrainerAdapter();
  await trainer.connect();
  return { trainer, ...fake };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const opcodes = (writes: number[][]) => writes.map((w) => w[0]);

afterEach(() => vi.unstubAllGlobals());

describe('BleTrainerAdapter sin ERG', () => {
  it('usa la calle simulada si el rodillo la anuncia', async () => {
    const { trainer, writes } = await connected({ simulation: true });
    expect(trainer.freeMode).toBe('sim');
    trainer.setSimulation(0);
    await flush();
    expect(opcodes(writes).at(-1)).toBe(CONTROL_POINT_OPCODE.setIndoorBikeSimulation);
  });

  it('cae a resistencia fija si el rodillo no la anuncia', async () => {
    const { trainer, writes } = await connected({ simulation: false });
    expect(trainer.freeMode).toBe('resistance');
    trainer.setSimulation(0);
    await flush();
    expect(opcodes(writes).at(-1)).toBe(CONTROL_POINT_OPCODE.setResistanceLevel);
  });

  it('si rechaza la calle simulada, avisa y pasa a resistencia fija (no a ERG)', async () => {
    const { trainer, writes, respond } = await connected({ simulation: null });
    const modes: string[] = [];
    trainer.onFreeModeChange((m) => modes.push(m));
    trainer.setSimulation(0);
    await flush();
    respond(CONTROL_POINT_OPCODE.setIndoorBikeSimulation, CONTROL_POINT_RESULT.opCodeNotSupported);
    await flush();
    expect(modes).toEqual(['resistance']);
    expect(opcodes(writes).at(-1)).toBe(CONTROL_POINT_OPCODE.setResistanceLevel);
  });

  it('si rechaza la resistencia fija, no lo regresa a ERG a escondidas', async () => {
    const { trainer, writes, respond } = await connected({ simulation: false });
    trainer.setResistance(20);
    await flush();
    const before = writes.length;
    respond(CONTROL_POINT_OPCODE.setResistanceLevel, CONTROL_POINT_RESULT.opCodeNotSupported);
    await flush();
    expect(writes.length).toBe(before);
  });

  it('si pierde el control en modo calle, lo recupera en modo calle', async () => {
    const { trainer, writes, respond } = await connected({ simulation: true });
    trainer.setSimulation(1);
    await flush();
    respond(CONTROL_POINT_OPCODE.setIndoorBikeSimulation, CONTROL_POINT_RESULT.controlNotPermitted);
    await flush();
    await flush();
    expect(opcodes(writes).slice(-3)).toEqual([CONTROL_POINT_OPCODE.requestControl, CONTROL_POINT_OPCODE.start, CONTROL_POINT_OPCODE.setIndoorBikeSimulation]);
    expect(opcodes(writes)).not.toContain(undefined);
    expect(opcodes(writes).filter((o) => o === CONTROL_POINT_OPCODE.setTargetPower)).toHaveLength(1); // solo el del enganche inicial
  });
});
