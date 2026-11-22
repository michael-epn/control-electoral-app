import { Component, Input, inject } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthStateService } from '../../../core/services/auth-state.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    IonBadge,
    IonButton,
    IonButtons,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>
          <span>{{ titulo }}</span>
          @if (auth.usuarioActual(); as usuario) {
            <span class="identity">
              <ion-badge color="light">{{ usuario.rol }}</ion-badge>
              <span>{{ usuario.nombres }} {{ usuario.apellidos }}</span>
            </span>
          }
        </ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" color="light" (click)="salir()">
            <ion-icon slot="start" name="log-out-outline"></ion-icon>
            Salir
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
  styles: [`
    ion-title {
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
      white-space: normal;
    }
    .identity {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.75rem;
      font-weight: 400;
      gap: 0.4rem;
      margin-top: 0.2rem;
      min-width: 0;
    }
    ion-button {
      --color: var(--ion-color-primary-contrast);
    }
    ion-badge {
      --background: #ffffff;
      color: var(--ion-color-primary);
    }
  `],
})
export class AppHeaderComponent {
  @Input({ required: true }) titulo!: string;

  readonly auth = inject(AuthStateService);

  async salir(): Promise<void> {
    await this.auth.cerrarSesion();
  }
}
