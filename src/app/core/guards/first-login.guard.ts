import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const firstLoginGuard: CanActivateFn = () => {
  // Replace with the required-password-change flow when it exists.
  return inject(Router).parseUrl('/auth');
};
