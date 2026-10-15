// Shared with Jobs src/domain/reviewWork.js. Integration tests enforce parity.
// These are recorded work corrections, never prices or commercial adjustments.
export function itemErrors(item) {
  const errors = [];
  if (!item || !['material', 'service', 'measurement', 'subcontractor'].includes(item.itemType) ||
    typeof item.itemCode !== 'string' || !item.itemCode.trim() ||
    typeof item.itemLabelSnapshot !== 'string' || !item.itemLabelSnapshot.trim() ||
    typeof item.unit !== 'string' || !item.unit.trim() || !Number.isFinite(item.quantity) || item.quantity < 0 ||
    (item.notes != null && typeof item.notes !== 'string')) {
    errors.push({ code: 'ITEM_INVALID', message: 'Items require a code, type, description, explicit unit, non-negative quantity and text notes.', field: 'items' });
  }
  return errors;
}

export function correctionLabel(log, path) {
  if (path === 'notes') return 'Daily notes';
  const [, id, field] = path.split('/');
  const item = log.items.find(item => item.id === id);
  const point = log.points?.find(point => point.id === item?.pointSegmentId)?.pointId;
  const label = { quantity: 'quantity', unit: 'unit', itemLabelSnapshot: 'description', notes: 'notes' }[field] || field;
  return `${item?.itemCode || 'Item'} · ${item?.itemLabelSnapshot || id} · ${point || 'Site-wide'} · ${label}`;
}

function invalid(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
export function applyWorkCorrections(source, corrections) {
  if (!corrections || typeof corrections !== 'object' || Array.isArray(corrections) ||
    Object.keys(corrections).some(key => !['notes', 'items'].includes(key))) invalid('Only daily notes and existing item values may be corrected in this release.');
  const next = structuredClone(source), changes = [];
  function change(target, field, value, path) {
    if (target[field] !== value) { changes.push({ path, before: target[field] ?? null, after: value }); target[field] = value; }
  }
  if (Object.hasOwn(corrections, 'notes')) {
    if (corrections.notes !== null && typeof corrections.notes !== 'string') invalid('Daily notes must be text or null.');
    change(next, 'notes', corrections.notes, 'notes');
  }
  if (corrections.items !== undefined) {
    if (!Array.isArray(corrections.items)) invalid('Item corrections must be an array.');
    const seen = new Set();
    for (const patch of corrections.items) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || seen.has(patch.id) ||
        Object.keys(patch).some(key => !['id', 'quantity', 'unit', 'itemLabelSnapshot', 'notes'].includes(key))) invalid('Choose distinct existing items and supported correction fields.');
      seen.add(patch.id);
      const item = next.items.find(item => item.id === patch.id);
      if (!item) invalid('A corrected item does not belong to this daily log.');
      for (const field of ['quantity', 'unit', 'itemLabelSnapshot', 'notes']) if (Object.hasOwn(patch, field)) change(item, field, patch[field], `items/${item.id}/${field}`);
    }
  }
  for (const item of next.items) if (itemErrors(item).length) invalid(itemErrors(item)[0].message);
  if (!changes.length) invalid('Make a work correction before correcting and locking, or lock the unchanged revision.');
  return { log: next, changes };
}
