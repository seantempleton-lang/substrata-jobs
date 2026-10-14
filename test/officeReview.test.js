import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyLog, endShift } from '../src/domain/dailyLog.js';
import { saveDailyLog, claimPendingMutations, applySyncAcknowledgements, mergeServerLogs, getDailyLog } from '../src/foundation/offlineStore.js';
import { clientSections } from '../server/output.mjs';
import { reviewUpdates } from '../src/foundation/reviewUpdates.js';

test('returned office decisions reach the owner without overwriting queued offline corrections', async () => {
  const owner = { userId: crypto.randomUUID(), employeeCode: 'TEST-OFFICE-OWNER', displayName: 'Fixture Owner' };
  const log = endShift(createDailyLog({ owner, ancillary: true, startedAt: '2026-10-13T20:00:00Z', initialActivity: { code: 'ANC_WORKSHOP', label: 'Workshop' } }), {}, '2026-10-14T03:00:00Z');
  await saveDailyLog(log);
  const mutation = (await claimPendingMutations(owner.userId))[0];
  await applySyncAcknowledgements([{ mutationId: mutation.mutationId, status: 'applied', serverRevision: 1 }]);
  const returned = { ...log, status: 'returned', serverRevision: 3, currentDocumentRevision: 1,
    requiresDrillerAction: true, officeReview: { comment: 'Correct attendance', reviewerName: 'Supervisor' } };
  await mergeServerLogs([returned]);
  assert.equal((await getDailyLog(log.id)).officeReview.comment, 'Correct attendance');
  await saveDailyLog({ ...returned, notes: 'Recoverable device correction' });
  await mergeServerLogs([{ ...returned, status: 'approved', serverRevision: 4 }]);
  assert.equal((await getDailyLog(log.id)).notes, 'Recoverable device correction');
  assert.equal((await getDailyLog(log.id)).status, 'returned');
});

test('client output excludes office review comments and decision metadata', () => {
  const log = { logType: 'rig_shift', division: 'Water', shift: { label: 'day' }, owner: { displayName: 'Fixture' }, crew: [], points: [], activities: [], items: [], setup: {}, clientAcknowledgement: { status: 'not_required' },
    officeReview: { comment: 'Private correction reason', reviewerName: 'Internal Reviewer' } };
  const text = JSON.stringify(clientSections(log));
  assert.ok(!text.includes('Private correction reason')); assert.ok(!text.includes('Internal Reviewer'));
});

test('a dormant device receives approval after its log leaves the rolling server list', async () => {
  const local = { id: crypto.randomUUID(), status: 'submitted', serverRevision: 2 };
  const remote = { ...local, status: 'approved', serverRevision: 3, approvedAt: '2026-08-02T10:00:00Z' };
  const calls = [];
  const results = await reviewUpdates([], [local, { id: 'draft', status: 'draft' }], async id => { calls.push(id); return { log: remote }; });
  assert.deepEqual(calls, [local.id]); assert.deepEqual(results, [remote]);
  await assert.rejects(() => reviewUpdates([], [local], async () => { throw new Error('Server unavailable'); }), /Server unavailable/);
  assert.deepEqual(await reviewUpdates([remote], [local], async () => { throw new Error('Unnecessary fetch'); }), [remote]);
});
