import {
  cedulaEcuatorianaValidator,
  validarCedulaEcuatoriana,
} from './cedula-ecuatoriana.validator';
import { FormControl } from '@angular/forms';

describe('validarCedulaEcuatoriana', () => {
  it('accepts a valid cédula with a valid province and check digit', () => {
    expect(validarCedulaEcuatoriana('0102030400')).toBe(true);
    expect(validarCedulaEcuatoriana('3002030405')).toBe(true);
  });

  it('rejects values whose length is not exactly ten digits', () => {
    expect(validarCedulaEcuatoriana('010203040')).toBe(false);
    expect(validarCedulaEcuatoriana('01020304000')).toBe(false);
  });

  it('rejects an invalid province code', () => {
    expect(validarCedulaEcuatoriana('2502030400')).toBe(false);
  });

  it('rejects a third digit outside the natural-person range', () => {
    expect(validarCedulaEcuatoriana('0162030400')).toBe(false);
  });

  it('rejects a changed check digit and non-numeric characters', () => {
    expect(validarCedulaEcuatoriana('0102030401')).toBe(false);
    expect(validarCedulaEcuatoriana('01020304a0')).toBe(false);
  });
});

describe('cedulaEcuatorianaValidator', () => {
  const validator = cedulaEcuatorianaValidator();

  it('returns null for a valid cédula', () => {
    expect(validator(new FormControl('0102030400'))).toBeNull();
  });

  it('returns the cedulaInvalida error for an invalid value', () => {
    expect(validator(new FormControl('123'))).toEqual({
      cedulaInvalida: {
        mensaje: 'Ingresa una cédula ecuatoriana válida de 10 dígitos.',
      },
    });
  });
});
