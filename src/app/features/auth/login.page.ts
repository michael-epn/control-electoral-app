import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
} from '@ionic/angular';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';
import { AuthStateService, rutaInicioPorRol } from '../../core/services/auth-state.service';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';

@Component({
  selector: 'app-login-page',
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
          <ion-card-title>Iniciar sesión</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Accede con tu cédula y contraseña.</p>
          <app-ui-feedback [requestState]="auth.authState()" />
          <form [formGroup]="formulario" (ngSubmit)="iniciarSesion()">
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

            <ion-input
              label="Contraseña"
              labelPlacement="stacked"
              fill="outline"
              type="password"
              autocomplete="current-password"
              formControlName="contrasena"
            />
            @if (formulario.controls.contrasena.touched && formulario.controls.contrasena.invalid) {
              <p role="alert">La contraseña es obligatoria.</p>
            }

            <ion-button
              type="submit"
              expand="block"
              [disabled]="formulario.invalid || auth.authState().status === 'loading'"
            >
              Ingresar
            </ion-button>
          </form>
          <a routerLink="/auth/recuperar-clave">Olvidé mi contraseña</a>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    .auth-card { margin: 2rem auto; max-width: 32rem; }
    form { display: grid; gap: 1rem; }
  `],
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

  ionViewWillEnter(): void {
    this.auth.limpiarError();
  }

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
