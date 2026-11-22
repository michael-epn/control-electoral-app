import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonItem,
  IonInput,
  IonLabel,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonToast,
} from '@ionic/angular';
import type { RequestState } from '../../core/models/request-state.model';
import type { Usuario } from '../../core/models/usuario.model';
import { AuthStateService } from '../../core/services/auth-state.service';
import { EscrutinioStateService } from '../../core/services/escrutinio-state.service';
import { cedulaEcuatorianaValidator } from '../../core/validators/cedula-ecuatoriana.validator';
import { AppHeaderComponent } from '../../shared/components/app-header/app-header.component';
import { UiFeedbackComponent } from '../../shared/components/ui-feedback/ui-feedback.component';

function esEnteroPositivo(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

@Component({
  selector: 'app-provincial-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiFeedbackComponent,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonItem,
    IonInput,
    IonLabel,
    IonProgressBar,
    IonSelect,
    IonSelectOption,
    IonToast,
    AppHeaderComponent,
  ],
  template: `
    <app-header [titulo]="titulo" />
    <ion-content class="ion-padding">
      <main>
        <h1>Consolidado provincial</h1>
        <app-ui-feedback [requestState]="escrutinio.recintosState()" />
        <app-ui-feedback [requestState]="escrutinio.jrvsState()" />
        <app-ui-feedback [requestState]="escrutinio.actasState()" />
        <app-ui-feedback [requestState]="escrutinio.organizacionesState()" />

        <section aria-labelledby="dashboard-heading">
          <ion-card class="ion-margin-bottom">
            <ion-card-header>
              <ion-card-title id="dashboard-heading">Avance del escrutinio</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item>
                <ion-label>Recinto</ion-label>
                <ion-select
                  [value]="escrutinio.filtroRecintoId()"
                  interface="popover"
                  aria-label="Filtrar el dashboard por recinto"
                  (ionChange)="filtrarRecinto($event.detail.value)"
                >
                  <ion-select-option value="">Todos los recintos</ion-select-option>
                  @for (recinto of escrutinio.recintos(); track recinto.id) {
                    <ion-select-option [value]="recinto.id">
                      {{ recinto.nombre }} · {{ recinto.parroquia }}
                    </ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <p>
                {{ metricas().actasIngresadas }} de {{ metricas().totalActasEsperadas }} actas
                ({{ metricas().avancePorcentual.toFixed(1) }}%)
              </p>
              <ion-progress-bar [value]="metricas().avancePorcentual / 100"></ion-progress-bar>
              <p>{{ metricas().totalJrvs }} JRV · 2 actas esperadas por mesa.</p>
              <p>
                Los votos se reciben por organización política. El esquema actual no asocia
                cada candidatura con una organización; por eso el consolidado se presenta por sigla.
              </p>
            </ion-card-content>
          </ion-card>
          @for (dignidad of dignidades; track dignidad) {
            <ion-card class="ion-margin-bottom">
              <ion-card-header>
                <ion-card-title>Votos para {{ dignidad }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                @for (fila of metricas().votosPorDignidad[dignidad]; track fila.sigla) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ fila.sigla }} · {{ fila.nombre }}</h3>
                      <p>{{ fila.votos }} votos · {{ fila.porcentaje.toFixed(1) }}% de votos por organización</p>
                    </ion-label>
                  </ion-item>
                }
              </ion-card-content>
            </ion-card>
          }
        </section>

        <section aria-labelledby="recintos-heading">
          <h2 id="recintos-heading">Recintos y coordinadores asignados</h2>
          @for (recinto of escrutinio.recintos(); track recinto.id) {
            <ion-card class="ion-margin-bottom">
              <ion-card-header>
                <ion-card-title>{{ recinto.nombre }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <p>{{ recinto.canton }} · {{ recinto.parroquia }} · {{ recinto.cantidadJrv }} JRV</p>
                @if (recinto.coordinadorId) {
                  <p>
                    Coordinador:
                    {{ escrutinio.usuarioPorId(recinto.coordinadorId)?.nombres ?? 'Cuenta asignada' }}
                    {{ escrutinio.usuarioPorId(recinto.coordinadorId)?.apellidos ?? '' }}
                  </p>
                } @else {
                  <p>Sin Coordinador de Recinto asignado.</p>
                }
              </ion-card-content>
            </ion-card>
          }

          <ion-card class="ion-margin-bottom">
            <ion-card-header>
              <ion-card-title>Crear recinto</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <app-ui-feedback [requestState]="escrutinio.crearRecintoState()" />
              <form [formGroup]="formularioRecinto" (ngSubmit)="crearRecinto()">
                <ion-input label="Cantón" labelPlacement="stacked" fill="outline"
                  formControlName="canton" required />
                <ion-input label="Parroquia" labelPlacement="stacked" fill="outline"
                  formControlName="parroquia" required />
                <ion-input label="Nombre" labelPlacement="stacked" fill="outline"
                  formControlName="nombre" required />
                <ion-input label="Cantidad de JRV" labelPlacement="stacked" fill="outline"
                  formControlName="cantidadJrv" type="number" min="1" max="499" step="1" required />
                @if (
                  formularioRecinto.controls.cantidadJrv.touched
                  && formularioRecinto.controls.cantidadJrv.invalid
                ) {
                  <p role="alert">Ingresa una cantidad entera entre 1 y 499.</p>
                }
                <ion-button
                  type="submit"
                  expand="block"
                  [disabled]="formularioRecinto.invalid || escrutinio.crearRecintoState().status === 'loading'"
                >
                  Crear recinto y sus JRV
                </ion-button>
              </form>
            </ion-card-content>
          </ion-card>

          <ion-card class="ion-margin-bottom">
            <ion-card-header>
              <ion-card-title>Asignar Coordinador de Recinto</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <app-ui-feedback [requestState]="estadoCoordinador()" />
              <form [formGroup]="formularioCoordinador" (ngSubmit)="crearCoordinador()">
                <ion-input label="Cédula" labelPlacement="stacked" fill="outline"
                  formControlName="cedula" inputmode="numeric" maxlength="10" required />
                @if (
                  formularioCoordinador.controls.cedula.touched
                  && formularioCoordinador.controls.cedula.invalid
                ) {
                  <p role="alert">Ingresa una cédula ecuatoriana válida.</p>
                }
                <ion-input label="Nombres" labelPlacement="stacked" fill="outline"
                  formControlName="nombres" required />
                <ion-input label="Apellidos" labelPlacement="stacked" fill="outline"
                  formControlName="apellidos" required />
                <ion-input label="Correo de confirmación" labelPlacement="stacked" fill="outline"
                  formControlName="email" type="email" required />
                <ion-input label="Teléfono" labelPlacement="stacked" fill="outline"
                  formControlName="telefono" type="tel" />
                <ion-item>
                  <ion-label>Recinto sin coordinador</ion-label>
                  <ion-select
                    formControlName="recintoId"
                    interface="popover"
                    aria-label="Seleccionar recinto para el coordinador"
                  >
                    @for (recinto of recintosSinCoordinador(); track recinto.id) {
                      <ion-select-option [value]="recinto.id">{{ recinto.nombre }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <ion-button
                  type="submit"
                  expand="block"
                  [disabled]="formularioCoordinador.invalid || estadoCoordinador().status === 'loading'"
                >
                  Crear y asignar coordinador
                </ion-button>
              </form>
            </ion-card-content>
          </ion-card>
        </section>

        <section aria-labelledby="gps-heading">
          <ion-card class="ion-margin-bottom">
            <ion-card-header>
              <ion-card-title id="gps-heading">Coordenadas GPS de las actas</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @for (acta of actasFiltradas(); track acta.id) {
                <ion-item>
                  <ion-label>
                    <h3>{{ nombreRecinto(acta.recintoId) }} · {{ acta.jrvId }} · {{ acta.dignidad }}</h3>
                    <p>Latitud {{ acta.gps.lat }} · Longitud {{ acta.gps.lng }}</p>
                  </ion-label>
                  <a
                    slot="end"
                    [href]="urlMapa(acta.gps.lat, acta.gps.lng)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver mapa
                  </a>
                </ion-item>
              }
            </ion-card-content>
          </ion-card>
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
    form { display: grid; gap: 0.85rem; }
    form ion-input { width: 100%; }
  `],
})
export class ProvincialPage {
  readonly titulo = 'Coordinación Provincial · Pichincha';
  readonly escrutinio = inject(EscrutinioStateService);
  private readonly auth = inject(AuthStateService);
  readonly dignidades = ['ALCALDE', 'PREFECTO'] as const;
  readonly metricas = this.escrutinio.metricas;
  readonly recintosSinCoordinador = computed(() =>
    this.escrutinio.recintos().filter((recinto) => !recinto.coordinadorId),
  );
  readonly actasFiltradas = computed(() => {
    const recintoId = this.escrutinio.filtroRecintoId();
    return this.escrutinio.actas().filter(
      (acta) => !recintoId || acta.recintoId === recintoId,
    );
  });
  readonly estadoCoordinador = signal<RequestState<Usuario>>({ status: 'idle' });
  readonly toastAbierto = signal(false);
  readonly toastMensaje = signal('');

