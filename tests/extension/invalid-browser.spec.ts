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

import { test, expect, extensionId } from './extension-fixtures';

test('extension mode rejects Firefox instead of opening Chrome', async ({ browserWithExtension, startClient }) => {
  const browserContext = await browserWithExtension.launch();
  const { client } = await startClient({
    args: ['--extension', '--browser', 'firefox'],
    env: { PWTEST_EXTENSION_USER_DATA_DIR: browserWithExtension.userDataDir },
  });

  const outcome = await Promise.race([
    client.callTool({ name: 'browser_tabs', arguments: { action: 'list' } }).then(response => ({ type: 'response' as const, response })),
    browserContext.waitForEvent('page', page => page.url().startsWith(`chrome-extension://${extensionId}/connect.html`))
        .then(() => ({ type: 'connect-page' as const })),
  ]);

  expect(outcome.type).toBe('response');
  if (outcome.type === 'response')
    expect(outcome.response.isError).toBe(true);
});
