import { expect, test } from "@playwright/test";

test("serviceWorkers block stays silent in an opaque sandbox frame", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setContent(`
    <!doctype html>
    <title>opaque sandbox repro</title>
    <iframe
      title="opaque sandbox"
      sandbox="allow-scripts"
      srcdoc="<!doctype html><script>parent.postMessage('ready', '*')</script>"
    ></iframe>
  `);

  await page.waitForEvent("console", { timeout: 500 }).catch(() => undefined);
  await page.waitForTimeout(100);

  expect(pageErrors).toEqual([]);
});
