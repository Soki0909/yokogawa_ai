import test from 'node:test';
import assert from 'node:assert/strict';
import { renameWithRetry } from '../src/json-storage.js';

test('Windowsの一時的なrename競合を再試行する', async () => {
  let calls = 0;
  const waits = [];
  await renameWithRetry('state.tmp', 'state.json', {
    renameImpl: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('temporarily locked'), { code: 'EPERM' });
    },
    waitImpl: async (ms) => { waits.push(ms); },
  });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [25, 50]);
});

test('renameの非一時エラーは再試行しない', async () => {
  let calls = 0;
  await assert.rejects(renameWithRetry('state.tmp', 'state.json', {
    renameImpl: async () => {
      calls += 1;
      throw Object.assign(new Error('invalid path'), { code: 'EINVAL' });
    },
    waitImpl: async () => {},
  }), /invalid path/);
  assert.equal(calls, 1);
});
