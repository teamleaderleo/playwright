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

test('should finish deferred test fixture cleanup before afterAll resolves fixtures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      let setupCount = 0;
      const closedInstances = new Set<number>();
      const test = base.extend<{ resource: number }>({
        resource: async ({}, use) => {
          const value = ++setupCount;
          console.log('%%resource-setup-' + value);
          await use(value);
          closedInstances.add(value);
          console.log('%%resource-teardown-' + value);
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test.afterAll(async ({ resource }) => {
        console.log('%%afterAll-resource-' + resource);
        console.log('%%afterAll-saw-test-resource-closed-' + closedInstances.has(1));
      });

      test('uses the resource', async ({ resource }) => {
        console.log('%%test-resource-' + resource);
      });
    `,
  }, { timeout: 100 });

  expect(result.exitCode).toBe(1);
  expect(result.outputLines.filter(line => /^(resource-|test-resource-|afterAll-)/.test(line))).toEqual([
    'resource-setup-1',
    'test-resource-1',
    'resource-teardown-1',
    'resource-setup-2',
    'afterAll-resource-2',
    'afterAll-saw-test-resource-closed-true',
    'resource-teardown-2',
  ]);
});
