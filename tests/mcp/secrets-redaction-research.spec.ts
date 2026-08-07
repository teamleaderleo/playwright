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

test('redacts configured values from saved session tool arguments', async ({ startClient, server }) => {
  const secretsFile = test.info().outputPath('secrets.env');
  const outputDir = test.info().outputPath('output');
  await fs.promises.writeFile(secretsFile, 'TOKEN=session-value-123');

  const { client } = await startClient({
    args: ['--secrets', secretsFile, '--save-session', '--output-dir', outputDir],
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.EMPTY_PAGE },
  });
  await client.callTool({
    name: 'browser_evaluate',
    arguments: { function: '() => "session-value-123"' },
  });

  const sessionFolder = fs.readdirSync(outputDir).find(entry => entry.startsWith('session-'))!;
  const sessionFile = path.join(outputDir, sessionFolder, 'session.md');
  await expect.poll(async () => fs.promises.readFile(sessionFile, 'utf8')).not.toContain('session-value-123');
  expect(await fs.promises.readFile(sessionFile, 'utf8')).toContain('<secret>TOKEN</secret>');
});
