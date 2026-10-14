import { sha256Hex } from "./crypto.js";

// Stable content identities shared by the device and server. Sync/audit fields
// cannot change the work a client acknowledged.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function workContent(log) {
  const { id, logType, division, job, equipment, owner, shift, setup, crew, points, activities, items, notes } = log;
  return { id, logType, division, job, equipment, owner, shift, setup, crew, points, activities, items, notes };
}

export function submissionContent(log) {
  return { ...workContent(log), clientAcknowledgement: log.clientAcknowledgement };
}

export function serverSnapshot(log) {
  const snapshot = structuredClone(log);
  delete snapshot.locallySynchronizedAt;
  return snapshot;
}

export async function contentHash(value) {
  return sha256Hex(new TextEncoder().encode(canonical(value)));
}

export const acknowledgementOutcomes = [
  ["signed_on_device", "Signed on device"], ["CLIENT_UNAVAILABLE", "Not available"],
  ["CLIENT_DECLINED", "Declined"], ["not_required", "Not required"],
  ["WILL_SIGN_LATER", "Will sign later"], ["OTHER", "Other"],
];

export function acknowledgementLabel(ack) {
  if (ack?.reasonCode === "CONTENT_CHANGED") return "Earlier signature does not cover this changed content";
  return acknowledgementOutcomes.find(([code]) => code === (ack?.status === "not_signed" ? ack.reasonCode : ack?.status))?.[1] || "Not signed";
}

export function acknowledgementErrors(log) {
  const ack = log.clientAcknowledgement || { status: "not_required" };
  const errors = [];
  const add = message => errors.push({ code: "ACKNOWLEDGEMENT_INVALID", field: "clientAcknowledgement", message });
  if (log.logType === "ancillary" && ack.status !== "not_required") add("Ancillary records cannot have client acknowledgement.");
  if (!["signed_on_device", "not_signed", "not_required"].includes(ack.status)) add("Choose a client acknowledgement outcome.");
  if (ack.status === "signed_on_device" && (typeof ack.signerName !== "string" || !ack.signerName.trim() || !ack.signatureUploadId || !Number.isFinite(Date.parse(ack.signedAt)))) add("A drawn signature requires the representative's name and signature time.");
  if (ack.status === "not_signed" && !["CLIENT_UNAVAILABLE", "CLIENT_DECLINED", "REMOTE_UNATTENDED", "WILL_SIGN_LATER", "OTHER", "CONTENT_CHANGED"].includes(ack.reasonCode)) add("Choose why the client has not signed.");
  if (ack.reasonCode === "OTHER" && (typeof ack.reasonNotes !== "string" || !ack.reasonNotes.trim())) add("Add a note for Other.");
  if (ack.clientEmail && (typeof ack.clientEmail !== "string" || ack.clientEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(ack.clientEmail))) add("Enter a valid client email address or leave it blank.");
  const allowed = ack.status === "signed_on_device" ? ["status", "signerName", "companyRole", "clientEmail", "signedAt", "signatureUploadId", "contentHash"] : ack.status === "not_signed" ? ["status", "reasonCode", "reasonNotes", "clientEmail", "priorSignatureUploadId"] : ["status"];
  if (Object.keys(ack).some(key => !allowed.includes(key))) add("Acknowledgement contains unsupported fields; signature content must use the restricted upload.");
  if ([ack.signerName, ack.companyRole].some(value => value != null && (typeof value !== "string" || value.length > 200))) add("Representative details must be text of 200 characters or fewer.");
  if (ack.reasonNotes != null && (typeof ack.reasonNotes !== "string" || ack.reasonNotes.length > 2000)) add("Acknowledgement note must be 2000 characters or fewer.");
  if (ack.contentHash != null && !/^[a-f0-9]{64}$/.test(ack.contentHash)) add("Acknowledged content identity is invalid.");
  return errors;
}

export function retentionEligible(log, { mutations = [], signatures = [], intentions = [], deliveries = [], now = Date.now() } = {}) {
  // Step 6 supplies approvedAt. The clock starts at the later of approval
  // and the last confirmed server synchronization, never device shift end.
  const approved = Date.parse(log.approvedAt), synced = Date.parse(log.locallySynchronizedAt);
  return log.status === "approved" && log.serverRevision > 0 && Number.isFinite(approved) && Number.isFinite(synced) &&
    now >= Math.max(approved, synced) + 14 * 86400000 &&
    !log.requiresDrillerAction && !mutations.some(m => m.entityId === log.id) &&
    !signatures.some(s => s.logId === log.id && s.state !== "uploaded") &&
    !intentions.some(i => i.logId === log.id && i.state !== "completed") &&
    !deliveries.some(d => d.logId === log.id);
}
