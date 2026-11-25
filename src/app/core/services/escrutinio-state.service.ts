import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import type { WritableSignal } from '@angular/core';
import type { DocumentData, Query } from 'firebase/firestore';
import { combineLatest, map, Subscription } from 'rxjs';
import type { ActaElectoral, VotosOrganizaciones } from '../models/acta-electoral.model';
import type { Candidato } from '../models/candidato.model';
import type { CrearRecintoDto, GuardarActaDto } from '../models/escrutinio.dto';
import type { Dignidad } from '../models/dignidad.model';
import type { Jrv } from '../models/jrv.model';
import { SIGLAS_ORGANIZACION } from '../models/organizacion-politica.model';
import type { OrganizacionPolitica, SiglaOrganizacion } from '../models/organizacion-politica.model';
import type { Recinto } from '../models/recinto.model';
import type { RequestState } from '../models/request-state.model';
import type { Usuario } from '../models/usuario.model';
import { isVotosOrganizaciones } from '../validators/votos-organizaciones.validator';
import { AuthStateService } from './auth-state.service';
import { OfflineSyncService } from './offline-sync.service';
import { SupabaseService } from './supabase.service';

export interface VotosPorOrganizacion {
  readonly sigla: SiglaOrganizacion;
  readonly nombre: string;
  readonly votos: number;
  readonly porcentaje: number;
}

export interface MetricasEscrutinio {
  readonly totalJrvs: number;
  readonly totalActasEsperadas: number;
  readonly actasIngresadas: number;
  readonly avancePorcentual: number;
  readonly votosPorDignidad: Readonly<Record<Dignidad, readonly VotosPorOrganizacion[]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  data: Record<string, unknown>,
  field: string,
): string {
  const value = data[field];
  if (typeof value !== 'string') {
    throw new Error(`El documento contiene un campo ${field} inválido.`);
  }
  return value;
}

function parseRecinto(value: unknown): Recinto {
  if (!isRecord(value) || !Number.isInteger(value['cantidadJrv'])) {
    throw new Error('Se encontró un recinto con datos inválidos.');
  }

  return {
    id: requireString(value, 'id'),
    provincia: requireString(value, 'provincia'),
    canton: requireString(value, 'canton'),
    parroquia: requireString(value, 'parroquia'),
    nombre: requireString(value, 'nombre'),
    cantidadJrv: value['cantidadJrv'] as number,
    coordinadorId: typeof value['coordinadorId'] === 'string'
      ? value['coordinadorId']
      : '',
  };
}

function parseJrv(value: unknown): Jrv {
  if (!isRecord(value) || !Number.isInteger(value['numero'])) {
    throw new Error('Se encontró una JRV con datos inválidos.');
  }

  const veedorId = value['veedorId'];
  if (veedorId !== undefined && veedorId !== null && typeof veedorId !== 'string') {
    throw new Error('Se encontró una asignación de JRV inválida.');
  }

  return {
    id: requireString(value, 'id'),
    numero: value['numero'] as number,
    recintoId: requireString(value, 'recintoId'),
    veedorId,
  };
}

