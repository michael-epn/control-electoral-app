export interface PhotoAuthorizationInput {
  readonly uid: string;
  readonly rol: unknown;
  readonly profileRecintoId: unknown;
  readonly actaRecintoId: string;
  readonly fotoPath: string;
  readonly veedorAsignadoId: unknown;
}

export function puedeFirmarFotoActa(input: PhotoAuthorizationInput): boolean {
  if (input.rol === 'PROVINCIAL') {
    return true;
  }

  if (input.rol === 'RECINTO') {
    return input.profileRecintoId === input.actaRecintoId;
  }

  if (input.rol === 'VEEDOR') {
    return input.fotoPath.split('/')[0] === input.uid
      && input.veedorAsignadoId === input.uid;
  }

  return false;
}
