import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const firstLoginGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const authState = inject(AuthStateService);
  await authState.esperarInicializacion();

  if (!authState.usuarioActual()) {
    return router.parseUrl('/auth');
  }

  return authState.requiereCambioClave()
    ? router.parseUrl('/auth/cambiar-clave')
    : true;
};
