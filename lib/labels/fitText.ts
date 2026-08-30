/**
 * lib/labels/fitText.ts
 *
 * Choosing a font size that fills a fixed box, for Helvetica-Bold.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A PDF has no text layout engine you can ask questions of and no CSS trick
 * that shrinks a string to fit: whatever size you name is the size that prints,
 * and anything that does not fit either wraps somewhere ugly or spills over a
 * rule. So a label that wants a name set as large as its box allows has to do
 * the measuring itself, before it renders.
 *
 * The alternative was a size small enough to be safe for the longest name we
 * could imagine, which is what the header used to do: 5.5pt, chosen for a
 * 46-character company name and then applied to every name including the short
 * ones. Measuring instead means every sender's name prints as large as its own
 * length allows.
 *
 * ── THE WIDTH TABLE ─────────────────────────────────────────────────────────
 * Helvetica-Bold is one of the 14 fonts built into every PDF reader, so its
 * advance widths are fixed by the format and safe to hard-code. The table below
 * is ASCII 32..126 in units of 1/1000 em, read straight out of the metrics that
 * @react-pdf/renderer itself uses, so a width computed here is the width the
 * renderer will lay out. Anything outside that range falls back to the width of
 * "n", which is close to the average and errs neither way badly.
 */

/** Advance widths for ASCII 32..126, Helvetica-Bold, in 1/1000 em. */
// prettier-ignore
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Width of "n": the stand-in for any character the table does not cover. */
const FALLBACK_WIDTH = 611;

/** Width of a string at 1pt. Multiply by the font size for the real width. */
function unitWidth(text: string): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    const width =
      code >= 0 && code < HELVETICA_BOLD_WIDTHS.length
        ? HELVETICA_BOLD_WIDTHS[code]
        : FALLBACK_WIDTH;
    total += width;
  }
  return total / 1000;
}

/**
 * Splits into exactly `lineCount` lines, on word boundaries, so that the
 * WIDEST line is as narrow as it can be.
 *
 * Widest-line-narrowest is the right objective because the widest line is what
 * caps the font size; a greedy fill would pack line one and leave line two
 * short, which caps the size on a line that had room to spare. Word count is
 * small enough (a company name) that trying every split point is free.
 *
 * Returns null when the text has too few words to make that many lines.
 */
function splitBalanced(text: string, lineCount: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < lineCount) return null;
  if (lineCount === 1) return [words.join(" ")];

  let best: string[] | null = null;
  let bestWidest = Infinity;

  // Only two-line splits are needed today, and a label has no room for more, so
  // this walks single split points rather than solving the general case.
  for (let cut = 1; cut < words.length; cut++) {
    const lines = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
    const widest = Math.max(...lines.map(unitWidth));
    if (widest < bestWidest) {
      bestWidest = widest;
      best = lines;
    }
  }

  return best;
}

export interface FitTextOptions {
  /** Never larger than this, however much room there is. */
  maxSize: number;
  /** Never smaller than this; below it the text is set too small to read. */
  minSize: number;
  /** Total height the lines may occupy, in points. */
  maxHeight: number;
  /** Line box as a multiple of the font size. Pass the same value to the style. */
  lineHeight: number;
  /** How many lines the text may wrap onto. 1 or 2. */
  maxLines: number;
}

export interface FittedText {
  lines: string[];
  fontSize: number;
}

/**
 * The largest Helvetica-Bold size at which `text` fits `maxWidth` x `maxHeight`,
 * with the line breaks that achieve it.
 *
 * More lines buy width but spend height, and which wins depends on the string,
 * so every allowed line count is costed and the best one is returned. The
 * caller renders the returned lines verbatim: they are already broken to fit,
 * and letting the renderer re-wrap them would undo the measurement.
 *
 * At `minSize` the fit is given up on rather than shrinking further, and the
 * text is returned at that size to be clipped by the layout. That only happens
 * for a name far longer than anything a sender has, and a clipped name is a
 * better failure than a name set too small to read.
 */
export function fitHelveticaBold(
  text: string,
  maxWidth: number,
  options: FitTextOptions,
): FittedText {
  const trimmed = text.trim();
  if (!trimmed) return { lines: [], fontSize: options.minSize };

  let best: FittedText = { lines: [trimmed], fontSize: options.minSize };
  let bestSize = 0;

  for (let lineCount = 1; lineCount <= options.maxLines; lineCount++) {
    const lines = splitBalanced(trimmed, lineCount);
    if (!lines) continue;

    const widest = Math.max(...lines.map(unitWidth));
    const byWidth = maxWidth / widest;
    const byHeight = options.maxHeight / (lineCount * options.lineHeight);
    const size = Math.min(options.maxSize, byWidth, byHeight);

    // Strictly greater, so a tie goes to the smaller line count: one line reads
    // faster than two and this loop visits them in order.
    if (size > bestSize) {
      bestSize = size;
      best = { lines, fontSize: size };
    }
  }

  return { lines: best.lines, fontSize: Math.max(bestSize, options.minSize) };
}
