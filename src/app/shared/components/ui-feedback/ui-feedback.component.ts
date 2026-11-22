import { Component, input } from '@angular/core';
import {
  IonSkeletonText,
  IonSpinner,
} from '@ionic/angular';
import type { RequestState } from '../../../core/models/request-state.model';

@Component({
  selector: 'app-ui-feedback',
  standalone: true,
  imports: [IonSkeletonText, IonSpinner],
  template: `
    @let state = requestState();
    @switch (state.status) {
      @case ('loading') {
        <div class="loading" role="status" aria-live="polite">
          <ion-spinner aria-label="Cargando"></ion-spinner>
          <ion-skeleton-text [animated]="true"></ion-skeleton-text>
        </div>
      }
      @case ('error') {
        <div class="error" role="alert">
          {{ state.message ?? state.error }}
        </div>
      }
      @case ('success') {
        @if (state.message) {
          <p class="success" role="status" aria-live="polite">{{ state.message }}</p>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .loading { align-items: center; display: flex; gap: 0.75rem; }
    ion-skeleton-text { margin: 0; width: min(100%, 16rem); }
    .error {
      background: var(--ion-color-danger-tint, #fce8e8);
      border-radius: 0.25rem;
      color: var(--ion-color-danger-shade, #8b0000);
      padding: 0.75rem;
    }
    .success { color: var(--ion-color-success-shade, #1d6b37); }
  `],
})
export class UiFeedbackComponent {
  readonly requestState = input.required<RequestState<unknown>>();
}
