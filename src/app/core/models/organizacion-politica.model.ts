export const SIGLAS_ORGANIZACION = ['MUP', 'FCS', 'ARP', 'PDT', 'CPM'] as const;

export type SiglaOrganizacion = (typeof SIGLAS_ORGANIZACION)[number];

export interface OrganizacionPolitica {
  readonly id: string;
  readonly nombre: string;
  readonly sigla: string;
}
