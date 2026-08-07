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

import { test, expect, parseResponse, consoleEntries } from './fixtures';

test('output budget keeps console artifact linked by current response', async ({ startClient, server }) => {
  const { client } = await startClient({ args: ['--output-max-size=1'] });

  server.setContent('/', '<script>console.log("hello from console")</script>', 'text/html');
  const response = parseResponse(await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  }));

  expect(response.events).toContain('New console entries:');
  expect(await consoleEntries(response)).toContain('hello from console');
});