function parseActa(value: unknown): ActaElectoral {
  if (!isRecord(value) || !isRecord(value['gps'])) {
    throw new Error('Se encontró un acta con datos inválidos.');
  }

  const votes = value['votosOrganizaciones'];
  if (
    !isRecord(votes)
    || Object.keys(votes).length !== SIGLAS_ORGANIZACION.length
    || SIGLAS_ORGANIZACION.some((sigla) =>
      !Number.isInteger(votes[sigla]) || (votes[sigla] as number) < 0,
    )
    || !isVotosOrganizaciones(votes)
  ) {
    throw new Error('Se encontró un acta con votos por organización inválidos.');
  }

  const { lat, lng } = value['gps'];
  if (
    typeof lat !== 'number'
    || !Number.isFinite(lat)
    || lat < -90
    || lat > 90
    || typeof lng !== 'number'
    || !Number.isFinite(lng)
    || lng < -180
    || lng > 180
    || (value['dignidad'] !== 'ALCALDE' && value['dignidad'] !== 'PREFECTO')
    || typeof value['auditadaPorCoordinador'] !== 'boolean'
    || (value['fotoPath'] !== null && typeof value['fotoPath'] !== 'string')
    || (value['fotoUrl'] !== null && typeof value['fotoUrl'] !== 'string')
    || (
      value['client_timestamp'] !== undefined
      && (
        typeof value['client_timestamp'] !== 'number'
        || !Number.isSafeInteger(value['client_timestamp'])
        || value['client_timestamp'] < 0
      )
    )
  ) {
    throw new Error('Se encontró un acta con metadatos inválidos.');
  }

  const bloqueada = value['bloqueada'];
  if (bloqueada !== undefined && typeof bloqueada !== 'boolean') {
    throw new Error('Se encontró un estado de bloqueo de acta inválido.');
  }

  return {
    id: requireString(value, 'id'),
    jrvId: requireString(value, 'jrvId'),
    recintoId: requireString(value, 'recintoId'),
    dignidad: value['dignidad'],
    votosOrganizaciones: votes,
    votosNulos: requireNonNegativeInteger(value, 'votosNulos'),
    votosBlancos: requireNonNegativeInteger(value, 'votosBlancos'),
    totalSufragantes: requireNonNegativeInteger(value, 'totalSufragantes'),
    fotoPath: value['fotoPath'],
    fotoUrl: value['fotoUrl'],
    gps: { lat, lng },
    auditadaPorCoordinador: value['auditadaPorCoordinador'],
    ...(value['client_timestamp'] === undefined
      ? {}
      : { client_timestamp: value['client_timestamp'] }),
    ...(bloqueada === undefined ? {} : { bloqueada }),
  };
}

function parseCandidato(value: unknown): Candidato {
  if (
    !isRecord(value)
    || (value['dignidad'] !== 'ALCALDE' && value['dignidad'] !== 'PREFECTO')
    || (value['organizacionPoliticaId'] !== null
      && typeof value['organizacionPoliticaId'] !== 'string')
  ) {
    throw new Error('Se encontró una candidatura con datos inválidos.');
  }

  return {
    id: requireString(value, 'id'),
    nombres: requireString(value, 'nombres'),
    apellidos: requireString(value, 'apellidos'),
    dignidad: value['dignidad'],
    organizacionPoliticaId: value['organizacionPoliticaId'],
  };
}

function parseOrganizacion(value: unknown): OrganizacionPolitica {
  if (!isRecord(value)) {
    throw new Error('Se encontró una organización política inválida.');
  }

  return {
    id: requireString(value, 'id'),
    nombre: requireString(value, 'nombre'),
    sigla: requireString(value, 'sigla'),
  };
}

function parseUsuario(value: unknown): Usuario {
  if (!isRecord(value)) {
    throw new Error('Se encontró un perfil de usuario inválido.');
  }

  const rol = value['rol'];
  if (rol !== 'PROVINCIAL' && rol !== 'RECINTO' && rol !== 'VEEDOR') {
    throw new Error('Se encontró un perfil con rol inválido.');
  }

  const jrvIdsRaw = value['jrvIds'];
  if (
    jrvIdsRaw !== undefined
    && (!Array.isArray(jrvIdsRaw) || !jrvIdsRaw.every((jrvId: unknown) => typeof jrvId === 'string'))
  ) {
    throw new Error('Se encontró una asignación de usuario inválida.');
  }

  const telefono = value['telefono'] ?? null;
  const recintoId = value['recintoId'] ?? null;
  const resolvedId = typeof value['id'] === 'string'
    ? value['id']
    : requireString(value, 'uid');

  if (
    (telefono !== null && typeof telefono !== 'string')
    || (recintoId !== null && typeof recintoId !== 'string')
  ) {
    throw new Error('Se encontró un perfil con datos inválidos.');
  }

  return {
    id: resolvedId,
    cedula: requireString(value, 'cedula'),
    nombres: requireString(value, 'nombres'),
    apellidos: requireString(value, 'apellidos'),
    telefono,
    email: requireString(value, 'email'),
    rol,
    debeCambiarClave: Boolean(value['debeCambiarClave']),
    recintoId,
    jrvIds: jrvIdsRaw ?? [],
  };
}

