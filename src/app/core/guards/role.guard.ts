import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { RolUsuario } from '../models/rol-usuario.model';
import {
  AuthStateService,
  rutaInicioPorRol,
} from '../services/auth-state.service';

export function roleGuard(rolesPermitidos: RolUsuario[]): CanActivateFn {
  return async () => {
    const router = inject(Router);
    const authState = inject(AuthStateService);
    await authState.esperarInicializacion();

    const usuario = authState.usuarioActual();
    if (!usuario) {
      return router.parseUrl('/auth');
    }

    if (authState.requiereCambioClave()) {
      return router.parseUrl('/auth/cambiar-clave');
    }

    return rolesPermitidos.includes(usuario.rol)
      ? true
      : router.parseUrl(rutaInicioPorRol(usuario.rol));
  };
}
