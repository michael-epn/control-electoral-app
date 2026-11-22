import {
  DestroyRef,
  Injectable,
  Injector,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  Auth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
} from '@angular/fire/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { environment } from '../../../environments/environment';
import type { RequestState } from '../models/request-state.model';
import type { CrearUsuarioDto } from '../models/crear-usuario.dto';
import type { RolUsuario } from '../models/rol-usuario.model';
import type { Usuario } from '../models/usuario.model';
import { validarCedulaEcuatoriana } from '../validators/cedula-ecuatoriana.validator';

const CLAVE_INICIAL = 'Ecuador2026';
const ROLES: readonly RolUsuario[] = ['PROVINCIAL', 'RECINTO', 'VEEDOR'];

interface MapeoCedula {
  readonly email: string;
  readonly uid: string;
}

interface DatosAlta {
  readonly email: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly telefono: string | null;
  readonly rol: 'RECINTO' | 'VEEDOR';
  readonly recintoId: string;
  readonly jrvIds: readonly string[];
}

class AuthFlowError extends Error {}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esMapeoCedula(valor: unknown): valor is MapeoCedula {
  return esRegistro(valor)
    && typeof valor['email'] === 'string'
    && typeof valor['uid'] === 'string';
}

function esRolUsuario(valor: unknown): valor is RolUsuario {
  return typeof valor === 'string'
    && ROLES.some((rol) => rol === valor);
}

function validacionesUsuario(valor: unknown, uid: string): string[] {
  if (!esRegistro(valor)) {
    return ['El documento no contiene un objeto de perfil.'];
  }

  const validaciones: string[] = [];
  const id = valor['id'] ?? valor['uid'] ?? uid;
  const rolProvincial = valor['rol'] === 'PROVINCIAL';

  if (id !== uid) {
    validaciones.push('El campo id/uid no coincide con el UID autenticado.');
  }
  if (typeof valor['cedula'] !== 'string') {
    validaciones.push('El campo cedula no es texto.');
  }
  if (typeof valor['nombres'] !== 'string') {
    validaciones.push('El campo nombres no es texto.');
  }
  if (typeof valor['apellidos'] !== 'string') {
    validaciones.push('El campo apellidos no es texto.');
  }
  if (typeof valor['telefono'] !== 'string' && valor['telefono'] !== null) {
    validaciones.push('El campo telefono debe ser texto o null.');
  }
  if (typeof valor['email'] !== 'string') {
    validaciones.push('El campo email no es texto.');
  }
  if (!esRolUsuario(valor['rol'])) {
    validaciones.push('El campo rol no contiene un rol reconocido.');
  }
  if (typeof valor['debeCambiarClave'] !== 'boolean') {
    validaciones.push('El campo debeCambiarClave no es booleano.');
  }

  if (!rolProvincial) {
    if (typeof valor['recintoId'] !== 'string' && valor['recintoId'] !== null) {
      validaciones.push('El campo recintoId debe ser texto o null.');
    }
    if (
      !Array.isArray(valor['jrvIds'])
      || !valor['jrvIds'].every((jrvId: unknown) => typeof jrvId === 'string')
    ) {
      validaciones.push('El campo jrvIds debe ser una lista de textos.');
    }
  }

  return validaciones;
}

function esUsuario(valor: unknown, uid: string): valor is Usuario {
  return validacionesUsuario(valor, uid).length === 0;
}

function codigoError(error: unknown): string | null {
  if (!esRegistro(error) || typeof error['code'] !== 'string') {
    return null;
  }

  return error['code'];
}