function requireNonNegativeInteger(
  data: Record<string, unknown>,
  field: string,
): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`El documento contiene un campo ${field} inválido.`);
  }
  return value;
}

function datosDe<T>(state: RequestState<T[]>): T[] {
  return state.status === 'success' ? state.data : [];
}

function mensajeDe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación. Inténtalo nuevamente.';
}

@Injectable({ providedIn: 'root' })
export class EscrutinioStateService {
  readonly recintosState = signal<RequestState<Recinto[]>>({ status: 'idle' });
  readonly jrvsState = signal<RequestState<Jrv[]>>({ status: 'idle' });
  readonly actasState = signal<RequestState<ActaElectoral[]>>({ status: 'idle' });
  readonly usuariosState = signal<RequestState<Usuario[]>>({ status: 'idle' });
  readonly organizacionesState =
    signal<RequestState<OrganizacionPolitica[]>>({ status: 'idle' });
  readonly candidatosState = signal<RequestState<Candidato[]>>({ status: 'idle' });
  readonly guardarActaState = signal<RequestState<ActaElectoral>>({ status: 'idle' });
  readonly crearRecintoState = signal<RequestState<Recinto>>({ status: 'idle' });
  readonly asignarVeedorState = signal<RequestState<Jrv>>({ status: 'idle' });
  readonly filtroRecintoId = signal('');

  readonly recintos = computed(() => datosDe(this.recintosState()));
  readonly jrvs = computed(() => datosDe(this.jrvsState()));
  readonly actas = computed(() => datosDe(this.actasState()));
  readonly usuarios = computed(() => datosDe(this.usuariosState()));
  readonly organizaciones = computed(() => datosDe(this.organizacionesState()));
  readonly candidatos = computed(() => datosDe(this.candidatosState()));
  readonly metricas = computed(() => this.calcularMetricas());

  private readonly authState = inject(AuthStateService);
  private readonly firestore = inject(Firestore);
  private readonly offlineSync = inject(OfflineSyncService);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private subscriptions = new Subscription();
  private actasDeJrvsSubscription: Subscription | null = null;
  private actasDeJrvsKey = '';
  private sequence = 0;

  constructor() {
    const userEffect = effect(() => {
      this.conectarUsuario(this.authState.usuarioActual());
    }, { allowSignalWrites: true });

    this.destroyRef.onDestroy(() => {
      userEffect.destroy();
      this.subscriptions.unsubscribe();
    });
  }

  actaPara(jrvId: string, dignidad: Dignidad): ActaElectoral | undefined {
    return this.actas().find(
      (acta) => acta.jrvId === jrvId && acta.dignidad === dignidad,
    );
  }

  usuarioPorId(uid: string | null | undefined): Usuario | undefined {
    return uid ? this.usuarios().find((usuario) => usuario.id === uid) : undefined;
  }

  limpiarErrores(): void {
    const recintoFiltro = this.filtroRecintoId();
    this.conectarUsuario(this.authState.usuarioActual());
    this.filtroRecintoId.set(recintoFiltro);
  }

