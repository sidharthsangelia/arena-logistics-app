/**
 * lib/labels/awb/naming.ts
 *
 * What a label file and its document row are called.
 *
 * Pure and free of `server-only`, so the naming can be pinned in tests. It is
 * not decoration: two labels for one parcel now travel together — the vendor's
 * own PDF and Arena's rendering of the same waybill — and they arrive in the
 * same email and sit on the same shipment page. If they shared a filename the
 * mail client would show one file, or two files a customer cannot tell apart,
 * and somebody would print the wrong one.
 *
 * So the Arena label always says so, in the filename and in the document label.
 */

/** Strip a waybill to something safe for a filename, keeping it recognisable. */
function safeAwb(awbNumber: string): string {
  return awbNumber.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A filename somebody can find again in a downloads folder six weeks later.
 * The AWB is the number they will be searching by.
 */
export function labelFileName(awbNumber: string): string {
  return `AWB-${safeAwb(awbNumber) || "label"}.pdf`;
}

/**
 * The same, for Arena's own rendering. Prefixed rather than suffixed so the two
 * never collide as email attachments and never sort next to each other by
 * accident in a downloads folder.
 */
export function arenaLabelFileName(awbNumber: string): string {
  return `Arena-label-${safeAwb(awbNumber) || "label"}.pdf`;
}

/**
 * The `label` on the ShipmentDocument row: what ops and the customer read in a
 * file list. It names the AWB because that is the only thing distinguishing one
 * label on a shipment from another.
 */
export function arenaLabelDocumentLabel(awbNumber: string): string {
  return `Arena shipping label (AWB ${awbNumber})`;
}