function mensajeError(error: unknown): string {
  if (error instanceof AuthFlowError) {
    return error.message;
  }

  if (error instanceof AggregateError) {
    const details = [...error.errors].map(mensajeError);
    if (details.length > 0) {
      return details.join(' | ');
    }
  }

  switch (codigoError(error)) {
    case 'auth/invalid-credential':
      return 'Contraseña incorrecta';
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'La cédula o la contraseña no son correctas.';
    case 'auth/too-many-requests':
      return 'Se realizaron demasiados intentos. Espera e inténtalo nuevamente.';
    case 'auth/network-request-failed':
      return 'No hay conexión. Verifica tu red e inténtalo nuevamente.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo electrónico.';
    case 'auth/weak-password':
      return 'La nueva contraseña no cumple los requisitos de seguridad.';
    case 'auth/requires-recent-login':
      return 'Vuelve a iniciar sesión antes de cambiar la contraseña.';
    case 'permission-denied':
      return 'Permisos insuficientes en Firestore';
    default: {
      const code = codigoError(error);
      const detail = esRegistro(error) && typeof error['message'] === 'string'
        ? error['message']
        : error instanceof Error
          ? error.message
          : String(error);
      return code ? `${code}: ${detail}` : detail;
    }
  }
}

export function rutaInicioPorRol(rol: RolUsuario): string {
  switch (rol) {
    case 'PROVINCIAL':
      return '/provincial';
    case 'RECINTO':
      return '/recinto';
    case 'VEEDOR':
      return '/veedor';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  readonly usuarioActual = signal<Usuario | null>(null);
  readonly authState = signal<RequestState<Usuario>>({ status: 'idle' });
  readonly requiereCambioClave = signal(false);

  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authInicializado: Promise<void>;
  private resolverAuthInicializado: (() => void) | null = null;
  private authInicializadoResuelto = false;
  private passwordInicialUsada = false;
  private secondaryAppId = 0;

  constructor() {
    this.authInicializado = new Promise<void>((resolve) => {
      this.resolverAuthInicializado = resolve;
    });

    const unsubscribe = runInInjectionContext(this.injector, () =>
      onAuthStateChanged(
        this.auth,
        (firebaseUser) => {
          void this.sincronizarUsuario(firebaseUser);
        },
        (error) => {
          console.error('Detalle error Firebase:', error);
          this.usuarioActual.set(null);
          this.requiereCambioClave.set(false);
          this.authState.set({ status: 'error', error: mensajeError(error) });
          this.resolverInicializacion();
        },
      ),
    );
    this.destroyRef.onDestroy(unsubscribe);
  }

  esperarInicializacion(): Promise<void> {
    return this.authInicializado;
  }

  limpiarError(): void {
    if (this.authState().status !== 'error') {
      return;
    }

    const usuario = this.usuarioActual();
    this.authState.set(usuario
      ? { status: 'success', data: usuario }
      : { status: 'idle' });
  }

  async iniciarSesionPorCedula(
    cedula: string,
    contrasena: string,
  ): Promise<Usuario | null> {
    this.authState.set({ status: 'loading' });
    let sesionCreada = false;

    try {
      if (!validarCedulaEcuatoriana(cedula.trim())) {
        throw new AuthFlowError('Ingresa una cédula ecuatoriana válida.');
      }

      const mapeoSnapshot = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'cedulas_lookup', cedula.trim())),
      );
      const mapeo = mapeoSnapshot.data();
      if (!mapeoSnapshot.exists() || !esMapeoCedula(mapeo)) {
        throw new AuthFlowError('La cédula o la contraseña no son correctas.');
      }

      const credencial = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(this.auth, mapeo.email, contrasena),
      );
      sesionCreada = true;

      if (!credencial.user.emailVerified) {
        throw new AuthFlowError('Confirma tu correo electrónico antes de iniciar sesión.');
      }

      if (credencial.user.uid !== mapeo.uid) {
        throw new AuthFlowError('No se pudo verificar la identidad de la cuenta.');
      }

      let usuario = await this.cargarPerfil(credencial.user.uid);
      this.passwordInicialUsada = contrasena === CLAVE_INICIAL;
      if (this.passwordInicialUsada && !usuario.debeCambiarClave) {
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'usuarios', usuario.id), {
            debeCambiarClave: true,
          }),
        );
        usuario = { ...usuario, debeCambiarClave: true };
      }

      this.usuarioActual.set(usuario);
      this.requiereCambioClave.set(
        usuario.debeCambiarClave || this.passwordInicialUsada,
      );
      this.authState.set({ status: 'success', data: usuario });
      return usuario;
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      let fallo: unknown = error;
      if (sesionCreada && this.auth.currentUser) {
        try {
          await runInInjectionContext(this.injector, () => signOut(this.auth));
        } catch (errorAlCerrarSesion) {
          console.error('Detalle error Firebase:', errorAlCerrarSesion);
          fallo = new AggregateError(
            [error, errorAlCerrarSesion],
            'Falló el acceso y no se pudo cerrar la sesión.',
          );
        }
      }

      this.usuarioActual.set(null);
      this.requiereCambioClave.set(false);
      this.authState.set({ status: 'error', error: mensajeError(fallo) });
      return null;
    }
  }

  async recuperarContrasenaPorCedula(cedula: string): Promise<void> {
    try {
      if (!validarCedulaEcuatoriana(cedula.trim())) {
        throw new AuthFlowError('Ingresa una cédula ecuatoriana válida.');
      }

      const mapeoSnapshot = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'cedulas_lookup', cedula.trim())),
      );
      if (!mapeoSnapshot.exists()) {
        return;
      }

      const mapeo = mapeoSnapshot.data();
      if (!esMapeoCedula(mapeo)) {
        throw new AuthFlowError('No se pudo resolver el correo para recuperar la cuenta.');
      }

      await runInInjectionContext(this.injector, () =>
        sendPasswordResetEmail(this.auth, mapeo.email),
      );
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      throw new Error(mensajeError(error), { cause: error });
    }
  }

  async cambiarContrasena(nuevaContrasena: string): Promise<boolean> {
    const firebaseUser = this.auth.currentUser;
    const usuario = this.usuarioActual();

    if (!firebaseUser || !usuario) {
      this.authState.set({
        status: 'error',
        error: 'Inicia sesión para cambiar la contraseña.',
      });
      return false;
    }

    if (nuevaContrasena === CLAVE_INICIAL) {
      this.authState.set({
        status: 'error',
        error: 'La nueva contraseña debe ser distinta de la clave inicial.',
      });
      return false;
    }

    this.authState.set({ status: 'loading' });
    if (!firebaseUser.emailVerified) {
      this.usuarioActual.set(null);
      this.requiereCambioClave.set(false);
      this.authState.set({
        status: 'error',
        error: 'Confirma tu correo electrónico antes de acceder.',
      });
      this.resolverInicializacion();
      return false;
    }

    try {
      await runInInjectionContext(this.injector, () =>
        updatePassword(firebaseUser, nuevaContrasena),
      );
      if (usuario.debeCambiarClave || this.passwordInicialUsada) {
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'usuarios', firebaseUser.uid), {
            debeCambiarClave: false,
          }),
        );
      }

      const usuarioActualizado: Usuario = {
        ...usuario,
        debeCambiarClave: false,
      };
      this.usuarioActual.set(usuarioActualizado);
      this.requiereCambioClave.set(false);
      this.passwordInicialUsada = false;
      this.authState.set({
        status: 'success',
        data: usuarioActualizado,
        message: 'La contraseña se actualizó correctamente.',
      });
      return true;
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      this.authState.set({ status: 'error', error: mensajeError(error) });
      return false;
    }
  }

  async crearUsuarioSubordinado(datos: CrearUsuarioDto): Promise<Usuario> {
    const coordinador = this.usuarioActual();
    const firebaseUser = this.auth.currentUser;
    if (!coordinador || !firebaseUser || coordinador.id !== firebaseUser.uid) {
      throw new AuthFlowError('Inicia sesión con un perfil de coordinación válido.');
    }

    this.authState.set({ status: 'loading' });

    try {
      const alta = await this.prepararAlta(datos, coordinador);
      const uid = await this.crearCuentaSecundaria(alta.email);

      const nuevoUsuario: Usuario = {
        id: uid,
        uid,
        cedula: datos.cedula,
        nombres: alta.nombres,
        apellidos: alta.apellidos,
        telefono: alta.telefono,
        email: alta.email,
        rol: alta.rol,
        debeCambiarClave: true,
        recintoId: alta.recintoId,
        jrvIds: alta.jrvIds,
      };

      try {
        const mapeoRef = runInInjectionContext(this.injector, () =>
          doc(this.firestore, 'cedulas_lookup', datos.cedula),
        );
        const usuarioRef = runInInjectionContext(this.injector, () =>
          doc(this.firestore, 'usuarios', uid),
        );
        const recintoRef = alta.rol === 'RECINTO'
          ? runInInjectionContext(this.injector, () =>
            doc(this.firestore, 'recintos', alta.recintoId),
          )
          : null;
        const jrvRefs = alta.rol === 'VEEDOR'
          ? alta.jrvIds.map((jrvId) =>
            runInInjectionContext(this.injector, () =>
              doc(this.firestore, 'jrvs', jrvId),
            ),
          )
          : [];
        await runInInjectionContext(this.injector, () =>
          runTransaction(this.firestore, async (transaction) => {
            const mapeoSnapshot = await transaction.get(mapeoRef);
            if (mapeoSnapshot.exists()) {
              throw new AuthFlowError('Ya existe una cuenta asociada a esa cédula.');
            }

            if (recintoRef) {
              const recintoSnapshot = await transaction.get(recintoRef);
              const recintoData = recintoSnapshot.data();
              if (
                !recintoSnapshot.exists()
                || !esRegistro(recintoData)
                || (typeof recintoData['coordinadorId'] === 'string'
                  && recintoData['coordinadorId'] !== '')
              ) {
                throw new AuthFlowError('El recinto no existe o ya tiene coordinador asignado.');
              }
            } else {
              const jrvSnapshots = await Promise.all(
                jrvRefs.map((jrvRef) => transaction.get(jrvRef)),
              );
              for (const jrvSnapshot of jrvSnapshots) {
                const jrvData = jrvSnapshot.data();
                if (
                  !jrvSnapshot.exists()
                  || !esRegistro(jrvData)
                  || jrvData['recintoId'] !== alta.recintoId
                  || (typeof jrvData['veedorId'] === 'string'
                    && jrvData['veedorId'] !== '')
                ) {
                  throw new AuthFlowError(
                    'Una JRV no existe, pertenece a otro recinto o ya tiene veedor asignado.',
                  );
                }
              }
            }

            transaction.set(usuarioRef, nuevoUsuario);
            transaction.set(mapeoRef, {
              uid,
              email: alta.email,
            });

            if (recintoRef) {
              transaction.update(recintoRef, { coordinadorId: uid });
            } else {
              for (const jrvRef of jrvRefs) {
                transaction.update(jrvRef, { veedorId: uid });
              }
            }
          }),
        );
      } catch (error) {
        console.error('Detalle error Firebase:', error);
        try {
          await this.eliminarCuentaSecundaria(alta.email);
        } catch (rollbackError) {
          console.error('Detalle error Firebase:', rollbackError);
          throw new AggregateError(
            [error, rollbackError],
            'Falló la persistencia del perfil y no fue posible revertir la cuenta de Auth.',
          );
        }
        throw error;
      }

      this.authState.set({
        status: 'success',
        data: coordinador,
        message: 'La cuenta y el perfil subordinado se crearon correctamente.',
      });
      return nuevoUsuario;
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      this.authState.set({ status: 'error', error: mensajeError(error) });
      throw error;
    }
  }

  private async prepararAlta(
    datos: CrearUsuarioDto,
    coordinador: Usuario,
  ): Promise<DatosAlta> {
    if (!validarCedulaEcuatoriana(datos.cedula)) {
      throw new AuthFlowError('La cédula ingresada no es válida.');
    }

    const email = datos.email.trim().toLowerCase();
    const nombres = datos.nombres.trim();
    const apellidos = datos.apellidos.trim();
    if (!email || !nombres || !apellidos) {
      throw new AuthFlowError('Correo, nombres y apellidos son obligatorios.');
    }

    const lookup = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'cedulas_lookup', datos.cedula)),
    );
    if (lookup.exists()) {
      throw new AuthFlowError('Ya existe una cuenta asociada a esa cédula.');
    }

    if (coordinador.rol === 'PROVINCIAL' && datos.rol === 'RECINTO') {
      const recintoId = datos.recintoId?.trim();
      if (!recintoId || (datos.jrvIds?.length ?? 0) > 0) {
        throw new AuthFlowError(
          'Selecciona un recinto para el Coordinador de Recinto y no asignes JRV todavía.',
        );
      }

      const recintoSnapshot = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'recintos', recintoId)),
      );
      const recinto = recintoSnapshot.data();
      if (
        !recintoSnapshot.exists()
        || !esRegistro(recinto)
        || (typeof recinto['coordinadorId'] === 'string'
          && recinto['coordinadorId'] !== '')
      ) {
        throw new AuthFlowError('El recinto no existe o ya tiene coordinador asignado.');
      }

      return {
        email,
        nombres,
        apellidos,
        telefono: datos.telefono?.trim() || null,
        rol: 'RECINTO',
        recintoId,
        jrvIds: [],
      };
    }

    if (coordinador.rol === 'RECINTO' && datos.rol === 'VEEDOR') {
      const recintoId = coordinador.recintoId;
      const jrvIds = [...new Set(datos.jrvIds ?? [])];
      if (!recintoId || jrvIds.length === 0) {
        throw new AuthFlowError('Selecciona al menos una JRV del recinto asignado.');
      }
      if (jrvIds.length !== (datos.jrvIds?.length ?? 0)) {
        throw new AuthFlowError('No repitas una JRV en la asignación del veedor.');
      }

      const jrvSnapshots = await Promise.all(jrvIds.map((jrvId) =>
        runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'jrvs', jrvId)),
        ),
      ));
      for (const jrvSnapshot of jrvSnapshots) {
        const jrv = jrvSnapshot.data();
        if (
          !jrvSnapshot.exists()
          || !esRegistro(jrv)
          || jrv['recintoId'] !== recintoId
          || (typeof jrv['veedorId'] === 'string' && jrv['veedorId'] !== '')
        ) {
          throw new AuthFlowError(
            'Una JRV no existe, pertenece a otro recinto o ya tiene veedor asignado.',
          );
        }
      }

      return {
        email,
        nombres,
        apellidos,
        telefono: datos.telefono?.trim() || null,
        rol: 'VEEDOR',
        recintoId,
        jrvIds,
      };
    }

    throw new AuthFlowError(
      'La jerarquía solo permite PROVINCIAL → RECINTO y RECINTO → VEEDOR.',
    );
  }

  private async cargarPerfil(uid: string): Promise<Usuario> {
    const perfilSnapshot = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'usuarios', uid)),
    );
    const perfilRecibido = perfilSnapshot.data();
    const perfil = esRegistro(perfilRecibido)
      ? {
        ...perfilRecibido,
        id: perfilRecibido['id'] ?? perfilRecibido['uid'] ?? uid,
        uid,
        debeCambiarClave: Boolean(perfilRecibido['debeCambiarClave']),
        ...(perfilRecibido['rol'] === 'PROVINCIAL'
          ? {
            recintoId: typeof perfilRecibido['recintoId'] === 'string'
              ? perfilRecibido['recintoId']
              : null,
            jrvIds: Array.isArray(perfilRecibido['jrvIds'])
              && perfilRecibido['jrvIds'].every((jrvId: unknown) =>
                typeof jrvId === 'string',
              )
              ? perfilRecibido['jrvIds']
              : [],
          }
          : {}),
      }
      : perfilRecibido;

    if (!perfilSnapshot.exists() || !esUsuario(perfil, uid)) {
      const validaciones = perfilSnapshot.exists()
        ? validacionesUsuario(perfil, uid)
        : ['No existe el documento de perfil en la colección usuarios.'];
      console.error('Validación de perfil Firestore fallida:', {
        uid,
        perfil: perfilRecibido,
        validaciones,
      });
      throw new AuthFlowError(
        `La cuenta no tiene un perfil electoral válido: ${validaciones.join(' ')}`,
      );
    }

    return perfil;
  }

  private async sincronizarUsuario(firebaseUser: User | null): Promise<void> {
    if (!firebaseUser) {
      this.usuarioActual.set(null);
      this.requiereCambioClave.set(false);
      this.passwordInicialUsada = false;
      this.authState.set({ status: 'idle' });
      this.resolverInicializacion();
      return;
    }

    this.authState.set({ status: 'loading' });
    if (!firebaseUser.emailVerified) {
      this.usuarioActual.set(null);
      this.requiereCambioClave.set(false);
      this.authState.set({
        status: 'error',
        error: 'Confirma tu correo electrónico antes de acceder.',
      });
      this.resolverInicializacion();
      return;
    }

    try {
      const usuario = await this.cargarPerfil(firebaseUser.uid);
      this.usuarioActual.set(usuario);
      this.requiereCambioClave.set(
        usuario.debeCambiarClave || this.passwordInicialUsada,
      );
      this.authState.set({ status: 'success', data: usuario });
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      this.usuarioActual.set(null);
      this.requiereCambioClave.set(false);
      this.authState.set({ status: 'error', error: mensajeError(error) });
    } finally {
      this.resolverInicializacion();
    }
  }

  private resolverInicializacion(): void {
    if (this.authInicializadoResuelto) {
      return;
    }

    this.authInicializadoResuelto = true;
    this.resolverAuthInicializado?.();
    this.resolverAuthInicializado = null;
  }

  private async crearCuentaSecundaria(email: string): Promise<string> {
    const nombreApp =
      `SecondaryApp_${Date.now()}_${++this.secondaryAppId}`;
    const app = initializeApp(environment.firebase, nombreApp);
    const authSecundaria = getAuth(app);
    let usuarioCreado: User | null = null;
    let uid: string | null = null;

    try {
      const credencial = await runInInjectionContext(this.injector, () =>
        createUserWithEmailAndPassword(authSecundaria, email, CLAVE_INICIAL),
      );
      const cuentaCreada = credencial.user;
      usuarioCreado = cuentaCreada;
      uid = cuentaCreada.uid;
      await runInInjectionContext(this.injector, () =>
        sendEmailVerification(cuentaCreada),
      );
    } catch (error) {
      console.error('Detalle error Firebase:', error);
      if (usuarioCreado) {
        try {
          const cuentaCreada = usuarioCreado;
          await runInInjectionContext(this.injector, () => deleteUser(cuentaCreada));
        } catch (cleanupError) {
          console.error('Detalle error Firebase:', cleanupError);
          throw new AggregateError(
            [error, cleanupError],
            'No se pudo enviar la verificación ni revertir la cuenta secundaria.',
          );
        }
      }
      throw error;
    } finally {
      try {
        if (authSecundaria.currentUser) {
          await runInInjectionContext(this.injector, () => signOut(authSecundaria));
        }
      } finally {
        await deleteApp(app);
      }
    }

    if (!uid) {
      throw new AuthFlowError('Firebase no devolvió el UID de la cuenta creada.');
    }

    return uid;
  }

  private async eliminarCuentaSecundaria(email: string): Promise<void> {
    const nombreApp =
      `SecondaryApp_${Date.now()}_${++this.secondaryAppId}`;
    const app = initializeApp(environment.firebase, nombreApp);
    const authSecundaria = getAuth(app);

    try {
      const credencial = await runInInjectionContext(this.injector, () =>
        signInWithEmailAndPassword(authSecundaria, email, CLAVE_INICIAL),
      );
      await runInInjectionContext(this.injector, () => deleteUser(credencial.user));
    } finally {
      try {
        if (authSecundaria.currentUser) {
          await runInInjectionContext(this.injector, () => signOut(authSecundaria));
        }
      } finally {
        await deleteApp(app);
      }
    }
  }
}
