import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export interface EvaluacionNitidez {
  readonly esNitida: boolean;
  readonly varianzaLaplaciana: number;
}

@Injectable({ providedIn: 'root' })
export class ImageQualityService {
  private readonly documentRef = inject(DOCUMENT);

  async evaluarNitidez(
    base64OrDataUrl: string,
  ): Promise<EvaluacionNitidez> {
    const source = this.normalizarOrigen(base64OrDataUrl);
    const image = await this.cargarImagen(source);
    const canvas = this.documentRef.createElement('canvas');
    canvas.hidden = true;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('La imagen no contiene dimensiones válidas.');
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('No fue posible preparar la imagen para validar su nitidez.');
    }

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const grises = this.convertirAEscalaDeGrises(data);
    const varianzaLaplaciana = this.calcularVarianzaLaplaciana(
      grises,
      canvas.width,
      canvas.height,
    );

    return {
      esNitida: varianzaLaplaciana >= 100,
      varianzaLaplaciana,
    };
  }

  private normalizarOrigen(value: string): string {
    const source = value.trim();
    if (!source) {
      throw new Error('No se recibió una imagen para validar.');
    }

    if (source.startsWith('data:')) {
      if (!/^data:image\/[\w.+-]+;base64,/i.test(source)) {
        throw new Error('El formato de la imagen no es válido.');
      }
      return source;
    }

    return `data:image/jpeg;base64,${source.replace(/\s/g, '')}`;
  }

  private cargarImagen(source: string): Promise<HTMLImageElement> {
    const image = this.documentRef.createElement('img');

    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(
        new Error('No se pudo cargar la imagen para validar su nitidez.'),
      );
      image.src = source;
    });
  }

  private convertirAEscalaDeGrises(pixels: Uint8ClampedArray): Float64Array {
    const grises = new Float64Array(pixels.length / 4);
    for (let pixel = 0; pixel < grises.length; pixel++) {
      const offset = pixel * 4;
      grises[pixel] = pixels[offset] * 0.299
        + pixels[offset + 1] * 0.587
        + pixels[offset + 2] * 0.114;
    }
    return grises;
  }

  private calcularVarianzaLaplaciana(
    grises: Float64Array,
    width: number,
    height: number,
  ): number {
    let count = 0;
    let mean = 0;
    let sumOfSquares = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        const response = grises[index - width]
          + grises[index - 1]
          - 4 * grises[index]
          + grises[index + 1]
          + grises[index + width];

        count++;
        const delta = response - mean;
        mean += delta / count;
        sumOfSquares += delta * (response - mean);
      }
    }

    return count === 0 ? 0 : Math.max(0, sumOfSquares / count);
  }
}
