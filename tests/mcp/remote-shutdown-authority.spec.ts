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

import os from 'os';

import { ChildProcess, spawn } from 'child_process';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { test as baseTest, expect, mcpServerPath, formatLog } from './fixtures';
import { inheritAndCleanEnv } from '../config/utils';

type ExitReceipt = { code: number | null, signal: NodeJS.Signals | null };
type Endpoint = {
  child: ChildProcess;
  loopbackBaseUrl: URL;
  remoteBaseUrl: URL;
  remoteMcpUrl: URL;
  stderr: () => string;
  waitForExit: () => Promise<ExitReceipt>;
};

function nonLoopbackIpv4(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal)
        return address.address;
    }
  }
  throw new Error('No non-loopback IPv4 address is available');
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 15_000)),
  ]);
}

const test = baseTest.extend<{
  shutdownServer: () => Promise<Endpoint>;
}>({
  shutdownServer: async ({ mcpHeadless }, use, testInfo) => {
    let endpoint: Endpoint | undefined;
    await use(async () => {
      if (endpoint)
        throw new Error('Process already running');
      const child = spawn('node', [
        ...mcpServerPath,
        '--port=0',
        '--host=0.0.0.0',
        '--allowed-hosts=*',
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
      const exitPromise = new Promise<ExitReceipt>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
      const presentedUrl = await withTimeout(new Promise<string>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => reject(new Error(`server exited before readiness: ${code}/${signal}\n${stderr}`)));
        child.stderr?.on('data', data => {
          stderr += data.toString();
          const match = stderr.match(/Listening on (http:\/\/.*)/);
          if (match)
            resolve(match[1]);
        });
      }), 'Playwright MCP did not report a listener');
      const loopbackBaseUrl = new URL(presentedUrl);
      const remoteBaseUrl = new URL(presentedUrl);
      remoteBaseUrl.hostname = nonLoopbackIpv4();
      endpoint = {
        child,
        loopbackBaseUrl,
        remoteBaseUrl,
        remoteMcpUrl: new URL('/mcp', remoteBaseUrl),
        stderr: () => stderr,
        waitForExit: () => withTimeout(exitPromise, 'server did not exit'),
      };
      return endpoint;
    });
    if (endpoint && endpoint.child.exitCode === null && endpoint.child.signalCode === null) {
      endpoint.child.kill('SIGTERM');
      await endpoint.waitForExit();
    }
  },
});

async function connectClient(url: URL) {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: 'remote-shutdown-authority', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('accepted remote Host cannot use the loopback-only shutdown route', async ({ shutdownServer, server }) => {
  const endpoint = await shutdownServer();
  const client = await connectClient(endpoint.remoteMcpUrl);
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });

  const response = await fetch(new URL('/killkillkill', endpoint.remoteBaseUrl), {
    method: 'POST',
    headers: { 'x-pw-mcp-kill': '1' },
  });
  expect(response.status).toBe(403);
  expect(await response.text()).toBe('Process shutdown is only allowed from loopback');
  await client.ping();
  expect(endpoint.child.exitCode).toBeNull();
});

test('loopback retains method and header controls plus graceful shutdown', async ({ shutdownServer }) => {
  const endpoint = await shutdownServer();
  const shutdownUrl = new URL('/killkillkill', endpoint.loopbackBaseUrl);

  expect((await fetch(shutdownUrl, { method: 'GET', headers: { 'x-pw-mcp-kill': '1' } })).status).toBe(405);
  expect((await fetch(shutdownUrl, { method: 'POST' })).status).toBe(405);
  expect((await fetch(shutdownUrl, { method: 'POST', headers: { 'x-pw-mcp-kill': '0' } })).status).toBe(405);

  const accepted = await fetch(shutdownUrl, { method: 'POST', headers: { 'x-pw-mcp-kill': '1' } });
  expect(accepted.status).toBe(200);
  expect(await accepted.text()).toBe('Killing process');
  expect(await endpoint.waitForExit()).toEqual({ code: 0, signal: null });
  expect(formatLog(endpoint.stderr())['gracefully closing 0']).toBe(1);
});