  async guardarActa(datos: GuardarActaDto): Promise<ActaElectoral> {
    this.guardarActaState.set({ status: 'loading' });

    try {
      const usuario = this.authState.usuarioActual();
      const firebaseUid = usuario?.id;
      if (
        !usuario
        || !firebaseUid
        || (usuario.rol !== 'VEEDOR' && usuario.rol !== 'RECINTO')
      ) {
        throw new Error('No tienes un perfil autorizado para registrar o corregir actas.');
      }

      const jrv = this.jrvs().find((item) => item.id === datos.jrvId);
      if (
        !jrv
        || jrv.recintoId !== datos.recintoId
        || (usuario.rol === 'VEEDOR' && jrv.veedorId !== usuario.id)
        || (usuario.rol === 'RECINTO' && usuario.recintoId !== datos.recintoId)
      ) {
        throw new Error('La JRV no pertenece a tu asignación o recinto.');
      }

      const actaId = `${datos.jrvId}_${datos.dignidad}`;
      const existente = this.actas().find((acta) => acta.id === actaId);
      if (
        (usuario.rol === 'RECINTO' && !existente)
        || existente?.auditadaPorCoordinador
        || existente?.bloqueada
      ) {
        throw new Error('El acta no existe para auditoría o ya está bloqueada.');
      }

      const votosOrganizaciones = this.validarVotos(datos.votosOrganizaciones);
      this.validarCuadre(
        votosOrganizaciones,
        datos.votosNulos,
        datos.votosBlancos,
        datos.totalSufragantes,
      );
      this.validarGps(datos.gps.lat, datos.gps.lng);
      if (
        usuario.rol === 'VEEDOR'
        && datos.auditadaPorCoordinador === true
      ) {
        throw new Error('Un veedor no puede marcar un acta como auditada.');
      }

      if (usuario.rol === 'VEEDOR') {
        try {
          await this.offlineSync.preparar();
        } catch (error) {
          if (!this.offlineSync.isOnline()) {
            throw error;
          }
        }
        if (!this.offlineSync.isOnline()) {
          const clientTimestamp = await this.offlineSync.encolarActa(datos, firebaseUid);
          const actaPendiente: ActaElectoral = {
            id: actaId,
            recintoId: datos.recintoId,
            jrvId: datos.jrvId,
            dignidad: datos.dignidad,
            votosOrganizaciones,
            votosNulos: datos.votosNulos,
            votosBlancos: datos.votosBlancos,
            totalSufragantes: datos.totalSufragantes,
            fotoPath: null,
            fotoUrl: null,
            gps: datos.gps,
            auditadaPorCoordinador: false,
            client_timestamp: clientTimestamp,
          };
          this.guardarActaState.set({
            status: 'success',
            data: actaPendiente,
            message: 'Sin conexión: el acta quedó pendiente de envío.',
          });
          return actaPendiente;
        }
      }

      let fotoPath = existente?.fotoPath ?? null;
      let fotoUrl = existente?.fotoUrl ?? null;
      if (datos.foto) {
        if (!datos.foto.size || !datos.foto.type.startsWith('image/')) {
          throw new Error('Captura una fotografía válida del acta antes de guardar.');
        }

        fotoPath = [
          firebaseUid,
          datos.recintoId,
          `${datos.jrvId}_${datos.dignidad}_${Date.now()}_${++this.sequence}.jpg`,
        ].join('/');
        fotoUrl = await this.supabase.subirFotoActa(datos.foto, fotoPath);
        this.validarFotoUrl(fotoUrl);
      } else if (!existente || !fotoPath || !fotoUrl) {
        throw new Error('Captura una fotografía válida antes de registrar el acta.');
      }

      const acta: ActaElectoral = {
        id: actaId,
        recintoId: datos.recintoId,
        jrvId: datos.jrvId,
        dignidad: datos.dignidad,
        votosOrganizaciones,
        votosNulos: datos.votosNulos,
        votosBlancos: datos.votosBlancos,
        totalSufragantes: datos.totalSufragantes,
        fotoPath,
        fotoUrl,
        gps: datos.gps,
        auditadaPorCoordinador:
          usuario.rol === 'RECINTO' && datos.auditadaPorCoordinador === true,
        client_timestamp: Date.now(),
        ...(existente?.bloqueada === undefined
          ? {}
          : { bloqueada: existente.bloqueada }),
      };

      await setDoc(doc(this.firestore, 'actas', actaId), acta, { merge: true });
      this.guardarActaState.set({
        status: 'success',
        data: acta,
        message: 'El acta y su evidencia se guardaron correctamente.',
      });
      return acta;
    } catch (error) {
      this.guardarActaState.set({ status: 'error', error: mensajeDe(error) });
      throw error;
    }
  }

