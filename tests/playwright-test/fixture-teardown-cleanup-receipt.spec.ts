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

test('should report started and unstarted deferred fixture cleanup', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      export default { timeout: 2000 };
    `,
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        root: async ({}, use) => {
          await use();
          console.log('%%root-closed');
        },
        child: async ({ root }, use) => {
          await use();
          console.log('%%child-finalizer-started');
          await new Promise(f => setTimeout(f, 5000));
          console.log('%%child-finalizer-finished');
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 3000));
      });

      test('passes its body', async ({ child }) => {
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line === 'child-finalizer-started' || line === 'child-finalizer-finished' || line === 'root-closed')).toEqual([
    'child-finalizer-started',
  ]);

  const reportTest = result.report.suites[0].specs[0].tests[0];
  const receiptAttachment = reportTest.results[0].attachments.find(attachment => attachment.name === 'fixture-cleanup');
  expect(receiptAttachment?.contentType).toBe('application/json');
  const receipt = JSON.parse(Buffer.from(receiptAttachment!.body!, 'base64').toString('utf8'));
  expect(receipt.version).toBe(1);
  expect(receipt.phase).toBe('worker-cleanup');
  expect(receipt.fixtures.filter((entry: any) => entry.name === 'child' || entry.name === 'root')).toEqual([
    { name: 'child', state: 'timed-out-after-start' },
    { name: 'root', state: 'not-started-budget-exhausted' },
  ]);
});
