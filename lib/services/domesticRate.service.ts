/**
 * lib/rate-service.ts
 * ────────────────────
 * Server-side helper for your Next.js app to talk to the Rate Loader microservice.
 *
 * Usage (in a Next.js Server Action or API route):
 *
 *   // After UploadThing finishes:
 *   const { jobId } = await submitRateJob({
 *     fileUrl: uploadedFile.url,
 *     fileName: uploadedFile.name,
 *     uploadedBy: userId,
 *   });
 *
 *   // Poll from the browser via your own Next.js route:
 *   // GET /api/rates/job-status?jobId=xxx  → proxies to rate service
 */

const DOMESTIC_RATE_SERVICE_URL = process.env.DOMESTIC_RATE_SERVICE_URL!;       // e.g. http://rate-service:8000
const DOMESTIC_RATE_SERVICE_KEY = process.env.DOMESTIC_RATE_SERVICE_SECRET_KEY!; // shared secret

if (!DOMESTIC_RATE_SERVICE_URL || !DOMESTIC_RATE_SERVICE_KEY) {
  throw new Error("DOMESTIC_RATE_SERVICE_URL and DOMESTIC_RATE_SERVICE_SECRET_KEY must be set");
}

const HEADERS = {
  "Content-Type": "application/json",
  "x-service-key": DOMESTIC_RATE_SERVICE_KEY,
};

// ─── Types ─────────────────────────────────────────────────────────────────

export type RateVendor = "EDS" | "INDIGO" | "AIR_INDIA";

export interface SubmitJobOptions {
  fileUrl: string;
  fileName: string;
  vendor?: RateVendor;       // omit to auto-detect
  effectiveFrom?: string;    // "YYYY-MM-DD", defaults to today
  uploadedBy?: string;       // Clerk userId
}

export interface SubmitJobResult {
  jobId: string;
  message: string;
}

export interface JobStatus {
  id: string;
  vendor: string | null;
  status: "pending" | "downloading" | "parsing" | "loading" | "done" | "failed";
  step: string;
  pct: number;
  message: string;
  result: {
    version_id: string;
    vendor: string;
    cards_inserted: number;
    slabs_inserted: number;
    surcharges_inserted: number;
    awb_charges_inserted: number;
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivateVersionOptions {
  versionId: string;
  activatedBy?: string;
}

// ─── API calls ──────────────────────────────────────────────────────────────

/**
 * Submit a new rate load job.
 * Call this from a Server Action right after UploadThing returns the file URL.
 */
export async function submitRateJob(opts: SubmitJobOptions): Promise<SubmitJobResult> {
  const res = await fetch(`${DOMESTIC_RATE_SERVICE_URL}/upload/url`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      file_url: opts.fileUrl,
      file_name: opts.fileName,
      vendor: opts.vendor ?? null,
      effective_from: opts.effectiveFrom ?? null,
      uploaded_by: opts.uploadedBy ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Rate service error ${res.status}: ${body.detail ?? res.statusText}`);
  }

  const data = await res.json();
  return { jobId: data.job_id, message: data.message };
}

/**
 * Fetch current job status.
 * Proxy this through a thin Next.js API route so you don't expose
 * the service URL or secret key to the browser.
 */
export async function getRateJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${DOMESTIC_RATE_SERVICE_URL}/status/${jobId}`, {
    headers: HEADERS,
    // Don't cache — this is a polling endpoint
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Rate service error ${res.status}: ${body.detail ?? res.statusText}`);
  }

  return res.json();
}

/**
 * Activate a staged rate version.
 * Call this from a Server Action when the ops team clicks "Activate" in your dashboard.
 */
export async function activateRateVersion(opts: ActivateVersionOptions): Promise<void> {
  const res = await fetch(`${DOMESTIC_RATE_SERVICE_URL}/activate`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      version_id: opts.versionId,
      activated_by: opts.activatedBy ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Activation failed ${res.status}: ${body.detail ?? res.statusText}`);
  }
}

/**
 * List recent rate versions (for the dashboard table).
 */
export async function listRateVersions(vendor?: RateVendor) {
  const url = vendor
    ? `${DOMESTIC_RATE_SERVICE_URL}/versions?vendor=${vendor}`
    : `${DOMESTIC_RATE_SERVICE_URL}/versions`;

  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch versions: ${res.statusText}`);
  return res.json();
}