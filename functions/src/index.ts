import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { puedeFirmarFotoActa } from './photo-authorization.js';

const supabaseUrl = defineSecret('SUPABASE_URL');
const supabaseServiceRoleKey = defineSecret('SUPABASE_SERVICE_ROLE_KEY');
const DURACION_URL_FIRMADA_SEGUNDOS = 604800;

if (getApps().length === 0) {
  initializeApp();
}

const firestore = getFirestore();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function esRutaFotoValida(fotoPath: string, recintoId: string): boolean {
  const segmentos = fotoPath.split('/');
  return !fotoPath.includes('\\')
    && segmentos.length >= 3
    && segmentos.every((segmento) => segmento.length > 0
      && segmento !== '.'
      && segmento !== '..')
    && segmentos[1] === recintoId;
}

export const obtenerUrlFotoActa = onCall(
  {
    secrets: [supabaseUrl, supabaseServiceRoleKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || request.auth?.token['email_verified'] !== true) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión con un correo verificado.',
      );
    }

    if (!isRecord(request.data) || typeof request.data['fotoPath'] !== 'string') {
      throw new HttpsError('invalid-argument', 'La ruta de evidencia no es válida.');
    }
    const fotoPath = request.data['fotoPath'].trim();
    if (fotoPath.length === 0) {
      throw new HttpsError('invalid-argument', 'La ruta de evidencia no es válida.');
    }

    const matches = await firestore.collection('actas')
      .where('fotoPath', '==', fotoPath)
      .limit(2)
      .get();
    if (matches.size !== 1) {
      throw new HttpsError('not-found', 'No se encontró un acta asociada a esa evidencia.');
    }

    const acta = matches.docs[0]?.data();
    if (
      !acta
      || typeof acta['recintoId'] !== 'string'
      || typeof acta['jrvId'] !== 'string'
      || !esRutaFotoValida(fotoPath, acta['recintoId'])
    ) {
      throw new HttpsError('failed-precondition', 'El acta no tiene una ruta de evidencia válida.');
    }

    const profileSnapshot = await firestore.collection('usuarios').doc(uid).get();
    const profile = profileSnapshot.data();
    if (!profileSnapshot.exists || !profile) {
      throw new HttpsError('permission-denied', 'No existe un perfil autorizado para este usuario.');
    }

    let veedorAsignadoId: unknown = null;
    if (profile['rol'] === 'VEEDOR') {
      const jrvSnapshot = await firestore.collection('jrvs').doc(acta['jrvId']).get();
      veedorAsignadoId = jrvSnapshot.data()?.['veedorId'] ?? null;
    }

    if (!puedeFirmarFotoActa({
      uid,
      rol: profile['rol'],
      profileRecintoId: profile['recintoId'],
      actaRecintoId: acta['recintoId'],
      fotoPath,
      veedorAsignadoId,
    })) {
      throw new HttpsError(
        'permission-denied',
        'No tienes permiso para consultar la evidencia de este acta.',
      );
    }

    const supabase = createClient(supabaseUrl.value(), supabaseServiceRoleKey.value(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase.storage
      .from('actas-evidencias')
      .createSignedUrl(fotoPath, DURACION_URL_FIRMADA_SEGUNDOS);

    if (error || !data?.signedUrl) {
      throw new HttpsError(
        'internal',
        `No se pudo firmar la evidencia: ${error?.message ?? 'URL no disponible.'}`,
      );
    }
    return { signedUrl: data.signedUrl };
  },
);
