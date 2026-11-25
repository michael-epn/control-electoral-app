import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

const DURACION_URL_FIRMADA_SEGUNDOS = 604800;

interface FotoUrlResponse {
  readonly signedUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);
  private readonly injector = inject(Injector);
  private readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.key,
    {
      accessToken: async () => this.obtenerTokenFirebase(),
    },
  );

  async subirFotoActa(file: Blob, ruta: string): Promise<string> {
    await this.auth.authStateReady();
    const rutaEnviada = this.normalizarRutaEscritura(ruta);

    const token = await this.obtenerTokenFirebase();
    if (!token) {
      throw new Error('No se pudo obtener el token de autenticación de Firebase.');
    }

    const { error } = await this.client.storage
      .from('actas-evidencias')
      .upload(rutaEnviada, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      await this.registrarDiagnosticoRls(rutaEnviada, error, token);
      throw new Error(
        `No fue posible subir la foto privada del acta: ${error.message}`,
        { cause: error },
      );
    }

    return this.crearUrlFirmadaPropia(rutaEnviada);
  }

  async obtenerUrlFotoActa(ruta: string): Promise<string> {
    await this.auth.authStateReady();
    if (!this.auth.currentUser?.uid) {
      throw new Error('Debes iniciar sesión para visualizar evidencias del acta.');
    }
    this.extraerSegmentosValidos(ruta);

    const callable = runInInjectionContext(this.injector, () =>
      httpsCallable<{ fotoPath: string }, FotoUrlResponse>(
        this.functions,
        'obtenerUrlFotoActa',
      ),
    );
    const response = await runInInjectionContext(
      this.injector,
      () => callable({ fotoPath: ruta }),
    );

    if (
      !isRecord(response.data)
      || typeof response.data['signedUrl'] !== 'string'
      || response.data['signedUrl'].length === 0
    ) {
      throw new Error('El servicio de evidencias no devolvió una URL firmada válida.');
    }

    return response.data['signedUrl'];
  }

  private async crearUrlFirmadaPropia(ruta: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from('actas-evidencias')
      .createSignedUrl(ruta, DURACION_URL_FIRMADA_SEGUNDOS);

    if (error || !data?.signedUrl) {
      console.error('Error real de Supabase Storage al firmar la foto recién subida:', error);
      throw new Error(
        `La foto se subió, pero no se pudo generar su URL temporal: ${
          error?.message ?? 'Supabase no devolvió una URL firmada.'
        }`,
        { cause: error },
      );
    }
    return data.signedUrl;
  }

  private async obtenerTokenFirebase(): Promise<string | null> {
    await this.auth.authStateReady();
    const usuario = this.auth.currentUser;
    if (!usuario) {
      return null;
    }

    return usuario.getIdToken(true);
  }

  private normalizarRutaEscritura(ruta: string): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Debes iniciar sesión para subir evidencias del acta.');
    }

    const segmentos = this.extraerSegmentosValidos(ruta);
    const rutaEnviada = [uid, ...segmentos.slice(1)].join('/');
    const segmentosEnviados = this.extraerSegmentosValidos(rutaEnviada);
    if (segmentosEnviados[0] !== uid) {
      throw new Error('La ruta de subida debe iniciar con el UID del usuario actual.');
    }
    return rutaEnviada;
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

  private async registrarDiagnosticoRls(
    rutaEnviada: string,
    error: { readonly message: string },
    token: string,
  ): Promise<void> {
    const claims = this.decodificarClaims(token);
    console.error('Diagnóstico RLS Supabase:', {
      claims,
      rutaEnviada,
      carpetaRaiz: rutaEnviada.split('/')[0] ?? null,
      supabaseUrl: environment.supabase.url,
      error,
    });
  }

  private decodificarClaims(token: string): {
    readonly sub: unknown;
    readonly aud: unknown;
    readonly iss: unknown;
    readonly decodeError?: string;
  } {
    const payload = token.split('.')[1];
    if (!payload) {
      return {
        sub: null,
        aud: null,
        iss: null,
        decodeError: 'El token no contiene un payload JWT.',
      };
    }

    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const parsed: unknown = JSON.parse(atob(base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        '=',
      )));
      if (!isRecord(parsed)) {
        return {
          sub: null,
          aud: null,
          iss: null,
          decodeError: 'El payload JWT no es un objeto.',
        };
      }
      return {
        sub: parsed['sub'] ?? null,
        aud: parsed['aud'] ?? null,
        iss: parsed['iss'] ?? null,
      };
    } catch (decodeError) {
      return {
        sub: null,
        aud: null,
        iss: null,
        decodeError: decodeError instanceof Error
          ? decodeError.message
          : 'No se pudo decodificar el payload JWT.',
      };
    }
  }
}
