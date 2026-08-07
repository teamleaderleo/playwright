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

import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from './fixtures';

test('explicit output filename does not follow a workspace symlink outside allowed roots', async ({ startClient, server }, testInfo) => {
  test.skip(process.platform === 'win32', 'symlink setup requires additional Windows privileges');

  const workspace = testInfo.outputPath('workspace');
  const outside = testInfo.outputPath('outside.txt');
  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.writeFile(outside, 'original');
  await fs.promises.symlink(outside, path.join(workspace, 'console.log'));

  const { client } = await startClient({ cwd: workspace });
  server.setContent('/', '<!doctype html><script>console.log("from page")</script>', 'text/html');
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX } });
  await client.callTool({
    name: 'browser_console_messages',
    arguments: { filename: 'console.log' },
  });

  expect(await fs.promises.readFile(outside, 'utf8')).toBe('original');
});
