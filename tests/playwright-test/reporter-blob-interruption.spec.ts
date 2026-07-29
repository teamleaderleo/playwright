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

import { extractZip } from '../../packages/utils/third_party/extractZip';
import { test, expect } from './playwright-test-fixtures';

const passingTest = {
  'a.spec.ts': `
    import { test, expect } from '@playwright/test';
    test('passes before reporter finalization', async () => {
      expect(1 + 1).toBe(2);
    });
  `,
};

test('creates no replayable blob before onEnd', async ({ runInlineTest }) => {
  const reportDir = test.info().outputPath('before-on-end');
  const result = await runInlineTest({
    ...passingTest,
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
  });

  expect(result.exitCode).toBe(93);
  expect(await filesIfPresent(reportDir)).toEqual([]);
});

test('leaves the final zip path non-replayable when interrupted as writing starts', async ({ runInlineTest }) => {
  const reportDir = test.info().outputPath('during-on-end');
  const result = await runInlineTest({
    ...passingTest,
    'interrupt-reporter.js': `
      class InterruptReporter {
        onBegin() {
          const fs = require('fs');
          const originalCreateWriteStream = fs.createWriteStream;
          fs.createWriteStream = function(file, ...args) {
            const stream = originalCreateWriteStream.call(fs, file, ...args);
            if (String(file).endsWith('.zip'))
              stream.once('open', () => process.exit(94));
            return stream;
          };
        }
      }
      module.exports = InterruptReporter;
    `,
    'playwright.config.ts': `
      module.exports = {
        workers: 1,
        reporter: [
          ['blob', { outputDir: ${JSON.stringify(reportDir)} }],
          ['./interrupt-reporter.js'],
        ],
      };
    `,
  });

  expect(result.exitCode).toBe(94);
  const reportFiles = await filesIfPresent(reportDir);
  expect(reportFiles).toHaveLength(1);
  expect(reportFiles[0]).toMatch(/\.zip$/);

  const zipFile = path.join(reportDir, reportFiles[0]);
  const extractDir = test.info().outputPath('during-on-end-extracted');
  await expect(extractZip(zipFile, extractDir)).rejects.toThrow();
});

test('creates a replayable blob after onEnd completes', async ({ runInlineTest }) => {
  const reportDir = test.info().outputPath('after-on-end');
  const result = await runInlineTest({
    ...passingTest,
    'playwright.config.ts': `
      module.exports = {
        workers: 1,
        reporter: [['blob', { outputDir: ${JSON.stringify(reportDir)} }]],
      };
    `,
  });

  expect(result.exitCode).toBe(0);
  const reportFiles = await filesIfPresent(reportDir);
  expect(reportFiles).toHaveLength(1);
  expect(reportFiles[0]).toMatch(/\.zip$/);

  const extractDir = test.info().outputPath('after-on-end-extracted');
  await extractZip(path.join(reportDir, reportFiles[0]), extractDir);
  const reportJsonl = path.join(extractDir, 'report.jsonl');
  expect((await fs.promises.stat(reportJsonl)).size).toBeGreaterThan(0);
});

async function filesIfPresent(dir: string): Promise<string[]> {
  try {
    return (await fs.promises.readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return [];
    throw error;
  }
}
