import { computed, signal } from '@angular/core';
import type { RequestState } from '../models/request-state.model';

export class RequestStateStore<T> {
  readonly state = signal<RequestState<T>>({ status: 'idle' });
  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly isSuccess = computed(() => this.state().status === 'success');
  readonly isError = computed(() => this.state().status === 'error');

  setLoading(): void {
    this.state.set({ status: 'loading' });
  }

  setSuccess(data: T, message?: string): void {
    this.state.set(message === undefined
      ? { status: 'success', data }
      : { status: 'success', data, message });
  }

  setError(error: string, message?: string): void {
    this.state.set(message === undefined
      ? { status: 'error', error }
      : { status: 'error', error, message });
  }

  reset(): void {
    this.state.set({ status: 'idle' });
  }
}
