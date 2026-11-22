import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonItem, IonLabel, IonToast } from '@ionic/angular';
import type { ActaElectoral } from '../../../core/models/acta-electoral.model';
import type { CoordenadasGps } from '../../../core/models/coordenadas-gps.model';
import type { Dignidad } from '../../../core/models/dignidad.model';
import { SIGLAS_ORGANIZACION } from '../../../core/models/organizacion-politica.model';
import type { RequestState } from '../../../core/models/request-state.model';
import { EscrutinioStateService } from '../../../core/services/escrutinio-state.service';
import { MediaLocationError, MediaLocationService } from '../../../core/services/media-location.service';
import { actaCuadreValidator } from '../../../core/validators/acta-cuadre.validator';
import { UiFeedbackComponent } from '../ui-feedback/ui-feedback.component';

function enteroNoNegativo(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function crearControlVotos(): FormControl<number> {
  return new FormControl(0, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.min(0),
      (control) => enteroNoNegativo(control.value) ? null : { enteroInvalido: true },
    ],
  });
}

@Component({
  selector: 'app-acta-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonItem,
    IonLabel,
    IonToast,
    UiFeedbackComponent,
  ],
  template: `
    <section class="acta-editor">
      <h3>{{ auditoria() ? 'Auditar y corregir acta' : 'Registrar o corregir acta' }}</h3>
      <p>{{ dignidad() }} · {{ jrvId() }}</p>
      @if (actaBloqueada()) {
        <p role="status">Esta acta ya fue auditada o bloqueada y no admite cambios.</p>
      }

      <app-ui-feedback [requestState]="estadoEnvio()" />
      <form [formGroup]="formulario" (ngSubmit)="guardar()">
        <fieldset>
          <legend>Votos por organización política</legend>
          @for (sigla of siglasOrganizacion; track sigla; let indice = $index) {
            <ion-item>
              <ion-label [attr.for]="'votos-' + sigla">{{ sigla }}</ion-label>
              <input
                [id]="'votos-' + sigla"
                [formControlName]="'votosOrg' + (indice + 1)"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                required
              />
            </ion-item>
          }
          <ion-item>
            <ion-label for="votos-nulos">Votos nulos</ion-label>
            <input id="votos-nulos" formControlName="votosNulos" type="number" min="0" step="1" required />
          </ion-item>
          <ion-item>
            <ion-label for="votos-blancos">Votos blancos</ion-label>
            <input id="votos-blancos" formControlName="votosBlancos" type="number" min="0" step="1" required />
          </ion-item>
          <ion-item>
            <ion-label for="total-sufragantes">Total de sufragantes</ion-label>
            <input id="total-sufragantes" formControlName="totalSufragantes" type="number" min="0" step="1" required />
          </ion-item>
        </fieldset>

        <p aria-live="polite">
          Suma calculada: {{ sumaCalculada() }} · Diferencia: {{ diferencia() }}
        </p>
        @if (formulario.hasError('descuadreActa')) {
          <p role="alert">La suma de los votos debe coincidir con el total de sufragantes.</p>
        }
        @if (formulario.hasError('votosInvalidos')) {
          <p role="alert">Ingresa cantidades enteras mayores o iguales a cero en todos los campos.</p>
        }

        <div class="capture-actions">
          <ion-button
            type="button"
            [disabled]="fotoState().status === 'loading' || actaBloqueada()"
            (click)="capturarFoto()"
          >
            Capturar Foto del Acta
          </ion-button>
          <app-ui-feedback [requestState]="fotoState()" />
          @if (auditoria() && acta()?.fotoUrl && fotoState().status !== 'success') {
            <p>
              Se conservará la evidencia existente:
              <a [href]="acta()?.fotoUrl" target="_blank" rel="noopener noreferrer">
                ver fotografía
              </a>
            </p>
          }
          @if (fotoState().status === 'success') {
            <p>Foto nítida capturada y lista para enviar.</p>
          }
        </div>

        <div class="capture-actions">
          <ion-button
            type="button"
            [disabled]="gpsState().status === 'loading' || actaBloqueada()"
            (click)="capturarGps()"
          >
            {{ gpsState().status === 'error' ? 'Reintentar GPS' : 'Actualizar GPS' }}
          </ion-button>
          <app-ui-feedback [requestState]="gpsState()" />
          @if (gpsState(); as gps) {
            @if (gps.status === 'success') {
              <p>Ubicación: {{ gps.data.lat }}, {{ gps.data.lng }}</p>
            }
          }
        </div>

        <ion-button
          type="submit"
          expand="block"
          [disabled]="!puedeGuardar()"
        >
          {{ estadoEnvio().status === 'loading'
            ? 'Enviando…'
            : auditoria() ? 'Guardar corrección y auditar' : 'Guardar acta' }}
        </ion-button>
      </form>

      <ion-toast
        [isOpen]="toastAbierto()"
        [message]="toastMensaje()"
        [duration]="2500"
        (didDismiss)="toastAbierto.set(false)"
      ></ion-toast>
    </section>
  `,
  styles: [`
    .acta-editor { display: block; padding-block: 1rem; }
    fieldset { border: 0; margin: 0; padding: 0; }
    legend { font-weight: 600; padding-block: 0.75rem; }
    ion-item input {
      border: 0;
      font: inherit;
      max-width: 7rem;
      padding: 0.5rem;
      text-align: end;
    }
    .capture-actions { margin-block: 1rem; }
  `],
})
export class ActaEditorComponent {
  readonly recintoId = input.required<string>();
  readonly jrvId = input.required<string>();
  readonly dignidad = input.required<Dignidad>();
  readonly acta = input<ActaElectoral | null>(null);
  readonly auditoria = input(false);

