-- scripts/rate-sweep-queries.sql
--
-- Starter queries against the stored international rate matrix. Every one of
-- these has been run against real swept data.
--
-- TWO THINGS TO KNOW BEFORE READING ANY NUMBER OUT OF HERE
--
--   1. These are RAW VENDOR COST. No markup. Org markup is applied at read
--      time in lib/services/rate-calculator.service.ts, so anything here is
--      what Arena pays, not what a customer is quoted.
--
--   2. Always filter `isComparable`. Rows quoted in a currency other than INR
--      are stored but flagged, and nothing in this system invents an exchange
--      rate. A cheapest-of query without that filter can rank 400 USD below
--      4000 INR and be confidently wrong.
--
-- ── THE CARRIER COLUMN ──────────────────────────────────────────────────────
--
-- `productName` is the vendor's own label and is free text: three vendors
-- resell FedEx as "FEDEX DEL", "Fedex" and "Fedex DL - with Pickup". `carrier`
-- is the normalised code (FEDEX, DHL, UPS, ARAMEX, USPS, DPD, CANADA_POST,
-- AUSTRALIA_POST, EMIRATES, and SHIPGLOBAL / SHIPMOZO for the resellers' own
-- consolidated networks). Group on `carrier`, never on `productName`.
--
-- Alongside it sit the terms behind the price, and they decide what may fairly
-- be compared with what:
--
--   "dutyMode"        DUTY_PAID / DUTY_UNPAID / UNKNOWN
--   "contentType"     DOCUMENTS / NON_DOCUMENTS / UNKNOWN
--   "pickupIncluded"  true / false / NULL when the label did not say
--   "restrictionNote" "Gifts only", "B2B only", ... or NULL
--
-- A duty-unpaid rate ranked against duty-paid ones wins on price and leaves the
-- customer a customs bill on delivery. Filter on "dutyMode" for any comparison
-- that becomes a quotation.
--
-- Table and column names are quoted because Prisma creates them camelCase.


-- ===========================================================================
-- A. The grid: cheapest all-in price per country per weight
-- ===========================================================================
-- The shape a quotation sheet is built from. Weights down the side, countries
-- across the top. Swap the country codes and the 50kg cap to taste.

SELECT
  s."weightKg" AS kg,
  MIN(s."totalWithTax") FILTER (WHERE s."destCountryCode" = 'US') AS us,
  MIN(s."totalWithTax") FILTER (WHERE s."destCountryCode" = 'GB') AS gb,
  MIN(s."totalWithTax") FILTER (WHERE s."destCountryCode" = 'AE') AS ae,
  MIN(s."totalWithTax") FILTER (WHERE s."destCountryCode" = 'AU') AS au,
  MIN(s."totalWithTax") FILTER (WHERE s."destCountryCode" = 'DE') AS de
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" <= 50
  AND s."isComparable"
GROUP BY s."weightKg"
ORDER BY s."weightKg";


-- ===========================================================================
-- B. Who wins each cell, and on which service
-- ===========================================================================
-- Same grid as A, but naming the vendor and product behind each number. This is
-- the one to run when a price in A looks wrong: it tells you who to blame.
--
-- DISTINCT ON takes the first row per (country, weight) after the ORDER BY, so
-- the ordering is doing the work of "cheapest". Postgres-specific and much
-- cheaper than a window function here.

SELECT DISTINCT ON (s."destCountryCode", s."weightKg")
  s."destCountryCode"  AS country,
  s."weightKg"         AS kg,
  s."vendorId",
  s."productName",
  s."totalWithoutTax",
  s."taxAmount",
  s."totalWithTax",
  s."tatDays"
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" <= 50
  AND s."isComparable"
ORDER BY s."destCountryCode", s."weightKg", s."totalWithTax" ASC;


-- ===========================================================================
-- C. Vendor against vendor on the same lane and weight
-- ===========================================================================
-- Each vendor's best price side by side. A blank cell means that vendor has no
-- rate for that lane and weight; query E says whether it declined or failed.
-- Useful for spotting a vendor that is never competitive anywhere.

