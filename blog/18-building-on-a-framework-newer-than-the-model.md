# 18. Building on a framework version newer than the model's training data

**Kind:** technical learning · **Tier:** 3 · **Est. length:** 900 words

## Hook

The first line of this repository's agent instructions is: this is not the
Next.js you know.

## Thesis

Coding agents fail on new framework versions in a specific and predictable way:
they write the previous version's API confidently, and it type-checks. The fix is
not a better prompt, it is pointing the agent at the docs that shipped inside
`node_modules`.

## Outline

1. The failure mode. Not hallucination, obsolescence. The code is correct for a
   version you are not running, which is the hardest kind of wrong to spot in
   review.
2. The instruction that fixed it: read the relevant guide in
   `node_modules/next/dist/docs/` before writing any code, and heed deprecation
   notices. The docs are already on disk, at the exact version installed.
3. Concrete things that moved and would have been written the old way: middleware
   file naming and shape, cache tag and revalidation APIs, and the rule that a
   `"use server"` file may not export types.
4. Standing constraints belong in the instructions file, not in prompts. The
   loading-state rule in this repo is one sentence and it shaped twenty-five
   components.
5. Repo-level memory versus per-session context. What is worth writing down: the
   things that are true across sessions and not derivable from the code, such as
   why a vendor integration is switched off, or which database URL is live.
6. What *not* to write down, because the repository already records it.
7. The wider point: an agent-legible codebase and a human-legible one are the same
   codebase. Everything that helps here (decision headers, docs in the repo,
   named constants with their source) was good practice before agents existed.

## Code

- `AGENTS.md`, `CLAUDE.md`
- the repo-root decision documents
- `proxy.ts` as the concrete "the file is not called middleware any more" example

## Note

Timely, and the shortest to write. Also the most likely to age badly, so publish
it early or not at all.
