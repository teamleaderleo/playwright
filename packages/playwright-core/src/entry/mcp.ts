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

import { program } from 'commander';
import { tools, utils } from '../coreBundle';
import { packageJSON } from '../package';

const testSigintMessage = Object.freeze({
  type: 'playwright:mcp:test:sigint',
  version: 1,
} as const);

type TestSigintMessage = typeof testSigintMessage;

function isTestSigintMessage(message: unknown): message is TestSigintMessage {
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return false;
  const keys = Reflect.ownKeys(message);
  return Object.getPrototypeOf(message) === Object.prototype &&
    keys.length === 2 &&
    keys.includes('type') &&
    keys.includes('version') &&
    (message as TestSigintMessage).type === testSigintMessage.type &&
    (message as TestSigintMessage).version === testSigintMessage.version;
}

// The spawning test process already owns this child. Use its private IPC
// channel to exercise the cross-platform SIGINT path without exposing a
// network shutdown endpoint to MCP clients.
if (process.send) {
  const onTestMessage = (message: unknown) => {
    if (!isTestSigintMessage(message))
      return;
    process.off('message', onTestMessage);
    process.emit('SIGINT');
  };
  process.on('message', onTestMessage);
}

const p = program.version('Version ' + packageJSON.version).name('Playwright MCP');
tools.decorateMCPCommand(p);
program.parseAsync(process.argv).catch(e => {
  // eslint-disable-next-line no-console
  console.error(e.message);
  utils.gracefullyProcessExitDoNotHang(1);
});
