/**
 * lib/labels/barcode.ts
 * -----------------------------------------------------------------------------
 * Code 128 barcodes for shipping labels, as geometry rather than as an image.
 *
 * ── WHY bwip-js, AND WHY NOT ITS RENDERERS ──────────────────────────────────
 * The encoding is the part worth taking from a library. Code 128 has three
 * character sets, shift and latch codes, an optimal-subset problem when digits
 * and letters mix, and a modulo-103 check character. Getting any of it subtly
 * wrong produces a barcode that looks perfect and scans as the wrong string, or
 * not at all. bwip-js is a port of Barcode Writer in Pure PostScript, which is
 * the reference implementation the industry actually checks itself against, and
 * it is pure JavaScript: no node-canvas, no native build, nothing that breaks
 * on a serverless deploy. jsbarcode was the alternative and needs a DOM or a
 * canvas to produce anything, which is the wrong shape for a background job.
 *
 * What we do NOT take from it is the drawing. `toBuffer` gives a PNG and
 * `toSVG` gives stroked lines, and both are worse here than they look:
 *
 *   - A PNG is resampled by the printer driver. At 203 dpi a raster barcode
 *     scaled to fit a box lands on fractional dot boundaries, and the driver
 *     resolves that with anti-aliasing: grey edges on every bar. Grey edges are
 *     exactly what a CCD scanner reads as ambiguous. The brief says pure black
 *     on pure white, and a raster image cannot promise that after scaling.
 *   - Stroked lines carry line-cap and stroke-width semantics that a PDF
 *     renderer interprets. A stroke is centred on its path, so a cap rendered
 *     as anything but butt bleeds the bar vertically.
 *
 * So we ask bwip-js for `raw()`, which returns the encoded module pattern and
 * nothing else, and emit each bar as a filled rectangle. Filled rectangles have
 * no cap, no join, no stroke width to interpret: the geometry IS the bar. It
 * stays vector all the way to the RIP, so it is exact at 203 dpi, at 300 dpi,
 * and on a laser printer.
 *
 * ── THE QUIET ZONE IS COMPUTED, NOT GUESSED ─────────────────────────────────
 * Code 128 requires a clear margin of at least 10 module widths on each side.
 * Rather than pick a padding and hope, `layoutCode128` solves for the module
 * width that makes the symbol plus both quiet zones exactly fill the width it
 * is given. The quiet zone is therefore correct by construction at any label
 * size, and the bars are as wide as the space allows, which is the single
 * biggest factor in whether a thermal-printed barcode scans first time.
 */

import bwipjs from "bwip-js/node";

/** One black bar, in points, relative to the left edge of the barcode box. */
export interface BarcodeBar {
  x: number;
  width: number;
}

export interface Code128Layout {
  /** Black bars to draw. Everything not covered by one is white. */
  bars: BarcodeBar[];
  /** Total width in points, quiet zones included. Equals the width requested. */
  width: number;
  /** Bar height in points, as requested. */
  height: number;
  /** Width of one module in points. Below ~0.7pt a thermal print gets fragile. */
  moduleWidth: number;
  /** Clear margin on each side, in points. Always >= 10 modules. */
  quietZone: number;
}

/**
 * Code 128 requires a quiet zone of at least 10 modules on each side. Nothing
 * about this is a style choice; a scanner uses it to find the symbol at all.
 */
const QUIET_ZONE_MODULES = 10;

/**
 * The narrowest module we will print, in points. 0.25mm is two dots at 203 dpi,
 * the resolution of the thermal printers these labels are made for, and is the
 * usual floor for a reliable direct-thermal print.
 *
 * Hitting this floor means the data is too long for the space, and the barcode
 * is allowed to overflow rather than silently print unscannable hairlines. The
 * caller is told via `moduleWidth` so it can react.
 */
const MIN_MODULE_WIDTH_PT = (0.25 / 25.4) * 72;

export class BarcodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BarcodeError";
  }
}

/**
 * The module run-lengths for a Code 128 symbol: bar, space, bar, space, ...
 * always starting with a bar.
 *
 * Exported for tests. The pattern is the thing worth pinning, because it is
 * what a scanner reads; the rectangles below are just arithmetic on top of it.
 */
export function code128Modules(value: string): number[] {
  const text = value.trim();

  if (!text) {
    throw new BarcodeError("Cannot encode an empty string as Code 128.");
  }

  // Code 128 covers ASCII 0-127. Anything outside it (a stray en dash pasted
  // into a reference, say) would be silently dropped or mis-encoded, so it is
  // refused here where the message can name the problem.
  if (!/^[\x00-\x7F]+$/.test(text)) {
    throw new BarcodeError(
      `Code 128 cannot encode "${text}": it contains non-ASCII characters.`,
    );
  }

  let raw;
  try {
    raw = bwipjs.raw({ bcid: "code128", text });
  } catch (err) {
    throw new BarcodeError(
      `Code 128 encoding failed for "${text}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // `raw()` describes linear symbologies as run-lengths (`sbs`) and matrix ones
  // as a pixel grid. Code 128 is linear so it is always the former, but the
  // union is narrowed rather than asserted: a cast here would turn a future
  // change of symbology into an undefined at render time instead of an error.
  const symbol = raw?.[0];

  if (!symbol || !("sbs" in symbol) || !Array.isArray(symbol.sbs) || symbol.sbs.length === 0) {
    throw new BarcodeError(`Code 128 encoding produced no pattern for "${text}".`);
  }

  return symbol.sbs;
}

/**
 * Turn a value into positioned black bars that exactly fill `width`.
 *
 * The module width falls out of the available width rather than being chosen:
 * symbol modules plus 20 quiet-zone modules span the whole box, so the bars are
 * always as wide as the space permits and the quiet zone is always exactly to
 * spec. Widening the box widens the bars; it never adds slack at the edges.
 */
export function layoutCode128(
  value: string,
  width: number,
  height: number,
): Code128Layout {
  if (!(width > 0) || !(height > 0)) {
    throw new BarcodeError(
      `Barcode needs a positive box; got ${width} x ${height}.`,
    );
  }

  const modules = code128Modules(value);
  const symbolModules = modules.reduce((sum, run) => sum + run, 0);
  const totalModules = symbolModules + QUIET_ZONE_MODULES * 2;

  const moduleWidth = Math.max(width / totalModules, MIN_MODULE_WIDTH_PT);
  const quietZone = moduleWidth * QUIET_ZONE_MODULES;

  const bars: BarcodeBar[] = [];
  let cursor = quietZone;

  modules.forEach((run, index) => {
    const runWidth = run * moduleWidth;
    // Even indices are bars, odd are spaces. The pattern always starts on a bar.
    if (index % 2 === 0) bars.push({ x: cursor, width: runWidth });
    cursor += runWidth;
  });

  return {
    bars,
    // `cursor` rather than `width`: when the module floor kicked in, the symbol
    // is wider than the box it was given, and the caller must be told the truth.
    width: Math.max(width, cursor + quietZone),
    height,
    moduleWidth,
    quietZone,
  };
}
