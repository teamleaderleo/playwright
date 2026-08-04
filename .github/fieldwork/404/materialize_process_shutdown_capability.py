from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement target, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "packages/playwright-core/src/tools/mcp/program.ts",
    """      .option('--allowed-hosts <hosts...>', 'comma-separated list of hosts this server is allowed to serve from. Defaults to the host the server is bound to. Pass \\'*\\' to disable the host check.', commaSeparatedList)
      .option('--allowed-origins <origins>', 'semicolon-separated list of TRUSTED origins to allow the browser to request. Default is to allow all.\\nImportant: *does not* serve as a security boundary and *does not* affect redirects. ', semicolonSeparatedList)
""",
    """      .option('--allowed-hosts <hosts...>', 'comma-separated list of hosts this server is allowed to serve from. Defaults to the host the server is bound to. Pass \\'*\\' to disable the host check.', commaSeparatedList)
      .option('--allow-process-shutdown', 'allow the HTTP process-shutdown route. Disabled by default. Any caller that can reach the server and satisfy the route method/header checks can terminate this process.')
      .option('--allowed-origins <origins>', 'semicolon-separated list of TRUSTED origins to allow the browser to request. Default is to allow all.\\nImportant: *does not* serve as a security boundary and *does not* affect redirects. ', semicolonSeparatedList)
""",
)

replace_once(
    "packages/playwright-core/src/tools/mcp/config.ts",
    """export type CLIOptions = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
""",
    """export type CLIOptions = {
  allowedHosts?: string[];
  allowProcessShutdown?: boolean;
  allowedOrigins?: string[];
""",
)
replace_once(
    "packages/playwright-core/src/tools/mcp/config.ts",
    """    server: {
      port: cliOptions.port,
      host: cliOptions.host,
      allowedHosts: cliOptions.allowedHosts,
    },
""",
    """    server: {
      port: cliOptions.port,
      host: cliOptions.host,
      allowedHosts: cliOptions.allowedHosts,
      allowProcessShutdown: cliOptions.allowProcessShutdown,
    },
""",
)
replace_once(
    "packages/playwright-core/src/tools/mcp/config.ts",
    """  options.allowedHosts = commaSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_HOSTS);
  options.allowedOrigins = semicolonSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_ORIGINS);
""",
    """  options.allowedHosts = commaSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_HOSTS);
  options.allowProcessShutdown = envToBoolean(e.PLAYWRIGHT_MCP_ALLOW_PROCESS_SHUTDOWN);
  options.allowedOrigins = semicolonSeparatedList(e.PLAYWRIGHT_MCP_ALLOWED_ORIGINS);
""",
)

replace_once(
    "packages/playwright-core/src/tools/mcp/config.d.ts",
    """    /**
     * The hosts this server is allowed to serve from. Defaults to the host server is bound to.
     * This is not for CORS, but rather for the DNS rebinding protection.
     */
    allowedHosts?: string[];
""",
    """    /**
     * The hosts this server is allowed to serve from. Defaults to the host server is bound to.
     * This is not for CORS, but rather for the DNS rebinding protection.
     */
    allowedHosts?: string[];

    /**
     * Expose the HTTP process-shutdown route. Disabled by default. This grants any caller that can
     * reach the server and satisfy the route method/header checks permission to terminate the MCP
     * process; it does not authenticate an individual caller.
     */
    allowProcessShutdown?: boolean;
""",
)

replace_once(
    "packages/playwright-core/src/tools/utils/mcp/server.ts",
    """export async function start(serverBackendFactory: ServerBackendFactory, options: { host?: string; port?: number, allowedHosts?: string[], socketPath?: string } = {}) {
""",
    """export async function start(serverBackendFactory: ServerBackendFactory, options: { host?: string; port?: number, allowedHosts?: string[], allowProcessShutdown?: boolean, socketPath?: string } = {}) {
""",
)

replace_once(
    "packages/playwright-core/src/tools/utils/mcp/http.ts",
    """export async function startMcpHttpServer(
  config: { host?: string, port?: number },
  serverBackendFactory: ServerBackendFactory,
  allowedHosts?: string[]
): Promise<string> {
  const httpServer = createHttpServer();
  await startHttpServer(httpServer, config);
  return await installHttpTransport(httpServer, serverBackendFactory, allowedHosts);
}
""",
    """export async function startMcpHttpServer(
  config: { host?: string, port?: number, allowProcessShutdown?: boolean },
  serverBackendFactory: ServerBackendFactory,
  allowedHosts?: string[]
): Promise<string> {
  const httpServer = createHttpServer();
  await startHttpServer(httpServer, config);
  return await installHttpTransport(httpServer, serverBackendFactory, allowedHosts, config.allowProcessShutdown === true);
}
""",
)
replace_once(
    "packages/playwright-core/src/tools/utils/mcp/http.ts",
    """async function installHttpTransport(httpServer: http.Server, serverBackendFactory: ServerBackendFactory, allowedHosts?: string[]) {
""",
    """async function installHttpTransport(httpServer: http.Server, serverBackendFactory: ServerBackendFactory, allowedHosts?: string[], allowProcessShutdown = false) {
""",
)
replace_once(
    "packages/playwright-core/src/tools/utils/mcp/http.ts",
    """    const url = new URL(`http://localhost${req.url}`);
    if (url.pathname === '/killkillkill') {
      // Require POST plus a custom header to prevent cross-origin CSRF
""",
    """    const url = new URL(`http://localhost${req.url}`);
    if (url.pathname === '/killkillkill') {
      if (!allowProcessShutdown) {
        res.statusCode = 404;
        return res.end();
      }
      // Require POST plus a custom header to prevent cross-origin CSRF
""",
)

