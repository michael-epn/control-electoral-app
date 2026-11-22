import type { RolUsuario } from './rol-usuario.model';

export interface CrearUsuarioDto {
  readonly cedula: string;
  readonly email: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly telefono?: string | null;
  readonly rol: RolUsuario;
  readonly recintoId?: string;
  readonly jrvIds?: readonly string[];
}
