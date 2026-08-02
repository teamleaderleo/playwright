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

import { ChildProcess, spawn } from 'child_process';

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { test as baseTest, expect, formatLog, mcpServerPath } from './fixtures';
import { inheritAndCleanEnv } from '../config/utils';

const test = baseTest.extend<{
  serverEndpoint: () => Promise<{
    url: URL,
    stderr: () => string,
    closeStdin: () => void,
    exited: Promise<void>,
  }>,
}>({
  serverEndpoint: async ({ mcpHeadless }, use, testInfo) => {
    let cp: ChildProcess | undefined;
    await use(async () => {
      if (cp)
        throw new Error('Process already running');
      cp = spawn('node', [
        ...mcpServerPath,
        '--port=0',
        '--isolated',
        ...(mcpHeadless ? ['--headless'] : []),
      ], {
        stdio: 'pipe',
        env: inheritAndCleanEnv({
          DEBUG: 'pw:mcp:test',
          DEBUG_COLORS: '0',
          DEBUG_HIDE_DATE: '1',
        }),
        cwd: testInfo.outputPath(),
      });
      let stderr = '';
      const url = await new Promise<string>(resolve => cp!.stderr?.on('data', data => {
        stderr += data.toString();
        const match = stderr.match(/Listening on (http:\/\/.*)/);
        if (match)
          resolve(match[1]);
      }));
      const exited = new Promise<void>(resolve => cp!.once('exit', () => resolve()));
      return {
        url: new URL(url),
        stderr: () => stderr,
        closeStdin: () => cp!.stdin!.end(),
        exited,
      };
    });
    cp?.kill('SIGTERM');
  },
});

test('http transport gracefully closes when its owning stdin closes', async ({ serverEndpoint, server }) => {
  const { url, stderr, closeStdin, exited } = await serverEndpoint();

  const transport = new StreamableHTTPClientTransport(new URL('/mcp', url));
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  });

  const oldShutdownResponse = await fetch(new URL('/killkillkill', url), {
    method: 'POST',
    headers: { 'x-pw-mcp-kill': '1' },
  });
  expect(oldShutdownResponse.status).not.toBe(200);
  await client.ping();

  closeStdin();

  await expect.poll(() => formatLog(stderr())).toEqual({
    'create browser (isolated)': 1,
    'create context': 1,
    'create http session': 1,
    'gracefully closing 1': 1,
  });
  await exited;
});

test('stdio transport accepts immediate client startup', async ({}, testInfo) => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: mcpServerPath,
    cwd: testInfo.outputPath(),
    stderr: 'pipe',
    env: inheritAndCleanEnv({
      DEBUG_COLORS: '0',
      DEBUG_HIDE_DATE: '1',
    }),
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  await client.ping();
  await client.close();
});
