"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Mail,
  CheckCheck,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { markQuoteAsSentAction } from "@/actions/quote/quoteEmail.action";
import SendQuoteDialog from "./SendQuoteDialog";


export type QuoteActionsMenuProps = {
  quote: {
    id: string;
    quoteNumber: string;
    productName: string;
    vendorName: string;
    quotedTotal: number;
    currency: string;
    status: string;
    validUntil: Date | null;
    pdfUrl: string | null;
  };
  client: {
    companyName: string;
    contactName: string | null;
    email: string | null;
  };
};

export default function QuoteActionsMenu({
  quote,
  client,
}: QuoteActionsMenuProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSent = quote.status === "SENT" || quote.status === "ACCEPTED";

  function handleMarkAsSent() {
    startTransition(async () => {
      const result = await markQuoteAsSentAction(quote.id);
      if (result.success) {
        toast.success(`Quote #${quote.quoteNumber} marked as Sent.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 data-[state=open]:bg-muted"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">Quote actions</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          {/* View PDF */}
          {quote.pdfUrl && (
            <DropdownMenuItem asChild>
              <a href={quote.pdfUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-2 h-3.5 w-3.5" />
                View PDF
              </a>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Send by Email */}
          <DropdownMenuItem
            onSelect={() => setEmailOpen(true)}
            disabled={!quote.pdfUrl}
          >
            <Mail className="mr-2 h-3.5 w-3.5" />
            Send by Email
          </DropdownMenuItem>

          {/* Mark as Sent — manual fallback for other channels */}
          <DropdownMenuItem
            onSelect={handleMarkAsSent}
            disabled={isSent || isPending}
            className={isSent ? "text-muted-foreground" : ""}
          >
            <CheckCheck className="mr-2 h-3.5 w-3.5" />
            {isSent ? "Already Sent" : "Mark as Sent"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Email dialog — mounted outside the dropdown to avoid unmount issues */}
      <SendQuoteDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        quote={quote}
        client={client}
      />
    </>
  );
}