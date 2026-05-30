# Rate Calculator — Architecture Overview

A freight rate aggregation system built around a **vendor adapter pattern**, **Server Actions**, and a **Zustand state layer**.

The system is designed so that:

- New carriers can be added without modifying existing code.
- Internal application calls never go through HTTP.
- UI state remains centralized and scalable.
- Vendor failures never crash the entire quote response.
- Future features such as quote history, saved quotes, invoice generation, and shipment drafts can be added without major rewrites.

---

# High Level Architecture

```text
User
 │
 ▼
RateCalculatorForm
 │
 ▼
Server Action
(getRatesAction)
 │
 ▼
rate-calculator.service.ts
 │
 ├── Skart Adapter
 ├── Aramex Adapter
 └── Future Adapters
 │
 ▼
Canonical Rate Response
 │
 ▼
Zustand Store
 │
 ▼
Results UI
```

---

# Directory Structure

```text
src/
├── app/
│   ├── api/
│   │   └── rates/
│   │       └── route.ts
│   │
│   └── rates/
│       └── page.tsx
│
├── components/
│   └── rate-calculator/
│       ├── RatesClient.tsx
│       ├── RateCalculatorForm.tsx
│       ├── RateResultsList.tsx
│       ├── RateResultCard.tsx
│       ├── ComparePanel.tsx
│       └── QuoteSheet.tsx
│
├── lib/
│   ├── actions/
│   │   └── rates.actions.ts
│   │
│   ├── adapters/
│   │   ├── core/
│   │   └── vendors/
│   │
│   ├── services/
│   │   └── rate-calculator.service.ts
│   │
│   └── types.ts
│
└── store/
    ├── index.ts
    ├── types.ts
    └── slices/
        ├── rates.slice.ts
        ├── compare.slice.ts
        ├── ui.slice.ts
        └── history.slice.ts
```

---

# State Management

State is centralized in Zustand.

## rates.slice

Owns:

```ts
quotes
vendorErrors
request
loading
```

Responsible for:

- Fetching rates
- Storing quote results
- Storing vendor failures
- Tracking active request

---

## ui.slice

Owns:

```ts
sortBy
activeCarriers
viewMode
```

Responsible for:

- Sorting
- Carrier filtering
- Grid/List toggle

---

## compare.slice

Owns:

```ts
compareMode
compareIds
```

Responsible for:

- Compare selection
- Compare limits
- Compare panel visibility

---

## history.slice

Scaffold for:

```ts
savedQuotes
quoteHistory
downloads
```

Used by future roadmap items.

---

# Server Actions

The web application must never call:

```ts
fetch("/api/rates")
```

for its own internal requests.

Instead:

```ts
RateCalculatorForm
    ↓
getRatesAction()
    ↓
rateCalculatorService()
```

### Benefits

- No HTTP round trip
- No JSON serialization overhead
- Full TypeScript safety
- Lower latency
- Easier testing

---

# API Route Responsibility

```text
app/api/rates/route.ts
```

Exists only for:

- External consumers
- n8n workflows
- Webhooks
- Third party integrations

The route should remain a thin HTTP layer.

Responsibilities:

- Parse request
- Validate request
- Sanitize vendor IDs
- Call service
- Return response

Business logic should never live here.

---

# Vendor Adapter Pattern

Every carrier follows the same lifecycle:

```text
Canonical Request
       │
       ▼
transformRequest()
       │
       ▼
callVendorApi()
       │
       ▼
transformResponse()
       │
       ▼
RateQuote[]
```

Each adapter extends:

```ts
BaseVendorAdapter
```

and registers itself inside:

```ts
vendors/index.ts
```

Adding a new vendor should only require:

1. Create vendor folder
2. Add vendor request/response types
3. Implement adapter
4. Register adapter
5. Add credentials

Nothing else should change.

---

# Important Design Rules

## Rule 1 — Components Should Not Own Business State

Avoid:

```ts
useState(quotes)
useState(compareIds)
useState(sortBy)
```

Prefer:

```ts
const quotes = useAppStore(...)
```

Business state belongs in Zustand.

---

## Rule 2 — Server Actions Must Return Serializable Data

Allowed:

```ts
string
number
boolean
array
object
null
```

Avoid:

```ts
Date
Map
Set
Buffer
Class instances
```

Server Actions should only return JSON serializable values.

---

## Rule 3 — Service Layer Owns Business Logic

Avoid placing business logic inside:

```text
route.ts
component.tsx
```

Instead:

```text
rate-calculator.service.ts
```

should own all quote aggregation and orchestration logic.

---

## Rule 4 — Vendor Failures Must Be Isolated

Use:

```ts
Promise.allSettled()
```

Never:

```ts
Promise.all()
```

One vendor outage should never block other quote results.

---

# Known Limitations

## Multi Package Shipments

The UI supports multiple packages.

Current request generation still sends:

```ts
items[0]
```

only.

This is a known limitation.

When the service contract is updated, replace the single package mapping with full package support.

---

# Bugs Fixed During Refactor

## Vendor Filter Logic

Old implementation:

```ts
vendors.length < 2 ? vendors : []
```

This accidentally queried all vendors whenever multiple vendors were selected.

Fixed by passing the selected vendor list directly.

---

## Hidden Package Data Loss

Old implementation silently ignored additional packages entered by the user.

The limitation is now explicitly documented and isolated for future implementation.

---

# Future Roadmap

## Authentication

Planned:

- Clerk Authentication
- Organization Support
- Role Management

---

## Database

Planned entities:

```text
users
organizations
clients
shipments
quotes
quote_documents
```

Purpose:

- Quote history
- Customer history
- Saved shipments
- Generated invoices
- Analytics

---

## Quote Persistence

Planned features:

```text
Save Quote
Quote History
Downloaded Documents
```

Store scaffolding already exists via:

```ts
history.slice.ts
```

---

## Performance Improvements

Potential future additions:

- Redis caching
- Request deduplication
- Adapter response timing
- Distributed tracing
- Rate limiting
- Queue based vendor retries

---

# Development Principles

When modifying this system:

1. Prefer Server Actions over internal API calls.
2. Keep route handlers thin.
3. Keep vendor specific code inside adapters.
4. Keep business logic inside services.
5. Keep UI state inside Zustand.
6. Add new vendors through the adapter registry only.
7. Use local component state only for visual or ephemeral UI concerns.
8. Keep vendor failures isolated from the overall quote response.
9. Preserve the canonical request and response contract.
10. Avoid introducing coupling between adapters.

---

# Notes For Future Developers

### Why Zustand?

The application roadmap includes:

- Quote history
- Saved quotes
- Shipment drafts
- Invoice generation
- Organization level data

Managing this through prop drilling or nested React Context providers would become difficult to maintain.

Zustand provides:

- Centralized state
- Slice based organization
- Minimal re-renders
- DevTools support
- Easy testing

---

### Why Server Actions?

The web application and service layer run inside the same Next.js application.

Using:

```ts
fetch("/api/rates")
```

creates unnecessary HTTP overhead.

Server Actions allow direct service invocation while preserving:

- Security
- Type safety
- Simpler architecture
- Better performance

The API route remains available only for external consumers and integrations.