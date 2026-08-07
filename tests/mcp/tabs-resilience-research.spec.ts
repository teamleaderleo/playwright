/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './fixtures';

test('hung background tab does not block a healthy current tab response', async ({ startClient, cdpServer, server }) => {
  const browserContext = await cdpServer.start();
  const background = browserContext.pages()[0];
  await background.goto(server.EMPTY_PAGE);
  await background.evaluate(() => { document.title = 'Background'; });

  const healthy = await browserContext.newPage();
  await healthy.goto(server.HELLO_WORLD);

  const { client } = await startClient({ args: [`--cdp-endpoint=${cdpServer.endpoint}`] });

  await client.callTool({
    name: 'browser_tabs',
    arguments: { action: 'select', index: 1 },
  });

  await background.evaluate(() => {
    setTimeout(() => {
      // Deliberately simulate an unresponsive renderer in a background tab.
      while (Date.now() > 0)
        Math.random();
    }, 100);
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  let settled = false;
  const call = client.callTool({
    name: 'browser_evaluate',
    arguments: { function: '() => 42' },
  }).finally(() => settled = true);

  // The current tab is healthy, so its tool call should not wait on the
  // unresponsive background tab merely to render the open-tab header.
  await new Promise(resolve => setTimeout(resolve, 2000));
  expect(settled).toBe(true);

  // Ensure the intentionally wedged renderer cannot strand fixture cleanup if
  // the assertion above fails on current source.
  await background.close().catch(() => {});
  await call.catch(() => {});
});
