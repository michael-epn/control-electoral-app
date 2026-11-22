import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonToast,
} from '@ionic/angular';
import type { Dignidad } from '../../core/models/dignidad.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { EscrutinioStateService } from '../../core/services/escrutinio-state.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { ActaEditorComponent } from '../../shared/components/acta-editor/acta-editor.component';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';

@Component({
  selector: 'app-veedor-page',
  standalone: true,
  imports: [
    ActaEditorComponent,
    UiFeedbackComponent,
    IonButton,
    IonBadge,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonToast,
    AppHeaderComponent,
  ],
  template: `
    <app-header [titulo]="titulo" />
    <ion-content class="ion-padding">
      <main>
        <ion-card class="ion-margin-bottom">
          <ion-card-content>
            <div class="sync-badges" aria-live="polite">
              <ion-badge color="warning">
                Pendientes de envío: {{ offlineSync.pendientesCount() }}
              </ion-badge>
              <ion-badge color="success">
                Sincronizadas: {{ sincronizadasCount() }}
              </ion-badge>
            </div>
          </ion-card-content>
        </ion-card>
        <h1>Mis Juntas Receptoras del Voto</h1>
        <p>Registra las actas de Alcaldía y Prefectura de las JRV asignadas a tu usuario.</p>
        <app-ui-feedback [requestState]="escrutinio.jrvsState()" />
        <app-ui-feedback [requestState]="escrutinio.actasState()" />
        <app-ui-feedback [requestState]="offlineSync.estadoSincronizacion()" />

        @if (escrutinio.jrvs().length === 0 && escrutinio.jrvsState().status === 'success') {
          <p role="status">No tienes JRV asignadas. Contacta al Coordinador de Recinto.</p>
        }

        @for (jrv of escrutinio.jrvs(); track jrv.id) {
          <ion-card class="ion-margin-bottom">
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
          <ion-card class="ion-margin-bottom">
            <ion-card-content>
              <app-acta-editor
                [recintoId]="recintoId()"
                [jrvId]="jrvSeleccionada()"
                [dignidad]="dignidadSeleccionada()"
                [acta]="actaSeleccionada()"
              />
            </ion-card-content>
          </ion-card>
        }

        <ion-toast
          [isOpen]="offlineSync.notificacion() !== null"
          [message]="offlineSync.notificacion() ?? ''"
          [duration]="3500"
          (didDismiss)="offlineSync.limpiarNotificacion()"
        ></ion-toast>
      </main>
    </ion-content>
  `,
  styles: [`
    .sync-badges {
      display: flex;
      gap: 0.35rem;
      padding-inline-end: 0.5rem;
    }
  `],
})
export class VeedorPage {
  readonly titulo = 'Panel de veeduría';
  readonly escrutinio = inject(EscrutinioStateService);
  readonly offlineSync = inject(OfflineSyncService);
  private readonly auth = inject(AuthStateService);
  private readonly actaEditor = viewChild(ActaEditorComponent);
  readonly dignidades: readonly Dignidad[] = ['ALCALDE', 'PREFECTO'];
  readonly jrvSeleccionada = signal('');
  readonly dignidadSeleccionada = signal<Dignidad>('ALCALDE');
  readonly recintoId = computed(() => this.auth.usuarioActual()?.recintoId ?? '');
  readonly sincronizadasCount = computed(() =>
    this.escrutinio.actas().filter(
      (acta) => !this.offlineSync.estaPendiente(acta.jrvId, acta.dignidad),
    ).length,
  );
  readonly actaSeleccionada = computed(() => {
    const jrvId = this.jrvSeleccionada();
    return jrvId
      ? this.escrutinio.actaPara(jrvId, this.dignidadSeleccionada()) ?? null
      : null;
  });

  ionViewWillEnter(): void {
    this.auth.limpiarError();
    this.escrutinio.limpiarErrores();
    this.actaEditor()?.limpiarErrores();
    this.offlineSync.limpiarNotificacion();
  }

  seleccionarActa(jrvId: string, dignidad: Dignidad): void {
    this.jrvSeleccionada.set(jrvId);
    this.dignidadSeleccionada.set(dignidad);
  }

  estadoActa(jrvId: string, dignidad: Dignidad): string {
    if (this.offlineSync.estaPendiente(jrvId, dignidad)) {
      return 'Pendiente de envío';
    }

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
