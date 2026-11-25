# Control Electoral App

Aplicación móvil de control y escrutinio electoral desarrollada con **Ionic Angular Standalone**, **Angular 22**, **Firebase** y **Supabase**. Permite administrar recintos y JRV, asignar veedores, registrar actas con evidencia fotográfica y ubicación, auditar resultados y consultar consolidados provinciales.

> Proyecto académico de uso electoral. Antes de usarlo con datos reales, revise las reglas de seguridad, la privacidad de los datos, la normativa electoral aplicable y la configuración de los proveedores externos.

## Tabla de contenidos

- [Características](#características)
- [Arquitectura técnica](#arquitectura-técnica)
- [Roles y permisos](#roles-y-permisos)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración de entornos](#configuración-de-entornos)
- [Configuración de Firebase](#configuración-de-firebase)
- [Configuración de Supabase Storage](#configuración-de-supabase-storage)
- [Ejecutar la aplicación web](#ejecutar-la-aplicación-web)
- [Ejecutar en Android](#ejecutar-en-android)
- [Pruebas](#pruebas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Modelo funcional de datos](#modelo-funcional-de-datos)
- [Flujos principales](#flujos-principales)
- [Persistencia offline y sincronización](#persistencia-offline-y-sincronización)
- [Seguridad](#seguridad)
- [Decisiones arquitectónicas](#decisiones-arquitectónicas)
- [Solución de problemas](#solución-de-problemas)
- [Scripts disponibles](#scripts-disponibles)
- [Convenciones de desarrollo](#convenciones-de-desarrollo)

## Características

- Inicio de sesión mediante cédula ecuatoriana y correo asociado.
- Cambio obligatorio de contraseña en el primer acceso.
- Recuperación de contraseña por correo electrónico.
- Jerarquía de altas:
  - Coordinador Provincial crea Coordinadores de Recinto.
  - Coordinador de Recinto crea Veedores y asigna JRV.
- Gestión de provincia, cantón, parroquia, recintos y JRV.
- Registro de actas para Alcaldía y Prefectura.
- Validación de cédula ecuatoriana mediante el dígito verificador.
- Cuadre matemático de votos:
  - organizaciones políticas;
  - votos nulos;
  - votos blancos;
  - total de sufragantes.
- Captura nativa de fotografía y validación de nitidez.
- Obtención de coordenadas GPS con precisión alta y respaldo balanceado.
- Evidencia almacenada en Supabase Storage mediante URLs firmadas.
- Consolidado provincial y métricas de avance.
- Auditoría y corrección de actas por el Coordinador de Recinto.
- Colas locales y sincronización diferida cuando vuelve la conexión.
- Interfaz móvil con Ionic Material Design, modo claro y oscuro.
- Cierre de sesión visible desde las páginas autenticadas.

## Arquitectura técnica

### Stack principal

| Componente | Tecnología |
|---|---|
| Framework móvil y web | Ionic Angular 9 |
| Framework frontend | Angular 22 Standalone |
| Lenguaje | TypeScript 6 |
| Backend de identidad y datos | Firebase Auth y Cloud Firestore |
| Evidencias fotográficas | Supabase Storage |
| Empaquetado Android | Capacitor 8 |
| Cámara | `@capacitor/camera` |
| Ubicación | `@capacitor/geolocation` |
| Conectividad y almacenamiento local | `@capacitor/network`, `@capacitor/filesystem`, `Preferences` |
| Estado reactivo | Angular Signals |
| Formularios | Reactive Forms |
| Iconos | Ionicons |
| Pruebas | Vitest y Firebase Emulator Suite |

### Arquitectura por capas

```text
src/app/
├── core/
│   ├── guards/       # Protección por autenticación y rol
│   ├── models/       # Contratos del dominio
│   ├── services/     # Firebase, Firestore, estado y servicios nativos
│   └── validators/   # Cédula ecuatoriana y cuadre de actas
├── shared/
│   └── components/   # Header, feedback, editor de actas
└── features/
    ├── auth/         # Login, recuperación y cambio de contraseña
    ├── provincial/   # Consolidado, recintos y altas de coordinadores
    ├── recinto/      # JRV, veedores y auditoría
    └── veedor/       # Registro de actas y sincronización offline
```

Los componentes visuales no deben consultar Firebase o Supabase directamente. Los servicios de `core/` encapsulan el acceso a los proveedores externos y exponen señales o resultados tipados a las páginas.

### Estado de peticiones

Las operaciones de dominio usan `RequestState<T>`:

```typescript
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; error: string };
```

Esto permite indicadores explícitos de carga, éxito y error sin estados implícitos dentro de los componentes.

## Roles y permisos

### `PROVINCIAL`

- Crear recintos y JRV.
- Crear Coordinadores de Recinto.
- Consultar el consolidado provincial.
- Consultar recintos, JRV y actas.
- Gestionar organizaciones y candidatos.
- Eliminar actas en la capa de reglas.

### `RECINTO`

- Consultar su recinto asignado.
- Consultar JRV propias.
- Crear Veedores.
- Asignar o retirar Veedores de JRV propias.
- Consultar y auditar actas de su recinto.
- Corregir actas no bloqueadas.

### `VEEDOR`

- Consultar únicamente JRV asignadas.
- Registrar o corregir actas permitidas.
- Capturar fotografía y GPS.
- Mantener actas pendientes mientras no exista conexión.
- No puede modificar actas auditadas o bloqueadas.

## Requisitos

### Software

- Node.js compatible con Angular 22.
- npm.
- Firebase CLI para emuladores y despliegue de reglas.
- Android Studio y SDK de Android para APK.
- JDK compatible con el Gradle wrapper incluido.
- Navegador moderno para desarrollo web.

### Servicios externos

- Proyecto de Firebase con Authentication y Cloud Firestore.
- Proyecto de Supabase con bucket privado `actas-evidencias`.
- Firebase configurado como proveedor Third-Party Auth en Supabase para validar tokens.

## Instalación

Desde la raíz del proyecto:

```bash
npm install
```

Si se descargó el repositorio sin las configuraciones locales:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.prod.ts
```

En Windows PowerShell puede usarse:

```powershell
Copy-Item src/environments/environment.example.ts src/environments/environment.ts
Copy-Item src/environments/environment.example.ts src/environments/environment.prod.ts
```

Los archivos reales `environment.ts` y `environment.prod.ts` están excluidos por `.gitignore`. Complete sus valores sin guardar credenciales privadas de servidor.

## Configuración de entornos

La configuración tiene esta forma:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://TU-PROYECTO.supabase.co',
    key: 'TU_CLAVE_PUBLICABLE',
  },
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU-PROYECTO.firebaseapp.com',
    projectId: 'TU-PROYECTO',
    storageBucket: 'TU-PROYECTO.firebasestorage.app',
    messagingSenderId: 'TU_MESSAGING_SENDER_ID',
    appId: 'TU_APP_ID',
    measurementId: 'TU_MEASUREMENT_ID',
  },
};
```

Para producción, `environment.prod.ts` debe tener `production: true` y los datos reales del entorno de despliegue.

No coloque claves administrativas de Firebase ni claves `service_role` de Supabase en el cliente.

## Configuración de Firebase

### 1. Crear proyecto

1. Cree un proyecto en Firebase.
2. Registre una aplicación Web.
3. Copie su configuración a `src/environments/environment.ts`.
4. Registre la aplicación Android si usará notificaciones o servicios vinculados al paquete.

### 2. Authentication

Habilite Firebase Authentication con proveedor de correo y contraseña.

- Los usuarios no se crean libremente desde el login.
- Los perfiles subordinados se crean desde la interfaz jerárquica.
- Para evitar cerrar la sesión del coordinador activo, el alta usa una instancia secundaria de Firebase.
- Los nuevos usuarios reciben la clave inicial `Ecuador2026` y deben cambiarla.

### 3. Cloud Firestore

Las colecciones principales son:

| Colección | Uso |
|---|---|
| `usuarios` | Perfil, rol, recinto/JRV y requisito de cambio de clave |
| `cedulas_lookup` | Relación entre cédula, correo y UID |
| `recintos` | Datos geográficos y coordinador asignado |
| `jrvs` | Mesa, recinto y veedor asignado |
| `organizaciones` | Organizaciones políticas |
| `candidatos` | Candidaturas por dignidad |
| `actas` | Votos, evidencia, GPS y estado de auditoría |

### 4. Desplegar reglas

Inicie sesión en Firebase CLI y despliegue las reglas:

```bash
firebase login
firebase use TU-PROYECTO
firebase deploy --only firestore:rules
```

Para una ejecución local sin alterar datos remotos:

```bash
npm run test:firestore-rules
```

## Configuración de Supabase Storage

1. Cree un proyecto de Supabase.
2. Cree el bucket privado `actas-evidencias`.
3. Configure Firebase como proveedor Third-Party Auth.
4. Ejecute el contenido de `supabase-storage-policies.sql` en el editor SQL de Supabase.
5. Configure `environment.supabase.url` y la clave publicable.

Las evidencias deben conservar esta estructura:

```text
<UID-FIREBASE>/<RECINTO>/<JRV-DIGNIDAD>_<timestamp>_<secuencia>.jpg
```

El servicio valida que el primer segmento coincida con el UID autenticado y genera URLs firmadas con vigencia limitada.

No use buckets públicos para las fotos de actas.

## Ejecutar la aplicación web

### Desarrollo

```bash
npm start
```

La aplicación normalmente queda disponible en `http://localhost:4200`.

### Compilación

```bash
npm run build
```

El resultado web se escribe en `www/`. Esta carpeta se excluye del control de versiones.

## Ejecutar en Android

### Preparación

Instale Android Studio, las herramientas de Android SDK y configure `ANDROID_SDK_ROOT`.

Desde la raíz:

```bash
npm run build
ionic cap sync android
ionic cap open android
```

Dentro de Android Studio:

1. Espere a que Gradle sincronice.
2. Seleccione un dispositivo o emulador.
3. Ejecute la app con el botón **Run**.
4. Para generar un instalador: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

El proyecto incluye permisos Android para:

- Cámara.
- Ubicación aproximada.
- Ubicación precisa.
- Acceso a Internet.

Las respuestas de permisos se gestionan en tiempo de ejecución desde `MediaLocationService`.

### Resolución manual

```bash
cd android
./gradlew assembleDebug
```

En Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

## Pruebas

### Pruebas unitarias

```bash
npm test -- --watch=false
```

Las pruebas cubren servicios y validadores, incluyendo calidad de imagen, ubicación offline y sincronización local.

### Lint

```bash
npm run lint
```

### Reglas de Firestore

```bash
npm run test:firestore-rules
```

Este comando inicia automáticamente el emulator de Firestore y ejecuta `scripts/firestore-rules.test.mjs`.

Las pruebas verifican, entre otros escenarios:

- acceso de Veedor solo a su JRV;
- creación jerárquica de usuarios;
- asignación de JRV dentro del recinto;
- lectura puntual de `cedulas_lookup`;
- prohibición de listado masivo de cédulas;
- permisos de coordinadores y provinciales.

## Estructura del proyecto

```text
.
├── android/                 # Proyecto nativo Android y Gradle
├── docs/adr/                # Registro de decisiones arquitectónicas
├── scripts/                 # Pruebas de reglas de Firestore
├── src/
│   ├── app/
│   │   ├── core/
│   │   ├── features/
│   │   └── shared/
│   ├── assets/
│   ├── environments/
│   ├── theme/
│   ├── global.scss
│   ├── main.ts
│   └── test-setup.ts
├── angular.json
├── capacitor.config.ts
├── firebase.json
├── firestore.rules
├── package.json
└── supabase-storage-policies.sql
```

## Modelo funcional de datos

### Usuario

```typescript
interface Usuario {
  id: string;
  uid?: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string;
  rol: 'PROVINCIAL' | 'RECINTO' | 'VEEDOR';
  debeCambiarClave: boolean;
  recintoId: string | null;
  jrvIds: readonly string[];
}
```

Los perfiles nuevos guardan `id` y `uid` con el mismo UID de Firebase Auth.

### Acta

Un acta contiene:

- JRV y recinto.
- Dignidad: `ALCALDE` o `PREFECTO`.
- Votos por las cinco organizaciones.
- Votos nulos y blancos.
- Total de sufragantes.
- Ruta y URL de la fotografía.
- Latitud y longitud.
- Estado de auditoría.
- Marca temporal del cliente.

### Mapeo de cédula

```text
cedulas_lookup/{cedula}
{
  email: string,
  uid: string
}
```

El login hace una lectura puntual con `cedula.trim()`, inicia sesión con el correo encontrado y valida el UID antes de cargar `usuarios/{uid}`.

## Flujos principales

### Inicio de sesión

1. El usuario ingresa una cédula válida y contraseña.
2. Se obtiene el documento `cedulas_lookup/{cedula}`.
3. Se inicia sesión con el correo asociado.
4. Se carga `usuarios/{firebaseUid}`.
5. Se valida el perfil y el correo verificado.
6. Si corresponde, se exige el cambio de contraseña.
7. El usuario se dirige a su página por rol.

### Cambio obligatorio de clave

1. El guard `firstLoginGuard` detecta `requiereCambioClave`.
2. El usuario ingresa una clave nueva.
3. Firebase Auth actualiza la contraseña.
4. Firestore cambia `debeCambiarClave` a `false`.
5. Se permite la navegación al panel correspondiente.

### Registro de acta

1. El Veedor selecciona JRV y dignidad.
2. Captura una fotografía de la cámara.
3. `ImageQualityService` rechaza imágenes con varianza Laplaciana menor a 100.
4. `MediaLocationService` obtiene coordenadas GPS.
5. Se valida el cuadre aritmético.
6. Con conexión, se sube la foto a Supabase y se guarda el acta en Firestore.
7. Sin conexión, se guarda una entrada local en cola.

### Auditoría

1. El Coordinador de Recinto revisa las actas del recinto.
2. Corrige votos o mantiene los datos validados.
3. Marca la acta como auditada.
4. Firestore bloquea modificaciones posteriores según las reglas.

### Cierre de sesión

El botón **Salir** del header compartido ejecuta `AuthStateService.cerrarSesion()`:

1. llama a `signOut`;
2. vacía el usuario actual;
3. limpia requisitos de cambio de clave;
4. restablece el estado de autenticación;
5. navega reemplazando la URL hacia `/auth/login`.

El estado de escrutinio observado por Signals se desconecta cuando `usuarioActual` pasa a `null`.

## Persistencia offline y sincronización

La aplicación puede persistir una fotografía y los datos del acta localmente cuando no existe conectividad.

- Monitoreo de red mediante Capacitor Network.
- Cola persistente mediante Preferences.
- Fotografía guardada con Filesystem.
- Clave idempotente:
  - JRV;
  - dignidad.
- Estrategia de conflicto:
  - prevalece la corrección auditada del Coordinador;
  - si no está auditada, puede aplicarse last-write-wins según `client_timestamp`.
- Tras reconectar:
  1. se procesa la cola;
  2. se sube primero la fotografía;
  3. se registra o actualiza el acta;
  4. se elimina el archivo temporal después de una confirmación completa.

La desinstalación o eliminación de datos de la app puede borrar la cola local.

## Seguridad

### Firebase

- Los accesos se protegen por UID autenticado y rol leído desde `usuarios/{uid}`.
- `cedulas_lookup` permite lectura puntual; no permite listados.
- Cada usuario puede leer su propio perfil.
- Provinciales y Coordinadores tienen permisos diferenciados.
- Las operaciones de usuario subordinado se validan con datos existentes y asignaciones.

### Supabase

- Bucket privado.
- Autorización mediante token Firebase.
- El primer segmento de la ruta debe coincidir con el claim `sub`.
- La selección, inserción y actualización se restringen al propietario.
- La eliminación pública está restringida.

### Cliente

- No almacenar claves administrativas en el navegador o APK.
- No registrar imágenes ni datos reales en repositorios públicos.
- No confiar exclusivamente en validaciones TypeScript: Firestore y Supabase deben aplicar controles en el servidor.
- Rotar inmediatamente cualquier clave que haya sido publicada accidentalmente.

## Decisiones arquitectónicas

Las decisiones completas se encuentran en `docs/adr/`:

| ADR | Tema |
|---|---|
| [ADR-001](docs/adr/ADR-001.md) | Ionic Angular Standalone y arquitectura por capas |
| [ADR-002](docs/adr/ADR-002.md) | Firebase y Supabase Storage |
| [ADR-003](docs/adr/ADR-003.md) | Capacitor, cámara, GPS y Android |
| [ADR-004](docs/adr/ADR-004.md) | Angular Signals y estados de UX |
| [ADR-005](docs/adr/ADR-005.md) | Separación core/shared/features y validadores |
| [ADR-006](docs/adr/ADR-006.md) | Persistencia local y sincronización offline |

## Solución de problemas

### `Calling Firebase APIs outside of an Injection context`

Las operaciones modulares de AngularFire deben ejecutarse dentro de `runInInjectionContext(this.injector, () => ...)`. Los servicios principales ya aplican este patrón.

### `Expected first argument to doc() to be a CollectionReference...`

Compruebe que el primer argumento sea la instancia inyectada:

```typescript
private readonly firestore = inject(Firestore);
doc(this.firestore, 'cedulas_lookup', cedula);
```

No mezcle un `doc()` de `firebase/firestore` con una instancia `Firestore` de `@angular/fire/firestore`.

Use una sola versión compatible de `firebase` y `@angular/fire`.

### Error `permission-denied`

Revise:

- usuario autenticado;
- rol guardado en `usuarios/{uid}`;
- asignación de recinto/JRV;
- campos obligatorios de `usuarios`, `recintos`, `jrvs` y `actas`;
- reglas desplegadas en el proyecto correcto;
- proyecto de Firebase configurado en `environment.ts`.

### La fotografía se rechaza como borrosa

Repita la captura en un lugar iluminado, sostenga el dispositivo y evite reflejos o movimiento.

### El GPS excede el tiempo de espera

- habilite ubicación del dispositivo;
- use el exterior o una zona con mejor recepción;
- revise permisos Android;
- el servicio intenta precisión balanceada después de un timeout.

### Los iconos no se muestran

Compruebe que `addIcons()` registre el nombre usado por el componente y que el SVG correspondiente exista en `node_modules/ionicons/dist/ionicons/svg`.

### La app Android muestra datos antiguos

Ejecute:

```bash
npm run build
ionic cap sync android
ionic cap open android
```

Después, reconstruya desde Android Studio.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm start` | Ejecuta el servidor Angular/Ionic |
| `npm run build` | Compila el proyecto en `www/` |
| `npm run watch` | Compilación continua de desarrollo |
| `npm test -- --watch=false` | Ejecuta las pruebas unitarias |
| `npm run lint` | Ejecuta ESLint sobre archivos TypeScript y HTML |
| `npm run test:firestore-rules` | Inicia el emulator y prueba las reglas |
| `ionic cap sync android` | Copia el build web al proyecto Android |
| `ionic cap open android` | Abre el proyecto en Android Studio |

## Convenciones de desarrollo

- Componentes Standalone y carga diferida por rutas.
- Servicios `providedIn: 'root'`.
- Inyección mediante `inject()`.
- Operaciones Firebase dentro de `runInInjectionContext`.
- Señales para estado compartido y computados para derivaciones.
- Validaciones puras dentro de `core/validators`.
- Interfaces sincronizadas con las reglas y documentos.
- Errores Firebase registrados con `console.error('Detalle error Firebase:', error)`.
- Mensajes de usuario amigables, sin ocultar por completo el código real.
- Límites claros entre `core`, `shared` y `features`.
- No enviar cambios reales de credenciales o datos personales.
- Ejecutar lint, unit tests y reglas antes de entregar.

## Licencia y uso

No se incluye una licencia explícita en el repositorio. Para publicar o distribuir el proyecto, confirme la propiedad del código y agregue una licencia acorde antes de su uso público.