SELECT
  s."destCountryCode" AS country,
  s."weightKg"        AS kg,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'shipmozo')   AS shipmozo,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'skart')      AS skart,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'shipglobal') AS shipglobal,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'aramex')     AS aramex
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" <= 50
  AND s."isComparable"
GROUP BY 1, 2
ORDER BY 1, 2;


-- ===========================================================================
-- D. What makes up a price
-- ===========================================================================
-- Every charge line behind one lane and weight. `canonicalName` is the
-- normalised label (lib/invoices/tax/chargeNames.ts) and `name` is the vendor's
-- own wording. Group on the canonical one: "FREIGHT", "Freight charges" and
-- "logistic fee" are the same line from three different vendors.

SELECT
  s."vendorId",
  s."productName",
  c."canonicalName",
  c.name AS vendor_label,
  c.amount,
  s."totalWithTax"
FROM "VendorRateSnapshot" s
JOIN "VendorRateCharge" c ON c."snapshotId" = s.id
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s."destCountryCode" = 'US'
  AND s."weightKg" = 5
ORDER BY s."totalWithTax" ASC, c."sortOrder" ASC;


-- ===========================================================================
-- E. Where the holes are
-- ===========================================================================
-- Every cell that did not produce a rate, and why. NO_SERVICE means the vendor
-- answered and declined, which is a fact rather than a fault. Anything else is
-- worth investigating.
--
-- This is the query that makes absence readable: a lane missing from A is
-- either a vendor that does not fly it or a vendor that broke, and those need
-- very different responses.

SELECT
  "vendorId",
  "destCountryCode" AS country,
  status,
  COUNT(*)::int     AS cells,
  MIN("weightKg")   AS from_kg,
  MAX("weightKg")   AS to_kg,
  MIN("errorMessage") AS sample_message
FROM "RateSweepCall"
WHERE "runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND status <> 'OK'
GROUP BY 1, 2, 3
ORDER BY cells DESC;


-- ===========================================================================
-- H. Whose FedEx is cheapest? One carrier, every vendor
-- ===========================================================================
-- The query the carrier column exists for, and the shape of one sheet in the
-- quotation workbook: a carrier down the side is a tab, weights down the rows,
-- vendors across the columns. Change the carrier code and you have the next tab.
--
-- Own-brand networks (SHIPGLOBAL, SHIPMOZO) are excluded from cross-vendor
-- comparisons: only one vendor sells each, so a "comparison" of them is a
-- single number wearing a table's clothes.

SELECT
  s."weightKg" AS kg,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'shipmozo')   AS via_shipmozo,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'skart')      AS via_skart,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'shipglobal') AS via_shipglobal,
  MIN(s."totalWithTax") FILTER (WHERE s."vendorId" = 'aramex')     AS via_aramex
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s.carrier = 'FEDEX'          -- swap for DHL, UPS, ARAMEX, ...
  AND s."destCountryCode" = 'US'
  AND s."weightKg" <= 50
  AND s."isComparable"
  -- Like for like. Drop this line and a duty-unpaid rate will undercut the
  -- duty-paid ones and look like the answer.
  AND s."dutyMode" <> 'DUTY_UNPAID'
GROUP BY 1
ORDER BY 1;


-- ===========================================================================
-- I. Where is our own Aramex account beaten by a reseller's?
-- ===========================================================================
-- We hold Aramex directly AND buy it through Shipmozo and sKart. This says, per
-- country, how our own account compares with the cheapest resold Aramex on the
-- same carrier. A positive gap means a reseller is beating our direct rate.
--
-- The same shape answers the general question for any carrier: replace the
-- vendorId in `ours` with whichever sourcing route you want to judge.

WITH ours AS (
  SELECT "destCountryCode", "weightKg", MIN("totalWithTax") AS direct
  FROM "VendorRateSnapshot"
  WHERE "runId" = (SELECT id FROM "RateSweepRun"
                    WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
                    ORDER BY "startedAt" DESC LIMIT 1)
    AND carrier = 'ARAMEX' AND "vendorId" = 'aramex' AND "isComparable"
  GROUP BY 1, 2
),
resold AS (
  SELECT "destCountryCode", "weightKg", MIN("totalWithTax") AS reseller
  FROM "VendorRateSnapshot"
  WHERE "runId" = (SELECT id FROM "RateSweepRun"
                    WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
                    ORDER BY "startedAt" DESC LIMIT 1)
    AND carrier = 'ARAMEX' AND "vendorId" <> 'aramex' AND "isComparable"
  GROUP BY 1, 2
)
SELECT
  o."destCountryCode" AS country,
  o."weightKg"        AS kg,
  o.direct,
  r.reseller,
  ROUND(((o.direct - r.reseller) / r.reseller) * 100, 1) AS direct_dearer_pct
