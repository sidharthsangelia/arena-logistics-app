/**
 * lib/rateSweep/excel/theme.ts
 *
 * One place that decides what an Arena workbook looks like.
 *
 * ── WHY A THEME MODULE AND NOT INLINE STYLES ────────────────────────────────
 * A quotation is a document a customer keeps, forwards, and compares against a
 * competitor's. Consistency across its sheets is most of what makes it read as
 * professional, and styles written inline drift the moment a second sheet is
 * added: one header ends up a shade off, one column loses its thousands
 * separator, and the file starts to look assembled rather than designed.
 *
 * ── COLOUR IS FUNCTIONAL, NEVER DECORATIVE ──────────────────────────────────
 * The palette is deliberately small and flat. No gradients. Colour carries
 * exactly three meanings in these files and nothing else:
 *
 *   INK on PAPER   ordinary content
 *   ACCENT         structure: headers, rules, the spine of a table
 *   WARN / DANGER  something the reader must not miss (an internal-only stamp,
 *                  a duty-unpaid caveat, a stale-data warning)
 *
 * If a colour ever appears without one of those meanings, the meanings stop
 * being readable.
 *
 * ExcelJS wants ARGB strings with no leading hash.
 */

import type { Borders, Fill, Font, Alignment } from "exceljs";

export const PALETTE = {
  /** Near-black. Body text and grid lines. */
  ink: "FF16181D",
  inkSoft: "FF5B6270",
  inkFaint: "FF8B92A1",

  paper: "FFFFFFFF",
  /** Zebra banding and the cover's field labels. */
  paperAlt: "FFF6F7F9",
  rule: "FFDDE1E7",

  /** Arena's structural colour. Table headers, section rules. */
  accent: "FF1B3A5C",
  accentSoft: "FFEAF0F6",

  /** Reserved for things that change what the reader should do. */
  warn: "FF8A5A00",
  warnSoft: "FFFDF3E2",
  danger: "FF8C1D18",
  dangerSoft: "FFFCEDEA",

  /** The cheapest option in a row. The only "good news" colour in the file. */
  best: "FF12603A",
  bestSoft: "FFE7F4ED",
} as const;

export const FONT = {
  /** Calibri is the safe cross-platform default; it renders on Excel, Numbers,
   *  Sheets and LibreOffice without substitution shifting the layout. */
  family: "Calibri",
} as const;

export const font = {
  title: {
    name: FONT.family,
    size: 26,
    bold: true,
    color: { argb: PALETTE.accent },
  } satisfies Partial<Font>,

  subtitle: {
    name: FONT.family,
    size: 12,
    color: { argb: PALETTE.inkSoft },
  } satisfies Partial<Font>,

  sheetTitle: {
    name: FONT.family,
    size: 16,
    bold: true,
    color: { argb: PALETTE.accent },
  } satisfies Partial<Font>,

  sectionLabel: {
    name: FONT.family,
    size: 9,
    bold: true,
    color: { argb: PALETTE.inkFaint },
  } satisfies Partial<Font>,

  tableHeader: {
    name: FONT.family,
    size: 10,
    bold: true,
    color: { argb: PALETTE.paper },
  } satisfies Partial<Font>,

  body: {
    name: FONT.family,
    size: 11,
    color: { argb: PALETTE.ink },
  } satisfies Partial<Font>,

  bodyStrong: {
    name: FONT.family,
    size: 11,
    bold: true,
    color: { argb: PALETTE.ink },
  } satisfies Partial<Font>,

  bodySoft: {
    name: FONT.family,
    size: 10,
    color: { argb: PALETTE.inkSoft },
  } satisfies Partial<Font>,

  small: {
    name: FONT.family,
    size: 9,
    color: { argb: PALETTE.inkFaint },
  } satisfies Partial<Font>,

  best: {
    name: FONT.family,
    size: 11,
    bold: true,
    color: { argb: PALETTE.best },
  } satisfies Partial<Font>,

  warn: {
    name: FONT.family,
    size: 10,
    bold: true,
    color: { argb: PALETTE.warn },
  } satisfies Partial<Font>,

  danger: {
    name: FONT.family,
    size: 11,
    bold: true,
    color: { argb: PALETTE.danger },
  } satisfies Partial<Font>,
} as const;

export function fill(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * Number formats.
 *
 * `#,##0` with no decimals for prices: a quotation reads better in whole
 * rupees, and the stored values carry paise that imply a precision the vendor
 * does not actually hold to. The Indian digit grouping (##,##,##0) is used
 * because these files are read in India and 12,34,567 is what the reader
 * expects to see.
 *
 * The dash for zero is deliberate. A blank cell means "no rate"; a zero would
 * mean "free", and the two must never look alike in a price grid.
 */
export const NUMBER_FORMAT = {
  money: '₹\\ ##,##,##0;[Red]-₹\\ ##,##,##0;"—"',
  moneyPlain: '##,##,##0;[Red]-##,##,##0;"—"',
  weight: '0.###"kg"',
  days: '0" days";;"—"',
  percent: "0.0%",
  integer: "#,##0",
} as const;

/** A thin rule on every side. The default grid for data tables. */
export function cellBorder(color: string = PALETTE.rule): Partial<Borders> {
  const side = { style: "thin" as const, color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

/** A heavier line under a header row, so the head reads as a head. */
export function headerBorder(): Partial<Borders> {
  return {
    top: { style: "thin", color: { argb: PALETTE.accent } },
    left: { style: "thin", color: { argb: PALETTE.accent } },
    bottom: { style: "medium", color: { argb: PALETTE.accent } },
    right: { style: "thin", color: { argb: PALETTE.accent } },
  };
}

export const ALIGN = {
  centre: { horizontal: "center", vertical: "middle", wrapText: true } satisfies Partial<Alignment>,
  left: { horizontal: "left", vertical: "middle", wrapText: true } satisfies Partial<Alignment>,
  right: { horizontal: "right", vertical: "middle" } satisfies Partial<Alignment>,
  topLeft: { horizontal: "left", vertical: "top", wrapText: true } satisfies Partial<Alignment>,
} as const;

/** Row heights, in points. Named so the intent survives a later tweak. */
export const ROW_HEIGHT = {
  title: 38,
  sectionGap: 8,
  tableHeader: 30,
  data: 20,
  terms: 15,
} as const;
