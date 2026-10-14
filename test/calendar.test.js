import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import '../server/db.mjs';
import { assignmentWindow } from '../server/calendar.mjs';
test('assignment window and PostgreSQL dates use New Zealand calendar days across DST', () => {
  assert.deepEqual(assignmentWindow(new Date('2026-09-26T13:00:00Z')), { from: '2026-09-27', to: '2026-10-10' });
  assert.equal(pg.types.getTypeParser(1082)('2026-10-14'), '2026-10-14');
});
