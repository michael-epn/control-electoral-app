import { FormControl, FormGroup } from '@angular/forms';
import { actaCuadreValidator } from './acta-cuadre.validator';

describe('actaCuadreValidator', () => {
  function crearFormulario(
    valores: Partial<Record<string, number>> = {},
  ): FormGroup {
    return new FormGroup(
      {
        votosOrg1: new FormControl(valores['votosOrg1'] ?? 1),
        votosOrg2: new FormControl(valores['votosOrg2'] ?? 2),
        votosOrg3: new FormControl(valores['votosOrg3'] ?? 3),
        votosOrg4: new FormControl(valores['votosOrg4'] ?? 4),
        votosOrg5: new FormControl(valores['votosOrg5'] ?? 5),
        votosNulos: new FormControl(valores['votosNulos'] ?? 1),
        votosBlancos: new FormControl(valores['votosBlancos'] ?? 1),
        totalSufragantes: new FormControl(valores['totalSufragantes'] ?? 17),
      },
      { validators: actaCuadreValidator() },
    );
  }

  it('returns null when the total matches the sum of all votes', () => {
    expect(crearFormulario().errors).toBeNull();
  });

  it('returns the calculated sum, total, and difference when totals do not match', () => {
    const form = crearFormulario({ totalSufragantes: 20 });

    expect(form.errors).toEqual({
      descuadreActa: {
        sumaCalculada: 17,
        totalSufragantes: 20,
        diferencia: -3,
      },
    });
  });

  it('rejects negative vote counts', () => {
    const form = crearFormulario({ votosOrg3: -1, totalSufragantes: 13 });

    expect(form.errors).toEqual({
      votosInvalidos: {
        campos: ['votosOrg3'],
        mensaje: 'Todos los votos deben ser enteros mayores o iguales a cero.',
      },
    });
  });

  it('rejects fractional and missing values as invalid vote fields', () => {
    const form = crearFormulario({ votosNulos: 1.5 });
    form.removeControl('votosBlancos');

    expect(form.errors).toEqual({
      votosInvalidos: {
        campos: ['votosNulos', 'votosBlancos'],
        mensaje: 'Todos los votos deben ser enteros mayores o iguales a cero.',
      },
    });
  });
});
