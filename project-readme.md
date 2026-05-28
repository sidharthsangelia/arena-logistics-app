# Rate Calculator — Adapter Architecture

A **vendor adapter pattern** that lets you plug in new shipping/logistics
rate APIs without touching existing code.

---

## Directory Structure

```
src/
├── lib/
│   ├── adapters/
│   │   ├── core/
│   │   │   ├── types.ts          ← Canonical input/output shapes (the shared language)
│   │   │   ├── base.adapter.ts   ← Abstract class every adapter must extend
│   │   │   └── registry.ts       ← Singleton map of vendorId → adapter instance
│   │   └── vendors/
│   │       ├── index.ts          ← ★ ONLY file you touch to add a new vendor ★
│   │       ├── skart/
│   │       │   ├── skart.types.ts    ← Skart-specific request/response types
│   │       │   └── skart.adapter.ts  ← Skart implementation
│   │       └── aramex/
│   │           ├── aramex.types.ts
│   │           └── aramex.adapter.ts
│   └── services/
│       └── rate-calculator.service.ts  ← Fans out to all adapters, merges results
└── app/
    └── api/
        └── rates/
            └── route.ts          ← Next.js API route (thin HTTP layer only)
```

---

## Data Flow

```
Client POST /api/rates
        │
        ▼
  route.ts                     ← parse, validate, call service
        │
        ▼
  rate-calculator.service.ts   ← fan out to N adapters in parallel
        │
   ┌────┴───────────────┐
   ▼                    ▼
skart.adapter.ts   aramex.adapter.ts   (... more vendors)
   │                    │
   │  3 steps each:     │
   │  1. transformRequest()
   │  2. callVendorApi()
   │  3. transformResponse()
   │                    │
   └────────┬───────────┘
            │  RateQuote[] from each
            ▼
  service merges + sorts by price
            │
            ▼
  CanonicalRateResponse → client
```

---

## Canonical API Contract

### Request  `POST /api/rates`

```json
{
  "origin": {
    "city": "New Delhi",
    "pincode": "110059",
    "countryCode": "IN",
    "line1": "123 Connaught Place"
  },
  "destination": {
    "city": "Sydney",
    "pincode": "7470",
    "countryCode": "AU",
    "country": "AUSTRALIA"
  },
  "shipment": {
    "weight": 1,
    "quantity": 1,
    "dimensions": { "length": 30, "width": 20, "height": 10, "unit": "cm" },
    "description": "Electronics"
  }
}
```

Optional query param to restrict to specific vendors:
```
POST /api/rates?vendors=skart,aramex
```

### Response

```json
{
  "success": true,
  "quotes": [
    {
      "vendorId": "aramex",
      "vendorName": "Aramex",
      "productName": "Aramex Priority Parcel Express",
      "currency": "USD",
      "totalWithTax": 45.20,
      "totalWithoutTax": 38.30,
      "tatDays": 3,
      "charges": [
        { "name": "FREIGHT", "amount": 38.30, "currency": "USD" }
      ]
    },
    {
      "vendorId": "skart",
      "vendorName": "sKart Express",
      "productName": "DHL Express",
      "currency": "INR",
      "totalWithTax": 1928.12,
      "totalWithoutTax": 1634.00,
      "tatDays": 2,
      "charges": [
        { "name": "FREIGHT",       "amount": 1291, "currency": "INR", "taxAmount": 232.38 },
        { "name": "FUEL SURCHARGE","amount": 343,  "currency": "INR", "taxAmount": 61.74  }
      ]
    }
  ],
  "vendorErrors": []
}
```

If a vendor fails, its quotes are absent but `vendorErrors` is populated —
**partial failure never crashes the whole response**.

---

## Adding a New Vendor (e.g. FedEx)

1. **Create the folder:**
   ```
   src/lib/adapters/vendors/fedex/
   ```

2. **Add types** (`fedex.types.ts`):
   Define the vendor-specific request and response shapes only.

3. **Add the adapter** (`fedex.adapter.ts`):
   ```typescript
   export class FedExAdapter extends BaseVendorAdapter<FedExRequest, FedExResponse> {
     readonly vendorId = "fedex";
     readonly vendorName = "FedEx";

     protected transformRequest(input: CanonicalRateRequest): FedExRequest { ... }
     protected async callVendorApi(req: FedExRequest): Promise<FedExResponse> { ... }
     protected transformResponse(res: FedExResponse): RateQuote[] { ... }
   }
   ```

4. **Register it** in `vendors/index.ts`:
   ```typescript
   import { FedExAdapter } from "./fedex/fedex.adapter";
   adapterRegistry.register(new FedExAdapter());
   ```

5. **Add credentials** to `.env.local`.

**Nothing else changes.** The service, route, and all types stay untouched.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Abstract base class | Enforces the 3-step contract; compile-time error if a step is missing |
| Registry singleton | Service never imports adapters directly → zero coupling |
| `Promise.allSettled` | One failing vendor never blocks the others |
| Vendor types scoped to their folder | Prevents vendor-specific shapes from leaking into shared code |
| Credentials in env vars only | Never in source; one `.env.local.example` shows what's needed |
| Thin route handler | Parsing + auth only; testable service + adapters in isolation |

---

## Recommended Additions for Production

- **Zod validation** in `route.ts` (replace the manual `validateRequest`)
- **Redis caching** in the service (cache by a hash of the canonical request, TTL ~5 min)
- **Observability**: wrap `callVendorApi` in the base class with timing/tracing
- **Unit tests**: each adapter's `transformRequest` and `transformResponse` are pure functions — easy to test with fixtures
- **Rate limiting**: add Next.js middleware or an `upstash/ratelimit` check in the route


# Todo

- add auth using clerk 
- add orgs
- add db to store client info and quotes history 
