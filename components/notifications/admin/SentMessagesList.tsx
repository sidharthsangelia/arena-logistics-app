import { MailOpen } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { SEVERITY_CONFIG } from "@/lib/notices/config";
import { timeAgo } from "@/lib/notifications/config";
import type { SentMessageSummary } from "@/lib/notifications/arenaMessages";

/**
 * What has already gone out, with how many recipients have actually opened it.
 *
 * The read count is the reason this exists. "I told them" and "they know" are
 * different claims, and after a message about a carrier delay it matters which one is
 * true: a low count a day later means picking up the phone rather than assuming.
 *
 * A server component. There is nothing interactive here, so it stays off the client
 * bundle and re-renders with the page after a send.
 */
export function SentMessagesList({ messages }: { messages: SentMessageSummary[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MailOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Already sent</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          How many recipients have opened each message.
        </p>
      </CardHeader>

      <Separator />

      <CardContent className="pt-0">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            You have not sent any messages yet.
          </p>
        ) : (
          <ul className="divide-y">
            {messages.map((message) => {
              const config = SEVERITY_CONFIG[message.severity];
              const allRead = message.readCount === message.orgCount;

              return (
                <li key={message.key} className="py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            config.chip,
                          )}
                        >
                          {config.label}
                        </span>
                        <p className="text-sm font-medium">{message.title}</p>
                      </div>
                      {message.body && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {message.body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        {timeAgo(message.sentAt)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          allRead ? "text-emerald-700" : "text-foreground",
                        )}
                      >
                        {message.readCount} / {message.orgCount}
                      </p>
                      <p className="text-[11px] text-muted-foreground">opened</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
