import type { Routes } from '@angular/router';

export const PROVINCIAL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./provincial.page').then((module) => module.ProvincialPage),
  },
];
