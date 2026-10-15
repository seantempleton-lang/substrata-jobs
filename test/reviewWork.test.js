import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyLog, endShift, draftErrors } from '../src/domain/dailyLog.js';
import { validateDailyLog } from '../server/dailyLogs.mjs';
import { itemErrors } from '../src/domain/reviewWork.js';
import { saveDailyLog, claimPendingMutations, applySyncAcknowledgements, mergeServerLogs, getDailyLog } from '../src/foundation/offlineStore.js';

test('field and office item validation accept captured precision and reject missing units/descriptions without coercion', () => {
  const owner = { userId: crypto.randomUUID(), displayName: 'Fixture Owner', employeeCode: 'REVIEW-ITEM' };
  const log = endShift(createDailyLog({ owner, ancillary: true, startedAt: '2026-10-14T20:00:00Z', initialActivity: { code: 'WORKSHOP', label: 'Workshop' } }), {}, '2026-10-15T03:00:00Z');
  const item = { id: crypto.randomUUID(), itemType: 'service', itemCode: 'OTHER', itemLabelSnapshot: 'Recorded service', quantity: 0.123456, unit: 'hour', notes: null, pointSegmentId: null };
  log.items = [item];
  assert.equal(draftErrors(log).length, 0); assert.equal(validateDailyLog(log, owner.userId), log);
  for (const value of [{ ...item, unit: ' ' }, { ...item, itemLabelSnapshot: 2 }, { ...item, quantity: '' }, { ...item, notes: {} }]) {
    assert.ok(itemErrors(value).length); assert.throws(() => validateDailyLog({ ...log, items: [value] }, owner.userId));
  }
});

test('a corrected locked revision reaches a clean device while queued local work remains recoverable', async () => {
  const owner = { userId: crypto.randomUUID(), displayName: 'Fixture Owner', employeeCode: 'REVIEW-SYNC' };
  const log = endShift(createDailyLog({ owner, ancillary: true, startedAt: '2026-10-14T20:00:00Z', initialActivity: { code: 'WORKSHOP', label: 'Workshop' } }), {}, '2026-10-15T03:00:00Z');
  await saveDailyLog(log);
  const mutation = (await claimPendingMutations(owner.userId))[0];
  await applySyncAcknowledgements([{ mutationId: mutation.mutationId, status: 'applied', serverRevision: 1 }]);
  const submitted = { ...log, status: 'submitted', serverRevision: 2, currentDocumentRevision: 1 };
  await mergeServerLogs([submitted]);
  const corrected = { ...submitted, status: 'approved', serverRevision: 3, currentDocumentRevision: 2, notes: 'Office correction', requiresDrillerAction: false,
    officeCorrection: { sourceDocumentRevision: 1, documentRevision: 2, reviewerName: 'Supervisor', reason: 'Checked recorded work', changes: [{ path: 'notes', before: null, after: 'Office correction' }] } };
  await mergeServerLogs([corrected]);
  assert.equal((await getDailyLog(log.id)).currentDocumentRevision, 2);
  assert.deepEqual((await getDailyLog(log.id)).officeCorrection, corrected.officeCorrection);
  const local = { ...corrected, id: crypto.randomUUID(), status: 'returned', notes: 'Unsent local work' };
  await saveDailyLog(local);
  await mergeServerLogs([{ ...corrected, id: local.id, serverRevision: 4 }]);
  assert.equal((await getDailyLog(local.id)).notes, 'Unsent local work');
  assert.equal((await getDailyLog(local.id)).status, 'returned');
});
