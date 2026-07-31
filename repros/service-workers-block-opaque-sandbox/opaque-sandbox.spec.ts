// Copyright (c) Microsoft Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { expect, test } from '@playwright/test';

test('serviceWorkers block stays silent in an opaque sandbox frame', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.setContent(`
    <!doctype html>
    <title>opaque sandbox repro</title>
    <iframe
      title="opaque sandbox"
      sandbox="allow-scripts"
      srcdoc="<!doctype html><script>parent.postMessage('ready', '*')</script>"
    ></iframe>
  `);

  await page.waitForEvent('console', { timeout: 500 }).catch(() => undefined);
  await page.waitForTimeout(100);

  expect(pageErrors).toEqual([]);
});
