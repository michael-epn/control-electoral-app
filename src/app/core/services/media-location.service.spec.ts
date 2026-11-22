import { TestBed } from '@angular/core/testing';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import type { Position } from '@capacitor/geolocation';
import { ImageQualityService } from './image-quality.service';
import {
  MediaLocationError,
  MediaLocationService,
} from './media-location.service';

const capacitorMocks = vi.hoisted(() => ({
  cameraCheckPermissions: vi.fn(),
  cameraRequestPermissions: vi.fn(),
  cameraGetPhoto: vi.fn(),
  geolocationCheckPermissions: vi.fn(),
  geolocationRequestPermissions: vi.fn(),
  geolocationGetCurrentPosition: vi.fn(),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions: capacitorMocks.cameraCheckPermissions,
    requestPermissions: capacitorMocks.cameraRequestPermissions,
    getPhoto: capacitorMocks.cameraGetPhoto,
  },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA' },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: capacitorMocks.geolocationCheckPermissions,
    requestPermissions: capacitorMocks.geolocationRequestPermissions,
    getCurrentPosition: capacitorMocks.geolocationGetCurrentPosition,
  },
}));

describe('MediaLocationService', () => {
  let service: MediaLocationService;
  const imageQuality = {
    evaluarNitidez: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    imageQuality.evaluarNitidez.mockReset();
    TestBed.configureTestingModule({
      providers: [
        MediaLocationService,
        { provide: ImageQualityService, useValue: imageQuality },
      ],
    });
    service = TestBed.inject(MediaLocationService);

    vi.mocked(Camera.checkPermissions)
      .mockResolvedValue({ camera: 'granted', photos: 'granted' });
    vi.mocked(Camera.requestPermissions)
      .mockResolvedValue({ camera: 'granted', photos: 'granted' });
    vi.mocked(Camera.getPhoto)
      .mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,SGVsbG8=',
        format: 'jpeg',
        saved: false,
      });
    vi.mocked(Geolocation.checkPermissions)
      .mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    vi.mocked(Geolocation.requestPermissions)
      .mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('captures only from the camera, rejects blur, and returns a Blob when sharp', async () => {
    imageQuality.evaluarNitidez.mockResolvedValue({
      esNitida: true,
      varianzaLaplaciana: 120,
    });

    const blob = await service.capturarActaNitida();

    expect(Camera.getPhoto).toHaveBeenCalledWith({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      width: 1280,
      quality: 80,
    });
    expect(imageQuality.evaluarNitidez)
      .toHaveBeenCalledWith('data:image/jpeg;base64,SGVsbG8=');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
    await expect(blob.text()).resolves.toBe('Hello');
  });

  it('does not return a blurred photo', async () => {
    imageQuality.evaluarNitidez.mockResolvedValue({
      esNitida: false,
      varianzaLaplaciana: 99.9,
    });

    await expect(service.capturarActaNitida()).rejects.toMatchObject({
      name: 'MediaLocationError',
      message: 'La fotografía está borrosa, enfoque el acta e intente nuevamente.',
    });
  });

  it('requests camera permission and reports denial without opening the camera', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({
      camera: 'denied',
      photos: 'denied',
    });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({
      camera: 'denied',
      photos: 'denied',
    });

    await expect(service.capturarActaNitida())
      .rejects.toBeInstanceOf(MediaLocationError);
    expect(Camera.requestPermissions)
      .toHaveBeenCalledWith({ permissions: ['camera'] });
    expect(Camera.getPhoto).not.toHaveBeenCalled();
  });

  it('retries timed-out precise GPS with balanced accuracy', async () => {
    vi.mocked(Geolocation.getCurrentPosition)
      .mockRejectedValueOnce(new Error('Location request timed out.'))
      .mockResolvedValueOnce(crearPosicion(-0.2, -78.5));

    await expect(service.obtenerUbicacionActa()).resolves.toEqual({
      lat: -0.2,
      lng: -78.5,
    });
    expect(Geolocation.getCurrentPosition).toHaveBeenNthCalledWith(1, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
    expect(Geolocation.getCurrentPosition).toHaveBeenNthCalledWith(2, {
      enableHighAccuracy: false,
      timeout: 10000,
    });
  });

  it('returns a controlled retry error when both GPS attempts fail', async () => {
    vi.mocked(Geolocation.getCurrentPosition)
      .mockRejectedValueOnce(new Error('Location request timed out.'))
      .mockRejectedValueOnce(new Error('Location unavailable.'));

    await expect(service.obtenerUbicacionActa()).rejects.toMatchObject({
      name: 'MediaLocationError',
      message: expect.stringContaining('inténtalo nuevamente'),
    });
  });

  function crearPosicion(latitude: number, longitude: number): Position {
    return {
      timestamp: Date.now(),
      coords: {
        latitude,
        longitude,
        accuracy: 10,
        altitudeAccuracy: null,
        altitude: null,
        speed: null,
        heading: null,
        magneticHeading: null,
        trueHeading: null,
        headingAccuracy: null,
        course: null,
      },
    };
  }
});
