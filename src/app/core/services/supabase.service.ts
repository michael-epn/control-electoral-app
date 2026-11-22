import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

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
    this.validarRutaActa(ruta);

    const { error } = await this.client.storage
      .from('actas-evidencias')
      .upload(ruta, file, {
        contentType: file.type || undefined,
        upsert: true,
      });

    if (error) {
      throw new Error('No fue posible subir la foto privada del acta.', {
        cause: error,
      });
    }

    return this.obtenerUrlFotoActa(ruta);
  }

  async obtenerUrlFotoActa(ruta: string): Promise<string> {
    this.validarRutaActa(ruta);

    const { data, error } = await this.client.storage
      .from('actas-evidencias')
      .createSignedUrl(ruta, 300);

    if (error) {
      throw new Error('No se pudo generar una URL temporal para la foto del acta.', {
        cause: error,
      });
    }

    return data.signedUrl;
  }

  private validarRutaActa(ruta: string): void {
    const uid = this.auth.currentUser?.uid;

    if (!uid) {
      throw new Error('Debes iniciar sesión para acceder a evidencias del acta.');
    }

    const segmentos = ruta.split('/');
    if (
      ruta.includes('\\')
      || segmentos.length < 3
      || segmentos[0] !== uid
      || segmentos.some((segmento) => !segmento || segmento === '.' || segmento === '..')
    ) {
      throw new Error('La ruta debe tener el formato UID/acta/archivo y pertenecer al usuario actual.');
    }
  }
}
