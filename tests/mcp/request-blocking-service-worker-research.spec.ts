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

import { test, expect, parseResponse } from './fixtures';

test('allowed origins also apply to service worker requests', async ({ server, startClient }) => {
  const allowedOrigin = new URL(server.PREFIX).origin;
  const blockedUrl = server.CROSS_PROCESS_PREFIX + '/blocked-by-origin-policy';
  let blockedOriginReached = false;

  server.setRoute('/blocked-by-origin-policy', (_req, res) => {
    blockedOriginReached = true;
    res.end('reached');
  });
  server.setContent('/sw.js', `
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('message', async event => {
      try {
        await fetch(${JSON.stringify(blockedUrl)}, { mode: 'no-cors' });
        event.ports[0].postMessage('fetched');
      } catch (error) {
        event.ports[0].postMessage('blocked');
      }
    });
  `, 'application/javascript');
  server.setContent('/', '<!doctype html><body>ready</body>', 'text/html');

  const { client } = await startClient({
    config: {
      network: { allowedOrigins: [allowedOrigin] },
    },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: `async () => {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        return await new Promise(resolve => {
          const channel = new MessageChannel();
          channel.port1.onmessage = event => resolve(event.data);
          registration.active.postMessage('fetch', [channel.port2]);
        });
      }`,
    },
  }));

  expect(response.result).toContain('blocked');
  expect(blockedOriginReached).toBe(false);
});
