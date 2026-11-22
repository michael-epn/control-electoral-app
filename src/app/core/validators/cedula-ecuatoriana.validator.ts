import {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

const MENSAJE_CEDULA_INVALIDA =
  'Ingresa una cédula ecuatoriana válida de 10 dígitos.';

export function validarCedulaEcuatoriana(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) {
    return false;
  }

  const provincia = Number(cedula.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) {
    return false;
  }

  if (Number(cedula[2]) >= 6) {
    return false;
  }

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const suma = coeficientes.reduce((total, coeficiente, indice) => {
    const producto = Number(cedula[indice]) * coeficiente;
    return total + (producto >= 10 ? producto - 9 : producto);
  }, 0);
  const digitoVerificador = (10 - (suma % 10)) % 10;

  return digitoVerificador === Number(cedula[9]);
}

export function cedulaEcuatorianaValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor = control.value;
    if (
      typeof valor !== 'string'
      || !validarCedulaEcuatoriana(valor)
    ) {
      return {
        cedulaInvalida: {
          mensaje: MENSAJE_CEDULA_INVALIDA,
        },
      };
    }

    return null;
  };
}
