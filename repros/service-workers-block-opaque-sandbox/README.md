# `serviceWorkers: "block"` emits a page error in an opaque sandbox

## Environment

- `@playwright/test` 1.62.0
- Chromium / Chrome for Testing 151.0.7922.34, Playwright revision 1234
- one local page containing an `iframe` with `sandbox="allow-scripts"`

## Run

```bash
cd repros/service-workers-block-opaque-sandbox
npm install
npx playwright install chromium
npm test
```

## Expected

The sandboxed frame loads without an uncaught page error. The frame has no same-origin capability, so service-worker access is unavailable by design.

## Observed

With `serviceWorkers: "block"`, Playwright's context hook reads `navigator.serviceWorker` in the opaque sandbox and Chromium reports:

```text
Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.
```

Removing `serviceWorkers: "block"` makes the test pass. A response-level `Content-Security-Policy: worker-src 'none'` can deny worker registration without touching the opaque frame API.

This reproduction contains synthetic local HTML and no credentials, storage state, browsing history, network destinations, screenshots, traces, or private content.
