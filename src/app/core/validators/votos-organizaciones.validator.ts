import type { VotosOrganizaciones } from '../models/acta-electoral.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVotosOrganizaciones(
  value: unknown,
): value is VotosOrganizaciones {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);
  return entries.length === 5 &&
    entries.every(([, votos]) => typeof votos === 'number' && Number.isFinite(votos));
}
