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

import { test, expect } from './fixtures';
import { tools } from '../../packages/playwright-core/lib/coreBundle';

const { resolveCLIConfigForMCP } = tools;

const emptyEnv = {};

test.skip(({ mcpBrowser }) => mcpBrowser !== 'chrome', 'Configuration-only test.');

// A misspelled device must not silently fall back to the default desktop context.
test('invalid --device value is rejected', async () => {
  await expect(resolveCLIConfigForMCP({ device: 'Not A Real Device' }, emptyEnv))
      .rejects.toThrow(/device/i);
});
