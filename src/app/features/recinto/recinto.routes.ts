import type { Routes } from '@angular/router';

export const RECINTO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./recinto.page').then((module) => module.RecintoPage),
  },
];
