import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';
import {
  AuthStateService,
  rutaInicioPorRol,
} from '../../core/services/auth-state.service';

function validarCoincidencia(control: AbstractControl): ValidationErrors | null {
  return control.get('nuevaContrasena')?.value
    === control.get('confirmarContrasena')?.value
    ? null
    : { contrasenasNoCoinciden: true };
}

@Component({
  selector: 'app-cambiar-clave-page',
  standalone: true,
  imports: [ReactiveFormsModule, UiFeedbackComponent],
  template: `
    <main>
      <h1>Cambia tu contraseña</h1>
      <p>Debes establecer una contraseña nueva para continuar.</p>
      <app-ui-feedback [requestState]="auth.authState()" />
      <form [formGroup]="formulario" (ngSubmit)="cambiarContrasena()">
        <label for="nueva-contrasena">Nueva contraseña</label>
        <input
          id="nueva-contrasena"
          type="password"
          autocomplete="new-password"
          formControlName="nuevaContrasena"
        />
        @if (
          formulario.controls.nuevaContrasena.touched
          && formulario.controls.nuevaContrasena.hasError('minlength')
        ) {
          <p role="alert">Usa al menos 8 caracteres.</p>
        }

        <label for="confirmar-contrasena">Confirma la contraseña</label>
        <input
          id="confirmar-contrasena"
          type="password"
          autocomplete="new-password"
          formControlName="confirmarContrasena"
        />
        @if (
          formulario.touched
          && formulario.hasError('contrasenasNoCoinciden')
        ) {
          <p role="alert">Las contraseñas no coinciden.</p>
        }

        <button
          type="submit"
          [disabled]="formulario.invalid || auth.authState().status === 'loading'"
        >
          Guardar contraseña
        </button>
      </form>
    </main>
  `,
})
export class CambiarClavePage {
  readonly auth = inject(AuthStateService);
  private readonly router = inject(Router);

  readonly formulario = new FormGroup(
    {
      nuevaContrasena: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmarContrasena: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: validarCoincidencia },
  );

  async cambiarContrasena(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const actualizada = await this.auth.cambiarContrasena(
      this.formulario.controls.nuevaContrasena.value,
    );
    const usuario = this.auth.usuarioActual();
    if (actualizada && usuario) {
      await this.router.navigateByUrl(rutaInicioPorRol(usuario.rol));
    }
  }
}
