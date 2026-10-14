// A device may reconnect after an approved record left the rolling server list.
// Reconcile its outstanding review states before applying device retention.
export async function reviewUpdates(serverLogs, localLogs, fetchLog) {
  const present = new Set(serverLogs.map(log => log.id));
  const waiting = localLogs.filter(log => !present.has(log.id) &&
    ['submitted', 'under_review', 'returned', 'awaiting_driller_confirmation', 'reopened'].includes(log.status));
  const updates = await Promise.all(waiting.map(async local => {
    const { log } = await fetchLog(local.id);
    if (!log || log.id !== local.id) throw new Error('Review update did not match the saved daily log. Device records are retained.');
    return log;
  }));
  return [...serverLogs, ...updates];
}
