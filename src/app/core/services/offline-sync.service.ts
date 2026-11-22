import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import {
  Firestore,
  doc,
  runTransaction,
} from '@angular/fire/firestore';
import type { CoordenadasGps } from '../models/coordenadas-gps.model';
import type { Dignidad } from '../models/dignidad.model';
import type { GuardarActaDto } from '../models/escrutinio.dto';
import { SIGLAS_ORGANIZACION } from '../models/organizacion-politica.model';
import type { RequestState } from '../models/request-state.model';
import { AuthStateService } from './auth-state.service';
import { SupabaseService } from './supabase.service';

const QUEUE_PREFERENCE_KEY = 'offline_actas_queue';
const IMAGE_DIRECTORY = 'offline_actas';

interface OfflineActa {
  readonly idempotency_key: string;
  readonly client_timestamp: number;
  readonly uid: string;
  readonly recintoId: string;
  readonly jrvId: string;
  readonly dignidad: Dignidad;
  readonly local_image_path: string;
  readonly votosOrganizaciones: Readonly<Record<string, number>>;
  readonly votosNulos: number;
  readonly votosBlancos: number;
  readonly totalSufragantes: number;
  readonly gps: CoordenadasGps;
}

type ResultadoConflicto = 'guardada' | 'auditada' | 'bloqueada' | 'mas-reciente';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mensajeDe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la sincronización offline.';
}

function esDignidad(value: unknown): value is Dignidad {
  return value === 'ALCALDE' || value === 'PREFECTO';
}

