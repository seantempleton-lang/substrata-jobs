import PDFDocument from "pdfkit";
import { acknowledgementLabel } from "../src/domain/submission.js";

export const DRAFT_MARK = "DRAFT - Awaiting Supervisor Approval";
const time = value => value ? new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
const clean = value => String(value ?? "").replace(/[\u2010-\u2015]/g, "-").split("").filter(char => char.charCodeAt(0) >= 32 || char === "\n" || char === "\t").join("");

// Explicit client projection: internal fields cannot leak through generic
// serialization when more workflow/payroll fields are added later.
export function clientSections(log) {
  const point = id => log.points.find(p => p.id === id)?.pointId || "General site work";
  return [
    ["Shift and crew", [`${log.shift.label} shift | ${time(log.shift.startedAt)} to ${time(log.shift.endedAt)} (New Zealand time)`, `Primary driller: ${log.owner.displayName}`,
      ...log.crew.map(p => `${p.displayNameSnapshot}${p.roleSnapshot ? ` - ${p.roleSnapshot}` : ""} | ${time(p.attendedFrom)} to ${time(p.attendedTo)}`)]],
    ["Point progress", log.points.length ? log.points.map(p => `${p.pointId} | ${p.startDepthM ?? "Not recorded"} to ${p.endDepthM ?? "Not recorded"} m | ${p.endStatus || "Not recorded"}\n${time(p.startedAt)} to ${time(p.endedAt)}`) : ["General site work; no points recorded."]],
    ["Bore and setup", Object.entries(log.setup || {}).filter(([key, value]) => ["boreSize", "details", "drillingMethod", "setupNotes", "casing", "waterSupply"].includes(key) && value).map(([key, value]) => `${key.replace(/([A-Z])/g, " $1")}: ${value}`)],
    ["Activities", [...log.activities].sort((a, b) => a.sequence - b.sequence).map(a => `${time(a.startedAt)} to ${time(a.endedAt)} | ${point(a.pointSegmentId)}\n${a.activityLabelSnapshot}${a.notes ? `\n${a.notes}` : ""}`)],
    [log.division === "Water" ? "Materials, services and readings" : "Materials, services and measurements", log.items.length ? log.items.map(i => `${i.itemLabelSnapshot} | ${i.quantity} ${i.unit} | ${point(i.pointSegmentId)}${i.notes ? `\n${i.notes}` : ""}`) : ["No quantities or readings recorded."]],
    ["Comments", [log.notes || "No daily comments recorded."]],
    ["Client acknowledgement", [acknowledgementLabel(log.clientAcknowledgement),
      ...(log.clientAcknowledgement.signerName ? [`Representative: ${log.clientAcknowledgement.signerName}${log.clientAcknowledgement.companyRole ? ` - ${log.clientAcknowledgement.companyRole}` : ""}`] : []),
      ...(log.clientAcknowledgement.signedAt ? [`Signed: ${time(log.clientAcknowledgement.signedAt)}`] : []),
      ...(log.clientAcknowledgement.reasonNotes ? [log.clientAcknowledgement.reasonNotes] : []),
      "Acknowledgement records the work presented on this device. It does not constitute supervisor approval or agreement to charges."]],
  ].filter(([, lines]) => lines.length);
}

export function renderDraftPdf(log, revision, signature = null) {
  if (log.logType !== "rig_shift") throw new Error("Ancillary records have no client PDF.");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 115, bottom: 65, left: 44, right: 44 }, bufferPages: true,
      info: { Title: `Substrata daily record - ${log.job.jobNumber} - revision ${revision}`, Author: "Substrata" } });
    const chunks = []; doc.on("data", chunk => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const width = doc.page.width - 88;
    const header = () => {
      doc.save();
      doc.roundedRect(44, 29, 32, 32, 7).fill("#0f1e2e");
      for (const [y, opacity] of [[37, 0.3], [43, 0.6], [49, 1]]) doc.strokeOpacity(opacity).strokeColor("white").lineWidth(2).moveTo(50, y).lineTo(60, y + 6).lineTo(70, y).stroke();
      doc.strokeOpacity(1).strokeColor("#f59e0b").moveTo(60, 32).lineTo(60, 50).stroke();
      doc.font("Helvetica-Bold").fontSize(17).fillColor("#0f1e2e").text("SUBSTRATA", 86, 31, { lineBreak: false });
      doc.font("Helvetica").fontSize(9).text("DAILY FIELD RECORD", 86, 52, { lineBreak: false });
      doc.roundedRect(44, 74, width, 23, 3).fill("#fff1cf");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#704a0a").text(DRAFT_MARK, 54, 81, { lineBreak: false });
      doc.restore(); doc.x = 44; doc.y = 115;
    };
    // Paint headers only after flowing text. Calling doc.text inside pageAdded
    // interferes with PDFKit's active wrapping engine for long descriptions.
    doc.x = 44; doc.y = 115;
    const text = (value, bold = false) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor("#182b3c").text(clean(value), { width, lineGap: 3 }); doc.moveDown(0.55); };
    text(`Job ${log.job.jobNumber} | ${log.division} | ${log.equipment.equipmentCode}`, true);
    text(log.job.title); text(`Client: ${log.job.clientName || "Not recorded"}\nSite: ${log.job.siteName || "Not recorded"}${log.job.siteAddress ? ` - ${log.job.siteAddress}` : ""}\nDocument revision: ${revision}`);
    for (const [heading, lines] of clientSections(log)) {
      const needed = heading === "Client acknowledgement" && signature ? 300 : 125;
      if (doc.y > doc.page.height - needed) doc.addPage();
      text(heading, true);
      for (const line of lines) text(line);
    }
    if (signature && log.clientAcknowledgement.status === "signed_on_device") {
      if (doc.y > doc.page.height - 200) { doc.addPage(); text("Client signature (continued)", true); }
      const y = doc.y;
      doc.save().roundedRect(44, y, 280, 112, 3).lineWidth(0.6).strokeColor("#b9c3ce").stroke();
      doc.strokeColor("#182b3c").lineWidth(1.5).lineCap("round").lineJoin("round");
      for (const stroke of signature.strokes) {
        stroke.forEach(([x, sy], index) => index ? doc.lineTo(50 + x * 268, y + 6 + sy * 100.5) : doc.moveTo(50 + x * 268, y + 6 + sy * 100.5)); doc.stroke();
      }
      doc.restore(); doc.y = y + 126;
    }
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i); header(); doc.save();
      doc.font("Helvetica").fontSize(8).fillColor("#667582").text(`Job ${clean(log.job.jobNumber)} | Revision ${revision} | Page ${i + 1} of ${range.count}`, 44, doc.page.height - 43, { lineBreak: false });
      doc.restore();
    }
    doc.end();
  });
}
