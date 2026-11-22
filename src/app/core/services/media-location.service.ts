import { Injectable, inject } from '@angular/core';
import {
  Camera,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import type { Position } from '@capacitor/geolocation';
import type { CoordenadasGps } from '../models/coordenadas-gps.model';
import { ImageQualityService } from './image-quality.service';

export class MediaLocationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MediaLocationError';
  }
}

function esTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const rawMessage = 'message' in error ? error.message : undefined;
  const message = typeof rawMessage === 'string'
    ? rawMessage
    : '';

  return code === 3
    || code === '3'
    || (typeof code === 'string' && /timeout/i.test(code))
    || /timed?\s*out|timeout|tiempo.*(?:agotado|espera)/i.test(message);
}

@Injectable({ providedIn: 'root' })
export class MediaLocationService {
  private readonly imageQuality = inject(ImageQualityService);

  async capturarActaNitida(): Promise<Blob> {
    await this.verificarPermisoCamara();

    let foto: Photo;
    try {
      foto = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        width: 1280,
        quality: 80,
      });
    } catch (error) {
      throw new MediaLocationError(
        'No se pudo capturar la fotografía. Verifica la cámara e inténtalo nuevamente.',
        { cause: error },
      );
    }

    if (!foto.dataUrl) {
      throw new MediaLocationError('La cámara no devolvió una imagen válida.');
    }

    let evaluacion: Awaited<ReturnType<ImageQualityService['evaluarNitidez']>>;
    try {
      evaluacion = await this.imageQuality.evaluarNitidez(foto.dataUrl);
    } catch (error) {
      throw new MediaLocationError(
        'No se pudo procesar la fotografía del acta. Inténtalo nuevamente.',
        { cause: error },
      );
    }

    if (!evaluacion.esNitida) {
      throw new MediaLocationError(
        'La fotografía está borrosa, enfoque el acta e intente nuevamente.',
      );
    }

    return this.convertirDataUrlABlob(foto.dataUrl);
  }

  async obtenerUbicacionActa(): Promise<CoordenadasGps> {
    await this.verificarPermisoUbicacion();

    let posicion: Position;
    try {
      posicion = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
    } catch (error) {
      if (!esTimeout(error)) {
        throw new MediaLocationError(
          'No se pudo obtener la ubicación. Verifica los servicios de ubicación e inténtalo nuevamente.',
          { cause: error },
        );
      }

      try {
        posicion = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
        });
      } catch (fallbackError) {
        throw new MediaLocationError(
          'No se pudo obtener la ubicación, incluso con precisión balanceada. Verifica la señal e inténtalo nuevamente.',
          { cause: fallbackError },
        );
      }
    }

    const { latitude, longitude } = posicion.coords;
    if (
      !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
    ) {
      throw new MediaLocationError('El dispositivo devolvió coordenadas inválidas.');
    }

    return { lat: latitude, lng: longitude };
  }

  private async verificarPermisoCamara(): Promise<void> {
    let permisos;
    try {
      permisos = await Camera.checkPermissions();
      if (permisos.camera !== 'granted') {
        permisos = await Camera.requestPermissions({ permissions: ['camera'] });
      }
    } catch (error) {
      throw new MediaLocationError(
        'No se pudo verificar el permiso de cámara. Revisa los permisos de la aplicación.',
        { cause: error },
      );
    }

    if (permisos.camera !== 'granted') {
      throw new MediaLocationError(
        'Se requiere permiso de cámara para fotografiar el acta. Habilítalo en los ajustes de la aplicación.',
      );
    }
  }

  private async verificarPermisoUbicacion(): Promise<void> {
    let permisos;
    try {
      permisos = await Geolocation.checkPermissions();
      if (
        permisos.location !== 'granted'
        && permisos.coarseLocation !== 'granted'
      ) {
        permisos = await Geolocation.requestPermissions({
          permissions: ['location'],
        });
      }
    } catch (error) {
      throw new MediaLocationError(
        'No se pudo verificar el permiso de ubicación. Habilita los servicios de ubicación e inténtalo nuevamente.',
        { cause: error },
      );
    }

    if (
      permisos.location !== 'granted'
      && permisos.coarseLocation !== 'granted'
    ) {
      throw new MediaLocationError(
        'Se requiere permiso de ubicación para registrar el acta. Habilítalo en los ajustes de la aplicación.',
      );
    }
  }

  private convertirDataUrlABlob(dataUrl: string): Blob {
    const [header, encoded] = dataUrl.split(',', 2);
    const match = /^data:(image\/[\w.+-]+);base64$/i.exec(header);
    if (!match || !encoded) {
      throw new MediaLocationError('La cámara devolvió una imagen en formato inválido.');
    }

    let binary: string;
    try {
      binary = atob(encoded);
    } catch (error) {
      throw new MediaLocationError('No se pudo convertir la fotografía a archivo.', {
        cause: error,
      });
    }

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: match[1] });
  }
}