  async crearRecinto(datos: CrearRecintoDto): Promise<Recinto> {
    this.crearRecintoState.set({ status: 'loading' });

    try {
      if (this.authState.usuarioActual()?.rol !== 'PROVINCIAL') {
        throw new Error('Solo el Coordinador Provincial puede crear recintos.');
      }

      const canton = datos.canton.trim();
      const parroquia = datos.parroquia.trim();
      const nombre = datos.nombre.trim();
      if (
        !canton
        || !parroquia
        || !nombre
        || !Number.isInteger(datos.cantidadJrv)
        || datos.cantidadJrv < 1
        || datos.cantidadJrv > 499
      ) {
        throw new Error('Completa los datos del recinto e ingresa entre 1 y 499 JRV.');
      }

      const recintoRef = doc(collection(this.firestore, 'recintos'));
      const recinto: Recinto = {
        id: recintoRef.id,
        provincia: 'Pichincha',
        canton,
        parroquia,
        nombre,
        cantidadJrv: datos.cantidadJrv,
        coordinadorId: '',
      };
      const batch = writeBatch(this.firestore);
      batch.set(recintoRef, recinto);

      for (let numero = 1; numero <= datos.cantidadJrv; numero++) {
        const codigo = `JRV-${String(numero).padStart(2, '0')}`;
        const jrv: Jrv = {
          id: `${recinto.id}-${codigo}`,
          numero,
          recintoId: recinto.id,
        };
        batch.set(doc(this.firestore, 'jrvs', jrv.id), jrv);
      }

      await batch.commit();
      this.crearRecintoState.set({
        status: 'success',
        data: recinto,
        message: 'El recinto y sus JRV se crearon correctamente.',
      });
      return recinto;
    } catch (error) {
      this.crearRecintoState.set({ status: 'error', error: mensajeDe(error) });
      throw error;
    }
  }

  async asignarVeedorAJrv(jrvId: string, veedorId: string | null): Promise<void> {
    this.asignarVeedorState.set({ status: 'loading' });

    try {
      const usuario = this.authState.usuarioActual();
      const jrv = this.jrvs().find((item) => item.id === jrvId);
      if (
        usuario?.rol !== 'RECINTO'
        || !usuario.recintoId
        || !jrv
        || jrv.recintoId !== usuario.recintoId
      ) {
        throw new Error('Solo puedes asignar veedores a las JRV de tu recinto.');
      }

      await updateDoc(doc(this.firestore, 'jrvs', jrvId), { veedorId });
      this.asignarVeedorState.set({
        status: 'success',
        data: { ...jrv, veedorId },
        message: 'La asignación de la JRV se actualizó.',
      });
    } catch (error) {
      this.asignarVeedorState.set({ status: 'error', error: mensajeDe(error) });
      throw error;
    }
  }

  private conectarUsuario(usuario: Usuario | null): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.actasDeJrvsSubscription?.unsubscribe();
    this.actasDeJrvsSubscription = null;
    this.actasDeJrvsKey = '';
    this.filtroRecintoId.set('');
    this.limpiarEstados();

    if (!usuario) {
      return;
    }

    this.escucharColeccion(
      collection(this.firestore, 'organizaciones'),
      this.organizacionesState,
      parseOrganizacion,
    );
    this.escucharColeccion(
      collection(this.firestore, 'candidatos'),
      this.candidatosState,
      parseCandidato,
    );

