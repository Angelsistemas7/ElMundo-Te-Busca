// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/image";

// `compressImage` corre en el navegador (canvas). jsdom no trae
// `createImageBitmap` ni un canvas con pixeles reales, asi que se doblan las
// dos piezas: el decodificador y el contexto/exportacion del canvas. Lo que
// importa comprobar no es la calidad de la imagen sino el CONTRATO: si se
// pudo recodificar, devuelve WebP redimensionado (eso es lo que borra los
// metadatos EXIF, incluida la posicion GPS de la foto); si algo falla,
// devuelve el archivo original sin romper la subida.
type BitmapStub = { width: number; height: number; close?: () => void };

function stubBitmap(width: number, height: number): BitmapStub {
  const bitmap: BitmapStub = { width, height, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  return bitmap;
}

/** Doble del canvas: registra el tamano final y devuelve un blob WebP. */
function stubCanvas({ withContext = true }: { withContext?: boolean } = {}) {
  const sizes: { width: number; height: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    sizes.push({ width: this.width, height: this.height });
    return withContext ? ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D) : null;
  } as typeof HTMLCanvasElement.prototype.getContext);
  const toBlob = vi
    .fn()
    .mockImplementation((cb: BlobCallback, type?: string) => cb(new Blob(["x".repeat(64)], { type })));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    toBlob as typeof HTMLCanvasElement.prototype.toBlob,
  );
  return { sizes, toBlob };
}

function file(name: string, type: string): File {
  return new File(["contenido"], name, { type });
}

describe("compressImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("devuelve el archivo tal cual si no es una imagen", async () => {
    const original = file("documento.pdf", "application/pdf");
    vi.stubGlobal("createImageBitmap", vi.fn());
    expect(await compressImage(original)).toBe(original);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("recodifica a WebP y renombra la extension", async () => {
    stubBitmap(800, 600);
    stubCanvas();
    const out = await compressImage(file("foto.JPG", "image/jpeg"));
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("foto.webp");
  });

  it("redimensiona respetando la proporcion y el lado mayor", async () => {
    stubBitmap(4000, 3000);
    const { sizes } = stubCanvas();
    await compressImage(file("foto.jpg", "image/jpeg"), { maxDim: 1280 });
    expect(sizes.at(-1)).toEqual({ width: 1280, height: 960 });
  });

  it("no agranda imagenes mas pequenas que el maximo", async () => {
    stubBitmap(400, 200);
    const { sizes } = stubCanvas();
    await compressImage(file("foto.jpg", "image/jpeg"), { maxDim: 1280 });
    expect(sizes.at(-1)).toEqual({ width: 400, height: 200 });
  });

  it("usa la calidad indicada al exportar a WebP", async () => {
    stubBitmap(100, 100);
    const { toBlob } = stubCanvas();
    await compressImage(file("foto.jpg", "image/jpeg"), { quality: 0.5 });
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.5);
  });

  it("libera el bitmap decodificado", async () => {
    const bitmap = stubBitmap(100, 100);
    stubCanvas();
    await compressImage(file("foto.jpg", "image/jpeg"));
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("devuelve el original si el navegador no da contexto 2D", async () => {
    stubBitmap(100, 100);
    stubCanvas({ withContext: false });
    const original = file("foto.jpg", "image/jpeg");
    expect(await compressImage(original)).toBe(original);
  });

  it("devuelve el original si toBlob no produce nada", async () => {
    stubBitmap(100, 100);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((cb: BlobCallback) =>
      cb(null)) as typeof HTMLCanvasElement.prototype.toBlob);
    const original = file("foto.jpg", "image/jpeg");
    expect(await compressImage(original)).toBe(original);
  });

  it("devuelve el original si el navegador no puede decodificar la imagen", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("formato no soportado");
      }),
    );
    const original = file("foto.heic", "image/heic");
    expect(await compressImage(original)).toBe(original);
  });
});
