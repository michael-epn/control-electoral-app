import { isVotosOrganizaciones } from './votos-organizaciones.validator';

describe('isVotosOrganizaciones', () => {
  it('accepts a map with five organization IDs and numeric vote counts', () => {
    expect(isVotosOrganizaciones({
      orgA: 10,
      orgB: 20,
      orgC: 30,
      orgD: 40,
      orgE: 50,
    })).toBe(true);
  });

  it('rejects maps with a different number of organizations or non-numeric votes', () => {
    expect(isVotosOrganizaciones({ orgA: 10, orgB: 20 })).toBe(false);
    expect(isVotosOrganizaciones({
      orgA: 10,
      orgB: 20,
      orgC: 30,
      orgD: 40,
      orgE: '50',
    })).toBe(false);
  });
});
