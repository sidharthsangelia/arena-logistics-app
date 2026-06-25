"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData, ServiceOption } from "@/types/booking.types";
import { getRatesAction } from "@/actions/rates.action";

// ---------------------------------------------------------------------------
// Country name → ISO 3166-1 alpha-2
// ---------------------------------------------------------------------------

const COUNTRY_TO_ISO: Record<string, string> = {
  "Afghanistan":"AF","Albania":"AL","Algeria":"DZ","Andorra":"AD","Angola":"AO",
  "Antigua and Barbuda":"AG","Argentina":"AR","Armenia":"AM","Australia":"AU",
  "Austria":"AT","Azerbaijan":"AZ","Bahamas":"BS","Bahrain":"BH","Bangladesh":"BD",
  "Barbados":"BB","Belarus":"BY","Belgium":"BE","Belize":"BZ","Benin":"BJ",
  "Bhutan":"BT","Bolivia":"BO","Bosnia and Herzegovina":"BA","Botswana":"BW",
  "Brazil":"BR","Brunei":"BN","Bulgaria":"BG","Burkina Faso":"BF","Burundi":"BI",
  "Cabo Verde":"CV","Cambodia":"KH","Cameroon":"CM","Canada":"CA",
  "Central African Republic":"CF","Chad":"TD","Chile":"CL","China":"CN",
  "Colombia":"CO","Comoros":"KM","Congo (DRC)":"CD","Congo (Republic)":"CG",
  "Costa Rica":"CR","Croatia":"HR","Cuba":"CU","Cyprus":"CY","Czech Republic":"CZ",
  "Denmark":"DK","Djibouti":"DJ","Dominican Republic":"DO","Ecuador":"EC",
  "Egypt":"EG","El Salvador":"SV","Equatorial Guinea":"GQ","Eritrea":"ER",
  "Estonia":"EE","Eswatini":"SZ","Ethiopia":"ET","Fiji":"FJ","Finland":"FI",
  "France":"FR","Gabon":"GA","Gambia":"GM","Georgia":"GE","Germany":"DE",
  "Ghana":"GH","Greece":"GR","Grenada":"GD","Guatemala":"GT","Guinea":"GN",
  "Guinea-Bissau":"GW","Guyana":"GY","Haiti":"HT","Honduras":"HN","Hong Kong":"HK",
  "Hungary":"HU","Iceland":"IS","India":"IN","Indonesia":"ID","Iran":"IR",
  "Iraq":"IQ","Ireland":"IE","Israel":"IL","Italy":"IT","Jamaica":"JM",
  "Japan":"JP","Jordan":"JO","Kazakhstan":"KZ","Kenya":"KE","Kiribati":"KI",
  "Kuwait":"KW","Kyrgyzstan":"KG","Laos":"LA","Latvia":"LV","Lebanon":"LB",
  "Lesotho":"LS","Liberia":"LR","Libya":"LY","Liechtenstein":"LI","Lithuania":"LT",
  "Luxembourg":"LU","Madagascar":"MG","Malawi":"MW","Malaysia":"MY","Maldives":"MV",
  "Mali":"ML","Malta":"MT","Marshall Islands":"MH","Mauritania":"MR",
  "Mauritius":"MU","Mexico":"MX","Micronesia":"FM","Moldova":"MD","Monaco":"MC",
  "Mongolia":"MN","Montenegro":"ME","Morocco":"MA","Mozambique":"MZ","Myanmar":"MM",
  "Namibia":"NA","Nauru":"NR","Nepal":"NP","Netherlands":"NL","New Zealand":"NZ",
  "Nicaragua":"NI","Niger":"NE","Nigeria":"NG","Norway":"NO","Oman":"OM",
  "Pakistan":"PK","Palau":"PW","Panama":"PA","Papua New Guinea":"PG","Paraguay":"PY",
  "Peru":"PE","Philippines":"PH","Poland":"PL","Portugal":"PT","Qatar":"QA",
  "Romania":"RO","Russia":"RU","Rwanda":"RW","Saint Kitts and Nevis":"KN",
  "Saint Lucia":"LC","Saint Vincent and the Grenadines":"VC","Samoa":"WS",
  "San Marino":"SM","São Tomé and Príncipe":"ST","Saudi Arabia":"SA","Senegal":"SN",
  "Serbia":"RS","Seychelles":"SC","Sierra Leone":"SL","Singapore":"SG",
  "Slovakia":"SK","Slovenia":"SI","Solomon Islands":"SB","Somalia":"SO",
  "South Africa":"ZA","South Sudan":"SS","Spain":"ES","Sri Lanka":"LK",
  "Sudan":"SD","Suriname":"SR","Sweden":"SE","Switzerland":"CH","Syria":"SY",
  "Taiwan":"TW","Tajikistan":"TJ","Tanzania":"TZ","Thailand":"TH","Timor-Leste":"TL",
  "Togo":"TG","Tonga":"TO","Trinidad and Tobago":"TT","Tunisia":"TN","Turkey":"TR",
  "Turkmenistan":"TM","Tuvalu":"TV","Uganda":"UG","Ukraine":"UA",
  "United Arab Emirates":"AE","United Kingdom":"GB","United States":"US",
  "Uruguay":"UY","Uzbekistan":"UZ","Vanuatu":"VU","Venezuela":"VE","Vietnam":"VN",
  "Yemen":"YE","Zambia":"ZM","Zimbabwe":"ZW",
};