  readonly formularioRecinto = new FormGroup({
    canton: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    parroquia: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    cantidadJrv: new FormControl(1, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(499),
        (control) => esEnteroPositivo(control.value) ? null : { enteroInvalido: true },
      ],
    }),
  });

  readonly formularioCoordinador = new FormGroup({
    cedula: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, cedulaEcuatorianaValidator()],
    }),
    nombres: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    apellidos: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    telefono: new FormControl('', { nonNullable: true }),
    recintoId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ionViewWillEnter(): void {
    this.auth.limpiarError();
    this.escrutinio.limpiarErrores();
    if (this.estadoCoordinador().status === 'error') {
      this.estadoCoordinador.set({ status: 'idle' });
    }
    this.toastAbierto.set(false);
  }

  filtrarRecinto(value: unknown): void {
    this.escrutinio.filtroRecintoId.set(typeof value === 'string' ? value : '');
  }

  async crearRecinto(): Promise<void> {
    if (this.formularioRecinto.invalid) {
      this.formularioRecinto.markAllAsTouched();
      return;
    }

    try {
      const recinto = await this.escrutinio.crearRecinto(
        this.formularioRecinto.getRawValue(),
      );
      this.formularioRecinto.reset({
        canton: '',
        parroquia: '',
        nombre: '',
        cantidadJrv: 1,
      });
      this.mostrarToast(`Recinto ${recinto.nombre} creado correctamente.`);
    } catch (error) {
      this.escrutinio.crearRecintoState.set({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'No se pudo crear el recinto. Inténtalo nuevamente.',
      });
    }
  }

  async crearCoordinador(): Promise<void> {
    if (this.formularioCoordinador.invalid) {
      this.formularioCoordinador.markAllAsTouched();
      return;
    }

    const provincial = this.auth.usuarioActual();
    if (provincial?.rol !== 'PROVINCIAL') {
      this.estadoCoordinador.set({
        status: 'error',
        error: 'Solo el Coordinador Provincial puede crear coordinadores de recinto.',
      });
      return;
    }

    this.estadoCoordinador.set({ status: 'loading' });
    const datos = this.formularioCoordinador.getRawValue();
    try {
      const usuario = await this.auth.crearUsuarioSubordinado({
        ...datos,
        telefono: datos.telefono.trim() || null,
        rol: 'RECINTO',
      });
      this.estadoCoordinador.set({
        status: 'success',
        data: usuario,
        message: 'El coordinador recibió un correo para confirmar su cuenta.',
      });
      this.formularioCoordinador.reset({
        cedula: '',
        nombres: '',
        apellidos: '',
        email: '',
        telefono: '',
        recintoId: '',
      });
      this.mostrarToast('Coordinador creado y asignado al recinto.');
    } catch (error) {
      this.estadoCoordinador.set({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'No se pudo crear el coordinador. Inténtalo nuevamente.',
      });
    }
  }

  nombreRecinto(recintoId: string): string {
    return this.escrutinio.recintos().find((recinto) => recinto.id === recintoId)?.nombre
      ?? recintoId;
  }

  urlMapa(lat: number, lng: number): string {
    return `https://maps.google.com/?q=${lat},${lng}`;
  }

  private mostrarToast(mensaje: string): void {
    this.toastMensaje.set(mensaje);
    this.toastAbierto.set(true);
  }
}
