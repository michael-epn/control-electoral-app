import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { RequestState } from '../../core/models/request-state.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';

@Component({
  selector: 'app-recuperar-clave-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, UiFeedbackComponent],
  template: `
    <main>
      <h1>Recuperar contraseña</h1>
      <p>Si la cédula está registrada, enviaremos las instrucciones al correo asociado.</p>
      <app-ui-feedback [requestState]="requestState()" />
      <form [formGroup]="formulario" (ngSubmit)="recuperarContrasena()">
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

        <button type="submit" [disabled]="formulario.invalid || requestState().status === 'loading'">
          Enviar instrucciones
        </button>
      </form>
      <a routerLink="/auth">Volver a iniciar sesión</a>
    </main>
  `,
})
export class RecuperarClavePage {
  private readonly auth = inject(AuthStateService);
  readonly requestState = signal<RequestState<unknown>>({ status: 'idle' });

  readonly formulario = new FormGroup({
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, cedulaEcuatorianaValidator()],
    }),
  });

  async recuperarContrasena(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.requestState.set({ status: 'loading' });
    try {
      await this.auth.recuperarContrasenaPorCedula(
        this.formulario.controls.cedula.value,
      );
      this.requestState.set({
        status: 'success',
        data: undefined,
        message: 'Si la cédula está registrada, recibirás instrucciones en el correo asociado.',
      });
    } catch {
      this.requestState.set({
        status: 'error',
        error: 'No se pudo procesar la recuperación. Inténtalo nuevamente.',
      });
    }
  }
}