function toISO(country: string): string {
  if (!country) return "";
  if (country.length === 2) return country.toUpperCase();
  return COUNTRY_TO_ISO[country] ?? country.slice(0, 2).toUpperCase();
}

function buildRateRequest(data: BookingFormData) {
  const first = data.packages[0];
  if (!first) throw new Error("At least one package is required.");

  return {
    origin: {
      city: data.consignor.city,
      pincode: data.consignor.postalCode,
      countryCode: toISO(data.consignor.country),
      country: data.consignor.country.toUpperCase(),
      line1: data.consignor.addressLine1,
    },
    destination: {
      city: data.consignee.city,
      pincode: data.consignee.postalCode,
      countryCode: toISO(data.consignee.country),
      country: data.consignee.country.toUpperCase(),
      line1: data.consignee.addressLine1,
    },
    shipment: {
      weight: data.packages.reduce((s, p) => s + p.weightKg * p.quantity, 0),
      quantity: data.packages.reduce((s, p) => s + p.quantity, 0),
      dimensions: {
        length: Math.max(Number(first.lengthCm) || 0, 1),
        width:  Math.max(Number(first.widthCm)  || 0, 1),
        height: Math.max(Number(first.heightCm) || 0, 1),
        unit: "cm" as const,
      },
      description: first.description || "General Cargo",
      goodsOriginCountry: toISO(first.countryOfOrigin || "India"),
    },
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmt(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ServiceSelectionStepProps {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  formData: BookingFormData;
}

// ---------------------------------------------------------------------------
// RateCard — consistent with RateResultCard from the rate calculator
// ---------------------------------------------------------------------------

function RateCard({
  quote,
  selected,
  isCheapest,
  isFastest,
  onSelect,
}: {
  quote: ServiceOption;
  selected: boolean;
  isCheapest: boolean;
  isFastest: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-lg border text-left transition-all duration-150",
        selected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/50 hover:shadow-sm",
      )}
    >
      {/* Top badges strip */}
      {(isCheapest || isFastest) && !selected && (
        <div className="flex gap-1.5 border-b border-border/60 px-4 py-2">
          {isCheapest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <TrendingDown className="h-2.5 w-2.5" />
              Best price
            </span>
          )}
          {isFastest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Zap className="h-2.5 w-2.5" />
              Fastest
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-4">
        {/* Selection indicator */}
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <CheckCircle2 className="h-3 w-3" />}
        </div>

        {/* Carrier + product */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {quote.productName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
              {quote.vendorName}
            </Badge>
            {quote.transitDays > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {quote.transitDays} {quote.transitDays === 1 ? "day" : "days"}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-foreground">
            {fmt(quote.price, quote.currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">incl. GST</p>
        </div>
      </div>

      {/* Selected confirmation bar */}
      {selected && (
        <div className="flex items-center gap-1.5 border-t border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Selected — click Next to confirm
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Route summary pill
// ---------------------------------------------------------------------------

function RouteSummary({ data }: { data: BookingFormData }) {
  const totalWeight = data.packages.reduce((s, p) => s + p.weightKg * p.quantity, 0);
  const totalPkgs   = data.packages.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">
        {data.consignor.city} → {data.consignee.city}, {data.consignee.country}
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>{totalPkgs} pkg{totalPkgs !== 1 ? "s" : ""}</span>
      <Separator orientation="vertical" className="h-3" />
      <span>{totalWeight.toFixed(2)} kg</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function RateSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-lg border bg-muted/40"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
      <p className="pt-1 text-center text-xs text-muted-foreground">
        Fetching live rates from carriers…
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceSelectionStep
// ---------------------------------------------------------------------------

export default function ServiceSelectionStep({
  watch,
  setValue,
  errors,
  formData,
}: ServiceSelectionStepProps) {
  const [quotes, setQuotes] = useState<ServiceOption[]>([]);
  const [vendorErrors, setVendorErrors] = useState<{ vendorId: string; message: string }[]>([]);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [hasFetched, setHasFetched]     = useState(false);

  const selectedService = watch("selectedService");
  const serviceError    = errors.selectedService?.message as string | undefined;

  const fetchRates = () => {
    setFetchError(null);
    setVendorErrors([]);
    setQuotes([]);

    startTransition(async () => {
      try {
        const request = buildRateRequest(formData);
        const result  = await getRatesAction(request as any);

        if (!result.success && result.quotes.length === 0) {
          setFetchError(result.error ?? "No rates returned from carriers.");
          return;
        }

        const mapped: ServiceOption[] = result.quotes.map((q: any) => ({
          vendorId:   q.vendorId,
          vendorName: q.vendorName,
          productCode: `${q.vendorId}-${q.productName}-${q.totalWithTax}`,
          productName: q.productName,
          transitDays: q.tatDays ?? 0,
          price:       q.totalWithTax,
          currency:    q.currency ?? "INR",
        }));

        setQuotes(mapped);
        setVendorErrors(result.vendorErrors ?? []);
        setHasFetched(true);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Unexpected error fetching rates.");
      }
    });
  };

  useEffect(() => {
    if (!hasFetched) fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cheapestPrice = quotes.length > 0 ? Math.min(...quotes.map((q) => q.price)) : Infinity;
  const fastestDays   = quotes.length > 0
    ? Math.min(...quotes.filter((q) => q.transitDays > 0).map((q) => q.transitDays))
    : Infinity;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Choose a Shipping Service</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live quotes from our carrier network, sorted by price.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={fetchRates}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Route summary */}
      {formData.packages.length > 0 && <RouteSummary data={formData} />}

      {/* Loading */}
      {isPending && <RateSkeleton />}

      {/* Fatal fetch error */}
      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Couldn't fetch rates</p>
            <p className="mt-0.5 text-muted-foreground">{fetchError}</p>
            <button
              type="button"
              onClick={fetchRates}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Try again <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Partial carrier failures */}
      {!isPending && vendorErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="font-medium mb-1">Some carriers didn't respond:</p>
          <ul className="space-y-0.5 text-amber-700">
            {vendorErrors.map((e) => (
              <li key={e.vendorId}>
                <span className="font-medium">{e.vendorId}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rate list */}
      {!isPending && quotes.length > 0 && (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <RateCard
              key={`${quote.vendorId}-${quote.productName}-${quote.price}`}
              quote={quote}
              selected={
                selectedService?.vendorId === quote.vendorId &&
                selectedService?.productCode === quote.productCode
              }
              isCheapest={quote.price === cheapestPrice}
              isFastest={quote.transitDays > 0 && quote.transitDays === fastestDays}
              onSelect={() => setValue("selectedService", quote, { shouldValidate: true })}
            />
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">
            {quotes.length} service{quotes.length !== 1 ? "s" : ""} available · Prices include GST
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed py-12 text-center">
          <Truck className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No services available for this route</p>
          <p className="text-xs text-muted-foreground">
            Check the destination postal code or adjust package details.
          </p>
        </div>
      )}

      {/* Validation error */}
      {serviceError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {serviceError}
        </p>
      )}
    </div>
  );
}