import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StateStore } from '../src/state-store.js';

const show = JSON.parse(await readFile(new URL('../shows/phase-a-demo.json', import.meta.url), 'utf8'));
const memory = () => ({ async load() { return null; }, async save() {} });

test('Phase B解除は開始・100%保持・緊急中断・次状態cleanupを正本で区別する', () => {
  const store = new StateStore({ storage: memory() });
  assert.equal(store.importShowFile(show, { apply: true }).valid, true);

  store.executeCue('pa-016');
  assert.equal(store.state.unlock.status, 'running');
  assert.equal(store.state.unlock.progress, 0);

  store.executeCue('pa-017');
  assert.equal(store.state.unlock.status, 'completed');
  assert.equal(store.state.unlock.progress, 100);

  store.executeCue('pa-018');
  assert.equal(store.state.unlock.status, 'aborted');
  assert.equal(store.state.unlock.progress, 100);

  store.executeCue('pa-020');
  assert.equal(store.state.unlock.status, 'aborted');
  store.executeCue('pa-021');
  assert.equal(store.state.unlock.status, 'idle');
  assert.equal(store.state.unlock.progress, 0);

  store.executeCue('pa-025');
  assert.equal(store.state.unlock.status, 'idle');
});
