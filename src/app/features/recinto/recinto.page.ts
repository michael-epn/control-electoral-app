import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular';
import type { ActaElectoral } from '../../core/models/acta-electoral.model';
import type { Dignidad } from '../../core/models/dignidad.model';
import type { RequestState } from '../../core/models/request-state.model';
import type { Usuario } from '../../core/models/usuario.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { EscrutinioStateService } from '../../core/services/escrutinio-state.service';
import { ActaEditorComponent } from '../../shared/components/acta-editor/acta-editor.component';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';

@Component({
  selector: 'app-recinto-page',
  standalone: true,
  imports: [
    ActaEditorComponent,
    ReactiveFormsModule,
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
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToast,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Coordinación de recinto</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <main>
        <h1>{{ recinto()?.nombre ?? 'Mi recinto' }}</h1>
        @if (recinto(); as actual) {
          <p>{{ actual.parroquia }}, {{ actual.canton }} · {{ actual.provincia }}</p>
        }

        <app-ui-feedback [requestState]="escrutinio.recintosState()" />
        <app-ui-feedback [requestState]="escrutinio.jrvsState()" />
        <app-ui-feedback [requestState]="escrutinio.actasState()" />

        <section aria-labelledby="jrv-heading">
          <h2 id="jrv-heading">Mesas y asignación de veedores</h2>
          <app-ui-feedback [requestState]="escrutinio.usuariosState()" />
          <app-ui-feedback [requestState]="estadoAsignacion()" />
          @for (jrv of escrutinio.jrvs(); track jrv.id) {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ etiquetaJrv(jrv.numero) }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-item>
                  <ion-label>Veedor asignado</ion-label>
                  <ion-select
                    [value]="jrv.veedorId ?? ''"
                    interface="popover"
                    aria-label="Asignar o reasignar veedor"
                    (ionChange)="actualizarAsignacion(jrv.id, $event.detail.value)"
                  >
                    <ion-select-option value="">Sin asignar</ion-select-option>
                    @for (veedor of escrutinio.usuarios(); track veedor.id) {
                      <ion-select-option [value]="veedor.id">
                        {{ veedor.nombres }} {{ veedor.apellidos }}
                      </ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                @for (dignidad of dignidades; track dignidad) {
                  <ion-item lines="none">
                    <ion-label>
                      <h3>{{ dignidad }}</h3>
                      <p>{{ estadoActa(jrv.id, dignidad) }}</p>
                    </ion-label>
                  </ion-item>
                }
              </ion-card-content>
            </ion-card>
          }
        </section>

        <section aria-labelledby="veedor-heading">
          <h2 id="veedor-heading">Crear veedor</h2>
          <app-ui-feedback [requestState]="estadoAlta()" />
          <form [formGroup]="formularioVeedor" (ngSubmit)="crearVeedor()">
            <label for="veedor-cedula">Cédula</label>
            <input id="veedor-cedula" formControlName="cedula" inputmode="numeric" maxlength="10" />
            @if (
              formularioVeedor.controls.cedula.touched
              && formularioVeedor.controls.cedula.invalid
            ) {
              <p role="alert">Ingresa una cédula ecuatoriana válida.</p>
            }

            <label for="veedor-nombres">Nombres</label>
            <input id="veedor-nombres" formControlName="nombres" autocomplete="given-name" />
            <label for="veedor-apellidos">Apellidos</label>
            <input id="veedor-apellidos" formControlName="apellidos" autocomplete="family-name" />
            <label for="veedor-email">Correo de confirmación</label>
            <input id="veedor-email" formControlName="email" type="email" autocomplete="email" />
            <label for="veedor-telefono">Teléfono</label>
            <input id="veedor-telefono" formControlName="telefono" type="tel" autocomplete="tel" />

            <ion-item>
              <ion-label>JRV iniciales</ion-label>
              <ion-select
                formControlName="jrvIds"
                multiple="true"
                interface="popover"
                aria-label="Asignar JRV iniciales al veedor"
              >
                @for (jrv of jrvsDisponibles(); track jrv.id) {
                  <ion-select-option [value]="jrv.id">
                    {{ etiquetaJrv(jrv.numero) }}
                  </ion-select-option>
                }
              </ion-select>
            </ion-item>

            <ion-button
              type="submit"
              expand="block"
              [disabled]="formularioVeedor.invalid || estadoAlta().status === 'loading'"
            >
              Crear veedor y asignar JRV
            </ion-button>
          </form>
        </section>

        <section aria-labelledby="audit-heading">
          <h2 id="audit-heading">Auditoría y corrección de actas</h2>
          @if (escrutinio.actas().length === 0 && escrutinio.actasState().status === 'success') {
            <p role="status">Aún no se han ingresado actas en este recinto.</p>
          }
          @for (acta of escrutinio.actas(); track acta.id) {
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ etiquetaJrvNumero(acta.jrvId) }} · {{ acta.dignidad }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <p>{{ acta.auditadaPorCoordinador ? 'Auditada' : 'Pendiente de auditoría' }}</p>
                @if (acta.fotoUrl) {
                  <a [href]="acta.fotoUrl" target="_blank" rel="noopener noreferrer">Ver fotografía</a>
                }
                <p>GPS: {{ acta.gps.lat }}, {{ acta.gps.lng }}</p>
                @if (!acta.auditadaPorCoordinador && !acta.bloqueada) {
                  <ion-button
                    type="button"
                    (click)="seleccionarActa(acta)"
                  >
                    Corregir y auditar
                  </ion-button>
                }
              </ion-card-content>
            </ion-card>
          }

          @if (actaSeleccionada(); as seleccionada) {
            <app-acta-editor
              #actaEditor
              [recintoId]="seleccionada.recintoId"
              [jrvId]="seleccionada.jrvId"
              [dignidad]="seleccionada.dignidad"
              [acta]="seleccionada"
              [auditoria]="true"
            />
            <ion-button type="button" fill="clear" (click)="cerrarAuditoria()">
              Cerrar editor
            </ion-button>
          }
        </section>
      </main>

      <ion-toast
        [isOpen]="toastAbierto()"
        [message]="toastMensaje()"
        [duration]="2500"
        (didDismiss)="toastAbierto.set(false)"
      ></ion-toast>
    </ion-content>
  `,
  styles: [`
    section { margin-block: 1.5rem; }
    form { display: grid; gap: 0.5rem; }
    form > input {
      border: 1px solid var(--ion-color-medium);
      border-radius: 0.25rem;
      font: inherit;
      padding: 0.65rem;
    }
  `],
})
export class RecintoPage {
  readonly escrutinio = inject(EscrutinioStateService);
  private readonly auth = inject(AuthStateService);
  private readonly actaEditor = viewChild(ActaEditorComponent);

  readonly dignidades: readonly Dignidad[] = ['ALCALDE', 'PREFECTO'];
  readonly recinto = computed(() => this.escrutinio.recintos().at(0) ?? null);
  readonly jrvsDisponibles = computed(() =>
    this.escrutinio.jrvs().filter((jrv) => !jrv.veedorId),
  );
  readonly actaSeleccionada = computed(() =>
    this.escrutinio.actas().find((acta) => acta.id === this.actaSeleccionadaId()) ?? null,
  );
  readonly estadoAlta = signal<RequestState<Usuario>>({ status: 'idle' });
  readonly estadoAsignacion = signal<RequestState<unknown>>({ status: 'idle' });
  readonly toastAbierto = signal(false);
  readonly toastMensaje = signal('');
  readonly formularioVeedor = new FormGroup({
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, cedulaEcuatorianaValidator()],
    }),
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    apellidos: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    telefono: new FormControl('', { nonNullable: true }),
    jrvIds: new FormControl<string[]>([], {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  private readonly actaSeleccionadaId = signal('');

  ionViewWillEnter(): void {
    this.auth.limpiarError();
    this.escrutinio.limpiarErrores();
    this.actaEditor()?.limpiarErrores();
    this.limpiarEstadoLocal(this.estadoAlta);
    this.limpiarEstadoLocal(this.estadoAsignacion);
    this.toastAbierto.set(false);
  }

  async crearVeedor(): Promise<void> {
    if (this.formularioVeedor.invalid) {
      this.formularioVeedor.markAllAsTouched();
      return;
    }

    const coordinador = this.auth.usuarioActual();
    if (coordinador?.rol !== 'RECINTO' || !coordinador.recintoId) {
      this.estadoAlta.set({
        status: 'error',
        error: 'El perfil no tiene un recinto asignado.',
      });
      return;
    }

    this.estadoAlta.set({ status: 'loading' });
    const datos = this.formularioVeedor.getRawValue();
    try {
      const veedor = await this.auth.crearUsuarioSubordinado({
        cedula: datos.cedula,
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        email: datos.email,
        telefono: datos.telefono.trim() || null,
        rol: 'VEEDOR',
        recintoId: coordinador.recintoId,
        jrvIds: datos.jrvIds,
      });
      this.estadoAlta.set({
        status: 'success',
        data: veedor,
        message: 'El veedor recibió un correo para confirmar su cuenta.',
      });
      this.formularioVeedor.reset({
        cedula: '',
        nombres: '',
        apellidos: '',
        email: '',
        telefono: '',
        jrvIds: [],
      });
      this.mostrarToast('Veedor creado y asignado correctamente.');
    } catch (error) {
      this.estadoAlta.set({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'No se pudo crear el veedor. Inténtalo nuevamente.',
      });
    }
  }

  async actualizarAsignacion(jrvId: string, value: unknown): Promise<void> {
    if (typeof value !== 'string') {
      this.estadoAsignacion.set({
        status: 'error',
        error: 'La asignación seleccionada no es válida.',
      });
      return;
    }

    this.estadoAsignacion.set({ status: 'loading' });
    try {
      await this.escrutinio.asignarVeedorAJrv(jrvId, value || null);
      this.estadoAsignacion.set({
        status: 'success',
        data: undefined,
        message: 'La asignación de la JRV se actualizó.',
      });
      this.mostrarToast('Asignación de veedor actualizada.');
    } catch (error) {
      this.estadoAsignacion.set({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'No se pudo actualizar la asignación.',
      });
    }
  }

  seleccionarActa(acta: ActaElectoral): void {
    this.actaSeleccionadaId.set(acta.id);
  }

  cerrarAuditoria(): void {
    this.actaSeleccionadaId.set('');
  }

  estadoActa(jrvId: string, dignidad: Dignidad): string {
    const acta = this.escrutinio.actaPara(jrvId, dignidad);
    if (!acta) {
      return 'Pendiente';
    }
    if (acta.auditadaPorCoordinador || acta.bloqueada) {
      return 'Auditada o bloqueada';
    }
    return 'Ingresada, pendiente de auditoría';
  }

  etiquetaJrv(numero: number): string {
    return `JRV-${String(numero).padStart(2, '0')}`;
  }

  etiquetaJrvNumero(jrvId: string): string {
    const jrv = this.escrutinio.jrvs().find((item) => item.id === jrvId);
    return jrv ? this.etiquetaJrv(jrv.numero) : jrvId;
  }

  private mostrarToast(mensaje: string): void {
    this.toastMensaje.set(mensaje);
    this.toastAbierto.set(true);
  }

  private limpiarEstadoLocal<T>(state: ReturnType<typeof signal<RequestState<T>>>): void {
    if (state().status === 'error') {
      state.set({ status: 'idle' });
    }
  }
}
