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

test('should treat fixture cleanup failure as unexpected after an expected body failure', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base, expect } from '@playwright/test';

      const test = base.extend({
        resource: async ({}, use, testInfo) => {
          await use();
          console.log('%%cleanup-' + testInfo.retry + '-worker-' + testInfo.workerIndex);
          throw new Error('cleanup exploded');
        },
      });

      test('expected body failure', async ({ resource }) => {
        test.fail();
        expect(1).toBe(2);
      });
    `,
  }, { retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('cleanup exploded');

  const markers = result.outputLines.filter(line => line.startsWith('cleanup-'));
  expect(markers).toHaveLength(2);
  expect(markers[0]).toMatch(/^cleanup-0-worker-\d+$/);
  expect(markers[1]).toMatch(/^cleanup-1-worker-\d+$/);
  expect(new Set(markers.map(line => line.split('-worker-')[1])).size).toBe(2);

  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.results).toHaveLength(2);
  for (const testResult of reportTest.results)
    expect(testResult.errors.some(error => error.message?.includes('cleanup exploded'))).toBe(true);
});
