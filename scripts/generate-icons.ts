/**
 * Renders the brand mark to the PNG and ICO files the browser and the OS ask
 * for, from the same geometry as components/brand/Mark.tsx.
 *
 * WHY THIS EXISTS: the previous icons were a different drawing from the in-app
 * mark — a filled truck where the app used a stroked one — because they were
 * produced by hand with no generator. Anything hand-made drifts. Run this and
 * the icon can never disagree with the product again.
 *
 *   npm run icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { BRAND_INDIGO } from "../lib/design/tokens";

// ── Minimal PNG encoder ─────────────────────────────────────────────────────
function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
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

function encodePng(rgba: Uint8Array, size: number): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── The mark, drawn by coverage sampling on the same 24-unit grid ───────────
const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/**
 * Distance-to-curve helpers. Sampling 3×3 per pixel gives clean edges without
 * an anti-aliasing library, which matters most at 16px where the whole mark
 * is only a few pixels of ink. The wave itself is the same cubic-bezier curve
 * as the "C6 5 9 5 12 9C15 13 18 13 21 9" path in components/brand/Mark.tsx —
 * sampled here into a polyline rather than solved in closed form, since this
 * is a build-time script, not a per-frame renderer.
 */
function cubicPoint(
  p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p1[0],
    mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p1[1],
  ];
}

/** baseline(y): the wave's two cubic segments, sampled into a polyline. */
function sampleWave(baseline: number): [number, number][] {
  const left: [number, number] = [3, baseline];
  const mid: [number, number] = [12, baseline];
  const right: [number, number] = [21, baseline];
  const N = 32;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i += 1) {
    pts.push(cubicPoint(left, [6, baseline - 4], [9, baseline - 4], mid, i / N));
  }
  for (let i = 1; i <= N; i += 1) {
    pts.push(cubicPoint(mid, [15, baseline + 4], [18, baseline + 4], right, i / N));
  }
  return pts;
}

function distanceToPolyline(px: number, py: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1) || 1e-9;
    const t = Math.min(1, Math.max(0, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2));
    best = Math.min(best, Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))));
  }
  return best;
}

const WAVE_UPPER = sampleWave(9);
const WAVE_LOWER = sampleWave(15);

function markAlpha(u: number, v: number): number {
  const STROKE = 1.75 / 2;

  // The upper wave, full ink.
  const onUpper = distanceToPolyline(u, v, WAVE_UPPER) <= STROKE ? 1 : 0;
  // The second wave. Reduced opacity, not a second colour — see Mark.tsx.
  const onLower = distanceToPolyline(u, v, WAVE_LOWER) <= STROKE ? 0.45 : 0;

  return Math.max(onUpper, onLower);
}

/** A tile: indigo ground, mark knocked out in white. */
function renderTile(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const [br, bg, bb] = hex(BRAND_INDIGO);
  const pad = size * 0.16;
  const inner = size - pad * 2;
  const radius = size * 0.22;
  const SS = 3;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ground = 0;
      let ink = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;

          // Rounded-square ground.
          const cx = Math.min(Math.max(fx, radius), size - radius);
          const cy = Math.min(Math.max(fy, radius), size - radius);
          if (Math.hypot(fx - cx, fy - cy) <= radius) ground += 1;

          // Mark, mapped from the 24-unit grid into the padded box.
          ink += markAlpha(((fx - pad) / inner) * 24, ((fy - pad) / inner) * 24);
        }
      }

      const n = SS * SS;
      const a = ground / n;
      const k = ink / n;
      const i = (y * size + x) * 4;

      px[i] = Math.round(br * (1 - k) + 255 * k);
      px[i + 1] = Math.round(bg * (1 - k) + 255 * k);
      px[i + 2] = Math.round(bb * (1 - k) + 255 * k);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

// ── ICO, so the browser tab stops showing the stock Next.js icon ────────────
function encodeIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries: Buffer[] = [];
  let offset = 6 + pngs.length * 16;

  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[4] = 1;
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const out: [string, number][] = [
  ["app/icon.png", 192],
  ["app/apple-icon.png", 180],
  ["public/icon-512.png", 512],
];

for (const [path, size] of out) {
  writeFileSync(path, encodePng(renderTile(size), size));
  console.log(`  ${path}  ${size}×${size}`);
}

const ico = encodeIco(
  [16, 32, 48].map((size) => ({ size, data: encodePng(renderTile(size), size) })),
);
writeFileSync("app/favicon.ico", ico);
console.log(`  app/favicon.ico  16/32/48  (was the stock Next.js icon)`);
