import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';
import { AuthStateService, rutaInicioPorRol } from '../../core/services/auth-state.service';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, UiFeedbackComponent],
  template: `
    <main>
      <h1>Iniciar sesión</h1>
      <p>Accede con tu cédula y contraseña.</p>
      <app-ui-feedback [requestState]="auth.authState()" />
      <form [formGroup]="formulario" (ngSubmit)="iniciarSesion()">
        <label for="cedula">Cédula</label>
        <input
          id="cedula"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          maxlength="10"
          formControlName="cedula"
        />
        @if (formulario.controls.cedula.touched && formulario.controls.cedula.invalid) {
          <p role="alert">Ingresa una cédula ecuatoriana válida.</p>
        }

        <label for="contrasena">Contraseña</label>
        <input
          id="contrasena"
          type="password"
          autocomplete="current-password"
          formControlName="contrasena"
        />
        @if (formulario.controls.contrasena.touched && formulario.controls.contrasena.invalid) {
          <p role="alert">La contraseña es obligatoria.</p>
        }

        <button
          type="submit"
          [disabled]="formulario.invalid || auth.authState().status === 'loading'"
        >
          Ingresar
        </button>
      </form>
      <a routerLink="/auth/recuperar-clave">Olvidé mi contraseña</a>
    </main>
  `,
})
export class LoginPage {
  readonly auth = inject(AuthStateService);
  private readonly router = inject(Router);

  readonly formulario = new FormGroup({
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, cedulaEcuatorianaValidator()],
    }),
    contrasena: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  async iniciarSesion(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const usuario = await this.auth.iniciarSesionPorCedula(
      this.formulario.controls.cedula.value,
      this.formulario.controls.contrasena.value,
    );
    if (!usuario) {
      return;
    }

    const destino = this.auth.requiereCambioClave()
      ? '/auth/cambiar-clave'
      : rutaInicioPorRol(usuario.rol);
    await this.router.navigateByUrl(destino);
  }
}
