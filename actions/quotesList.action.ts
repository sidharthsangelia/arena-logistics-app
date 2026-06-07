"use server";
 
import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";
import type { EmailEvent, Prisma, QuoteStatus } from "@/generated/prisma";
import { getDbOrgId } from "@/utils/tenant";
 
export interface QuoteRow {
  id:            string;
  quoteNumber:   string;
  status:        QuoteStatus;
  vendorName:    string;
  productName:   string;
  currency:      string;
  quotedTotal:   number;
lastEmailEvent: EmailEvent | null;
  markupPercent: number;
  tatDays:       number | null;
  pdfUrl:        string | null;
  validUntil:    string;
  createdAt:     string;
  client: {
    id:          string;
    companyName: string;
    contactName: string | null;
  } | null;
  isExpired: boolean;
}
 
export interface QuoteListResult {
  quotes: QuoteRow[];
  total:  number;
}
 
const PAGE_SIZE = 25;
 
export async function getQuotesAction(params: {
  q?:      string;
  status?: QuoteStatus | "";
  page?:   number;
}): Promise<QuoteListResult> {
  const orgId = await getDbOrgId();
  const query = params.q?.trim() ?? "";
  const page  = Math.max(1, params.page ?? 1);
  const skip  = (page - 1) * PAGE_SIZE;
  const now   = new Date();
 
  const where: Prisma.QuoteWhereInput = {
    orgId,          // ← only this org's quotes
    ...(params.status ? { status: params.status } : {}),
    ...(query
      ? {
          OR: [
            { quoteNumber: { contains: query, mode: "insensitive" } },
            { vendorName:  { contains: query, mode: "insensitive" } },
            { productName: { contains: query, mode: "insensitive" } },
            { client: { companyName: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
 
  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id:            true,
        quoteNumber:   true,
        status:        true,
        vendorName:    true,
        productName:   true,
        currency:      true,
        quotedTotal:   true,
        markupPercent: true,
        tatDays:       true,
        pdfUrl:        true,
        validUntil:    true,
        createdAt:     true,
        emailEvents: {
  orderBy: {
    createdAt: "desc",
  },
  take: 1,
  select: {
    event: true,
  },
},
        client: {
          select: {
            id:          true,
            companyName: true,
            contactName: true,
          },
        },
      },
    }),
    prisma.quote.count({ where }),
  ]);
 
  const quotes: QuoteRow[] = rows.map((r) => ({
    id:            r.id,
    quoteNumber:   r.quoteNumber,
    status:        r.status,
    vendorName:    r.vendorName,
    productName:   r.productName,
    currency:      r.currency,
    quotedTotal:   Number(r.quotedTotal),
    markupPercent: Number(r.markupPercent),
    tatDays:       r.tatDays,
    pdfUrl:        r.pdfUrl,
    lastEmailEvent: r.emailEvents[0]?.event ?? null,
    validUntil:    r.validUntil.toISOString(),
    createdAt:     r.createdAt.toISOString(),
    client:        r.client,
    isExpired:     r.validUntil < now && r.status === "DRAFT",
  }));
 
  return { quotes, total };
}
 
type ActionResult =
  | { success: true }
  | { success: false; message: string };
 
export async function updateQuoteStatusAction(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();
 
    await prisma.quote.update({
      where: { id, orgId },   // ← org-scoped
      data: { status },
    });
 
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("updateQuoteStatusAction", error);
    return { success: false, message: "Failed to update status." };
  }
}
 
export async function deleteQuoteAction(id: string): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();
 
    await prisma.quote.delete({
      where: { id, orgId },   // ← org-scoped
    });
 
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("deleteQuoteAction", error);
    return { success: false, message: "Failed to delete quote." };
  }
}