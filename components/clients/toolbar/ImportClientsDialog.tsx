"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { importClientsAction } from "@/actions/clientsImportExport.actions";
import {
  COLUMN_SPECS,
  type ClientImportRow,
  type ImportAnalysis,
} from "@/lib/clients/clientImportSpec";
import {
  ACCEPTED_EXTENSIONS,
  downloadClientTemplate,
  MAX_FILE_SIZE_BYTES,
  parseClientFile,
} from "@/lib/clients/clientImportBrowser";

type Step = "upload" | "preview";

export default function ImportClientsDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ClientImportRow[]>([]);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setBusy(false);
    setFileName("");
    setRows([]);
    setAnalysis(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      toast.error("Unsupported file type. Please upload a .csv, .xlsx, or .xls file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    setBusy(true);
    try {
      const parsed = await parseClientFile(file);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }

      const result = await importClientsAction(parsed.rows, { dryRun: true });
      if (!result.success && result.readyCount === 0 && result.total === 0) {
        toast.error(result.message ?? "Couldn't read that file.");
        return;
      }

      setFileName(file.name);
      setRows(parsed.rows);
      setAnalysis(result);
      setStep("preview");
    } catch (err) {
      console.error("Client import analysis failed:", err);
      toast.error("Something went wrong while reading the file. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const result = await importClientsAction(rows, { dryRun: false });
      if (!result.committed || (result.importedCount ?? 0) === 0) {
        toast.error(result.message ?? "No clients were imported.");
        setAnalysis(result);
        return;
      }

      const skipped =
        result.duplicateExistingRows.length + result.duplicateInFileRows.length;
      const parts = [`${result.importedCount} client${result.importedCount === 1 ? "" : "s"} imported`];
      if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
      if (result.invalidRows.length)
        parts.push(`${result.invalidRows.length} row${result.invalidRows.length === 1 ? "" : "s"} with errors skipped`);
      toast.success(parts.join(", "));
      handleOpenChange(false);
    } catch (err) {
      console.error("Client import commit failed:", err);
      toast.error("Something went wrong while importing. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import clients</DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Bulk-add clients from a CSV or Excel file. You'll review everything before anything is saved."
              : `Reviewing ${fileName} — nothing is saved until you confirm.`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <UploadStep
            busy={busy}
            inputRef={inputRef}
            onPick={() => inputRef.current?.click()}
            onFile={handleFile}
          />
        ) : (
          analysis && <PreviewStep analysis={analysis} />
        )}

        <DialogFooter>
          {step === "upload" ? (
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={reset} disabled={busy}>
                Choose another file
              </Button>
              <Button onClick={handleConfirm} disabled={busy || !analysis?.readyCount}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {analysis?.readyCount
                  ? `Import ${analysis.readyCount} client${analysis.readyCount === 1 ? "" : "s"}`
                  : "Nothing to import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — upload + template + guidance
// ---------------------------------------------------------------------------

function UploadStep({
  busy,
  inputRef,
  onPick,
  onFile,
}: {
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: () => void;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const required = COLUMN_SPECS.filter((c) => c.required);
  const optional = COLUMN_SPECS.filter((c) => !c.required);

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFile}
        disabled={busy}
      />

      {/* Dropzone-style trigger */}
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/60 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">
          {busy ? "Reading file…" : "Click to choose a .csv or .xlsx file"}
        </span>
        <span className="text-xs text-muted-foreground">Up to 5,000 rows · max 5MB</span>
      </button>

      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">New here? Start from the template</p>
          <p className="text-xs text-muted-foreground">
            Includes an instructions sheet and example rows.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadClientTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
      </div>

      {/* Field guidance */}
      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Required:</span>
          {required.map((c) => (
            <Badge key={c.field} variant="secondary">
              {c.header}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Optional:</span>
          {optional.map((c) => (
            <Badge key={c.field} variant="outline">
              {c.header}
            </Badge>
          ))}
        </div>
        <Separator className="my-1" />
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Headers are matched loosely — order doesn&apos;t matter and common variants (Phone / Mobile) work.</li>
          <li>• Rows missing a required field are skipped and listed for you.</li>
          <li>• Clients that already exist are skipped, never overwritten.</li>
          <li>• Blank <span className="font-medium text-foreground">Company Name</span> is treated as an individual (uses Contact Name).</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — preview + confirm
// ---------------------------------------------------------------------------

function PreviewStep({ analysis }: { analysis: ImportAnalysis }) {
  const skipped = analysis.duplicateExistingRows.length + analysis.duplicateInFileRows.length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />}
          label="Ready"
          value={analysis.readyCount}
        />
        <SummaryTile
          icon={<Copy className="h-4 w-4 text-amber-600 dark:text-amber-500" />}
          label="Duplicates skipped"
          value={skipped}
        />
        <SummaryTile
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          label="Errors"
          value={analysis.invalidRows.length}
        />
      </div>

      {analysis.readyCount === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nothing to import</AlertTitle>
          <AlertDescription>
            {analysis.message ?? "Every row was skipped. Check the tabs below for why."}
          </AlertDescription>
        </Alert>
      )}

      {analysis.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {analysis.preview.length} of {analysis.readyCount} ready rows. All valid rows will still be imported.
        </p>
      )}

      <Tabs defaultValue="ready">
        <TabsList>
          <TabsTrigger value="ready">Ready ({analysis.readyCount})</TabsTrigger>
          <TabsTrigger value="skipped">Skipped ({skipped})</TabsTrigger>
          <TabsTrigger value="errors">Errors ({analysis.invalidRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ready">
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.preview.length === 0 ? (
                  <EmptyRow colSpan={5} label="No rows are ready to import." />
                ) : (
                  analysis.preview.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="font-medium">
                        {r.companyName}
                        {r.warnings.length > 0 && (
                          <span className="mt-0.5 block text-xs font-normal text-amber-600 dark:text-amber-500">
                            {r.warnings.join(" · ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{r.contactName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="skipped">
          <IssueTable
            rows={[...analysis.duplicateExistingRows, ...analysis.duplicateInFileRows]}
            emptyLabel="No duplicates — every row is new."
          />
        </TabsContent>

        <TabsContent value="errors">
          <IssueTable
            rows={analysis.invalidRows}
            emptyLabel="No errors — every row has the required fields."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function IssueTable({
  rows,
  emptyLabel,
}: {
  rows: { row: number; label: string; reasons: string[] }[];
  emptyLabel: string;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={3} label={emptyLabel} />
          ) : (
            rows.map((r) => (
              <TableRow key={`${r.row}-${r.label}`}>
                <TableCell className="text-muted-foreground tabular-nums">{r.row}</TableCell>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-muted-foreground">{r.reasons.join(", ")}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-sm text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}
