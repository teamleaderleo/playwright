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

import { ManualPromise } from '@isomorphic/manualPromise';
import { escapeWithQuotes } from '@isomorphic/stringUtils';
import { filterStackFile } from '@utils/stackTrace';

import { fixtures } from '../common';
import { formatLocation } from '../util';

import { TimeoutManagerError } from './timeoutManager';
import type { TestInfoImpl } from './testInfo';
import type { FixtureDescription, RunnableDescription, TimeSlot } from './timeoutManager';
import type { WorkerInfo } from '../../types/test';
import type { Location } from '../../types/testReporter';

class Fixture {
  runner: FixtureRunner;
  registration: fixtures.FixtureRegistration;
  value: any;
  failed = false;

  private _useFuncFinished: ManualPromise<void> | undefined;
  private _selfTeardownComplete: Promise<void> | undefined;
  private _setupDescription: FixtureDescription;
  private _teardownDescription: FixtureDescription;
  private _teardownDeferred = false;
  private _stepInfo: { title: string, category: 'fixture', location?: Location, group?: string } | undefined;
  _deps = new Set<Fixture>();
  _usages = new Set<Fixture>();

  constructor(runner: FixtureRunner, registration: fixtures.FixtureRegistration) {
    this.runner = runner;
    this.registration = registration;
    this.value = null;
    const isUserFixture = this.registration.location && filterStackFile(this.registration.location.file);
    const title = this.registration.customTitle || this.registration.name;
    const location = isUserFixture ? this.registration.location : undefined;
    this._stepInfo = { title: `Fixture ${escapeWithQuotes(title, '"')}`, category: 'fixture', location };
    if (this.registration.box === 'self')
      this._stepInfo = undefined;
    else if (this.registration.box)
      this._stepInfo.group = isUserFixture ? 'configuration' : 'internal';
    this._setupDescription = {
      title,
      phase: 'setup',
      location,
      slot: this.registration.timeout !== undefined ? {
        timeout: this.registration.timeout,
        elapsed: 0,
      } : this.registration.scope === 'worker' ? {
        timeout: this.runner.workerFixtureTimeout,
        elapsed: 0,
      } : undefined,
    };
    this._teardownDescription = { ...this._setupDescription, phase: 'teardown' };
  }

  async setup(testInfo: TestInfoImpl, runnable: RunnableDescription) {
    this.runner.instanceForId.set(this.registration.id, this);

    if (typeof this.registration.fn !== 'function') {
      this.value = this.registration.fn;
      return;
    }

    const run = () => testInfo._runWithTimeout({ ...runnable, fixture: this._setupDescription }, () => this._setupInternal(testInfo));
    if (this._stepInfo)
      await testInfo._runAsStep(this._stepInfo, run);
    else
      await run();
  }

  private async _setupInternal(testInfo: TestInfoImpl) {
    const params: { [key: string]: any } = {};
    for (const name of this.registration.deps) {
      const registration = this.runner.pool!.resolve(name, this.registration)!;
      const dep = this.runner.instanceForId.get(registration.id);
      if (!dep) {
        this.failed = true;
        return;
      }
      // Fixture teardown is root => leaves, when we need to teardown a fixture,
      // it recursively tears down its usages first.
      dep._usages.add(this);
      // Don't forget to decrement all usages when fixture goes.
      // Otherwise worker-scope fixtures will retain test-scope fixtures forever.
      this._deps.add(dep);
      params[name] = dep.value;
      if (dep.failed) {
        this.failed = true;
        return;
      }
    }

    let called = false;
    const useFuncStarted = new ManualPromise<void>();
    const useFunc = async (value: any) => {
      if (called)
        throw new Error(`Cannot provide fixture value for the second time`);
      called = true;
      this.value = value;
      this._useFuncFinished = new ManualPromise<void>();
      useFuncStarted.resolve();
      await this._useFuncFinished;
    };

    const workerInfo: WorkerInfo = { config: testInfo.config, parallelIndex: testInfo.parallelIndex, workerIndex: testInfo.workerIndex, project: testInfo.project };
    const info = this.registration.scope === 'worker' ? workerInfo : testInfo;
    this._selfTeardownComplete = (async () => {
      try {
        await this.registration.fn(params, useFunc, info);
        if (!useFuncStarted.isDone())
          throw new Error(`use() was not called in fixture "${this.registration.name}"`);
      } catch (error) {
        this.failed = true;
        if (!useFuncStarted.isDone())
          useFuncStarted.reject(error);
        else
          throw error;
      }
    })();
    await useFuncStarted;
  }

  teardownWasDeferred() {
    return this._teardownDeferred;
  }

