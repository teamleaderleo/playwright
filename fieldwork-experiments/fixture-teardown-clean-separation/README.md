# Fixture cleanup separation probe

This experiment separates two concerns that were previously coupled in the fixture-recovery stack:

1. **Worker safety:** incomplete deferred cleanup must retire the worker before another test runs there.
2. **Result accounting:** whether the current test retries or becomes unexpected belongs to Fieldwork #142.

The patch removes the temporary public `status = 'timedOut'` rewrite and records only an internal incomplete-cleanup signal for worker replacement.

## Evidence boundary

The first workflow run failed while applying the generated patch because its hunk line counts were stale. No Playwright test ran in that attempt. The workflow now uses `git apply --recount` while retaining context checks, so source drift still fails closed.

A passing workflow would establish only the focused worker-safety split on the pinned base. It would not settle retry policy, final outcome classification, or the public result model.
