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
    data: { roles: ['PROVINCIAL'] },
    canActivate: [authGuard, roleGuard, firstLoginGuard],
    loadChildren: () =>
      import('./features/provincial/provincial.routes')
        .then((module) => module.PROVINCIAL_ROUTES),
  },
  {
    path: 'recinto',
    data: { roles: ['RECINTO'] },
    canActivate: [authGuard, roleGuard, firstLoginGuard],
    loadChildren: () =>
      import('./features/recinto/recinto.routes')
        .then((module) => module.RECINTO_ROUTES),
  },
  {
    path: 'veedor',
    data: { roles: ['VEEDOR'] },
    canActivate: [authGuard, roleGuard, firstLoginGuard],
    loadChildren: () =>
      import('./features/veedor/veedor.routes')
        .then((module) => module.VEEDOR_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' },
];