FROM ours o
JOIN resold r USING ("destCountryCode", "weightKg")
ORDER BY direct_dearer_pct DESC NULLS LAST;


-- ===========================================================================
-- J. Which carriers can we actually offer on a lane?
-- ===========================================================================
-- The menu behind a quotation. One row per carrier we can sell on that lane and
-- weight, cheapest source named, so the sheet can say "FedEx 5,965" rather than
-- an unattributed number. This is the per-cell query the Excel builder runs.

SELECT DISTINCT ON (s.carrier)
  s.carrier,
  s."vendorId"    AS cheapest_via,
  s."productName",
  s."totalWithTax",
  s."tatDays",
  s."dutyMode",
  s."contentType",
  s."restrictionNote"
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s."destCountryCode" = 'US'
  AND s."weightKg" = 5
  AND s."isComparable"
  AND s."dutyMode" <> 'DUTY_UNPAID'
  -- A restricted rate must never land in a general quotation unnoticed. Drop
  -- this line only if you are quoting that exact kind of consignment.
  AND s."restrictionNote" IS NULL
ORDER BY s.carrier, s."totalWithTax" ASC;


-- ===========================================================================
-- K. Carrier coverage: who flies where
-- ===========================================================================
-- Which carriers reach which countries, and through how many vendors. A carrier
-- reachable through one vendor only is a single point of failure on that lane:
-- if that vendor declines the booking there is no second source.

SELECT
  carrier,
  COUNT(DISTINCT "destCountryCode")::int AS countries,
  COUNT(DISTINCT "vendorId")::int        AS vendors,
  string_agg(DISTINCT "vendorId", ', ' ORDER BY "vendorId") AS sourced_via,
  MIN("weightKg") AS from_kg,
  MAX("weightKg") AS to_kg
FROM "VendorRateSnapshot"
WHERE "runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND "isComparable"
GROUP BY 1
ORDER BY vendors DESC, countries DESC;


-- ===========================================================================
-- L. Service names that mapped to no carrier
-- ===========================================================================
-- The review list. Empty is the normal answer. A row here means a vendor is
-- selling something the rules in lib/rateSweep/carrier.ts do not recognise, and
-- until a rule is added every rate under that name is invisible to queries
-- H through K.

SELECT "vendorId", "productName", COUNT(*)::int AS rows,
       COUNT(DISTINCT "destCountryCode")::int AS countries
FROM "VendorRateSnapshot"
WHERE "runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND carrier = 'OTHER'
GROUP BY 1, 2
ORDER BY rows DESC;


-- ===========================================================================
-- M. Country-locked services
-- ===========================================================================
-- A service that only ever quotes for one country is country-locked, whether or
-- not its name says so. Derived from the data rather than parsed from the label
-- on purpose: plenty of country-specific services do not announce it, and "DEL"
-- in most sKart names is the Delhi ORIGIN, not a destination.

SELECT "vendorId", "productName", carrier,
       MIN("destCountryCode") AS only_country,
       COUNT(*)::int AS rows
FROM "VendorRateSnapshot"
WHERE "runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
GROUP BY 1, 2, 3
HAVING COUNT(DISTINCT "destCountryCode") = 1
ORDER BY rows DESC;


-- ===========================================================================
-- N. The big four, five lanes, up to 30kg
-- ===========================================================================
-- FedEx / UPS / DHL / Aramex side by side, cheapest source for each, for the
-- five busiest lanes. This is the sheet a customer picks a carrier from: they
-- are choosing between carriers, not between our vendors, so the vendor is
-- resolved away and only the carrier and the price remain.
--
-- The three filters below the weight cap are what make the numbers comparable
-- with each other, and dropping any of them makes the cheapest column lie:
--
--   isComparable       excludes non-INR rows, which nothing here converts
--   dutyMode           excludes duty-unpaid rates, which undercut duty-paid
--                      ones and leave the customer a customs bill at the door
--   restrictionNote    excludes gifts-only and B2B-only services, which cannot
--                      be sold for a general consignment
--
-- Query O below names the vendor behind each of these numbers.

