/*
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

import { test, expect } from './playwright-test-fixtures';

test('should not tear down a dependency while a timed-out child finalizer is still running', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      let rootClosed = false;
      const test = base.extend({
        root: async ({}, use) => {
          await use({ isClosed: () => rootClosed });
          rootClosed = true;
          console.log('%%root-closed');
        },
        child: async ({ root }, use) => {
          await use();
          console.log('%%child-finalizer-started');
          await new Promise(f => setTimeout(f, 80));
          console.log('%%child-finished-root-' + (root.isClosed() ? 'closed' : 'open'));
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test('passes its body', async ({ child }) => {
      });
    `,
  }, { timeout: 120 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line === 'child-finalizer-started' || line === 'root-closed' || line.startsWith('child-finished-root-'))).toEqual([
    'child-finalizer-started',
    'child-finished-root-open',
    'root-closed',
  ]);
});