  async teardown(testInfo: TestInfoImpl, runnable: RunnableDescription, retrySlot?: TimeSlot): Promise<boolean> {
    const fixtureRunnable = retrySlot ? { ...runnable, slot: retrySlot, fixture: this._teardownDescription } : { ...runnable, fixture: this._teardownDescription };
    const isTimeExhausted = testInfo._timeoutManager.isTimeExhaustedFor(fixtureRunnable);

    // A test-scoped fixture without an explicit timeout shares the runnable slot.
    // During final test cleanup, keep it registered when that shared slot is
    // exhausted so that worker cleanup can retry it with a fresh slot. Hook
    // fixture scopes continue force-cleaning because later hooks may still run.
    if (isTimeExhausted && runnable.type === 'test' && !this._teardownDescription.slot && !retrySlot) {
      this._teardownDeferred = true;
      return false;
    }

    this._teardownDeferred = false;
    try {
      // Do not even start the teardown for a fixture that does not have any
      // time remaining in the selected time slot. This avoids cascading timeouts.
      if (!isTimeExhausted) {
        const run = () => testInfo._runWithTimeout(fixtureRunnable, () => this._teardownInternal());
        if (this._stepInfo)
          await testInfo._runAsStep(this._stepInfo, run);
        else
          await run();
      }
    } finally {
      // To preserve fixtures integrity, forcefully cleanup fixtures
      // that cannot teardown due to a timeout or an error.
      for (const dep of this._deps)
        dep._usages.delete(this);
      this.runner.instanceForId.delete(this.registration.id);
    }
    return true;
  }

  private async _teardownInternal() {
    if (typeof this.registration.fn !== 'function')
      return;
    if (this._usages.size !== 0) {
      // TODO: replace with assert.
      console.error('Internal error: fixture integrity at', this._teardownDescription.title);  // eslint-disable-line no-console
      this._usages.clear();
    }
    if (this._useFuncFinished) {
      this._useFuncFinished.resolve();
      this._useFuncFinished = undefined;
      await this._selfTeardownComplete;
    }
  }

  _collectFixturesInTeardownOrder(scope: fixtures.FixtureScope, collector: Set<Fixture>) {
    if (this.registration.scope !== scope)
      return;
    for (const fixture of this._usages)
      fixture._collectFixturesInTeardownOrder(scope, collector);
    collector.add(this);
  }
}

type DeferredFixtureGroup = {
  fixtures: Set<Fixture>;
  weight: number;
  fixturesRemaining: number;
  allowance: number;
  slot?: TimeSlot;
};

export class FixtureRunner {
  private testScopeClean = true;
  pool: fixtures.FixturePool | undefined;
  instanceForId = new Map<string, Fixture>();
  workerFixtureTimeout = 0;

  setPool(pool: fixtures.FixturePool) {
    if (!this.testScopeClean)
      throw new Error('Did not teardown test scope');
    if (this.pool && pool.digest !== this.pool.digest) {
      throw new Error([
        `Playwright detected inconsistent test.use() options.`,
        `Most common mistakes that lead to this issue:`,
        `  - Calling test.use() outside of the test file, for example in a common helper.`,
        `  - One test file imports from another test file.`,
      ].join('\n'));
    }
    this.pool = pool;
  }

  private _collectFixturesInSetupOrder(registration: fixtures.FixtureRegistration, collector: Set<fixtures.FixtureRegistration>) {
    if (collector.has(registration))
      return;
    for (const name of registration.deps) {
      const dep = this.pool!.resolve(name, registration)!;
      this._collectFixturesInSetupOrder(dep, collector);
    }
    collector.add(registration);
  }

  async teardownScope(scope: fixtures.FixtureScope, testInfo: TestInfoImpl, runnable: RunnableDescription) {
    // Teardown fixtures in the reverse order.
    const allFixtures = Array.from(this.instanceForId.values()).reverse();
    const collector = new Set<Fixture>();
    for (const fixture of allFixtures)
      fixture._collectFixturesInTeardownOrder(scope, collector);

    // A timed-out teardown callback keeps running after the timeout race rejects.
    // Budget deferred recovery by connected dependency groups so a timed-out child
    // cannot cause its resource-owning dependency to start teardown concurrently.
    // Independent groups still receive bounded shares, weighted by fixture count.
    const deferredFixtures = new Set(Array.from(collector).filter(fixture => fixture.teardownWasDeferred()));
    const groupByFixture = new Map<Fixture, DeferredFixtureGroup>();
    const groups: DeferredFixtureGroup[] = [];
    const collectGroup = (fixture: Fixture, fixturesInGroup: Set<Fixture>) => {
      if (!deferredFixtures.has(fixture) || fixturesInGroup.has(fixture))
        return;
      fixturesInGroup.add(fixture);
      for (const dep of fixture._deps)
        collectGroup(dep, fixturesInGroup);
      for (const usage of fixture._usages)
        collectGroup(usage, fixturesInGroup);
    };
    for (const fixture of collector) {
      if (!deferredFixtures.has(fixture) || groupByFixture.has(fixture))
        continue;
      const fixturesInGroup = new Set<Fixture>();
      collectGroup(fixture, fixturesInGroup);
      const group: DeferredFixtureGroup = {
        fixtures: fixturesInGroup,
        weight: fixturesInGroup.size,
        fixturesRemaining: fixturesInGroup.size,
        allowance: 0,
      };
      groups.push(group);
      for (const groupedFixture of fixturesInGroup)
        groupByFixture.set(groupedFixture, group);
    }

    let unallocatedBudget = runnable.slot ? Math.max(0, runnable.slot.timeout - runnable.slot.elapsed) : 0;
    let unallocatedWeight = groups.reduce((total, group) => total + group.weight, 0);

    let firstError: Error | undefined;
    let skippedTeardown = false;
    for (const fixture of collector) {
      const group = groupByFixture.get(fixture);
      if (group && !group.slot) {
        group.allowance = unallocatedWeight ? Math.floor(unallocatedBudget * group.weight / unallocatedWeight) : 0;
        unallocatedBudget -= group.allowance;
        unallocatedWeight -= group.weight;
        // A zero timeout disables timeout enforcement. Represent an allocation
        // too small to start as an already-exhausted one millisecond slot.
        group.slot = group.allowance >= 2 ? { timeout: group.allowance, elapsed: 0 } : { timeout: 1, elapsed: 1 };
      }

      const slotElapsedBefore = group?.slot?.elapsed ?? 0;
      try {
        const didTeardown = await fixture.teardown(testInfo, runnable, group?.slot);
        skippedTeardown = !didTeardown || skippedTeardown;
      } catch (error) {
        firstError = firstError ?? error;
      } finally {
        if (group?.slot && runnable.slot) {
          const elapsed = group.slot.elapsed - slotElapsedBefore;
          runnable.slot.elapsed += elapsed;
          --group.fixturesRemaining;
          if (!group.fixturesRemaining)
            unallocatedBudget += Math.max(0, group.allowance - group.slot.elapsed);
        }
      }
    }
    if (scope === 'test')
      this.testScopeClean = !Array.from(this.instanceForId.values()).some(fixture => fixture.registration.scope === 'test');
    if (firstError)
      throw firstError;
    if (skippedTeardown) {
      const error = new TimeoutManagerError('Test timeout was exhausted before all test fixtures could be torn down.');
      if (!testInfo._isFailure()) {
        testInfo._failWithError(error);
        if (!testInfo._isFailure())
          testInfo.status = 'timedOut';
      }
      throw error;
    }
  }

