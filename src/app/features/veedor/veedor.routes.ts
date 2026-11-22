import type { Routes } from '@angular/router';

export const VEEDOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./veedor.page').then((module) => module.VeedorPage),
  },
];
