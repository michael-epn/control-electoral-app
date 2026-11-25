import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import type { RequestState } from '../../../core/models/request-state.model';
import { EscrutinioStateService } from '../../../core/services/escrutinio-state.service';
import { UiFeedbackComponent } from '../ui-feedback/ui-feedback.component';

function mensajeDe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo renovar el enlace de la evidencia.';
}

@Component({
  selector: 'app-acta-photo',
  standalone: true,
  imports: [IonButton, UiFeedbackComponent],
  template: `
    @if (urlActual()) {
      <a [href]="urlActual()" target="_blank" rel="noopener noreferrer">Ver fotografía</a>
    }
    @if (fotoPath()) {
      <ion-button
        type="button"
        fill="clear"
        size="small"
        [disabled]="estado().status === 'loading'"
        (click)="renovarEnlace()"
      >
        {{ estado().status === 'loading' ? 'Renovando enlace…' : 'Renovar enlace' }}
      </ion-button>
    }
    @if (estado().status !== 'idle') {
      <app-ui-feedback [requestState]="estado()" />
    }
  `,
})
export class ActaPhotoComponent {
  readonly fotoPath = input<string | null>(null);
  readonly fotoUrl = input<string | null>(null);
  readonly estado = signal<RequestState<string>>({ status: 'idle' });
  private readonly urlRenovada = signal<{ readonly path: string; readonly url: string } | null>(null);
  private readonly escrutinio = inject(EscrutinioStateService);
  readonly urlActual = computed(() => {
    const renovada = this.urlRenovada();
    return renovada?.path === this.fotoPath()
      ? renovada.url
      : this.fotoUrl();
  });

  async renovarEnlace(): Promise<void> {
    const path = this.fotoPath();
    if (!path) {
      this.estado.set({ status: 'error', error: 'El acta no tiene una ruta de evidencia.' });
      return;
    }

    this.estado.set({ status: 'loading' });
    try {
      const signedUrl = await this.escrutinio.obtenerUrlFotoActa(path);
      this.urlRenovada.set({ path, url: signedUrl });
      this.estado.set({
        status: 'success',
        data: signedUrl,
        message: 'Enlace de evidencia renovado.',
      });
    } catch (error) {
      this.estado.set({ status: 'error', error: mensajeDe(error) });
    }
  }
}