SELECT
  s."destCountryCode" AS country,
  s."weightKg"        AS kg,
  MIN(s."totalWithTax") FILTER (WHERE s.carrier = 'FEDEX')  AS fedex,
  MIN(s."totalWithTax") FILTER (WHERE s.carrier = 'UPS')    AS ups,
  MIN(s."totalWithTax") FILTER (WHERE s.carrier = 'DHL')    AS dhl,
  MIN(s."totalWithTax") FILTER (WHERE s.carrier = 'ARAMEX') AS aramex
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s.carrier IN ('FEDEX','UPS','DHL','ARAMEX')
  AND s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" <= 30
  AND s."isComparable"
  AND s."dutyMode" <> 'DUTY_UNPAID'
  AND s."restrictionNote" IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- ===========================================================================
-- O. The same grid, with the vendor to buy each one from
-- ===========================================================================
-- One row per (lane, weight, carrier) naming the cheapest source and the exact
-- service. Run this when a number in N looks wrong, and when the quotation is
-- accepted and somebody has to actually book it — N says the price, O says
-- where to go and get it.
--
-- The service name is not decoration. "Fedex DL - with Pickup" and "Fedex
-- Non-Documents." are different products at different prices, and a booking
-- made against the wrong one is a booking at a price we did not quote.

SELECT DISTINCT ON (s."destCountryCode", s."weightKg", s.carrier)
  s."destCountryCode" AS country,
  s."weightKg"        AS kg,
  s.carrier,
  s."vendorId"        AS buy_from,
  s."productName"     AS service,
  s."totalWithTax",
  s."tatDays",
  s."pickupIncluded"
FROM "VendorRateSnapshot" s
WHERE s."runId" = (
        SELECT id FROM "RateSweepRun"
         WHERE status IN ('COMPLETED','PARTIAL') AND "snapshotCount" > 0
         ORDER BY "startedAt" DESC LIMIT 1)
  AND s.carrier IN ('FEDEX','UPS','DHL','ARAMEX')
  AND s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" <= 30
  AND s."isComparable"
  AND s."dutyMode" <> 'DUTY_UNPAID'
  AND s."restrictionNote" IS NULL
-- The ORDER BY is doing the "cheapest" work for DISTINCT ON: the leading
-- columns must match the DISTINCT ON list exactly or Postgres refuses the query.
ORDER BY s."destCountryCode", s."weightKg", s.carrier, s."totalWithTax" ASC;


-- ===========================================================================
-- F. Price movement between runs
-- ===========================================================================
-- The reason history is kept. Returns nothing useful until at least two runs
-- have completed. Add `AND r."configVersion" = '...'` if the matrix definition
-- has changed since, because a slab or postcode change makes rows from either
-- side of it incomparable.

SELECT
  s."destCountryCode" AS country,
  s."weightKg"        AS kg,
  s."vendorId",
  date_trunc('day', s."capturedAt") AS day,
  MIN(s."totalWithTax") AS cheapest
FROM "VendorRateSnapshot" s
WHERE s."destCountryCode" IN ('US','GB','AE','AU','DE')
  AND s."weightKg" IN (0.5, 1, 2, 5, 10)
  AND s."isComparable"
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;


-- ===========================================================================
-- G. Surcharge trend
-- ===========================================================================
-- Charges are stored as rows rather than JSON specifically so this is a plain
-- query. Watch a fuel surcharge move across runs and vendors.

SELECT
  date_trunc('day', s."capturedAt") AS day,
  s."vendorId",
  c."canonicalName",
  ROUND(AVG(c.amount), 2) AS avg_amount,
  COUNT(*)::int           AS lines
FROM "VendorRateSnapshot" s
JOIN "VendorRateCharge" c ON c."snapshotId" = s.id
WHERE c."canonicalName" ILIKE '%fuel%'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2;