function esEnteroNoNegativo(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function esOfflineActa(value: unknown): value is OfflineActa {
  if (!isRecord(value)) {
    return false;
  }

  const gps = value['gps'];
  const votosOrganizaciones = value['votosOrganizaciones'];
  const idempotencyKey = value['idempotency_key'];
  const clientTimestamp = value['client_timestamp'];
  const uid = value['uid'];
  const recintoId = value['recintoId'];
  const jrvId = value['jrvId'];
  const dignidad = value['dignidad'];
  const localImagePath = value['local_image_path'];
  const votosNulos = value['votosNulos'];
  const votosBlancos = value['votosBlancos'];
  const totalSufragantes = value['totalSufragantes'];

  if (
    !isRecord(gps)
    || !isRecord(votosOrganizaciones)
    || typeof idempotencyKey !== 'string'
    || typeof clientTimestamp !== 'number'
    || !Number.isSafeInteger(clientTimestamp)
    || typeof uid !== 'string'
    || uid.length === 0
    || typeof recintoId !== 'string'
    || recintoId.length === 0
    || typeof jrvId !== 'string'
    || !/^[A-Za-z0-9_-]+$/.test(jrvId)
    || !esDignidad(dignidad)
    || typeof localImagePath !== 'string'
    || !esEnteroNoNegativo(votosNulos)
    || !esEnteroNoNegativo(votosBlancos)
    || !esEnteroNoNegativo(totalSufragantes)
  ) {
    return false;
  }

  const lat = gps['lat'];
  const lng = gps['lng'];
  let sumaVotos = votosNulos + votosBlancos;
  for (const sigla of SIGLAS_ORGANIZACION) {
    const votos = votosOrganizaciones[sigla];
    if (!esEnteroNoNegativo(votos)) {
      return false;
    }
    sumaVotos += votos;
  }

  return idempotencyKey === `${jrvId}_${dignidad}`
    && localImagePath === `${IMAGE_DIRECTORY}/${idempotencyKey}.jpg`
    && typeof lat === 'number'
    && Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && typeof lng === 'number'
    && Number.isFinite(lng)
    && lng >= -180
    && lng <= 180
    && Object.keys(votosOrganizaciones).length === SIGLAS_ORGANIZACION.length
    && sumaVotos === totalSufragantes;
}

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  readonly isOnline = signal(true);
  readonly pendientesCount = signal(0);
  readonly pendientesKeys = signal<readonly string[]>([]);
  readonly estadoSincronizacion = signal<RequestState<number>>({ status: 'idle' });
  readonly notificacion = signal<string | null>(null);

  private readonly auth = inject(AuthStateService);
  private readonly firestore = inject(Firestore);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialization: Promise<void>;
  private initializationError: unknown;
  private initializationFailed = false;
  private queue: OfflineActa[] = [];
  private readonly notificacionesPendientes: string[] = [];
  private queueOperation: Promise<void> = Promise.resolve();
  private networkListener: { remove: () => Promise<void> } | null = null;

  constructor() {
    this.initialization = this.initialize().catch((error: unknown) => {
      this.initializationFailed = true;
      this.initializationError = error;
      this.estadoSincronizacion.set({ status: 'error', error: mensajeDe(error) });
    });

    const authEffect = effect(() => {
      const usuario = this.auth.usuarioActual();
      if (usuario?.rol === 'VEEDOR' && this.isOnline()) {
        void this.procesarCola().catch((error: unknown) => this.registrarError(error));
      }
    });

    this.destroyRef.onDestroy(() => {
      authEffect.destroy();
      void this.networkListener?.remove();
    });

    void this.initialization.then(() => {
      if (this.isOnline()) {
        return this.procesarCola();
      }
      return undefined;
    }).catch((error: unknown) => this.registrarError(error));
  }

  async encolarActa(datos: GuardarActaDto, uid: string): Promise<number> {
    await this.esperarInicializacion();
    const foto = datos.foto;
    if (!uid) {
      throw new Error('Debes iniciar sesión para guardar un acta sin conexión.');
    }
    if (!foto || !foto.size || !foto.type.startsWith('image/')) {
      throw new Error('Se requiere una fotografía válida para guardar el acta sin conexión.');
    }

    const idempotencyKey = `${datos.jrvId}_${datos.dignidad}`;
    if (!/^[A-Za-z0-9_-]+$/.test(datos.jrvId)) {
      throw new Error('El identificador de JRV no es válido para almacenamiento local.');
    }

    const clientTimestamp = Date.now();
    const localImagePath = `${IMAGE_DIRECTORY}/${idempotencyKey}.jpg`;
    const item: OfflineActa = {
      idempotency_key: idempotencyKey,
      client_timestamp: clientTimestamp,
      uid,
      recintoId: datos.recintoId,
      jrvId: datos.jrvId,
      dignidad: datos.dignidad,
      local_image_path: localImagePath,
      votosOrganizaciones: datos.votosOrganizaciones,
      votosNulos: datos.votosNulos,
      votosBlancos: datos.votosBlancos,
      totalSufragantes: datos.totalSufragantes,
      gps: datos.gps,
    };

    await this.serializar(async () => {
      const base64 = await this.blobABase64(foto);
      const queueIndex = this.queue.findIndex(
        (pending) => pending.idempotency_key === idempotencyKey,
      );
      const nextQueue = [...this.queue];
      if (queueIndex === -1) {
        nextQueue.push(item);
      } else {
        nextQueue[queueIndex] = item;
      }

      const existingImage = queueIndex === -1
        ? null
        : await Filesystem.readFile({
          path: localImagePath,
          directory: Directory.Data,
        });
      const backupImage = existingImage
        ? typeof existingImage.data === 'string'
          ? existingImage.data
          : await this.blobABase64(existingImage.data)
        : null;

      await Filesystem.writeFile({
        path: localImagePath,
        data: base64,
        directory: Directory.Data,
        recursive: true,
      });

      try {
        await this.persistirCola(nextQueue);
      } catch (error) {
        try {
          if (backupImage !== null) {
            await Filesystem.writeFile({
              path: localImagePath,
              data: backupImage,
              directory: Directory.Data,
              recursive: true,
            });
          } else {
            await Filesystem.deleteFile({
              path: localImagePath,
              directory: Directory.Data,
            });
          }
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'No se pudo persistir la cola offline ni restaurar la imagen local.',
          );
        }
        throw error;
      }
    });

    return clientTimestamp;
  }

  estaPendiente(jrvId: string, dignidad: Dignidad): boolean {
    return this.pendientesKeys().includes(`${jrvId}_${dignidad}`);
  }

  limpiarNotificacion(): void {
    this.notificacion.set(this.notificacionesPendientes.shift() ?? null);
  }

  async preparar(): Promise<void> {
    await this.esperarInicializacion();
  }

  private async initialize(): Promise<void> {
    this.networkListener = await Network.addListener(
      'networkStatusChange',
      (status) => {
        this.isOnline.set(status.connected);
        if (status.connected) {
          void this.procesarCola().catch((error: unknown) => this.registrarError(error));
        }
      },
    );

    const stored = await Preferences.get({ key: QUEUE_PREFERENCE_KEY });
    this.queue = this.parseQueue(stored.value);
    this.actualizarPendientes();

    const status = await Network.getStatus();
    this.isOnline.set(status.connected);
    this.estadoSincronizacion.set({
      status: 'success',
      data: this.queue.length,
    });
  }

  private async esperarInicializacion(): Promise<void> {
    await this.initialization;
    if (this.initializationFailed) {
      throw new Error('No se pudo inicializar la cola offline.', {
        cause: this.initializationError,
      });
    }
  }

  private parseQueue(value: string | null): OfflineActa[] {
    if (value === null || value.length === 0) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error('La cola offline guardada está dañada y no puede sincronizarse.', {
        cause: error,
      });
    }

    if (!Array.isArray(parsed) || !parsed.every(esOfflineActa)) {
      throw new Error('La cola offline guardada contiene datos inválidos.');
    }
    return parsed;
  }

  private async procesarCola(): Promise<void> {
    await this.esperarInicializacion();
    const usuario = this.auth.usuarioActual();
    if (!this.isOnline() || usuario?.rol !== 'VEEDOR') {
      return;
    }

    await this.serializar(async () => {
      while (this.isOnline() && this.queue.length > 0) {
        const item = this.queue[0];
        if (!item || item.uid !== usuario.id) {
          return;
        }

        this.estadoSincronizacion.set({
          status: 'loading',
        });
        const resultado = await this.sincronizarItem(item);
        await this.confirmarItemProcesado(item);

        if (resultado === 'auditada') {
          this.notificar(
            `El Coordinador de Recinto ya auditó ${item.idempotency_key}; se conservó la versión del servidor.`,
          );
        } else if (resultado === 'bloqueada') {
          this.notificar(
            `El acta ${item.idempotency_key} está bloqueada en el servidor; se descartó la copia offline.`,
          );
        } else if (resultado === 'mas-reciente') {
          this.notificar(
            `Se conservó una versión más reciente de ${item.idempotency_key} en el servidor.`,
          );
        } else {
          this.notificar(`Acta ${item.idempotency_key} sincronizada.`);
        }
      }

      this.estadoSincronizacion.set({
        status: 'success',
        data: this.queue.length,
      });
    });
  }

  private async sincronizarItem(item: OfflineActa): Promise<ResultadoConflicto> {
    const storedImage = await Filesystem.readFile({
      path: item.local_image_path,
      directory: Directory.Data,
    });
    const image = typeof storedImage.data === 'string'
      ? this.base64ABlob(storedImage.data)
      : storedImage.data;
    const fotoPath = [
      item.uid,
      item.recintoId,
      `${item.jrvId}_${item.dignidad}_${item.client_timestamp}.jpg`,
    ].join('/');
    const fotoUrl = await this.supabase.subirFotoActa(image, fotoPath);
    this.validarFotoUrl(fotoUrl);

    const actaId = `${item.jrvId}_${item.dignidad}`;
    const actaRef = doc(this.firestore, 'actas', actaId);
    return runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(actaRef);
      if (existing.exists()) {
        const data = existing.data();
        if (data['auditadaPorCoordinador'] === true) {
          return 'auditada';
        }
        if (data['bloqueada'] === true) {
          return 'bloqueada';
        }

        const serverTimestamp = data['client_timestamp'];
        if (
          typeof serverTimestamp === 'number'
          && Number.isFinite(serverTimestamp)
          && serverTimestamp >= item.client_timestamp
        ) {
          return 'mas-reciente';
        }
      }

      transaction.set(actaRef, {
        id: actaId,
        recintoId: item.recintoId,
        jrvId: item.jrvId,
        dignidad: item.dignidad,
        votosOrganizaciones: item.votosOrganizaciones,
        votosNulos: item.votosNulos,
        votosBlancos: item.votosBlancos,
        totalSufragantes: item.totalSufragantes,
        fotoPath,
        fotoUrl,
        gps: item.gps,
        auditadaPorCoordinador: false,
        client_timestamp: item.client_timestamp,
      }, { merge: true });
      return 'guardada';
    });
  }

  private async confirmarItemProcesado(item: OfflineActa): Promise<void> {
    const nextQueue = this.queue.filter(
      (pending) => pending.idempotency_key !== item.idempotency_key,
    );
    await this.persistirCola(nextQueue);
    await Filesystem.deleteFile({
      path: item.local_image_path,
      directory: Directory.Data,
    });
  }

  private async persistirCola(queue: OfflineActa[]): Promise<void> {
    await Preferences.set({
      key: QUEUE_PREFERENCE_KEY,
      value: JSON.stringify(queue),
    });
    this.queue = queue;
    this.actualizarPendientes();
  }

  private actualizarPendientes(): void {
    this.pendientesCount.set(this.queue.length);
    this.pendientesKeys.set(this.queue.map((item) => item.idempotency_key));
  }

  private serializar<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queueOperation.then(operation);
    this.queueOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async blobABase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la fotografía local.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('La fotografía no tiene un formato local válido.'));
          return;
        }
        const separator = reader.result.indexOf(',');
        if (separator < 0) {
          reject(new Error('No se pudo codificar la fotografía para almacenarla.'));
          return;
        }
        resolve(reader.result.slice(separator + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  private base64ABlob(value: string): Blob {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  private validarFotoUrl(value: string): void {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Protocolo de URL inválido.');
      }
    } catch (error) {
      throw new Error('Supabase no devolvió una URL válida para la evidencia offline.', {
        cause: error,
      });
    }
  }

  private registrarError(error: unknown): void {
    const message = mensajeDe(error);
    this.estadoSincronizacion.set({ status: 'error', error: message });
    this.notificar(`Sincronización pendiente: ${message}`);
  }

  private notificar(message: string): void {
    if (this.notificacion() === null) {
      this.notificacion.set(message);
      return;
    }
    this.notificacionesPendientes.push(message);
  }
}
