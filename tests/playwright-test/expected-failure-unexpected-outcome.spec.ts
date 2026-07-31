/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './playwright-test-fixtures';

test('reports independent after-body failure as unexpected without rewriting attempt status', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test.afterEach(async () => {
        throw new Error('afterEach exploded');
      });

      test('expected body failure', async () => {
        test.fail();
        expect(1).toBe(2);
      });
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);

  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.expectedStatus).toBe('failed');
  expect(reportTest.status).toBe('unexpected');
  expect(reportTest.results).toHaveLength(1);
  expect(reportTest.results[0].status).toBe('failed');
  expect(reportTest.results[0].errors.some(error => error.message?.includes('afterEach exploded'))).toBe(true);
});

test('keeps expected body failure expected when no independent after-body error occurs', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test('expected body failure', async () => {
        test.fail();
        expect(1).toBe(2);
      });
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);

  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.expectedStatus).toBe('failed');
  expect(reportTest.status).toBe('expected');
  expect(reportTest.results).toHaveLength(1);
  expect(reportTest.results[0].status).toBe('failed');
});

test('counts independent after-body failure toward max failures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test.afterEach(async ({}, testInfo) => {
        if (testInfo.title === 'expected body failure')
          throw new Error('afterEach exploded');
      });

      test('expected body failure', async () => {
        test.fail();
        expect(1).toBe(2);
      });

      test('must not run after max failures', async () => {
        console.log('SHOULD_NOT_RUN');
      });
    `,
  }, { workers: 1, 'max-failures': 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.didNotRun).toBe(1);
  expect(result.output).not.toContain('SHOULD_NOT_RUN');
});
