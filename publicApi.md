# Arena Logistics Public API (v1)

Rate calculation and shipment tracking, over HTTP, for another website.

Base URL: `https://<arena-host>/api/v1`

There are four endpoints:

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Confirms your key works and lists what it may do |
| `POST` | `/api/v1/rates/international` | Export rates from India |
| `POST` | `/api/v1/rates/domestic` | India to India courier rates |
| `GET` | `/api/v1/track` | Tracking timeline for a shipment number or waybill |

---

## 1. Before you start

### Authentication

Every request needs an API key, sent as a header:

```http
x-api-key: <your key>
```

`Authorization: Bearer <your key>` is accepted as well, if that is easier for
your HTTP client. Neither form is more trusted than the other.

### Call this from your server, not from the browser

The key is a secret. It can spend our paid carrier quota, so anything that
puts it in front of a visitor puts it in front of everyone.

In a Next.js app, that means calling us from a route handler, a server action
or `getServerSideProps`, with the key in your own environment. Your client
components call your endpoint, and your endpoint calls ours.

```ts
// app/api/quote/route.ts   (YOUR app)
export async function POST(req: Request) {
  const body = await req.json();

  const res = await fetch("https://<arena-host>/api/v1/rates/domestic", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ARENA_API_KEY!,   // server-side only
    },
    body: JSON.stringify(body),
    // Our responses are already cached server-side where it is safe to do so.
    cache: "no-store",
  });

  return Response.json(await res.json(), { status: res.status });
}
```

We do not send CORS headers, so a direct call from a browser will fail. That is
deliberate, and it is the reason above. If you have a case that genuinely needs
a browser call, talk to us rather than working around it.

### Check your key first

```bash
curl -s https://<arena-host>/api/v1/health -H "x-api-key: $ARENA_API_KEY"
```

```json
{
  "requestId": "req_V1StGXR8Z5jdHi6B",
  "status": "ok",
  "consumer": "arena-web",
  "scopes": ["rates:international", "rates:domestic", "track"],
  "orgBound": true,
  "serverTime": "2026-09-19T11:04:22.118Z"
}
```

`health` touches no carrier and costs nothing, so use it freely while you are
wiring things up. `orgBound` matters for tracking: see section 5.

---

## 2. How every response is shaped

Success is always HTTP 200 with a `requestId` at the top level:

```json
{
  "requestId": "req_V1StGXR8Z5jdHi6B",
  "...": "endpoint-specific fields"
}
```

Failure is a non-2xx status with a fixed shape:

```json
{
  "requestId": "req_V1StGXR8Z5jdHi6B",
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request body is not valid.",
    "details": [
      { "path": "shipment.weight", "message": "Too small: expected number to be >0" }
    ]
  }
}
```

**Branch on `error.code`, never on `error.message`.** Codes are stable and will
not change meaning. Messages are written for humans and we may reword them at
any time.

`requestId` is also returned in the `x-arena-request-id` header, and it is what
we search on. Log it on your side for every call. When something goes wrong,
one request id turns a support thread into a lookup.

### Error codes

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | Key missing or not recognised | Check the header and the key |
| `FORBIDDEN` | 403 | Key is valid but not allowed to do this | Ask us to widen the key |
| `INVALID_JSON` | 400 | Body was not readable JSON | Fix the body |
| `INVALID_REQUEST` | 422 | Body failed validation, see `details` | Fix the named fields |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 64 KB | Send fewer package lines |
| `RATE_LIMITED` | 429 | Over budget, see `Retry-After` | Back off, then retry |
| `NOT_FOUND` | 404 | Tracking: no such shipment for this key | Show "not found" to the user |
| `UPSTREAM_UNAVAILABLE` | 502 | Every rate source failed | Retry, usually transient |
| `MISCONFIGURED` | 500 | Our configuration is wrong | Report it with the request id |
| `INTERNAL_ERROR` | 500 | Unhandled fault on our side | Report it with the request id |

---

## 3. Rate limits

Budgets are per key, per minute:

| Endpoint | Per key |
| --- | --- |
| `/rates/international` | 30 / minute |
| `/rates/domestic` | 30 / minute |
| `/track` | 120 / minute |
| `/health` | 60 / minute |

There is also a ceiling across all keys together, which normal traffic from
several partner sites will not reach.

A 429 carries a `Retry-After` header in seconds. Honour it. Retrying inside the
window keeps your own counter full and gets you nowhere.

These are not arbitrary: each rate call fans out to live carrier APIs that bill
us per request. If your traffic needs more, ask, and bring an estimate.

### Retry policy we recommend

* `502 UPSTREAM_UNAVAILABLE`: retry twice, backing off (1s, then 4s).
* `429 RATE_LIMITED`: wait for `Retry-After`, then retry once.
* `5xx INTERNAL_ERROR`: retry once, then surface a failure and report it.
* `4xx` other than 429: do not retry. The request will not start working.

---

## 4. Rates

Both rate endpoints return the same response shape. They differ only in the
request body and in which carriers are asked.

### Response

```json
{
  "requestId": "req_V1StGXR8Z5jdHi6B",
  "currency": "INR",
  "cached": false,
  "quotes": [
    {
      "id": "q_1",
      "service": "Arena Direct",
      "courierId": "4412",
      "currency": "INR",
      "totalWithTax": 2184.50,
      "totalWithoutTax": 1851.27,
      "transitDays": 4,
      "charges": [
        { "name": "Freight", "amount": 1700.00, "currency": "INR", "igst": 306.00 },
        { "name": "Fuel Surcharge", "amount": 151.27, "currency": "INR", "taxAmount": 27.23 }
      ]
    }
  ],
  "warnings": [
    { "code": "NO_SERVICE", "message": "One of our sources does not serve this route." }
  ]
}
```

Field notes:

* **`quotes` is sorted cheapest first.** `quotes[0]` is the best price.
* **`totalWithTax` is the number to show a customer.** It is the sell price,
  inclusive of tax.
* **`id` is meaningful within one response only.** Use it to tie a selected row
  back to the quote it came from in your own UI. It is not a booking token and
  it means nothing on a later request.
* **`transitDays` of `0` means the carrier did not state a transit time.**
  Render it as "on request", not as "same day".
* **`service` is the service name to display.** Do not try to map it back to an
  underlying carrier: see section 6.
* **`courierId`** is the source's own id for that exact service, where it has
  one. It is opaque. Store it if you want to refer to the precise service a
  customer picked, rather than re-matching on a display name later.
* **Every service we are quoted is returned.** Nothing is dropped, deduplicated
  or collapsed. Two near-identical rows at different prices are two genuinely
  purchasable options, usually the same carrier reached through different
  sources, and the cheaper one is a real saving rather than a duplicate to
  filter out.
* **Tax is reported exactly as the source reported it.** A source giving one
  combined figure produces `taxAmount`; one splitting an intra-state supply
  produces `cgst` and `sgst`; an inter-state one produces `igst`. Fields the
  source did not report are **absent**, and we never derive them. Sum only the
  fields that are present, and do not assume which those will be.
* **`cached`** tells you whether this came from our short-lived cache. It is
  informational. Prices are correct either way.

### `warnings` is not an error

We ask several sources in parallel. If one declines and three answer, you get
three quotes and one warning, with HTTP 200. That is the normal case on an
unusual lane, not a failure.

| Warning code | Meaning |
| --- | --- |
| `NO_SERVICE` | One source does not serve this route |
| `RATE_LIMITED` | One source was throttling us |
| `UNAVAILABLE` | One source errored or timed out |

### Empty `quotes` has two meanings, and they differ

* **HTTP 200 with `quotes: []`**: nobody serves this route. This is a complete
  answer. Show "no service available for this route". Retrying will not help.
* **HTTP 502 `UPSTREAM_UNAVAILABLE`**: every source failed for some other
  reason. Show "try again shortly" and retry.

Getting this distinction right is the difference between a customer who knows
to change the destination and one who reloads forever.

