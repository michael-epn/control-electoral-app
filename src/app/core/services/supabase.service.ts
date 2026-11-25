import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

const DURACION_URL_FIRMADA_SEGUNDOS = 60 * 60 * 24 * 7;

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly auth = inject(Auth);
  private readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.key,
    {
      accessToken: async () => {
        const usuario = this.auth.currentUser;
        return usuario ? usuario.getIdToken() : null;
      },
    },
  );

  async subirFotoActa(file: Blob, ruta: string): Promise<string> {
    this.validarRutaEscritura(ruta);

    const { error } = await this.client.storage
      .from('actas-evidencias')
      .upload(ruta, file, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Error real de Supabase Storage al subir:', error);
      const detalle = error.message ? ` (${error.message})` : '';
      throw new Error(`No fue posible subir la foto privada del acta${detalle}.`, {
        cause: error,
      });
    }

    return this.obtenerUrlFotoActa(ruta, DURACION_URL_FIRMADA_SEGUNDOS);
  }

  async obtenerUrlFotoActa(
    ruta: string,
    expiresInSeconds = DURACION_URL_FIRMADA_SEGUNDOS,
  ): Promise<string> {
    this.validarRutaLectura(ruta);

    const { data, error } = await this.client.storage
      .from('actas-evidencias')
      .createSignedUrl(ruta, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error('Error real de Supabase Storage al firmar URL:', error);
      const detalle = error?.message ? ` (${error.message})` : '';
      throw new Error(`No se pudo generar la URL temporal de la foto del acta${detalle}.`, {
        cause: error,
      });
    }

    return data.signedUrl;
  }

  private validarRutaEscritura(ruta: string): void {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Debes iniciar sesión para subir evidencias del acta.');
    }

    const segmentos = this.extraerSegmentosValidos(ruta);
    if (segmentos[0] !== uid) {
      throw new Error('La ruta de subida debe iniciar con el UID del usuario actual.');
    }
  }

  private validarRutaLectura(ruta: string): void {
    if (!this.auth.currentUser?.uid) {
      throw new Error('Debes iniciar sesión para visualizar evidencias del acta.');
    }

    this.extraerSegmentosValidos(ruta);
  }

  private extraerSegmentosValidos(ruta: string): string[] {
    const segmentos = ruta.split('/');
    if (
      ruta.includes('\\')
      || segmentos.length < 3
      || segmentos.some((segmento) => !segmento || segmento === '.' || segmento === '..')
    ) {
      throw new Error('La ruta del archivo debe tener el formato UID/acta/archivo.');
    }
    return segmentos;
  }
}