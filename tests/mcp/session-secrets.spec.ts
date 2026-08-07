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

import { test, expect } from './fixtures';

test('configured secret values are redacted in saved session tool arguments', async ({ startClient, server }, testInfo) => {
  const secretsFile = testInfo.outputPath('secrets.env');
  const outputDir = testInfo.outputPath('output');
  await fs.promises.writeFile(secretsFile, 'PASSWORD=password123');

  const { client } = await startClient({
    args: ['--secrets', secretsFile, '--save-session', '--output-dir', outputDir],
  });

  server.setContent('/', '<input />', 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  await client.callTool({
    name: 'browser_type',
    arguments: {
      element: 'textbox',
      target: 'e2',
      text: 'password123',
    },
  });

  const readSession = async () => {
    const entries = await fs.promises.readdir(outputDir).catch(() => []);
    const sessionDir = entries.find(entry => entry.startsWith('session-'));
    if (!sessionDir)
      return '';
    return await fs.promises.readFile(path.join(outputDir, sessionDir, 'session.md'), 'utf8').catch(() => '');
  };

  await expect.poll(readSession).toContain('### Tool call: browser_type');
  const session = await readSession();
  expect(session).not.toContain('password123');
  expect(session).toContain('<secret>PASSWORD</secret>');
});
