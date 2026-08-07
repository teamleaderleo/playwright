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

import { Command } from 'commander';

import { test, expect } from './fixtures';
import { tools } from '../../packages/playwright-core/lib/coreBundle';

const { decorateMCPCommand } = tools;

test.skip(({ mcpBrowser }) => mcpBrowser !== 'chrome', 'CLI parsing only.');

// Variadic Commander options should accumulate each supplied permission.
test('space-separated --grant-permissions values are preserved', () => {
  const command = new Command();
  decorateMCPCommand(command);
  command.parseOptions(['--grant-permissions', 'geolocation', 'clipboard-read']);
  expect(command.opts().grantPermissions).toEqual(['geolocation', 'clipboard-read']);
});
