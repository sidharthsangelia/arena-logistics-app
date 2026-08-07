/**
 * Renders sample shipping labels to real PDFs, so the template can be looked at
 * without booking a shipment. Throwaway verification script, and the fastest
 * way to check the one thing that matters most: that it still fits on one page.
 *
 * Four files, because the combinations exercise different halves of the label:
 * COD against PREPAID changes the stamp block, and thermal against A4 changes
 * the page around identical artwork.
 *
 *   npx tsx scripts/renderSampleLabel.tsx
 *
 * Then open the PDFs and check, in this order:
 *   1. ONE page each. A label that wraps to a second page has lost its bottom
 *      half, and the bottom half is the payment stamp.
 *   2. The barcode zooms to crisp vertical edges with no grey. If it is fuzzy,
 *      something has turned it back into an image.
 *   3. The thermal and A4 barcodes measure the same width.
 */

import { writeFileSync } from "node:fs";

import { AwbLabelDocument } from "@/lib/labels/awb/AwbLabelDocument";
import { SAMPLE_COD_LABEL, SAMPLE_PREPAID_LABEL } from "@/lib/labels/awb/sample";
import { assertLabelData } from "@/lib/labels/awb/types";
import type { AwbLabelData, LabelPaperSize } from "@/lib/labels/awb/types";

// The document, not lib/labels/awb/render — that module is `server-only`, which
// throws outside a React Server Component. Same reason renderSampleInvoice.tsx
// renders TaxInvoiceDocument directly.
async function render(
  name: string,
  data: AwbLabelData,
  paperSize: LabelPaperSize,
) {
  const { renderToBuffer } = await import("@react-pdf/renderer");

  assertLabelData(data);
  const buffer = await renderToBuffer(
    <AwbLabelDocument data={data} paperSize={paperSize} />,
  );
  const path = `${name}.pdf`;
  writeFileSync(path, buffer);

  // The page count is the check worth automating; everything else needs eyes.
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(
    `${path.padEnd(34)} ${(buffer.length / 1024).toFixed(1).padStart(6)} KB   ${pages} page${pages === 1 ? "" : "s"}${pages === 1 ? "" : "   <-- TOO MANY"}`,
  );
}

async function main() {
  await render("sample-label-cod-thermal", SAMPLE_COD_LABEL, "thermal");
  await render("sample-label-prepaid-thermal", SAMPLE_PREPAID_LABEL, "thermal");
  await render("sample-label-cod-a4", SAMPLE_COD_LABEL, "a4");
  await render("sample-label-prepaid-a4", SAMPLE_PREPAID_LABEL, "a4");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
