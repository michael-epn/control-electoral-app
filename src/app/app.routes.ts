import type { Routes } from '@angular/router';
import { firstLoginGuard } from './core/guards/first-login.guard';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((module) => module.AUTH_ROUTES),
  },
  {
    path: 'provincial',
    canActivate: [
      authGuard,
      firstLoginGuard,
      roleGuard(['PROVINCIAL']),
    ],
    loadChildren: () =>
      import('./features/provincial/provincial.routes')
        .then((module) => module.PROVINCIAL_ROUTES),
  },
  {
    path: 'recinto',
    canActivate: [
      authGuard,
      firstLoginGuard,
      roleGuard(['RECINTO']),
    ],
    loadChildren: () =>
      import('./features/recinto/recinto.routes')
        .then((module) => module.RECINTO_ROUTES),
  },
  {
    path: 'veedor',
    canActivate: [
      authGuard,
      firstLoginGuard,
      roleGuard(['VEEDOR']),
    ],
    loadChildren: () =>
      import('./features/veedor/veedor.routes')
        .then((module) => module.VEEDOR_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' },
];
