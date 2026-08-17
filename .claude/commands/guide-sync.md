---
description: Re-check deploy/guide/ against what moved under deploy/ — touched pages re-read and edited in place, Synced stamps advanced; the runbook and the files always win (R31)
---

Guide sync. Scope given as: $ARGUMENTS

(No scope = the full check. A named scope — one page, one deploy/
subtree — narrows the re-read, never the diff. R31 owns this law; the
guide's contract lives in `deploy/guide/README.md` §Staying fresh.
The guide is a LIVING document: this workflow edits it directly —
the audit lanes' proposals-only rule does not apply here — but the
machinery stays untouched: where guide and reality disagree, the
guide moves, never the runbook or the files. A deploy/ change that
smells like a direction change is surfaced to the maintainer, never
silently taught.)

In order:

1. **Collect the stamps.** Every page's `Synced:` hash — they can
   diverge (additions land with their own); each distinct hash gets
   its own diff.
2. **Diff.** Per stamp hash:
   `git diff <hash>..HEAD -- deploy/ ':!deploy/guide'`
   plus `git log --oneline` over the range for the why. Empty for
   every stamp → report "fresh", touch nothing, done. Stamps move
   only when there was something to check against.
3. **Map.** Changed files → affected pages, TWO ways: filename/path
   mention (grep the pages) AND topic ownership (the README index
   says what each page teaches — a pager-script change touches 12
   even where no filename matches). 20 (file-by-file reference) is
   touched by nearly every diff; new or deleted files always reach
   20 and 21; the README's vocabulary table hears new house words.
   When in doubt, a page is affected.
4. **Re-read and edit.** Each affected page read WHOLE against the
   changed files and runbook sections — stale values, dead paths,
   vanished units, changed shapes edited in place, in register.
   Never restate what the runbook owns: teach the shape, point at
   the law. New machinery with no home lands per the contract's
   addition rule — right number range, index row, its own stamp.
5. **Advance the stamps.** Every page checked — by re-read or by the
   map showing no overlap — gets `Synced: `<hash>` (<date>)` with
   the deploy-state commit it was checked against (HEAD at check
   time, not the sync's own commit).
6. **Report.** One breath at the wrap: range checked, pages edited
   vs confirmed, anything surfaced for the maintainer — direction-
   change smells, proposed new pages. The sync lands as its own
   commit (edits + stamp moves together).

Standing lane (R31): any round landing changes under `deploy/`
outside `deploy/guide/` runs this before its wrap — or the wrap
names the sync deferred, one line, and the next session inherits
it. Cheap when the diff is small; free when it is empty.
