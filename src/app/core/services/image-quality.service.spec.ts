import { TestBed } from '@angular/core/testing';
import { ImageQualityService } from './image-quality.service';

describe('ImageQualityService', () => {
  let service: ImageQualityService;
  let pixels: Uint8ClampedArray;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ImageQualityService] });
    service = TestBed.inject(ImageQualityService);

    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(4);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get')
      .mockReturnValue(4);
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
      .mockImplementation(function (this: HTMLImageElement) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      });

    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels }) as ImageData),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('accepts a high-contrast image with Laplacian variance above 100', async () => {
    pixels = crearPixeles([
      [0, 255, 0, 255],
      [255, 0, 255, 0],
      [0, 255, 0, 255],
      [255, 0, 255, 0],
    ]);

    const result = await service.evaluarNitidez('AQID');

    expect(result.esNitida).toBe(true);
    expect(result.varianzaLaplaciana).toBeGreaterThanOrEqual(100);
  });

  it('rejects a uniform image as blurred', async () => {
    pixels = crearPixeles([
      [128, 128, 128, 128],
      [128, 128, 128, 128],
      [128, 128, 128, 128],
      [128, 128, 128, 128],
    ]);

    await expect(service.evaluarNitidez('AQID')).resolves.toEqual({
      esNitida: false,
      varianzaLaplaciana: 0,
    });
  });

  function crearPixeles(grises: number[][]): Uint8ClampedArray {
    const result = new Uint8ClampedArray(grises.length * grises[0].length * 4);
    for (let y = 0; y < grises.length; y++) {
      for (let x = 0; x < grises[y].length; x++) {
        const offset = (y * grises[y].length + x) * 4;
        result[offset] = grises[y][x];
        result[offset + 1] = grises[y][x];
        result[offset + 2] = grises[y][x];
        result[offset + 3] = 255;
      }
    }
    return result;
  }
});
