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

test('should give every deferred fixture a cleanup opportunity during worker cleanup', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          const name = 'sentinel-' + testInfo.retry;
          testInfo.attachments.push({
            name,
            contentType: 'text/plain',
            body: Buffer.from(name),
          });
          console.log('%%' + name);
        },
        blocker: async ({}, use) => {
          await use();
          await new Promise(f => setTimeout(f, 1000));
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test('passes its body', async ({ sentinel, blocker }) => {
      });
    `,
  }, { timeout: 100, retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line.startsWith('sentinel-'))).toEqual([
    'sentinel-0',
    'sentinel-1',
  ]);
  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.results.map(testResult => testResult.attachments.map(attachment => attachment.name).filter(name => name.startsWith('sentinel-')))).toEqual([
    ['sentinel-0'],
    ['sentinel-1'],
  ]);
});

test('should carry unused cleanup budget to later deferred fixtures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        sentinelA: async ({}, use, testInfo) => {
          await use();
          const name = 'sentinel-a-' + testInfo.retry;
          testInfo.attachments.push({
            name,
            contentType: 'text/plain',
            body: Buffer.from(name),
          });
          console.log('%%' + name);
        },
        sentinelB: async ({}, use, testInfo) => {
          await use();
          const name = 'sentinel-b-' + testInfo.retry;
          testInfo.attachments.push({
            name,
            contentType: 'text/plain',
            body: Buffer.from(name),
          });
          console.log('%%' + name);
        },
        blocker: async ({}, use) => {
          await use();
          await new Promise(f => setTimeout(f, 1000));
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test('passes its body', async ({ sentinelA, sentinelB, blocker }) => {
      });
    `,
  }, { timeout: 120, retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line.startsWith('sentinel-'))).toEqual([
    'sentinel-b-0',
    'sentinel-a-0',
    'sentinel-b-1',
    'sentinel-a-1',
  ]);
  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.results.map(testResult => testResult.attachments.map(attachment => attachment.name).filter(name => name.startsWith('sentinel-')))).toEqual([
    ['sentinel-b-0', 'sentinel-a-0'],
    ['sentinel-b-1', 'sentinel-a-1'],
  ]);
});
