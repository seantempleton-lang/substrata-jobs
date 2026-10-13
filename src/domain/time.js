const zone = "Pacific/Auckland";
export function localInput(value = new Date().toISOString()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function fromLocalInput(value) {
  if (!value) throw new Error("Enter a date and time.");
  const target = Date.parse(`${value}Z`);
  if (!Number.isFinite(target)) throw new Error("Enter a valid date and time.");
  // Search both NZ offsets to reject DST gaps and ambiguous clocks explicitly.
  const matches = [12, 13].map(hours => new Date(target - hours * 3600000).toISOString()).filter(instant => localInput(instant).slice(0, value.length) === value);
  if (matches.length !== 1) throw new Error(matches.length ? "This time occurs twice at daylight saving. Use Now or choose an unambiguous time." : "This time does not exist in New Zealand daylight saving.");
  return matches[0];
}
export function displayTime(value) { return value ? new Date(value).toLocaleString("en-NZ", { timeZone: zone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "In progress"; }
export function elapsed(start, finish = new Date().toISOString()) {
  const minutes = Math.max(0, Math.floor((Date.parse(finish) - Date.parse(start)) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