  readonly siglasOrganizacion = SIGLAS_ORGANIZACION;
  readonly estadoEnvio = signal<RequestState<ActaElectoral>>({ status: 'idle' });
  readonly fotoState = signal<RequestState<Blob>>({ status: 'idle' });
  readonly gpsState = signal<RequestState<CoordenadasGps>>({ status: 'idle' });
  readonly toastAbierto = signal(false);
  readonly toastMensaje = signal('');

  readonly formulario = new FormGroup(
    {
      votosOrg1: crearControlVotos(),
      votosOrg2: crearControlVotos(),
      votosOrg3: crearControlVotos(),
      votosOrg4: crearControlVotos(),
      votosOrg5: crearControlVotos(),
      votosNulos: crearControlVotos(),
      votosBlancos: crearControlVotos(),
      totalSufragantes: crearControlVotos(),
    },
    { validators: actaCuadreValidator() },
  );

  readonly sumaCalculada = computed(() => {
    this.revisionFormulario();
    const valores = this.formulario.getRawValue();
    return valores.votosOrg1
      + valores.votosOrg2
      + valores.votosOrg3
      + valores.votosOrg4
      + valores.votosOrg5
      + valores.votosNulos
      + valores.votosBlancos;
  });
  readonly diferencia = computed(() => {
    this.revisionFormulario();
    return this.sumaCalculada() - this.formulario.controls.totalSufragantes.value;
  });
  readonly actaBloqueada = computed(() => {
    const actual = this.acta();
    return actual?.auditadaPorCoordinador === true || actual?.bloqueada === true;
  });

