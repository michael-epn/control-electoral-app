import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const authState = inject(AuthStateService);
  await authState.esperarInicializacion();

  return authState.usuarioActual()
    ? true
    : router.parseUrl('/auth');
};