### 4a. `POST /api/v1/rates/international`

Exports out of India. `origin.countryCode` must be `IN` and
`destination.countryCode` must not be.

```json
{
  "origin":      { "city": "Mumbai", "countryCode": "IN", "pincode": "400001" },
  "destination": { "city": "Dubai",  "countryCode": "AE" },
  "shipment": {
    "packages": [
      { "quantity": 2, "weightKg": 2.0, "lengthCm": 30, "widthCm": 20, "heightCm": 10 },
      { "quantity": 1, "weightKg": 5.0, "lengthCm": 50, "widthCm": 40, "heightCm": 30 }
    ],
    "declaredValue": 45000,
    "description": "Cotton garments"
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `origin.countryCode` | yes | ISO 2 letter. Must be `IN` |
| `origin.city` | yes | |
| `origin.pincode` | yes | 6 digit Indian PIN. The first mile is priced from it |
| `destination.countryCode` | yes | ISO 2 letter, anything but `IN` |
| `destination.city` | yes | |
| `destination.pincode` | **yes**, see below | Delivery postcode. Drives door-level pricing |
| `shipment.packages[]` | see below | Preferred shape |
| `shipment.declaredValue` | no | Goods value. Drives duty estimates |
| `shipment.description` | no | Goods description |
| `shipment.goodsOriginCountry` | no | Where the goods were made |
| `origin.country` / `destination.country` | no | Full country name. We derive it from the code, so you do not need to send it |

#### The origin PIN code is required

Every source prices the pickup leg from it, and none of them fall back to
anything sensible when it is missing: one refuses the request, one answers 422,
one answers "Invalid Zipcode". An optional origin PIN was not a lenient
contract, it was a request that validated cleanly and came back with an empty
`quotes` array, which is a much harder thing to debug from your side.

Send the PIN the shipment is actually collected from. If you consolidate at a
hub first, send the hub PIN.

#### You do not need to send a country name

`countryCode` is the field that matters. Some of our sources are given the ISO
code and some are given the full country name, and we fill the name in from the
code on both ends of the route.

If you do send `country`, we use our own name for the code anyway. That is
deliberate: a carrier catalogue lists "United Arab Emirates", not "UAE", and a
quote should not depend on which of those your data happens to hold. For a code
we have no name for, your value is used as-is.

#### The destination postcode is required

Several carriers price door delivery by postcode, so a quote produced without
one is a country-level estimate wearing a door-level price tag. Send the real
delivery postcode and the number you get back is the number that holds.

There is one exception, and you do not have to code for it. Some destinations
have no postal system at all: the Gulf states, Hong Kong, and a number of
countries across Africa and the Caribbean. For those, omit `destination.pincode`
and we fill in `"00000"` ourselves, which is what the carriers expect there.

If we have a country wrong, you are never blocked by it: an explicit
`"00000"` is always accepted, whatever the destination. Tell us and we will fix
the list.

### 4b. `POST /api/v1/rates/domestic`

India to India courier rates. Addresses are a PIN code pair. City is optional:
the couriers rate on the PIN code, so do not look a city up just for us.

```json
{
  "origin":      { "pincode": "400001" },
  "destination": { "pincode": "110001" },
  "shipment": {
    "weight": 1.5,
    "quantity": 1,
    "dimensions": { "length": 25, "width": 20, "height": 10, "unit": "cm" },
    "paymentType": "COD",
    "codAmount": 2499
  }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `origin.pincode` | yes | 6 digits, not starting with 0 |
| `destination.pincode` | yes | Same |
| `shipment.paymentType` | no | `PREPAID` (default) or `COD` |
| `shipment.codAmount` | if COD | What the courier collects from the receiver |

**Price COD as COD.** The collection fee varies by courier, so a prepaid quote
is the wrong number for a COD shipment. Send `paymentType: "COD"` and the real
`codAmount` rather than quoting prepaid and adding a fee yourself.

### Describing the shipment

Both endpoints accept two shapes. Use whichever fits.

**Preferred: `packages[]`,** one entry per distinct box line.

```json
"packages": [
  { "quantity": 2, "weightKg": 2.0, "lengthCm": 30, "widthCm": 20, "heightCm": 10 }
]
```

`weightKg` is the weight of **one** box, not the line total. `quantity` is how
many identical boxes. Dimensions are always centimetres here.

**Simple: flat fields,** for a single box.

```json
"weight": 2.0,
"quantity": 1,
"dimensions": { "length": 30, "width": 20, "height": 10, "unit": "cm" }
```

`weight` here is the **total** shipment weight. `unit` may be `cm` or `in`.

Send one shape or the other. If you send `packages[]` it wins.

### Limits

| Limit | Value |
| --- | --- |
| Max weight | 1000 kg total, and per box |
| Max dimension | 400 cm on any side |
| Max quantity | 200 boxes per line |
| Max package lines | 50 |
| Max body size | 64 KB |

### Unknown fields are rejected

A body with a key we do not recognise gets a 422 rather than being quoted
anyway. `weigth: 5` is a typo, and a quote that silently ignored it would be a
price for a shipment you did not describe. The 422 names the field.

---

## 5. Tracking

```http
GET /api/v1/track?query=ARN260130748291
```

`query` accepts either number your customer might be holding:

* an **Arena shipment number**, `ARN260130748291`, from the confirmation and
  the invoice
* a **carrier waybill**, from the label

You do not need to know which one it is. `awb=` works as an alias for `query=`.

### Response

```json
{
  "requestId": "req_V1StGXR8Z5jdHi6B",
  "tracking": {
    "shipment": {
      "awb": "1234567890",
      "reference": "ARN260130748291",
      "route": "Mumbai, Maharashtra to Dubai, United Arab Emirates",
      "carrier": "DHL",
      "service": "Arena Direct",
      "shipDate": "2026-09-14T06:12:00.000Z",
      "weightKg": 14,
      "pieces": 3,
      "destination": "UNITED ARAB EMIRATES"
    },
    "status": {
      "current": "Out for Delivery",
      "eventType": "out_for_delivery",
      "isDelivered": false,
      "lastUpdatedAt": "2026-09-18T04:31:00.000Z"
    },
    "legs": [
      { "kind": "first_mile", "label": "Door pickup", "awb": "SF0099123", "carrier": "Delhivery", "eventCount": 4 },
      { "kind": "main", "label": "Air leg", "awb": "1234567890", "carrier": "DHL", "eventCount": 9 }
    ],
    "events": [
      {
        "timestamp": "2026-09-18T04:31:00.000Z",
        "status": "Out for Delivery",
        "description": "Shipment out with courier for delivery",
        "location": "DXB - HUB, United Arab Emirates",
        "eventType": "out_for_delivery",
        "leg": "main",
        "legLabel": "Air leg"
      }
    ]
  }
}
```

Field notes:

* **`events` is newest first.** Render it top to bottom, no sorting needed.
* **`status.isDelivered`** is the flag to switch your UI to a completed state.
  Do not string-match `status.current`.
* **`legs`** appears when a shipment moved in stages, typically a door pickup
  then an air leg. Each event carries `leg` and `legLabel` so you can group
  them. A simple domestic courier shipment has one leg.
* **`reference`** is present only when the number resolved to an Arena booking.
  A bare carrier waybill lookup has no Arena reference to report.
* **`status.current` is `null` before any carrier has scanned the parcel.**
  This is normal in the first hours after booking. Show "booked, awaiting
  pickup" rather than an empty timeline.

### `eventType` values

Use these to drive icons and colours. Do not parse `status` text.

`booked`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`,
`attempted`, `exception`, `returned`, `unknown`

### What your key may look up

This is the one place where key configuration changes behaviour.

* **A carrier waybill** resolves for any key. It is the carrier's number, not
  ours.
* **An Arena shipment number (`ARN…`)** resolves only for a key bound to an
  Arena account, and only within that account. `health` reports this as
  `orgBound`.

If your key is not bound and you send an `ARN…`, you get a `403 FORBIDDEN`
explaining exactly that. Ask us to bind the key to your account.

A number that does not exist, belongs to another account, or is not recognised
by any carrier all return the same `404 NOT_FOUND`. We do not tell them apart
on purpose: doing so would turn this endpoint into a way of discovering which
shipment numbers exist.

### Polling

Tracking is pull only. There is no webhook today. Carriers scan a few times a
day, so polling more than once every 15 minutes for the same shipment buys you
nothing. A sensible pattern is to fetch on page load and cache on your side for
10 to 15 minutes.

If you need push updates, tell us. It is a real feature, not a config change.

---

## 6. Two rules about what you display

**Show `service` as we give it to you.** Do not try to resolve it to the
company that actually operates the route, and do not display anything we have
not sent you. Service names are what our customers are quoted, invoiced and
supported on, and a different name in your UI is a support problem at best.

**Prices are quotes, not commitments.** A rate is valid at the moment it is
returned and reflects the shipment as described. Actual charges follow the
weight and dimensions measured at the hub. If your UI implies a locked price,
say alongside it that final charges follow verified weight.

---

## 7. Worked example

```ts
// Quote a 1.5 kg parcel Mumbai to Delhi, then show the cheapest option.

type ArenaCharge = {
  name: string;
  amount: number;
  currency: string;
  // Whichever heads the source reported. Sum what is present; do not assume
  // which ones will be.
  igst?: number;
  cgst?: number;
  sgst?: number;
  taxAmount?: number;
};

type ArenaQuote = {
  id: string;
  service: string;
  courierId?: string;
  currency: string;
  totalWithTax: number;
  totalWithoutTax: number;
  transitDays: number;
  charges: ArenaCharge[];
};

type ArenaRates =
  | { requestId: string; currency: string; cached: boolean; quotes: ArenaQuote[];
      warnings: { code: string; message: string }[] }
  | { requestId: string; error: { code: string; message: string; details?: unknown } };

async function cheapestDomestic(fromPin: string, toPin: string, weightKg: number) {
  const res = await fetch(`${process.env.ARENA_API_URL}/rates/domestic`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ARENA_API_KEY!,
    },
    body: JSON.stringify({
      origin: { pincode: fromPin },
      destination: { pincode: toPin },
      shipment: {
        weight: weightKg,
        quantity: 1,
        dimensions: { length: 25, width: 20, height: 10, unit: "cm" },
      },
    }),
    cache: "no-store",
  });

  const body: ArenaRates = await res.json();

  // Always log the request id. It is how we find your call.
  console.info("arena rates", { requestId: body.requestId, status: res.status });

  if ("error" in body) {
    switch (body.error.code) {
      case "RATE_LIMITED":
        throw new Error(`retry after ${res.headers.get("retry-after")}s`);
      case "UPSTREAM_UNAVAILABLE":
        throw new Error("carriers unavailable, retry");
      default:
        throw new Error(`${body.error.code}: ${body.error.message}`);
    }
  }

  if (body.quotes.length === 0) {
    return { serviceable: false as const };   // nobody serves this lane
  }

  // Already sorted cheapest first.
  return { serviceable: true as const, quote: body.quotes[0] };
}
```

---

## 8. Going live

A short checklist before you point production at this.

- [ ] Key is in your server environment only, and is not in any client bundle.
- [ ] `/health` returns `status: "ok"` from your production environment.
- [ ] You log `requestId` on every call, success and failure.
- [ ] You branch on `error.code`, not on message text.
- [ ] You handle `quotes: []` (no service) separately from 502 (retry).
- [ ] You honour `Retry-After` on 429.
- [ ] You do not retry 4xx other than 429.
- [ ] Your UI says final charges follow verified weight.
- [ ] If you track by `ARN…`, your key is `orgBound: true`.

---

## 9. Support

Send us:

1. the `requestId`,
2. the endpoint and the approximate time,
3. the request body, with the key removed.

The request id is enough for us to find the call. Without it we are guessing.
