---
description: Return the tree to a past checkpoint while keeping chosen commits — full-range revert proving return, keepers re-landed as adapted picks, forward-only (R27)
---

Salvage run. Checkpoint and keeper hashes given as: $ARGUMENTS

(If no checkpoint was named, ask for it — never infer which past state
the maintainer means. Keepers are the commits to KEEP from between
checkpoint and HEAD, pasted in any order. R27 owns this law. R9's
ask-first door stays shut throughout: no reset, no rebase of pushed
history, no force-push — main only ever moves forward.)

1. **Preflight.** Clean tree, nothing stashed silently. Enumerate the
   range (`git log --oneline <checkpoint>..HEAD`) and confirm every
   keeper sits inside it. Map each keeper's ground: `git log -S` on
   the symbols it touches, blame over its hunks — does it build on a
   commit being reverted? Per entangled keeper, surface the choice to
   the maintainer BEFORE anything moves: widen the keep-set to include
   the dependency / hand-adapt with the dependent parts stripped /
   declare it unsalvageable (reimplement fresh later, noted in the
   wrap). Registry check: do reverted commits carry law (R/G ids)?
   Retired ids stay retired; a keeper whose meaning changes re-lands
   under a NEW id — the R23→R24 precedent.

2. **Return.** `git revert --no-edit <checkpoint>..HEAD` — the
   sequencer reverts newest-first, one revert commit per commit
   (`--continue` through conflicts, `--abort` restores; mind that
   `..` excludes its left commit). A merge commit needs `-m 1` and is
   said out loud — reverting a merge poisons re-merging that branch
   (rare on this trunk, named anyway). Then PROVE the return:
   `git diff <checkpoint> HEAD` must be empty. Selective in-place
   reverts (skipping keepers) are rejected: interleaved hunks
   conflict, and keepers would stand unvalidated on reverted ground.
   A genuinely entangled round MAY squash (`revert -n`) — only said
   out loud; it costs per-item re-revertibility.

3. **Re-land.** Cherry-pick the keepers OLDEST-first, one at a time,
   `git cherry-pick -x <hash>`. ADAPT each to the tree that now
   exists: comments, references, docs and registry lines true to the
   new state — never a mechanical replay. Message: original subject
   plus "(adapted from commit <hash>: what changed and why)"; on
   conflicted picks git drops the "(cherry picked from …)" line —
   append it by hand. Gate after EVERY pick: `node
   extension/test/unit.ts` when `extension/` is touched; a records
   keeper gets its pointers walked instead.

4. **Semantic sweep.** A clean apply can still lie. Grep the
   survivors for symbols, flags, paths and ids that were reverted
   away — a stale reference is the tell. `git range-diff
   <old-first>^..<old-last> <new-first>^..<new-last>` pairs originals
   against replays; review the deltas like patches.

5. **Records & close.** The wrap names the reverted range, the kept
   (old hash → new hash), the abandoned (one-line why each); registry
   consequences land dated (tombstones, new ids, revision notes —
   never silent rewrites). Full verification recipe, then ONE push
   when the whole series is green (R9's checkpoint law). Repo salvage
   never touches deployed state or player data — the deploy runbook
   owns rollbacks there.

Heavy-adaptation variant: rebuild on a scratch branch cut from the
checkpoint (unpushed, so rebase and squash are legal there), verify
the series, then land forward on main — the revert series (step 2)
followed by the verified picks. Either way, main's history only grows.
