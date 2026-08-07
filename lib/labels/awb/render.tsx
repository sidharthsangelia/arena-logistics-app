/**
 * lib/labels/awb/render.tsx
 *
 * Renders a shipping label to a PDF buffer.
 *
 * NODE RUNTIME ONLY, same as the invoice renderer: @react-pdf/renderer needs
 * Node streams and is not usable on the edge. Any route importing this has to
 * declare the Node runtime.
 *
 * Deliberately does NOT upload anywhere. The invoice renderer is paired with an
 * upload because an invoice is a record that has to exist afterwards; a label
 * is printed on demand and reprinted whenever somebody needs another copy.
 * Storing every reprint would fill the bucket with identical files. When a
 * label does need to be filed against a shipment, lib/booking/labelStorage.ts
 * is the thing that files it.
 */

import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { AwbLabelDocument } from "./AwbLabelDocument";
import { labelFileName } from "./naming";
import { assertLabelData, type AwbLabelData, type LabelPaperSize } from "./types";

export class LabelRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelRenderError";
  }
}

// Naming moved to ./naming.ts, which carries no `server-only` and can therefore
// be tested directly. Re-exported so callers of the renderer keep working.
export { labelFileName };

export async function renderAwbLabel(
  data: AwbLabelData,
  paperSize: LabelPaperSize = "thermal",
): Promise<{ buffer: Buffer; fileName: string }> {
  // Validated before rendering, so a label with no waybill fails as that rather
  // than as a PDF with an empty space where the barcode should be.
  assertLabelData(data);

  const buffer = await renderToBuffer(
    <AwbLabelDocument data={data} paperSize={paperSize} />,
  );

  if (!buffer?.length) {
    throw new LabelRenderError("Label PDF rendered as an empty buffer.");
  }

  return { buffer, fileName: labelFileName(data.awbNumber) };
}
