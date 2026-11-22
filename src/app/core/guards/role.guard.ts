import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const roleGuard: CanActivateFn = () => {
  // Deny access until the active user's role is checked.
  return inject(Router).parseUrl('/auth');
};
