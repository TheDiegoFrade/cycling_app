/** Tipos base de FIT que usamos (subconjunto del catálogo del SDK). */
export const BASE_TYPE = {
  enum: 0x00,
  uint8: 0x02,
  uint16: 0x84,
  uint32: 0x86,
} as const;

export type BaseType = (typeof BASE_TYPE)[keyof typeof BASE_TYPE];

const BASE_TYPE_SIZE: Record<number, number> = {
  [BASE_TYPE.enum]: 1,
  [BASE_TYPE.uint8]: 1,
  [BASE_TYPE.uint16]: 2,
  [BASE_TYPE.uint32]: 4,
};

export interface FitFieldDef {
  num: number;
  baseType: BaseType;
}

/** Acumula bytes de mensajes de definición y de datos FIT. Un "mensaje" en
 * FIT es: header byte + payload; una Definition Message declara el layout
 * de un "local message type" (0–15) que las Data Messages siguientes
 * reutilizan hasta que se redefina. */
export class FitWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  writeDefinition(localType: number, globalMesgNum: number, fields: FitFieldDef[]): void {
    this.bytes.push(0x40 | localType, 0x00, 0x00, globalMesgNum & 0xff, (globalMesgNum >> 8) & 0xff, fields.length);
    for (const f of fields) {
      this.bytes.push(f.num, BASE_TYPE_SIZE[f.baseType], f.baseType);
    }
  }

  writeData(localType: number, fields: FitFieldDef[], values: number[]): void {
    this.bytes.push(localType & 0x0f);
    fields.forEach((f, i) => {
      this.writeValue(f.baseType, values[i]);
    });
  }

  private writeValue(baseType: BaseType, value: number): void {
    switch (baseType) {
      case BASE_TYPE.enum:
      case BASE_TYPE.uint8:
        this.bytes.push(value & 0xff);
        return;
      case BASE_TYPE.uint16:
        this.bytes.push(value & 0xff, (value >> 8) & 0xff);
        return;
      case BASE_TYPE.uint32:
        this.bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
        return;
    }
  }
}
