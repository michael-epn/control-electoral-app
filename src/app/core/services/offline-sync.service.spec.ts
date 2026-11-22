import { TestBed } from '@angular/core/testing';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Firestore } from '@angular/fire/firestore';
import type { Transaction } from 'firebase/firestore';
import { signal } from '@angular/core';
import type { GuardarActaDto } from '../models/escrutinio.dto';
import type { Usuario } from '../models/usuario.model';
import { AuthStateService } from './auth-state.service';
import { OfflineSyncService } from './offline-sync.service';
import { SupabaseService } from './supabase.service';

const capacitorMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  getStatus: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  deleteFile: vi.fn(),
  preferencesGet: vi.fn(),
  preferencesSet: vi.fn(),
  runTransaction: vi.fn(),
  doc: vi.fn((...parts: string[]) => parts.join('/')),
  listener: null as ((status: { connected: boolean }) => void) | null,
  preferenceValue: null as string | null,
  events: [] as string[],
}));

vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: capacitorMocks.addListener,
    getStatus: capacitorMocks.getStatus,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    writeFile: capacitorMocks.writeFile,
    readFile: capacitorMocks.readFile,
    deleteFile: capacitorMocks.deleteFile,
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: capacitorMocks.preferencesGet,
    set: capacitorMocks.preferencesSet,
  },
}));

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: capacitorMocks.doc,
  runTransaction: capacitorMocks.runTransaction,
}));

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  const uid = 'veedor-1';
  const actaDatos: GuardarActaDto = {
    recintoId: 'recinto-1',
    jrvId: 'jrv-01',
    dignidad: 'ALCALDE',
    votosOrganizaciones: {
      MUP: 1,
      FCS: 0,
      ARP: 0,
      PDT: 0,
      CPM: 0,
    },
    votosNulos: 0,
    votosBlancos: 0,
    totalSufragantes: 1,
    foto: new Blob(['imagen-comprimida'], { type: 'image/jpeg' }),
    gps: { lat: -0.2, lng: -78.5 },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    capacitorMocks.listener = null;
    capacitorMocks.preferenceValue = null;
    capacitorMocks.events.length = 0;
    capacitorMocks.addListener.mockImplementation(async (_event, listener) => {
      capacitorMocks.listener = listener;
      return { remove: vi.fn() };
    });
    capacitorMocks.getStatus.mockResolvedValue({ connected: false });
    capacitorMocks.writeFile.mockImplementation(async () => {
      capacitorMocks.events.push('local-image');
      return { uri: 'offline_actas/jrv-01_ALCALDE.jpg' };
    });
    capacitorMocks.readFile.mockResolvedValue({ data: 'SGVsbG8=' });
    capacitorMocks.deleteFile.mockResolvedValue(undefined);
    capacitorMocks.preferencesGet.mockImplementation(async () => ({
      value: capacitorMocks.preferenceValue,
    }));
    capacitorMocks.preferencesSet.mockImplementation(async ({ value }) => {
      capacitorMocks.preferenceValue = value;
      capacitorMocks.events.push('queue');
    });
    capacitorMocks.runTransaction.mockImplementation(
      async (_firestore, callback) => callback({
        get: async () => ({ exists: () => false, data: () => ({}) }),
        set: () => capacitorMocks.events.push('firestore'),
      } as unknown as Transaction),
    );

    const usuarioActual = signal({
      id: uid,
      rol: 'VEEDOR',
    } as Usuario);
    const auth = { usuarioActual } as unknown as AuthStateService;
    const supabase = {
      subirFotoActa: vi.fn(async () => {
        capacitorMocks.events.push('supabase');
        return 'https://storage.example.test/signed';
      }),
    } as unknown as SupabaseService;

    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        { provide: AuthStateService, useValue: auth },
        { provide: Firestore, useValue: {} },
        { provide: SupabaseService, useValue: supabase },
      ],
    });
    service = TestBed.inject(OfflineSyncService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('persists the compressed photo and acta data in FIFO Preferences while offline', async () => {
    await service.preparar();

    await service.encolarActa(actaDatos, uid);

    expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: 'offline_actas/jrv-01_ALCALDE.jpg',
      directory: Directory.Data,
    }));
    const savedQueue = JSON.parse(capacitorMocks.preferenceValue ?? '[]') as {
      idempotency_key: string;
      local_image_path: string;
      votosNulos: number;
      gps: { lat: number; lng: number };
    }[];
    expect(savedQueue).toHaveLength(1);
    expect(savedQueue[0]).toMatchObject({
      idempotency_key: 'jrv-01_ALCALDE',
      local_image_path: 'offline_actas/jrv-01_ALCALDE.jpg',
      votosNulos: 0,
      gps: { lat: -0.2, lng: -78.5 },
    });
    expect(service.pendientesCount()).toBe(1);
  });

  it('uploads the image before writing Firestore and then removes the local queue item', async () => {
    await service.preparar();
    await service.encolarActa(actaDatos, uid);
    capacitorMocks.events.length = 0;

    capacitorMocks.listener?.({ connected: true });

    await vi.waitFor(() => {
      expect(service.pendientesCount()).toBe(0);
    });

    expect(capacitorMocks.events.indexOf('supabase'))
      .toBeLessThan(capacitorMocks.events.indexOf('firestore'));
    expect(Filesystem.deleteFile).toHaveBeenCalledWith({
      path: 'offline_actas/jrv-01_ALCALDE.jpg',
      directory: Directory.Data,
    });
  });

  it('discards queued data when Firestore has an audited server version', async () => {
    capacitorMocks.runTransaction.mockImplementation(
      async (_firestore, callback) => callback({
        get: async () => ({
          exists: () => true,
          data: () => ({ auditadaPorCoordinador: true }),
        }),
        set: vi.fn(),
      } as unknown as Transaction),
    );
    await service.preparar();
    await service.encolarActa(actaDatos, uid);

    capacitorMocks.listener?.({ connected: true });
    await vi.waitFor(() => {
      expect(service.pendientesCount()).toBe(0);
    });

    expect(service.notificacion()).toContain('ya auditó');
  });

  it('keeps the server version when its client timestamp is newer', async () => {
    const set = vi.fn();
    capacitorMocks.runTransaction.mockImplementation(
      async (_firestore, callback) => callback({
        get: async () => ({
          exists: () => true,
          data: () => ({ client_timestamp: Number.MAX_SAFE_INTEGER }),
        }),
        set,
      } as unknown as Transaction),
    );
    await service.preparar();
    await service.encolarActa(actaDatos, uid);

    capacitorMocks.listener?.({ connected: true });
    await vi.waitFor(() => {
      expect(service.pendientesCount()).toBe(0);
    });

    expect(set).not.toHaveBeenCalled();
    expect(service.notificacion()).toContain('versión más reciente');
  });
});