  async resolveParametersForFunction(fn: Function, testInfo: TestInfoImpl, autoFixtures: 'worker' | 'test' | 'all-hooks-only', runnable: RunnableDescription): Promise<{ result: object } | null> {
    const collector = new Set<fixtures.FixtureRegistration>();

    // Collect automatic fixtures.
    const auto: fixtures.FixtureRegistration[] = [];
    for (const registration of this.pool!.autoFixtures()) {
      let shouldRun = true;
      if (autoFixtures === 'all-hooks-only')
        shouldRun = registration.scope === 'worker' || registration.auto === 'all-hooks-included';
      else if (autoFixtures === 'worker')
        shouldRun = registration.scope === 'worker';
      if (shouldRun)
        auto.push(registration);
    }
    auto.sort((r1, r2) => (r1.scope === 'worker' ? 0 : 1) - (r2.scope === 'worker' ? 0 : 1));
    for (const registration of auto)
      this._collectFixturesInSetupOrder(registration, collector);

    // Collect used fixtures.
    const names = getRequiredFixtureNames(fn);
    for (const name of names)
      this._collectFixturesInSetupOrder(this.pool!.resolve(name)!, collector);

    // Setup fixtures.
    for (const registration of collector)
      await this._setupFixtureForRegistration(registration, testInfo, runnable);

    // Create params object.
    const params: { [key: string]: any } = {};
    for (const name of names) {
      const registration = this.pool!.resolve(name)!;
      const fixture = this.instanceForId.get(registration.id);
      if (!fixture || fixture.failed)
        return null;
      params[name] = fixture.value;
    }
    // Wrap in an object to avoid returning a thenable if a fixture is named 'then'.
    return { result: params };
  }

  async resolveParametersAndRunFunction(fn: Function, testInfo: TestInfoImpl, autoFixtures: 'worker' | 'test' | 'all-hooks-only', runnable: RunnableDescription) {
    const params = await this.resolveParametersForFunction(fn, testInfo, autoFixtures, runnable);
    if (params === null) {
      // Do not run the function when fixture setup has already failed.
      return null;
    }
    await testInfo._runWithTimeout(runnable, () => fn(params.result, testInfo));
  }

  private async _setupFixtureForRegistration(registration: fixtures.FixtureRegistration, testInfo: TestInfoImpl, runnable: RunnableDescription): Promise<Fixture> {
    if (registration.scope === 'test')
      this.testScopeClean = false;

    let fixture = this.instanceForId.get(registration.id);
    if (fixture)
      return fixture;

    fixture = new Fixture(this, registration);
    await fixture.setup(testInfo, runnable);
    return fixture;
  }

  dependsOnWorkerFixturesOnly(fn: Function, location: Location): boolean {
    const names = getRequiredFixtureNames(fn, location);
    for (const name of names) {
      const registration = this.pool!.resolve(name)!;
      if (registration.scope !== 'worker')
        return false;
    }
    return true;
  }
}

function getRequiredFixtureNames(fn: Function, location?: Location) {
  return fixtures.fixtureParameterNames(fn, location ?? { file: '<unknown>', line: 1, column: 1 }, e => {
    throw new Error(`${formatLocation(e.location!)}: ${e.message}`);
  });
}
