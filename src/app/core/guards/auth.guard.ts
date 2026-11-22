import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  // Replace with the session check when authentication is implemented.
  return inject(Router).parseUrl('/auth');
};