  private readonly escrutinio = inject(EscrutinioStateService);
  private readonly media = inject(MediaLocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly revisionFormulario = signal(0);
  private readonly claveSeleccion = computed(() =>
    `${this.recintoId()}|${this.jrvId()}|${this.dignidad()}|${this.acta()?.id ?? 'nuevo'}`,
  );
  private ultimaClaveSeleccion = '';

  constructor() {
    const subscription = this.formulario.valueChanges.subscribe(() => {
      this.revisionFormulario.update((revision) => revision + 1);
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());

    effect(() => {
      const clave = this.claveSeleccion();
      if (clave === this.ultimaClaveSeleccion) {
        return;
      }
      this.ultimaClaveSeleccion = clave;
      const actual = untracked(() => this.acta());
      this.cargarActa(actual);
      this.fotoState.set({ status: 'idle' });
      this.gpsState.set({ status: 'idle' });
      this.estadoEnvio.set({ status: 'idle' });
      this.toastAbierto.set(false);
      void this.capturarGps();
    });
  }

  limpiarErrores(): void {
    if (this.estadoEnvio().status === 'error') {
      this.estadoEnvio.set({ status: 'idle' });
    }
    if (this.fotoState().status === 'error') {
      this.fotoState.set({ status: 'idle' });
    }
    if (this.gpsState().status === 'error') {
      this.gpsState.set({ status: 'idle' });
      void this.capturarGps();
    }
    this.toastAbierto.set(false);
  }

  async capturarFoto(): Promise<void> {
    this.fotoState.set({ status: 'loading' });
    try {
      const foto = await this.media.capturarActaNitida();
      this.fotoState.set({
        status: 'success',
        data: foto,
        message: 'Fotografía validada.',
      });
    } catch (error) {
      this.fotoState.set({
        status: 'error',
        error: error instanceof MediaLocationError
          ? error.message
          : 'No se pudo capturar la fotografía. Inténtalo nuevamente.',
      });
    }
  }

  async capturarGps(): Promise<void> {
    this.gpsState.set({ status: 'loading' });
    try {
      const gps = await this.media.obtenerUbicacionActa();
      this.gpsState.set({ status: 'success', data: gps });
    } catch (error) {
      this.gpsState.set({
        status: 'error',
        error: error instanceof MediaLocationError
          ? error.message
          : 'No se pudo obtener la ubicación. Inténtalo nuevamente.',
      });
    }
  }

  async guardar(): Promise<void> {
    if (!this.puedeGuardar()) {
      this.formulario.markAllAsTouched();
      return;
    }

    const foto = this.fotoState();
    const gps = this.gpsState();
    if (foto.status !== 'success' || gps.status !== 'success') {
      return;
    }

    this.estadoEnvio.set({ status: 'loading' });
    try {
      const valores = this.formulario.getRawValue();
      const acta = await this.escrutinio.guardarActa({
        recintoId: this.recintoId(),
        jrvId: this.jrvId(),
        dignidad: this.dignidad(),
        votosOrganizaciones: {
          MUP: valores.votosOrg1,
          FCS: valores.votosOrg2,
          ARP: valores.votosOrg3,
          PDT: valores.votosOrg4,
          CPM: valores.votosOrg5,
        },
        votosNulos: valores.votosNulos,
        votosBlancos: valores.votosBlancos,
        totalSufragantes: valores.totalSufragantes,
        ...(foto.status === 'success' ? { foto: foto.data } : {}),
        gps: gps.data,
        auditadaPorCoordinador: this.auditoria(),
      });
      const state = this.escrutinio.guardarActaState();
      const message = state.status === 'success'
        ? state.message ?? 'El acta se guardó correctamente.'
        : 'El acta se guardó correctamente.';
      this.estadoEnvio.set({
        status: 'success',
        data: acta,
        message,
      });
      this.toastMensaje.set(message);
      this.toastAbierto.set(true);
    } catch (error) {
      this.estadoEnvio.set({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'No se pudo guardar el acta. Inténtalo nuevamente.',
      });
    }
  }

  puedeGuardar(): boolean {
    const evidenciaExistente = this.auditoria()
      && Boolean(this.acta()?.fotoPath && this.acta()?.fotoUrl);
    const fotoValida = this.fotoState().status === 'success' || evidenciaExistente;
    return this.formulario.valid
      && fotoValida
      && this.gpsState().status === 'success'
      && this.estadoEnvio().status !== 'loading'
      && !this.actaBloqueada();
  }

  private cargarActa(acta: ActaElectoral | null): void {
    this.formulario.reset({
      votosOrg1: acta?.votosOrganizaciones['MUP'] ?? 0,
      votosOrg2: acta?.votosOrganizaciones['FCS'] ?? 0,
      votosOrg3: acta?.votosOrganizaciones['ARP'] ?? 0,
      votosOrg4: acta?.votosOrganizaciones['PDT'] ?? 0,
      votosOrg5: acta?.votosOrganizaciones['CPM'] ?? 0,
      votosNulos: acta?.votosNulos ?? 0,
      votosBlancos: acta?.votosBlancos ?? 0,
      totalSufragantes: acta?.totalSufragantes ?? 0,
    });
  }
}
