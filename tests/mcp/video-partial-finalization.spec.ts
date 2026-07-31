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

import fs from 'fs';

import { test, expect } from './fixtures';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

test.use({ mcpCaps: ['devtools'] });

test('shares one video finalization across concurrent stop tool calls', async ({ client }, testInfo) => {
  const start = await client.callTool({
    name: 'browser_start_video',
    arguments: { filename: 'concurrent.webm' },
  });
  expect(start.isError, textOf(start)).toBeFalsy();
  await produceFrames(client);

  const [first, second] = await Promise.all([
    client.callTool({ name: 'browser_stop_video', arguments: {} }),
    client.callTool({ name: 'browser_stop_video', arguments: {} }),
  ]);

  expect(first.isError, textOf(first)).toBeFalsy();
  expect(second.isError, textOf(second)).toBeFalsy();
  expect(textOf(first)).toContain('concurrent.webm');
  expect(textOf(second)).toContain('concurrent.webm');

  const video = testInfo.outputPath('concurrent.webm');
  expect((await fs.promises.stat(video)).isFile()).toBeTruthy();
  expect((await fs.promises.stat(video)).size).toBeGreaterThan(0);

  const repeated = await client.callTool({
    name: 'browser_stop_video',
    arguments: {},
  });
  expect(repeated.isError, textOf(repeated)).toBeFalsy();
  expect(textOf(repeated)).toContain('No videos were recorded.');
});

test('reports a recording after its page closes before explicit stop', async ({ client }, testInfo) => {
  const start = await client.callTool({
    name: 'browser_start_video',
    arguments: { filename: 'closed-page.webm' },
  });
  expect(start.isError, textOf(start)).toBeFalsy();
  await produceFrames(client);

  const close = await client.callTool({
    name: 'browser_tabs',
    arguments: { action: 'close' },
  });
  expect(close.isError, textOf(close)).toBeFalsy();

  const stop = await client.callTool({
    name: 'browser_stop_video',
    arguments: {},
  });
  expect(stop.isError, textOf(stop)).toBeFalsy();
  expect(textOf(stop)).toContain('closed-page.webm');

  const video = testInfo.outputPath('closed-page.webm');
  expect((await fs.promises.stat(video)).isFile()).toBeTruthy();
  expect((await fs.promises.stat(video)).size).toBeGreaterThan(0);
});

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return result.content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join('\n');
}

async function produceFrames(client: Client) {
  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: `async () => {
        async function rafraf(count) {
          for (let i = 0; i < count; i++)
            await new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
        }
        document.body.style.backgroundColor = 'red';
        await rafraf(30);
        document.body.style.backgroundColor = 'green';
        await rafraf(30);
        return 'ok';
      }`,
    },
  })).toHaveResponse({ result: '"ok"' });
}
