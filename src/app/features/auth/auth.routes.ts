import type { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./login.page').then((module) => module.LoginPage),
  },
  {
    path: 'login',
    pathMatch: 'full',
    redirectTo: '',
  },
  {
    path: 'cambiar-clave',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./cambiar-clave.page').then((module) => module.CambiarClavePage),
  },
  {
    path: 'recuperar-clave',
    loadComponent: () =>
      import('./recuperar-clave.page').then((module) => module.RecuperarClavePage),
  },
];
