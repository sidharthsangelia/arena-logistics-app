/**
 * lib/help/search.ts
 *
 * Help-centre search. Pure and dependency free: it runs in the browser over an
 * index the server has already filtered to the viewer's audience, so it never
 * has to know about permissions.
 *
 * Scoring is deliberately simple and explainable. Every word of the query must
 * match somewhere in the article (a prefix, or one typo on longer words), and
 * where it matches decides how much it counts: title over keywords over
 * headings over summary over body. A phrase that appears whole in the title is
 * a bonus on top. A few dozen articles do not need anything cleverer, and
 * "why did this come first" should always have an obvious answer.
 */

import type { HelpBlock, HelpSearchDoc } from "./types";

// ---------------------------------------------------------------------------
// Inline markup → plain text
// ---------------------------------------------------------------------------

/** Strips the help inline syntax (see types.ts) down to readable words. */
export function stripInline(text: string): string {
  return text
    .replace(/\[\[(?:button|badge|key):([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function blockText(block: HelpBlock): string {
  switch (block.type) {
    case "heading":
    case "p":
      return block.text;
    case "callout":
      return [block.title, block.text].filter(Boolean).join(". ");
    case "list":
      return block.items.join(". ");
    case "steps":
      return block.items.map((i) => [i.title, i.body].filter(Boolean).join(" ")).join(". ");
    case "table":
      return [block.head.join(" "), ...block.rows.map((r) => r.join(" "))].join(". ");
    case "flow":
      return block.stages.map((s) => [s.label, s.hint].filter(Boolean).join(" ")).join(". ");
    case "faq":
      return block.items.map((i) => `${i.q} ${i.a}`).join(". ");
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "is", "it",
  "my", "i", "do", "how", "can", "what", "with", "be", "are", "does", "where",
  "why", "when", "this", "that", "me",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function queryTokens(query: string): string[] {
  const all = tokenize(query);
  const meaningful = all.filter((t) => !STOP_WORDS.has(t));
  // "how do i" on its own should still search for something.
  return meaningful.length > 0 ? meaningful : all;
}

/** True when the two words are at most one edit apart. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * How well one query word matches a field's words: 1 exact or prefix, 0.6 a
 * single typo (words of five letters or more only, or "tax" would match "fax"),
 * 0 no match.
 */
function wordMatch(q: string, words: readonly string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === q || w.startsWith(q)) return 1;
    if (q.length >= 5 && w.length >= 4) {
      if (withinOneEdit(q, w) || withinOneEdit(q, w.slice(0, q.length))) {
        best = 0.6;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

interface PreparedDoc {
  doc: HelpSearchDoc;
  title: string[];
  keywords: string[];
  headings: string[];
  summary: string[];
  body: string[];
  titleLower: string;
}

const WEIGHTS = { title: 10, keywords: 7, headings: 5, summary: 4, body: 1 };

export function prepareIndex(docs: readonly HelpSearchDoc[]): PreparedDoc[] {
  return docs.map((doc) => ({
    doc,
    title: tokenize(doc.title),
    keywords: tokenize(doc.keywords.join(" ")),
    headings: tokenize(doc.headings.join(" ")),
    summary: tokenize(doc.summary),
    body: tokenize(doc.body),
    titleLower: doc.title.toLowerCase(),
  }));
}

export interface HelpSearchResult {
  doc: HelpSearchDoc;
  score: number;
  /** A short window of the body around the first match, for the result row. */
  snippet: string;
}

export function searchHelp(
  index: readonly PreparedDoc[],
  query: string,
  limit = 20,
): HelpSearchResult[] {
  const q = queryTokens(query);
  if (q.length === 0) return [];
  const phrase = query.trim().toLowerCase();

  const results: HelpSearchResult[] = [];

  for (const p of index) {
    let score = 0;
    let allMatched = true;

    for (const token of q) {
      const s =
        WEIGHTS.title * wordMatch(token, p.title) +
        WEIGHTS.keywords * wordMatch(token, p.keywords) +
        WEIGHTS.headings * wordMatch(token, p.headings) +
        WEIGHTS.summary * wordMatch(token, p.summary) +
        WEIGHTS.body * Math.min(wordMatch(token, p.body), 1);
      if (s === 0) {
        allMatched = false;
        break;
      }
      score += s;
    }
    if (!allMatched) continue;

    if (phrase.length > 2 && p.titleLower.includes(phrase)) score += 15;

    results.push({ doc: p.doc, score, snippet: makeSnippet(p.doc, q) });
  }

  return results
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit);
}

function makeSnippet(doc: HelpSearchDoc, tokens: readonly string[]): string {
  const body = doc.body;
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return doc.summary;

  const start = Math.max(0, body.lastIndexOf(" ", Math.max(0, at - 60)) + 1);
  const end = Math.min(body.length, at + 140);
  const cut = body.slice(start, end).trim();
  return `${start > 0 ? "… " : ""}${cut}${end < body.length ? " …" : ""}`;
}
