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
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
} from '@ionic/angular';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
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
  imports: [
    AppHeaderComponent,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonInput,
    ReactiveFormsModule,
    UiFeedbackComponent,
  ],
  template: `
    <app-header [titulo]="titulo" />
    <ion-content class="ion-padding">
      <ion-card class="auth-card">
        <ion-card-header>
          <ion-card-title>Cambia tu contraseña</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Debes establecer una contraseña nueva para continuar.</p>
          <app-ui-feedback [requestState]="auth.authState()" />
          <form [formGroup]="formulario" (ngSubmit)="cambiarContrasena()">
            <ion-input
              label="Nueva contraseña"
              labelPlacement="stacked"
              fill="outline"
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

            <ion-input
              label="Confirma la contraseña"
              labelPlacement="stacked"
              fill="outline"
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

            <ion-button
              type="submit"
              expand="block"
              [disabled]="formulario.invalid || auth.authState().status === 'loading'"
            >
              Guardar contraseña
            </ion-button>
          </form>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    .auth-card { margin: 2rem auto; max-width: 32rem; }
    form { display: grid; gap: 1rem; }
  `],
})
export class CambiarClavePage {
  readonly titulo = 'Cambiar contraseña';
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

  ionViewWillEnter(): void {
    this.auth.limpiarError();
  }

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
