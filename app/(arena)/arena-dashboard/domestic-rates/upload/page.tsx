"use client";

import { useEffect, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

 

import { UploadButton } from "@/utils/uploadthing";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Progress } from "@/components/ui/progress";

import { Badge } from "@/components/ui/badge";
import { submitRateLoadAction } from "@/actions/domesticRates.action";

type Vendor = "EDS" | "INDIGO" | "AIR_INDIA";

type JobStatus = {
  id: string;
  vendor: string | null;
  status:
    | "pending"
    | "downloading"
    | "parsing"
    | "loading"
    | "done"
    | "failed";

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
};

export default function DomesticRatesPage() {
  const [vendor, setVendor] =
    useState<Vendor>("INDIGO");

  const [jobId, setJobId] =
    useState<string | null>(null);

  const [job, setJob] =
    useState<JobStatus | null>(null);

  const [loading, setLoading] =
    useState(false);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/rates/job-status?jobId=${jobId}`,
          {
            cache: "no-store",
          }
        );

        const data = await res.json();

        setJob(data);

        if (
          data.status === "done" ||
          data.status === "failed"
        ) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            Domestic Air Rates
          </CardTitle>

          <CardDescription>
            Upload vendor rate sheets and
            create a staged version for review.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Vendor
            </p>

            <Select
              value={vendor}
              onValueChange={(v) =>
                setVendor(v as Vendor)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="EDS">
                  EDS
                </SelectItem>

                <SelectItem value="INDIGO">
                  Indigo
                </SelectItem>

                <SelectItem value="AIR_INDIA">
                  Air India
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <UploadButton
            endpoint="rateSheetUploader"
            appearance={{
              button:
                "w-full h-11 border-dashed border-2 rounded-md border-muted bg-transparent hover:bg-muted/50 data-[state=open]:bg-transparent",
            }}
            onUploadBegin={() => {
              setLoading(true);
            }}
            onClientUploadComplete={async (
              files
            ) => {
              try {
                const file = files[0];

                const result =
                  await submitRateLoadAction({
                    fileUrl: file.url,
                    fileName: file.name,
                    vendor,
                  });

                setJobId(result.jobId);
              } catch (error) {
                console.error(error);
                alert(
                  error instanceof Error
                    ? error.message
                    : "Upload failed"
                );
              } finally {
                setLoading(false);
              }
            }}
            onUploadError={(err) => {
              setLoading(false);
              alert(err.message);
            }}
          />

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading file...
            </div>
          )}

          {job && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    Processing Job
                  </CardTitle>

                  <Badge variant="secondary">
                    {job.status}
                  </Badge>
                </div>

                <CardDescription>
                  {job.message}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <Progress
                  value={job.pct}
                />

                <div className="text-sm text-muted-foreground">
                  Step: {job.step}
                </div>

                {job.status === "done" &&
                  job.result && (
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="h-5 w-5" />

                        <span className="font-medium">
                          Rate Version Created
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div>
                          Version:
                          {" "}
                          {
                            job.result
                              .version_id
                          }
                        </div>

                        <div>
                          Cards:
                          {" "}
                          {
                            job.result
                              .cards_inserted
                          }
                        </div>

                        <div>
                          Slabs:
                          {" "}
                          {
                            job.result
                              .slabs_inserted
                          }
                        </div>

                        <div>
                          Surcharges:
                          {" "}
                          {
                            job.result
                              .surcharges_inserted
                          }
                        </div>

                        <div>
                          AWB Charges:
                          {" "}
                          {
                            job.result
                              .awb_charges_inserted
                          }
                        </div>
                      </div>
                    </div>
                  )}

                {job.status === "failed" && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5" />

                      <span className="font-medium">
                        Job Failed
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {job.error}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}