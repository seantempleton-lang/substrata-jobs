export function assignmentWindow(now = new Date()) {
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + 13 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}
