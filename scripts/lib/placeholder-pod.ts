import { deflateSync } from "node:zlib";

/**
 * Generates a small, document-looking PNG for seeded proof-of-delivery pages.
 *
 * WHY GENERATE RATHER THAN COMMIT A FIXTURE: the seed must work offline and
 * without binary blobs in the repo, and the demo needs the POD tab to show
 * something that reads as a signed challan rather than a broken image icon.
 *
 * Hand-rolled PNG encoder — a full image library is a heavy dependency for
 * drawing grey rectangles.
 */

function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Draw an axis-aligned filled rectangle into an RGB pixel buffer. */
function rect(
  px: Uint8Array, W: number,
  x0: number, y0: number, x1: number, y1: number,
  r: number, g: number, b: number,
) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * W + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
}

export function placeholderPodPng(seed = 0): Buffer {
  const W = 600;
  const H = 800;
  const px = new Uint8Array(W * H * 3).fill(0xf2); // off-white paper

  // Page body
  rect(px, W, 20, 20, W - 20, H - 20, 0xff, 0xff, 0xff);
  // Header band
  rect(px, W, 20, 20, W - 20, 90, 0xe8, 0xe8, 0xe8);
  // Title bar (stands in for "DELIVERY CHALLAN")
  rect(px, W, 45, 45, 330, 66, 0x33, 0x33, 0x33);
  // Meta lines
  rect(px, W, 45, 115, 250, 126, 0x99, 0x99, 0x99);
  rect(px, W, 45, 140, 200, 151, 0x99, 0x99, 0x99);

  // Table rows — vary slightly per page so pages are visibly distinct.
  const rows = 8 + (seed % 4);
  for (let i = 0; i < rows; i += 1) {
    const y = 200 + i * 42;
    rect(px, W, 45, y, W - 45, y + 1, 0xdd, 0xdd, 0xdd);
    rect(px, W, 55, y + 12, 55 + 120 + ((i * 37 + seed * 11) % 90), y + 22, 0xaa, 0xaa, 0xaa);
    rect(px, W, 380, y + 12, 500, y + 22, 0xaa, 0xaa, 0xaa);
  }

  // Received-stamp box
  rect(px, W, 45, H - 210, 260, H - 90, 0xf7, 0xf7, 0xf7);
  rect(px, W, 45, H - 210, 260, H - 208, 0xcc, 0xcc, 0xcc);

  // A scrawled signature: a few short diagonal strokes.
  for (let s = 0; s < 5; s += 1) {
    const x0 = 330 + s * 26;
    const y0 = H - 150 + ((s * 13 + seed * 7) % 20);
    for (let t = 0; t < 40; t += 1) {
      const x = x0 + t;
      const y = y0 - Math.round(Math.sin((t + s * 6) / 6) * 16);
      if (x > 0 && x < W && y > 0 && y < H) {
        const i = (y * W + x) * 3;
        px[i] = 0x22; px[i + 1] = 0x33; px[i + 2] = 0x88;
      }
    }
  }
  // Signature rule
  rect(px, W, 320, H - 110, 540, H - 109, 0x55, 0x55, 0x55);

  // PNG scanlines: each row prefixed with filter byte 0.
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y += 1) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(px.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (W * 3 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
