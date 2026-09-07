/**
 * Client-side POD compression: ≤1600px on the long edge and ≤500KB.
 *
 * Done on the phone, before upload, because the driver is on a 2G patch at a
 * loading dock. A 12MP photo is ~5MB; this makes it ~200KB.
 *
 * Two field-specific details:
 *  - `imageOrientation: "from-image"` applies the EXIF rotation. Without it,
 *    every photo from a Samsung arrives 90° rotated and the POD looks unusable.
 *  - We ask createImageBitmap to downscale during decode where supported, so a
 *    2GB phone does not OOM decoding at full resolution first.
 */
const MAX_EDGE = 1600;
const MAX_BYTES = 500_000;

export async function compressForPod(file: File | Blob): Promise<Blob> {
  const bitmap = await decode(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  let width = Math.round(bitmap.width * scale);
  let height = Math.round(bitmap.height * scale);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image on this device");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Binary-search quality rather than guessing: the dual size/dimension
    // constraint has no single fixed quality that satisfies every photo.
    let lo = 0.5;
    let hi = 0.92;
    let best: Blob | null = null;

    for (let i = 0; i < 5; i += 1) {
      const q = (lo + hi) / 2;
      const blob = await toBlob(canvas, q);
      if (blob.size <= MAX_BYTES) {
        best = blob;
        lo = q; // try for better quality within budget
      } else {
        hi = q;
      }
    }

    if (best) {
      bitmap.close?.();
      return best;
    }

    // Still too large at minimum quality: halve the dimensions and retry once.
    width = Math.round(width / 2);
    height = Math.round(height / 2);
  }

  const fallback = await toBlob(makeCanvasWith(bitmap, width, height), 0.5);
  bitmap.close?.();
  return fallback;
}

async function decode(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: MAX_EDGE,
      resizeQuality: "high",
    });
  } catch {
    // Older Android WebViews reject the options bag entirely.
    return createImageBitmap(file);
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  // OffscreenCanvas is missing on Android WebView < 92, still in the field.
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeCanvasWith(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = makeCanvas(width, height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress the photo"))),
      "image/jpeg",
      quality,
    );
  });
}
