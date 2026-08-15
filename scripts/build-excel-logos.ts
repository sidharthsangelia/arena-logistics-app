/**
 * scripts/build-excel-logos.ts
 *
 * Bakes the logos in /public into a TypeScript module of base64 PNGs for the
 * quotation workbook builder.
 *
 *   npx tsx scripts/build-excel-logos.ts
 *
 * ── WHY NOT JUST READ /public AT RUNTIME ────────────────────────────────────
 * Files in /public are served by the CDN, and Next does not guarantee they are
 * present on the serverless filesystem a route handler runs on. A workbook that
 * renders its logos locally and silently loses them in production is exactly
 * the kind of failure nobody catches before a customer sees it. Baking them in
 * removes the question.
 *
 * ── AND WHY RESIZE ──────────────────────────────────────────────────────────
 * The Arena source logo is 670KB, which would land in every generated file and
 * be rendered at about 200px wide. These are sized for what the sheet actually
 * displays, which keeps a workbook in the tens of kilobytes.
 *
 * Re-run after replacing any logo in /public.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

/** Width in pixels, chosen per role rather than uniformly. */
const SOURCES: { key: string; file: string; width: number }[] = [
  { key: "arena", file: "arena_logo.png", width: 420 },
  { key: "aramex", file: "aramex.png", width: 240 },
  { key: "dhl", file: "dhl.png", width: 200 },
  { key: "fedex", file: "fedex.png", width: 200 },
  { key: "ups", file: "ups.png", width: 120 },
  { key: "shipglobal", file: "shipglobal.png", width: 220 },
];

async function main() {
  const root = process.cwd();
  const entries: string[] = [];

  for (const source of SOURCES) {
    const input = path.join(root, "public", source.file);

    const image = sharp(input).resize({
      width: source.width,
      withoutEnlargement: true,
      fit: "inside",
    });

    const buffer = await image.png({ compressionLevel: 9 }).toBuffer();
    const meta = await sharp(buffer).metadata();

    entries.push(
      `  ${source.key}: {\n` +
        `    width: ${meta.width},\n` +
        `    height: ${meta.height},\n` +
        `    base64: "${buffer.toString("base64")}",\n` +
        `  },`,
    );

    console.log(
      `${source.key.padEnd(12)} ${meta.width}x${meta.height}  ${(buffer.length / 1024).toFixed(1)}KB`,
    );
  }

  const contents = `/**
 * lib/rateSweep/excel/logoData.ts
 *
 * GENERATED FILE — do not edit by hand.
 * Run: npx tsx scripts/build-excel-logos.ts
 *
 * Base64 PNGs of the brand marks, sized for the quotation workbook. Generated
 * rather than read from /public at runtime because /public is not guaranteed to
 * exist on the filesystem a serverless route handler runs on, and a workbook
 * that quietly loses its logos in production is not a failure anyone catches
 * before a customer opens the file.
 */

export interface EmbeddedLogo {
  width: number;
  height: number;
  base64: string;
}

export const EXCEL_LOGOS: Record<string, EmbeddedLogo> = {
${entries.join("\n")}
};
`;

  const out = path.join(root, "lib", "rateSweep", "excel", "logoData.ts");
  writeFileSync(out, contents, "utf8");
  console.log(`\nWrote ${out} (${(contents.length / 1024).toFixed(0)}KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