    switch (usuario.rol) {
      case 'PROVINCIAL':
        this.escucharColeccion(
          collection(this.firestore, 'recintos'),
          this.recintosState,
          parseRecinto,
        );
        this.escucharColeccion(
          collection(this.firestore, 'jrvs'),
          this.jrvsState,
          parseJrv,
        );
        this.escucharColeccion(
          collection(this.firestore, 'actas'),
          this.actasState,
          parseActa,
        );
        this.escucharColeccion(
          collection(this.firestore, 'usuarios'),
          this.usuariosState,
          parseUsuario,
        );
        break;
      case 'RECINTO':
        if (!usuario.recintoId) {
          this.recintosState.set({
            status: 'error',
            error: 'El perfil no tiene un recinto asignado.',
          });
          break;
        }
        this.escucharRecinto(usuario.recintoId);
        this.escucharColeccion(
          query(
            collection(this.firestore, 'jrvs'),
            where('recintoId', '==', usuario.recintoId),
          ),
          this.jrvsState,
          parseJrv,
          (jrvs) => this.escucharActasDeJrvs(jrvs, usuario.recintoId ?? undefined),
        );
        this.escucharColeccion(
          query(
            collection(this.firestore, 'usuarios'),
            where('rol', '==', 'VEEDOR'),
            where('recintoId', '==', usuario.recintoId),
          ),
          this.usuariosState,
          parseUsuario,
        );
        break;
      case 'VEEDOR':
        this.escucharColeccion(
          query(
            collection(this.firestore, 'jrvs'),
            where('veedorId', '==', usuario.id),
          ),
          this.jrvsState,
          parseJrv,
          (jrvs) => this.escucharActasDeJrvs(jrvs),
        );
        break;
    }
  }

  private escucharColeccion<T>(
    source: Query<DocumentData>,
    target: WritableSignal<RequestState<T[]>>,
    parse: (value: unknown) => T,
    onSuccess?: (value: T[]) => void,
  ): void {
    target.set({ status: 'loading' });
    const subscription = collectionData(source, { idField: 'id' }).subscribe({
      next: (documents) => {
        try {
          const result = documents.map(parse);
          target.set({ status: 'success', data: result });
          onSuccess?.(result);
        } catch (error) {
          target.set({ status: 'error', error: mensajeDe(error) });
        }
      },
      error: (error: unknown) => {
        target.set({ status: 'error', error: mensajeDe(error) });
      },
    });
    this.subscriptions.add(subscription);
  }

  private escucharRecinto(recintoId: string): void {
    this.recintosState.set({ status: 'loading' });
    const subscription = docData(
      doc(this.firestore, 'recintos', recintoId),
      { idField: 'id' },
    ).subscribe({
      next: (document) => {
        if (document === undefined) {
          this.recintosState.set({
            status: 'error',
            error: 'El recinto asignado ya no existe.',
          });
          return;
        }

        try {
          this.recintosState.set({
            status: 'success',
            data: [parseRecinto(document)],
          });
        } catch (error) {
          this.recintosState.set({ status: 'error', error: mensajeDe(error) });
        }
      },
      error: (error: unknown) => {
        this.recintosState.set({ status: 'error', error: mensajeDe(error) });
      },
    });
    this.subscriptions.add(subscription);
  }

  private escucharActasDeJrvs(
    jrvs: readonly Jrv[],
    recintoId?: string,
  ): void {
    const jrvIds = jrvs.map(({ id }) => id).sort();
    const key = `${recintoId ?? ''}:${jrvIds.join('|')}`;
    if (key === this.actasDeJrvsKey && this.actasState().status !== 'idle') {
      return;
    }

    this.actasDeJrvsSubscription?.unsubscribe();
    this.actasDeJrvsKey = key;
    if (jrvs.length === 0) {
      this.actasState.set({ status: 'success', data: [] });
      return;
    }

    this.actasState.set({ status: 'loading' });
    const actasStreams = jrvs.map((jrv) => {
      const source = recintoId
        ? query(
          collection(this.firestore, 'actas'),
          where('jrvId', '==', jrv.id),
          where('recintoId', '==', recintoId),
        )
        : query(
          collection(this.firestore, 'actas'),
          where('jrvId', '==', jrv.id),
        );
      return collectionData(source, { idField: 'id' })
        .pipe(map((documents) => documents.map(parseActa)));
    });

    this.actasDeJrvsSubscription = combineLatest(actasStreams).pipe(
      map((groups) => {
        const uniqueActas = new Map<string, ActaElectoral>();
        for (const actas of groups) {
          for (const acta of actas) {
            uniqueActas.set(acta.id, acta);
          }
        }
        return [...uniqueActas.values()];
      }),
    ).subscribe({
      next: (actas) => this.actasState.set({ status: 'success', data: actas }),
      error: (error: unknown) => {
        this.actasState.set({ status: 'error', error: mensajeDe(error) });
      },
    });
    this.subscriptions.add(this.actasDeJrvsSubscription);
  }

  private validarVotos(value: Readonly<Record<string, number>>): VotosOrganizaciones {
    if (
      !isVotosOrganizaciones(value)
      || Object.keys(value).length !== SIGLAS_ORGANIZACION.length
      || SIGLAS_ORGANIZACION.some((sigla) =>
        !Object.prototype.hasOwnProperty.call(value, sigla)
        || !Number.isInteger(value[sigla])
        || value[sigla] < 0,
      )
    ) {
      throw new Error('Todos los votos por organización deben ser enteros no negativos.');
    }

    return value;
  }

  private validarCuadre(
    votos: VotosOrganizaciones,
    votosNulos: number,
    votosBlancos: number,
    totalSufragantes: number,
  ): void {
    if (
      !Number.isInteger(votosNulos)
      || votosNulos < 0
      || !Number.isInteger(votosBlancos)
      || votosBlancos < 0
      || !Number.isInteger(totalSufragantes)
      || totalSufragantes < 0
    ) {
      throw new Error('Los votos y sufragantes deben ser enteros mayores o iguales a cero.');
    }

    const suma = SIGLAS_ORGANIZACION.reduce(
      (total, sigla) => total + votos[sigla],
      votosNulos + votosBlancos,
    );
    if (suma !== totalSufragantes) {
      throw new Error(`El acta no cuadra: la suma es ${suma} y los sufragantes son ${totalSufragantes}.`);
    }
  }

  private validarGps(lat: number, lng: number): void {
    if (
      !Number.isFinite(lat)
      || lat < -90
      || lat > 90
      || !Number.isFinite(lng)
      || lng < -180
      || lng > 180
    ) {
      throw new Error('Captura una ubicación GPS válida antes de guardar el acta.');
    }
  }

  private validarFotoUrl(value: string): void {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Protocolo inválido');
      }
    } catch (error) {
      throw new Error('Supabase no devolvió una URL válida para la evidencia.', {
        cause: error,
      });
    }
  }

  private limpiarEstados(): void {
    this.recintosState.set({ status: 'idle' });
    this.jrvsState.set({ status: 'idle' });
    this.actasState.set({ status: 'idle' });
    this.usuariosState.set({ status: 'idle' });
    this.organizacionesState.set({ status: 'idle' });
    this.candidatosState.set({ status: 'idle' });
    this.guardarActaState.set({ status: 'idle' });
    this.crearRecintoState.set({ status: 'idle' });
    this.asignarVeedorState.set({ status: 'idle' });
  }

  private calcularMetricas(): MetricasEscrutinio {
    const filtro = this.filtroRecintoId();
    const jrvs = this.jrvs().filter(
      (jrv) => !filtro || jrv.recintoId === filtro,
    );
    const recintoJrvIds = new Set(jrvs.map(({ id }) => id));
    const actas = this.actas().filter(
      (acta) => recintoJrvIds.has(acta.jrvId)
        && (!filtro || acta.recintoId === filtro),
    );
    const totalActasEsperadas = jrvs.length * 2;
    const organizaciones = this.organizaciones();

    const votosPorDignidad = {
      ALCALDE: this.calcularVotosPorOrganizacion('ALCALDE', actas, organizaciones),
      PREFECTO: this.calcularVotosPorOrganizacion('PREFECTO', actas, organizaciones),
    } satisfies Record<Dignidad, readonly VotosPorOrganizacion[]>;

    return {
      totalJrvs: jrvs.length,
      totalActasEsperadas,
      actasIngresadas: actas.length,
      avancePorcentual: totalActasEsperadas === 0
        ? 0
        : Math.min(100, actas.length / totalActasEsperadas * 100),
      votosPorDignidad,
    };
  }

  private calcularVotosPorOrganizacion(
    dignidad: Dignidad,
    actas: readonly ActaElectoral[],
    organizaciones: readonly OrganizacionPolitica[],
  ): readonly VotosPorOrganizacion[] {
    const porSigla = new Map<SiglaOrganizacion, number>(
      SIGLAS_ORGANIZACION.map((sigla) => [sigla, 0]),
    );
    const actasDignidad = actas.filter((acta) => acta.dignidad === dignidad);

    for (const acta of actasDignidad) {
      for (const sigla of SIGLAS_ORGANIZACION) {
        porSigla.set(sigla, (porSigla.get(sigla) ?? 0) + acta.votosOrganizaciones[sigla]);
      }
    }

    const votosValidos = [...porSigla.values()].reduce((total, votos) => total + votos, 0);
    return SIGLAS_ORGANIZACION.map((sigla) => {
      const votos = porSigla.get(sigla) ?? 0;
      return {
        sigla,
        nombre: organizaciones.find((item) => item.sigla === sigla)?.nombre ?? sigla,
        votos,
        porcentaje: votosValidos === 0 ? 0 : votos / votosValidos * 100,
      };
    });
  }
}