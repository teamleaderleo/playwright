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
import path from 'path';
import { pathToFileURL } from 'url';

import { test, expect } from './fixtures';

test('explicit output cannot escape workspace through a symlink', async ({ startClient, server }, testInfo) => {
  test.skip(process.platform === 'win32', 'Directory symlink setup requires elevated privileges on some Windows runners.');

  const workspace = testInfo.outputPath('workspace');
  const outside = testInfo.outputPath('outside');
  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.mkdir(outside, { recursive: true });
  await fs.promises.symlink(outside, path.join(workspace, 'escape'), 'dir');

  const { client } = await startClient({
    roots: [{ name: 'workspace', uri: pathToFileURL(workspace).href }],
  });

  server.setContent('/', '<script>console.log("hello")</script>', 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  const output = path.join(workspace, 'escape', 'console.log');
  const response = await client.callTool({
    name: 'browser_console_messages',
    arguments: { filename: output },
  });

  expect(response.isError).toBe(true);
  expect(fs.existsSync(path.join(outside, 'console.log'))).toBe(false);
});
