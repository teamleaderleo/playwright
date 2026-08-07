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

test('client cancellation aborts in-flight navigation', async ({ client, server }) => {
  // Warm the browser first so the request timeout below measures navigation,
  // not browser startup.
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.EMPTY_PAGE },
  });

  let navigationRequestClosed = false;
  server.setRoute('/hang', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<html><body>still loading');
    res.on('close', () => { navigationRequestClosed = true; });
  });

  await expect(client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX + '/hang' },
  }, { timeout: 500 })).rejects.toThrow();

  await expect.poll(() => navigationRequestClosed, { timeout: 3000 }).toBe(true);
});
