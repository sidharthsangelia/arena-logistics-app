# 15. The rate limiter whose comment was the opposite of the truth

**Kind:** failure · **Tier:** 3 · **Est. length:** 800 words

## Hook

The comment said the map was "self-cleaning as keys go idle". It was exactly
backwards: a bucket is only trimmed when its key is hit *again*, so a key that
goes quiet keeps its entry for the life of the process.

## Thesis

A wrong comment is worse than no comment, because it is the thing that stops the
next reader from checking. The interesting question is what class of comment goes
wrong this way, and the answer is: the ones that describe an emergent property
rather than an instruction.

## Outline

1. The limiter and what it is for. A dependency-free sliding window in front of
   paths that fan out to paid vendor APIs. Cost control first, abuse control
   second.
2. The leak. One entry per distinct key, and it shrank never. One entry per
   organisation is negligible. One entry per IP on an endpoint anyone can reach
   is not, and that was exactly the key space in question.
3. Why the wrong comment was believable. Trimming on write *is* self-cleaning,
   for keys that keep being used. The claim was true of the busy case and
   silently false of the case that matters.
4. The fix and its own tradeoff. Sweep expired buckets, but not on every call,
   because an O(n) walk in front of every rate search is worse than the leak.
   Sweep when the map is big enough to be worth it.
5. Honest scoping, which is the part most posts skip. State lives in process
   memory, so on multi-instance hosting the effective ceiling is the limit times
   the instance count. That is fine for stopping one tenant hammering a
   calculator from a single session, and it is not a global quota. Name the seam
   where Redis goes if it ever needs to be one.
6. The `globalThis` pin again, for the same reason as the adapter registry: dev
   HMR and duplicate module graphs mean a module-level `Map` is not one map.
7. Closing thought: write comments that state rules and counterfactuals, not
   properties you believe the code has. A rule is checkable.

## Code

- `lib/rateLimit.ts`, `utils/rateLimit.test.ts`
