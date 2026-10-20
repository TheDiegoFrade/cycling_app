// Concordancia de género en lo que la app le dice a la persona. Sale del sexo
// del perfil (Hombre / Mujer); con «Otro» o sin dato se usa una forma neutra
// (que no dependa de un adjetivo con género), nunca el masculino genérico.
import type { Profile } from './types';

export type Gender = 'm' | 'f' | 'n';

export function genderOf(sex: Profile['sex'] | null | undefined): Gender {
  return sex === 'M' ? 'm' : sex === 'F' ? 'f' : 'n';
}

/** Elige la forma según el género. `neutral` es la frase sin género (si no se
 * da, «m/f» comparten texto y no hace falta). */
export function byGender(gender: Gender | undefined, masc: string, fem: string, neutral: string): string {
  return gender === 'm' ? masc : gender === 'f' ? fem : neutral;
}