replace_once(
    "tests/mcp/http.spec.ts",
    """test('http transport browser sigint', async ({ serverEndpoint, server }) => {
  const { url, stderr } = await serverEndpoint({ args: ['--isolated'] });
""",
    """test('http transport browser sigint', async ({ serverEndpoint, server }) => {
  const { url, stderr } = await serverEndpoint({ args: ['--isolated', '--allow-process-shutdown'] });
""",
)

Path("tests/mcp/process-shutdown-capability.spec.ts").write_text(
    r'''/**
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
import http from 'http';
import os from 'os';

import { ChildProcess, spawn } from 'child_process';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { test as baseTest, expect, mcpServerPath, formatLog } from './fixtures';
import { inheritAndCleanEnv } from '../config/utils';

type Authority = 'default' | 'cli' | 'config' | 'environment';
type ExitReceipt = { code: number | null, signal: NodeJS.Signals | null };
type Endpoint = {
  child: ChildProcess;
  loopbackBaseUrl: URL;
  remoteBaseUrl: URL;
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

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Proxy did not expose one TCP listener');
  return address.port;
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

function createProxy(upstream: URL): http.Server {
  return http.createServer((request, response) => {
    const upstreamRequest = http.request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url,
      headers: request.headers,
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode || 500, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstreamRequest.once('error', error => {
      if (!response.headersSent)
        response.writeHead(502, { 'content-type': 'text/plain' });
      response.end(`proxy failure: ${error.name}`);
    });
    request.pipe(upstreamRequest);
  });
}

const test = baseTest.extend<{
  shutdownServer: (authority: Authority) => Promise<Endpoint>;
}>({
  shutdownServer: async ({ mcpHeadless }, use, testInfo) => {
    let endpoint: Endpoint | undefined;
    await use(async (authority: Authority) => {
      if (endpoint)
        throw new Error('Process already running');

      const configPath = testInfo.outputPath('shutdown-config.json');
      if (authority === 'config') {
        await fs.promises.writeFile(configPath, JSON.stringify({
          server: { allowProcessShutdown: true },
        }, null, 2));
      }

      const child = spawn('node', [
        ...mcpServerPath,
        '--port=0',
        '--host=0.0.0.0',
        '--allowed-hosts=*',
        '--isolated',
        ...(authority === 'cli' ? ['--allow-process-shutdown'] : []),
        ...(authority === 'config' ? [`--config=${configPath}`] : []),
        ...(mcpHeadless ? ['--headless'] : []),
      ], {
        stdio: 'pipe',
        env: inheritAndCleanEnv({
          DEBUG: 'pw:mcp:test',
          DEBUG_COLORS: '0',
          DEBUG_HIDE_DATE: '1',
          ...(authority === 'environment' ? { PLAYWRIGHT_MCP_ALLOW_PROCESS_SHUTDOWN: '1' } : {}),
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

async function connectClient(url: URL): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: 'process-shutdown-capability', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('ordinary server hides shutdown from direct and locally proxied requests', async ({ shutdownServer }) => {
  const endpoint = await shutdownServer('default');
  const client = await connectClient(new URL('/mcp', endpoint.loopbackBaseUrl));

  const direct = await fetch(new URL('/killkillkill', endpoint.remoteBaseUrl), {
    method: 'POST',
    headers: { 'x-pw-mcp-kill': '1' },
  });
  expect(direct.status).toBe(404);
  expect(await direct.text()).toBe('');

  const proxy = createProxy(endpoint.loopbackBaseUrl);
  const proxyPort = await listen(proxy);
  try {
    const proxied = await fetch(new URL(`http://${nonLoopbackIpv4()}:${proxyPort}/killkillkill`), {
      method: 'POST',
      headers: { 'x-pw-mcp-kill': '1' },
    });
    expect(proxied.status).toBe(404);
    expect(await proxied.text()).toBe('');
    await client.ping();
    expect(endpoint.child.exitCode).toBeNull();
  } finally {
    await client.close();
    await closeServer(proxy);
  }
});

for (const authority of ['cli', 'config', 'environment'] as const) {
  test(`${authority} authority exposes method/header-gated graceful shutdown`, async ({ shutdownServer }) => {
    const endpoint = await shutdownServer(authority);
    const shutdownUrl = new URL('/killkillkill', endpoint.remoteBaseUrl);

    expect((await fetch(shutdownUrl, { method: 'GET', headers: { 'x-pw-mcp-kill': '1' } })).status).toBe(405);
    expect((await fetch(shutdownUrl, { method: 'POST' })).status).toBe(405);
    expect((await fetch(shutdownUrl, { method: 'POST', headers: { 'x-pw-mcp-kill': '0' } })).status).toBe(405);

    const accepted = await fetch(shutdownUrl, { method: 'POST', headers: { 'x-pw-mcp-kill': '1' } });
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe('Killing process');
    expect(await endpoint.waitForExit()).toEqual({ code: 0, signal: null });
    expect(formatLog(endpoint.stderr())['gracefully closing 0']).toBe(1);
  });
}
''',
    encoding="utf-8",
)
