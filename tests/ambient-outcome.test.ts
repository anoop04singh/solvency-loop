import assert from 'node:assert/strict';
import test from 'node:test';
import { ambientOutcome } from '../src/lib/ambient-outcome';

test('unresolved workflows take priority over an earlier success notice', () => {
  const confirmed = { busy: false, error: '', succeeded: true, pending: false, needsRefresh: false };
  assert.equal(ambientOutcome(confirmed), 'success');
  assert.equal(ambientOutcome({ ...confirmed, pending: true }), 'pending', 'A pending memory update must not appear fully complete.');
  assert.equal(ambientOutcome({ ...confirmed, busy: true }), 'pending', 'A new operation supersedes an earlier success.');
  assert.equal(ambientOutcome({ ...confirmed, needsRefresh: true }), 'error', 'A confirmed payment with stale account state still needs attention.');
  assert.equal(ambientOutcome({ ...confirmed, pending: true, error: 'Confirmation unavailable.' }), 'error', 'An uncertain transaction must never be colored as a success.');
});
