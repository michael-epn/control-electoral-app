import type { CoordenadasGps } from './coordenadas-gps.model';
import type { Dignidad } from './dignidad.model';

export type VotosOrganizaciones = Readonly<Record<string, number>>;

export interface ActaElectoral {
  readonly id: string;
  readonly jrvId: string;
  readonly dignidad: Dignidad;
  readonly votosOrganizaciones: VotosOrganizaciones;
  readonly votosNulos: number;
  readonly votosBlancos: number;
  readonly totalSufragantes: number;
  readonly fotoUrl: string | null;
  readonly gps: CoordenadasGps;
  readonly auditadaPorCoordinador: boolean;
}
