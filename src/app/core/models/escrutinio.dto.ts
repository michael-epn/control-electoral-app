import type { CoordenadasGps } from './coordenadas-gps.model';
import type { Dignidad } from './dignidad.model';

export interface CrearRecintoDto {
  readonly canton: string;
  readonly parroquia: string;
  readonly nombre: string;
  readonly cantidadJrv: number;
}

export interface GuardarActaDto {
  readonly recintoId: string;
  readonly jrvId: string;
  readonly dignidad: Dignidad;
  readonly votosOrganizaciones: Readonly<Record<string, number>>;
  readonly votosNulos: number;
  readonly votosBlancos: number;
  readonly totalSufragantes: number;
  readonly foto?: Blob;
  readonly gps: CoordenadasGps;
  readonly auditadaPorCoordinador?: boolean;
}
