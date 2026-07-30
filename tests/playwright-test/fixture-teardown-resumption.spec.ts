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

test('should resume independent fixture teardown after the shared slot is exhausted', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          const marker = 'sentinel-' + testInfo.retry + '-worker-' + testInfo.workerIndex;
          testInfo.attachments.push({
            name: 'sentinel-' + testInfo.retry,
            contentType: 'text/plain',
            body: Buffer.from(marker),
          });
          console.log('%%' + marker);
        },
        blocker: async ({}, use) => {
          await use();
          await new Promise(f => setTimeout(f, 1000));
        },
      });

      test('fails', async ({ sentinel, blocker }) => {
        throw new Error('expected failure');
      });
    `,
  }, { timeout: 100, retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  const markers = result.outputLines.filter(line => line.startsWith('sentinel-'));
  expect(markers).toHaveLength(2);
  expect(markers[0]).toMatch(/^sentinel-0-worker-\d+$/);
  expect(markers[1]).toMatch(/^sentinel-1-worker-\d+$/);
  expect(new Set(markers.map(line => line.split('-worker-')[1])).size).toBe(2);

  const reportTest = result.report.suites[0].specs[0].tests[0];
  expect(reportTest.results.map(testResult => testResult.attachments.map(attachment => attachment.name).filter(name => name.startsWith('sentinel-')))).toEqual([
    ['sentinel-0'],
    ['sentinel-1'],
  ]);
});

test('should resume dependency and independent fixture teardown after a dependent times out', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          console.log('%%sentinel-' + testInfo.retry);
        },
        root: async ({}, use, testInfo) => {
          await use('root');
          console.log('%%root-' + testInfo.retry);
        },
        blocker: async ({ root }, use) => {
          await use(root);
          await new Promise(f => setTimeout(f, 1000));
        },
      });

      test('fails', async ({ sentinel, blocker }) => {
        throw new Error('expected failure');
      });
    `,
  }, { timeout: 100 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line === 'root-0' || line === 'sentinel-0')).toEqual([
    'root-0',
    'sentinel-0',
  ]);
});

test('should resume fixture teardown after afterEach exhausts the shared slot', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          console.log('%%sentinel-' + testInfo.retry);
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test('passes its body', async ({ sentinel }) => {
      });
    `,
  }, { timeout: 100, retries: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.outputLines.filter(line => line.startsWith('sentinel-'))).toEqual([
    'sentinel-0',
    'sentinel-1',
  ]);
});

test('should not force retry when deferred cleanup recovers after an expected body failure', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base, expect } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          console.log('%%sentinel-' + testInfo.retry + '-worker-' + testInfo.workerIndex);
        },
      });

      test.afterEach(async () => {
        await new Promise(f => setTimeout(f, 1000));
      });

      test('expected body failure', async ({ sentinel }) => {
        test.fail();
        expect(1).toBe(2);
      });
    `,
  }, { timeout: 100, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  const markers = result.outputLines.filter(line => line.startsWith('sentinel-'));
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatch(/^sentinel-0-worker-\d+$/);
});

test('should replace the worker when deferred cleanup remains incomplete after an expected body failure', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base, expect } from '@playwright/test';

      const test = base.extend({
        sentinel: async ({}, use, testInfo) => {
          await use();
          console.log('%%sentinel-start-' + testInfo.retry + '-worker-' + testInfo.workerIndex);
          await new Promise(f => setTimeout(f, 1000));
        },
      });

      test.afterEach(async ({}, testInfo) => {
        if (testInfo.title === 'expected body failure')
          await new Promise(f => setTimeout(f, 1000));
      });

      test('expected body failure', async ({ sentinel }) => {
        test.fail();
        expect(1).toBe(2);
      });

      test('runs after incomplete cleanup', async ({}, testInfo) => {
        console.log('%%next-worker-' + testInfo.workerIndex);
      });
    `,
  }, { timeout: 100, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(2);
  const cleanupMarkers = result.outputLines.filter(line => line.startsWith('sentinel-start-'));
  const nextMarkers = result.outputLines.filter(line => line.startsWith('next-worker-'));
  expect(cleanupMarkers).toHaveLength(1);
  expect(nextMarkers).toHaveLength(1);
  const cleanupWorker = cleanupMarkers[0].split('-worker-')[1];
  const nextWorker = nextMarkers[0].split('next-worker-')[1];
  expect(nextWorker).not.toBe(cleanupWorker);
});

test('should not retain a hook-scoped fixture for the next afterAll hook', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test as base } from '@playwright/test';

      let setupCount = 0;
      const test = base.extend({
        resource: async ({}, use) => {
          const value = ++setupCount;
          console.log('%%setup-' + value);
          await use(value);
          console.log('%%teardown-' + value);
        },
      });

      test.afterAll(async ({ resource }) => {
        console.log('%%first-hook-' + resource);
        await new Promise(f => setTimeout(f, 1000));
      });

      test.afterAll(async ({ resource }) => {
        console.log('%%second-hook-' + resource);
      });

      test('passes', async () => {
      });
    `,
  }, { timeout: 100 });

  expect(result.exitCode).toBe(1);
  expect(result.outputLines.filter(line => /^(setup|first-hook|second-hook|teardown)-/.test(line))).toEqual([
    'setup-1',
    'first-hook-1',
    'setup-2',
    'second-hook-2',
    'teardown-2',
  ]);
});
