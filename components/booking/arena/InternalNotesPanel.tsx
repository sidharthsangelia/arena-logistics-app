"use client";

import React from "react";
 

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateInternalNotes } from "@/actions/book/companySideBookings.action";

interface Props {
  shipmentId: string;
  initialNotes: string;
}

export function InternalNotesPanel({ shipmentId, initialNotes }: Props) {
  const [notes, setNotes] = React.useState(initialNotes);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = notes.trim() !== initialNotes.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await updateInternalNotes(shipmentId, notes);

    setSaving(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Visible to ops only. Not shown to tenants.
        </p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add ops notes, tracking info, carrier contacts…"
          className="h-28 resize-none text-sm"
        />

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={!isDirty || saving}
          variant={isDirty ? "default" : "secondary"}
          className="w-full h-9"
          size="sm"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              Notes saved
            </>
          ) : (
            "Save notes"
          )}
        </Button>
    </div>
  );
}