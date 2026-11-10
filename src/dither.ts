// An ordered-dither glow, drawn once as a mask. CSS fills it with the theme's accent,
// so it follows every theme and mode with no redraw. Matches the dither on the README and social card.

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/** Size of the glow in CSS pixels, and of one dither cell. */
export const GLOW = { width: 200, height: 112, cell: 3, clear: 36 };

let cached: { dpr: number; url: string } | null = null;

/** A data URL of the glow's mask, drawn to whole device pixels so the cells stay crisp. */
export function glowMask(): string {
  const dpr = window.devicePixelRatio || 1;
  if (cached?.dpr === dpr) return cached.url;
  const cell = Math.max(1, Math.round(GLOW.cell * dpr));
  const cols = Math.ceil((GLOW.width * dpr) / cell);
  const rows = Math.ceil((GLOW.height * dpr) / cell);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      // A ring around the duck: clear in the middle so the duck stays clean, densest just
      // outside it, and thinning out towards the edge of the box.
      const u = (x + 0.5) / cols - 0.5, v = (y + 0.5) / rows - 0.5;
      const d = Math.hypot(u, v) * 2;
      // The clear middle is a circle in CSS pixels, since the box itself is wider than tall.
      const px = Math.hypot(u * GLOW.width, v * GLOW.height);
      const inner = Math.min(1, Math.max(0, (px - GLOW.clear) / 14));
      const f = inner * Math.max(0, 1 - d) ** 1.1 * 1.5;
      if (f > (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  cached = { dpr, url: canvas.toDataURL() };
  return cached.url;
}
