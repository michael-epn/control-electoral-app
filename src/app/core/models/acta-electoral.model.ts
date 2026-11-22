import type { CoordenadasGps } from './coordenadas-gps.model';
import type { Dignidad } from './dignidad.model';

declare const votosOrganizacionesBrand: unique symbol;

export type VotosOrganizaciones = Readonly<Record<string, number>> & {
  readonly [votosOrganizacionesBrand]: true;
};

export interface ActaElectoral {
  readonly id: string;
  readonly jrvId: string;
  readonly recintoId: string;
  readonly dignidad: Dignidad;
  readonly votosOrganizaciones: VotosOrganizaciones;
  readonly votosNulos: number;
  readonly votosBlancos: number;
  readonly totalSufragantes: number;
  readonly fotoPath: string | null;
  readonly fotoUrl: string | null;
  readonly gps: CoordenadasGps;
  readonly auditadaPorCoordinador: boolean;
  readonly client_timestamp?: number;
  readonly bloqueada?: boolean;
}
