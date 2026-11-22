import {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

const CAMPOS_VOTOS = [
  'votosOrg1',
  'votosOrg2',
  'votosOrg3',
  'votosOrg4',
  'votosOrg5',
  'votosNulos',
  'votosBlancos',
] as const;
const CAMPO_TOTAL = 'totalSufragantes';

function esEnteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number'
    && Number.isInteger(valor)
    && valor >= 0;
}

export function actaCuadreValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const campos = [...CAMPOS_VOTOS, CAMPO_TOTAL] as const;
    const valores: number[] = [];
    const invalidos: string[] = [];

    for (const campo of campos) {
      const valor = control.get(campo)?.value;
      if (esEnteroNoNegativo(valor)) {
        valores.push(valor);
      } else {
        invalidos.push(campo);
      }
    }

    if (invalidos.length > 0) {
      return {
        votosInvalidos: {
          campos: invalidos,
          mensaje: 'Todos los votos deben ser enteros mayores o iguales a cero.',
        },
      };
    }

    const sumaCalculada = valores
      .slice(0, CAMPOS_VOTOS.length)
      .reduce((suma, votos) => suma + votos, 0);
    const totalSufragantes = valores[CAMPOS_VOTOS.length];

    if (sumaCalculada === totalSufragantes) {
      return null;
    }

    return {
      descuadreActa: {
        sumaCalculada,
        totalSufragantes,
        diferencia: sumaCalculada - totalSufragantes,
      },
    };
  };
}
