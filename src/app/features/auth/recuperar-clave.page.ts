import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
} from '@ionic/angular';
import type { RequestState } from '../../core/models/request-state.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';

@Component({
  selector: 'app-recuperar-clave-page',
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonInput,
    ReactiveFormsModule,
    RouterLink,
    UiFeedbackComponent,
  ],
  template: `
    <ion-content class="ion-padding">
      <ion-card class="auth-card">
        <ion-card-header>
          <ion-card-title>Recuperar contraseña</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Si la cédula está registrada, enviaremos las instrucciones al correo asociado.</p>
          <app-ui-feedback [requestState]="requestState()" />
          <form [formGroup]="formulario" (ngSubmit)="recuperarContrasena()">
            <ion-input
              label="Cédula"
              labelPlacement="stacked"
              fill="outline"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="10"
              formControlName="cedula"
            />
            @if (formulario.controls.cedula.touched && formulario.controls.cedula.invalid) {
              <p role="alert">Ingresa una cédula ecuatoriana válida.</p>
            }

            <ion-button
              type="submit"
              expand="block"
              [disabled]="formulario.invalid || requestState().status === 'loading'"
            >
              Enviar instrucciones
            </ion-button>
          </form>
          <a routerLink="/auth">Volver a iniciar sesión</a>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    .auth-card { margin: 2rem auto; max-width: 32rem; }
    form { display: grid; gap: 1rem; }
  `],
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

  ionViewWillEnter(): void {
    if (this.requestState().status === 'error') {
      this.requestState.set({ status: 'idle' });
    }
  }

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
    } catch (error) {
      this.requestState.set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
