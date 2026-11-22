import type { Dignidad } from './dignidad.model';

export interface Candidato {
  readonly id: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly dignidad: Dignidad;
  readonly organizacionPoliticaId: string;
}
