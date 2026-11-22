import type { RolUsuario } from './rol-usuario.model';

export interface Usuario {
  readonly id: string;
  readonly uid?: string;
  readonly cedula: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly telefono: string | null;
  readonly email: string;
  readonly rol: RolUsuario;
  readonly debeCambiarClave: boolean;
  readonly recintoId: string | null;
  readonly jrvIds: readonly string[];
}
