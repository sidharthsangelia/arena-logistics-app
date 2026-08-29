# Considered and parked

Not weak, just weaker than the eighteen, or too close to something already
published.

- **The rate sweep, in any form.** Already published. Posts 08 and 16 borrow it
  as an example only.
- **"A bad cell costs one cell": error containment granularity in fan-out jobs.**
  Genuinely good, and it is the sweep's central lesson. Only revive it if it can
  be argued from a non-sweep example.
- **Wallet as a ledger.** Amount always stored positive with the type carrying
  direction; collection status recomputed from the rows every time rather than
  nudged along a path; `WRITTEN_OFF` deliberately sticky while nothing has been
  collected; a one-paisa settlement tolerance so a booking is not left a
  hundredth of a rupee short of settled forever. Strong material, but it overlaps
  posts 02 and 10. Merge into 02 or promote later.
  Code: `lib/wallet/collections.ts`, `lib/wallet/adminLedger.ts`.
- **The KYC waiver.** An admin-only, expiring, reasoned exception to a compliance
  rule, where the tenant sees only a boolean. Nice small post about modelling
  exceptions as first-class rows instead of nullable flags. Thin on its own.
  Code: `lib/booking/waiver.ts`, `KycWaiver` in the schema.
- **Conditional document requirements.** What paperwork an export needs depends on
  the filing route, and an earlier version demanded IEC and AD code on every
  export, which blocked people who legitimately had neither. Good "validation is
  domain modelling" post. Fold into 04 or keep for later.
  Code: `lib/booking/exportProfile.ts`.
- **Charge-name normalisation.** A strict allowlist turned every unrecognised
  vendor surcharge into one bucket, and vendors invent surcharge names
  constantly. Same shape as post 04, so it is the second example in that post
  rather than its own.
  Code: `lib/invoices/tax/chargeNames.ts`.
- **Zustand slice architecture.** Composed slices, immer plus devtools plus
  persist, and `partialize` scoped so only saved quotes survive a reload because
  restoring a stale rate result from a previous session would be a lie. One good
  idea, not a post. Could be a section in 14.
- **Turning off an integration without deleting it.** A vendor was withdrawn by
  unregistering its adapters while leaving the code intact for easy re-enable.
  Nice illustration of the registry seam. Two paragraphs inside post 07.
- **Notification inbox design.** Emit never throws, `adminOnly` is derived from
  the kind rather than passed in so a caller cannot forget it, dedupe collisions
  are a success rather than an error, and hrefs are validated against
  protocol-relative URLs. The href check is a genuinely good security footnote.
  Best as a section in post 13.
