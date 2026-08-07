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

import { test, expect } from './fixtures';

test('redacts secrets after evaluate JSON serialization', async ({ startClient, server }) => {
  const secretsFile = test.info().outputPath('secrets.env');
  await fs.promises.writeFile(secretsFile, String.raw`TOKEN=abc\def`);

  const { client } = await startClient({
    args: ['--secrets', secretsFile],
  });

  server.setContent('/', String.raw`<!DOCTYPE html><body>abc\def</body>`, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: { function: '() => document.body.textContent' },
  })).toHaveResponse({
    result: expect.stringContaining('<secret>TOKEN</secret>'),
  });
});

test('redacts the longest overlapping secret value', async ({ startClient, server }) => {
  const secretsFile = test.info().outputPath('secrets.env');
  await fs.promises.writeFile(secretsFile, 'SHORT=abc\nLONG=abcdef');

  const { client } = await startClient({
    args: ['--secrets', secretsFile],
  });

  server.setContent('/', '<!DOCTYPE html><body>abcdef</body>', 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: { function: '() => document.body.textContent' },
  })).toHaveResponse({
    result: expect.stringContaining('<secret>LONG</secret>'),
  });
});
