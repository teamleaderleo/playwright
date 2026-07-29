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

import fs from 'fs';
import path from 'path';

import { test, expect } from './playwright-test-fixtures';

test('should retain a recoverable blob journal when the process exits before onEnd', async ({ runInlineTest }) => {
  const reportDir = test.info().outputPath('blob-report');
  const result = await runInlineTest({
    'exit-reporter.js': `
      class ExitReporter {
        onTestEnd() {
          process.exit(93);
        }
      }
      module.exports = ExitReporter;
    `,
    'playwright.config.ts': `
      module.exports = {
        workers: 1,
        reporter: [
          ['blob', { outputDir: ${JSON.stringify(reportDir)} }],
          ['./exit-reporter.js'],
        ],
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('passes before abrupt reporter exit', async () => {
        expect(1 + 1).toBe(2);
      });
    `,
  });

  expect(result.exitCode).toBe(93);
  expect(fs.existsSync(path.join(reportDir, 'report.partial.jsonl'))).toBeTruthy();
});
