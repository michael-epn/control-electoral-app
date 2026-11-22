import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.key,
  );

  async subirFotoActa(file: Blob, ruta: string): Promise<string> {
    const { error } = await this.client.storage
      .from('actas-evidencias')
      .upload(ruta, file, {
        contentType: file.type || undefined,
        upsert: true,
      });

    if (error) {
      throw new Error('No fue posible subir la foto del acta.', {
        cause: error,
      });
    }

    const { data } = this.client.storage
      .from('actas-evidencias')
      .getPublicUrl(ruta);

    if (!data.publicUrl) {
      throw new Error('La foto se subió, pero no se pudo obtener su URL pública.');
    }

    return data.publicUrl;
  }
}
