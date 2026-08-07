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
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListRootsRequestSchema } from 'playwright-core/lib/utilsBundle';

import { test, expect, mcpServerPath } from './fixtures';
import { inheritAndCleanEnv } from '../config/utils';

test('explicit output can be written to the second client root', async ({}, testInfo) => {
  const rootOne = testInfo.outputPath('root-one');
  const rootTwo = testInfo.outputPath('root-two');
  await fs.promises.mkdir(rootOne, { recursive: true });
  await fs.promises.mkdir(rootTwo, { recursive: true });

  const cp = spawn('node', [
    ...mcpServerPath,
    '--port=0',
    '--isolated',
    '--headless',
  ], {
    stdio: 'pipe',
    env: inheritAndCleanEnv({ DEBUG_COLORS: '0', DEBUG_HIDE_DATE: '1' }),
    cwd: rootOne,
  });

  try {
    let stderr = '';
    const baseURL = await new Promise<string>(resolve => cp.stderr?.on('data', data => {
      stderr += data.toString();
      const match = stderr.match(/Listening on (http:\/\/.*)/);
      if (match)
        resolve(match[1]);
    }));

    const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseURL));
    const client = new Client({ name: 'multi-root-test', version: '1.0.0' }, { capabilities: { roots: {} } });
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: [
        { name: 'root-one', uri: pathToFileURL(rootOne).href },
        { name: 'root-two', uri: pathToFileURL(rootTwo).href },
      ],
    }));

    await client.connect(transport);
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: 'data:text/html,<script>console.log("hello")</script>' },
    });

    const response = await client.callTool({
      name: 'browser_console_messages',
      arguments: {
        filename: 'console.log',
        _meta: { cwd: rootTwo },
      },
    });

    expect(response.isError).not.toBe(true);
    expect(await fs.promises.readFile(`${rootTwo}/console.log`, 'utf8')).toContain('hello');

    await transport.terminateSession();
    await client.close();
  } finally {
    cp.kill('SIGTERM');
  }
});
