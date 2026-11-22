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
      background: #c62828;
      border-radius: 0.25rem;
      color: #ffffff;
      padding: 0.75rem;
    }
    .success {
      background: #2e7d32;
      border-radius: 0.25rem;
      color: #ffffff;
      padding: 0.75rem;
    }
  `],
})
export class UiFeedbackComponent {
  readonly requestState = input.required<RequestState<unknown>>();
}
