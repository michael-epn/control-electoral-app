export type RequestState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly data: T;
      readonly message?: string;
    }
  | {
      readonly status: 'error';
      readonly error: string;
      readonly message?: string;
    };
