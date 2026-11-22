import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Dignidad } from '../../core/models/dignidad.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { EscrutinioStateService } from '../../core/services/escrutinio-state.service';
import { ActaEditorComponent } from '../../shared/components/acta-editor/acta-editor.component';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';

@Component({
  selector: 'app-veedor-page',
  standalone: true,
  imports: [
    ActaEditorComponent,
    UiFeedbackComponent,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Panel de veeduría</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <main>
        <h1>Mis Juntas Receptoras del Voto</h1>
        <p>Registra las actas de Alcaldía y Prefectura de las JRV asignadas a tu usuario.</p>
        <app-ui-feedback [requestState]="escrutinio.jrvsState()" />
        <app-ui-feedback [requestState]="escrutinio.actasState()" />

        @if (escrutinio.jrvs().length === 0 && escrutinio.jrvsState().status === 'success') {
          <p role="status">No tienes JRV asignadas. Contacta al Coordinador de Recinto.</p>
        }

        @for (jrv of escrutinio.jrvs(); track jrv.id) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>JRV-{{ jrv.numero.toString().padStart(2, '0') }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @for (dignidad of dignidades; track dignidad) {
                <ion-item lines="none">
                  <ion-label>
                    <h2>{{ dignidad }}</h2>
                    <p>{{ estadoActa(jrv.id, dignidad) }}</p>
                  </ion-label>
                  <ion-button
                    slot="end"
                    [disabled]="actaBloqueada(jrv.id, dignidad)"
                    (click)="seleccionarActa(jrv.id, dignidad)"
                  >
                    {{ escrutinio.actaPara(jrv.id, dignidad) ? 'Corregir' : 'Registrar' }}
                  </ion-button>
                </ion-item>
              }
            </ion-card-content>
          </ion-card>
        }

        @if (jrvSeleccionada() && recintoId()) {
          <app-acta-editor
            [recintoId]="recintoId()"
            [jrvId]="jrvSeleccionada()"
            [dignidad]="dignidadSeleccionada()"
            [acta]="actaSeleccionada()"
          />
        }
      </main>
    </ion-content>
  `,
})
export class VeedorPage {
  readonly escrutinio = inject(EscrutinioStateService);
  private readonly auth = inject(AuthStateService);
  readonly dignidades: readonly Dignidad[] = ['ALCALDE', 'PREFECTO'];
  readonly jrvSeleccionada = signal('');
  readonly dignidadSeleccionada = signal<Dignidad>('ALCALDE');
  readonly recintoId = computed(() => this.auth.usuarioActual()?.recintoId ?? '');
  readonly actaSeleccionada = computed(() => {
    const jrvId = this.jrvSeleccionada();
    return jrvId
      ? this.escrutinio.actaPara(jrvId, this.dignidadSeleccionada()) ?? null
      : null;
  });

  ionViewWillEnter(): void {
    this.auth.limpiarError();
    this.escrutinio.limpiarErrores();
  }

  seleccionarActa(jrvId: string, dignidad: Dignidad): void {
    this.jrvSeleccionada.set(jrvId);
    this.dignidadSeleccionada.set(dignidad);
  }

  estadoActa(jrvId: string, dignidad: Dignidad): string {
    const acta = this.escrutinio.actaPara(jrvId, dignidad);
    if (!acta) {
      return 'Pendiente de registro';
    }
    if (acta.auditadaPorCoordinador || acta.bloqueada) {
      return 'Registrada y bloqueada para edición';
    }
    return 'Acta ingresada';
  }

  actaBloqueada(jrvId: string, dignidad: Dignidad): boolean {
    const acta = this.escrutinio.actaPara(jrvId, dignidad);
    return acta?.auditadaPorCoordinador === true || acta?.bloqueada === true;
  }
}
