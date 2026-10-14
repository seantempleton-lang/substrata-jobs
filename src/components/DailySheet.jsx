import { Plus, ArrowRight, Clock3, Users, MapPin } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useEditorState } from "./DraftEditor";
import { editDailyLog } from "../domain/dailyLog";
import { displayTime } from "../domain/time";
import { sheetMaterials, sheetServices, sheetSubcontractors, sheetEntries, sheetItem, setSheetQuantity, setBoreDetail, setBoreDepth } from "../domain/dailySheet";
const SheetLocked = createContext(false);

// Keep unfinished input through a restart, but prefer the saved record when a
// dialog or another screen changes it. Pending keystrokes survive queued saves.
function useSheetValue(field, initial, save, reportError, numeric = false) {
  const [draft, setDraft] = useEditorState(field, null);
  const [pending, setPending] = useState(0);
  const base = String(initial ?? "");
  const value = draft && (pending > 0 || draft.base === base) ? draft.value : base;
  function change(next) {
    setDraft({ base, value: next });
    if (numeric && next !== "" && (!Number.isFinite(Number(next)) || Number(next) < 0)) return;
    setPending(count => count + 1);
    Promise.resolve(save(next)).catch(error => reportError(error.message)).finally(() => setPending(count => count - 1));
  }
  return [value, change];
}

function SheetInput({ field, label, initial = "", save, reportError, numeric = false, unit, placeholder, multiline = false }) {
  const locked = useContext(SheetLocked);
  const [value, change] = useSheetValue(field, initial, save, reportError, numeric);
  const props = { value, placeholder, disabled: locked, onChange: e => change(e.target.value), "aria-label": label };
  return <label className={`sheet-input ${multiline ? "wide" : ""}`}><span>{label}</span><div>{multiline ? <textarea {...props} rows={2} /> : <input {...props} type={numeric ? "number" : "text"} inputMode={numeric ? "decimal" : undefined} min={numeric ? "0" : undefined} step={numeric ? "any" : undefined} />}{unit && <small>{unit}</small>}</div></label>;
}

function Section({ number, title, children, action, hint }) {
  return <section className="daily-section" id={`daily-part-${number}`}><header><span className="daily-step">{number}</span><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>{action}</header>{children}</section>;
}

function jumpToSection(number) {
  const section = document.getElementById(`daily-part-${number}`), screen = section?.closest(".screen");
  if (screen) screen.scrollTo({ top: screen.scrollTop + section.getBoundingClientRect().top - screen.getBoundingClientRect().top - 56, behavior: "smooth" });
}

export default function DailySheet({ w, openSheet, launch }) {
  const log = w.log;
  const currentPoint = log.points.find(point => !point.endedAt);
  const [selected, select] = useEditorState("selectedBore", currentPoint?.id || log.points.at(-1)?.id || "");
  const point = log.points.find(point => point.id === selected) || currentPoint || log.points.at(-1);
  const pointId = point?.id || null, details = point?.dailyDetails || {};
  const current = log.activities.find(activity => !activity.endedAt);
  const reportError = w.setError;
  const persist = transform => w.persist(transform);
  const contextInput = (field, label, placeholder = "") => <SheetInput key={field} field={field} label={label} initial={log.setup?.[field]} placeholder={placeholder} reportError={reportError} save={value => persist(source => editDailyLog(source, next => { next.setup = { ...next.setup, [field]: value }; }))} />;
  const boreInput = (field, label, numeric = false, unit, initial) => <SheetInput key={`${pointId}:${field}`} field={`${pointId}:${field}`} label={label} initial={details[field] ?? initial} numeric={numeric} unit={unit} reportError={reportError} save={value => persist(source => setBoreDetail(source, pointId, field, value))} />;
  const quantity = preset => {
    const item = sheetItem(log, preset, pointId);
    return <SheetInput key={`${pointId}:${preset[0]}`} field={`${pointId}:quantity:${preset[0]}`} label={preset[1]} numeric initial={item?.quantity} unit={item?.unit || preset[2]} reportError={reportError} save={value => persist(source => setSheetQuantity(source, preset, pointId, value, w.workspace.catalogues?.items))} />;
  };
  const extras = log.items.filter(item => (item.pointSegmentId || null) === pointId && !sheetEntries.some(preset => preset[1] === item.itemLabelSnapshot));
  return <SheetLocked.Provider value={w.locked}><div className="daily-sheet">
    <div className="daily-sheet-heading"><div><p className="eyebrow">YOUR DAILY RECORD</p><h2>Daily log</h2></div><span className="daily-save" role="status">{w.busy ? "Saving…" : "Saved on device"}</span></div>
    <nav className="daily-jumps" aria-label="Daily log sections">{[["Bore", "1"], ["Work", "2"], ...(point ? [["Water", "3"]] : []), ["Materials", point ? "4" : "3"], ["Comments", point ? "7" : "6"]].map(([label, number]) => <button key={label} type="button" onClick={() => jumpToSection(number)}>{label}</button>)}</nav>
    <div className="daily-context"><div><span>CLIENT</span><strong>{log.job.clientName || "Not supplied by Ops"}</strong></div><div><span>JOB REF</span><strong>{log.job.jobNumber}</strong></div><div className="wide"><span>LOCATION</span><strong>{log.job.siteName || log.job.title}</strong>{log.job.siteAddress && <small>{log.job.siteAddress}</small>}</div><div><span>PLANT</span><strong>{log.equipment.equipmentCode}</strong></div><div><span>DAY / DATE</span><strong>{new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(log.shift.startedAt))}</strong></div></div>
    <Section number="1" title="Bore details" hint="Choose a bore to record its details and quantities.">
      <div className="bore-selector" role="group" aria-label="Bores on this daily log">{log.points.map(p => <button type="button" className={pointId === p.id ? "selected" : ""} aria-pressed={pointId === p.id} key={p.id} onClick={() => select(p.id)}><MapPin size={14} />{p.pointId}</button>)}</div>
      <button className="daily-point-action" disabled={w.locked || !!log.shift.endedAt} onClick={() => openSheet("point")} aria-label={`CURRENT POINT ${currentPoint?.pointId || "General site work"}`}><span>{currentPoint ? `Working on ${currentPoint.pointId}` : "Choose / change work point"}</span><ArrowRight size={16} /></button>
      <div className="daily-fields">{contextInput("consultant", "Consultant", "Consultant / company")}{point && <>{boreInput("boreSize", "Bore size", false, null, log.setup?.boreSize)}{boreInput("permitNumber", "Permit number (optional)")}{boreInput("gridReference", "Grid reference (optional)")}{boreInput("purpose", "Purpose of bore")}<SheetInput key={`${pointId}:startDepth`} field={`${pointId}:startDepth`} label="Starting bore depth" numeric unit="m" initial={point.startDepthM} reportError={reportError} save={value => persist(source => setBoreDepth(source, pointId, "startDepthM", value))} />{point.endedAt ? <SheetInput key={`${pointId}:endDepth`} field={`${pointId}:endDepth`} label="Finishing bore depth" numeric unit="m" initial={point.endDepthM} reportError={reportError} save={value => persist(source => setBoreDepth(source, pointId, "endDepthM", value))} /> : boreInput("currentDepthM", "Current bore depth", true, "m")}</>}</div>
      {!point && <p className="daily-hint">General site work is available below. Select a bore when drilling starts.</p>}
      {point && <div className="daily-progress"><span>{point.pointId} · {point.startDepthM ?? "—"} → {point.endDepthM ?? details.currentDepthM ?? "—"} m · {point.endStatus || "In progress"}</span><button disabled={w.locked} onClick={() => openSheet("progress", { point })}>Edit depth / status</button></div>}
    </Section>
    <Section number="2" title="Work details" hint="Start, finish and what the crew did." action={<button className="daily-link" disabled={w.locked} onClick={() => openSheet("shift")}><Clock3 size={15} />Shift times</button>}>
      <div className="work-table"><div className="work-table-head"><span>START</span><span>FINISH</span><span>WORK DETAILS</span></div>{log.activities.map(activity => <div className={`work-entry ${!activity.endedAt ? "current" : ""}`} key={activity.id}>
        <button className="work-entry-time" disabled={w.locked} onClick={() => openSheet("activity", { activity })} aria-label={`Edit times for ${activity.activityLabelSnapshot}`}>{displayTime(activity.startedAt).split(", ").at(-1)}<span>{activity.endedAt ? displayTime(activity.endedAt).split(", ").at(-1) : "In progress"}</span></button>
        <div className="work-entry-detail"><small>{activity.activityLabelSnapshot}{activity.pointSegmentId ? ` · ${log.points.find(p => p.id === activity.pointSegmentId)?.pointId}` : " · General work"}</small><SheetInput field={`work:${activity.id}`} label={`Work details from ${displayTime(activity.startedAt)}`} initial={activity.notes || ""} placeholder="What did you do? Add drilling method, depths and tests…" multiline reportError={reportError} save={value => persist(source => editDailyLog(source, next => { next.activities.find(a => a.id === activity.id).notes = value || null; }))} /></div>
      </div>)}</div>
      {current && <button className="primary-button daily-next" disabled={w.locked} onClick={() => openSheet("activity")}><Plus size={18} />Next work entry</button>}
      <p className="daily-hint">Use Next work entry to finish the current row and start the next at the same time. Times can be entered manually.</p>
    </Section>
    {point && <Section number="3" title="Water readings" hint={`For ${point.pointId} · leave unused readings blank.`}>
      <h4>Standing water level</h4><div className="daily-fields">{boreInput("waterLevelAm", "AM depth to water", true, "m")}{boreInput("waterLevelBoreDepthAm", "AM bore depth", true, "m")}{boreInput("waterLevelPm", "PM depth to water", true, "m")}{boreInput("waterLevelBoreDepthPm", "PM bore depth", true, "m")}</div>
      <p className="daily-hint">Record the bore depth at the time of each water-level reading.</p><h4>Water meter</h4><div className="daily-fields">{boreInput("waterMeterSerial", "Water meter serial")}<label className="sheet-input"><span>Meter units</span><select aria-label="Meter units" disabled={w.locked} value={details.waterMeterUnit || "L"} onChange={e => { const value = e.target.value; persist(source => setBoreDetail(source, pointId, "waterMeterUnit", value)).catch(error => reportError(error.message)); }}><option value="L">Litres (L)</option><option value="m³">Cubic metres (m³)</option></select></label>{boreInput("waterMeterStart", "Meter start reading", true, details.waterMeterUnit || "L")}{boreInput("waterMeterFinish", "Meter finish reading", true, details.waterMeterUnit || "L")}</div>
      {details.waterMeterStart != null && details.waterMeterFinish >= details.waterMeterStart && <p className="daily-meter-total">Water used: {Number((details.waterMeterFinish - details.waterMeterStart).toFixed(6))} {details.waterMeterUnit || "L"}</p>}
    </Section>}
    <Section number={point ? "4" : "3"} title="Materials used" hint={`${point?.pointId || "General site work"} · enter a quantity; blank means not recorded.`}>
      <div className="daily-fields daily-quantities">{sheetMaterials.slice(0, 5).map(quantity)}</div><details className="daily-more"><summary>More materials</summary><div className="daily-fields daily-quantities">{sheetMaterials.slice(5).map(quantity)}</div></details>
    </Section>
    <Section number={point ? "5" : "4"} title="Tests, site services & crew expenses" hint={point?.pointId || "General site work"}>
      <div className="daily-fields daily-quantities">{sheetServices.slice(0, 4).map(quantity)}</div><details className="daily-more"><summary>More services, accommodation & meals</summary><div className="daily-fields daily-quantities">{sheetServices.slice(4).map(quantity)}</div></details>
    </Section>
    <Section number={point ? "6" : "5"} title="Subcontractors" hint="Record use explicitly; leave unrecorded services blank.">
      {sheetSubcontractors.map(preset => {
        const item = sheetItem(log, preset, pointId);
        return <Subcontractor key={`${pointId}:${preset[0]}`} preset={preset} pointId={pointId} item={item} w={w} />;
      })}
    </Section>
    <Section number={point ? "7" : "6"} title="Crew & comments" action={<button className="daily-link" disabled={w.locked} onClick={() => openSheet("crewTab")}><Users size={15} />Edit crew</button>}>
      <div className="daily-crew"><span><small>DRILLER</small><strong>{log.owner.displayName}</strong></span><span><small>DRILL CREW</small><strong>{[...new Set(log.crew.map(p => p.displayNameSnapshot))].join(", ")}</strong></span></div>
      <SheetInput field="dailyComments" label="Daily comments" initial={log.notes} multiline placeholder="Site events, instructions, delays or anything the next shift should know…" reportError={reportError} save={value => persist(source => editDailyLog(source, next => { next.notes = value || null; }))} />
    </Section>
    <details className="daily-more daily-other"><summary>Other items & technical records</summary>{extras.map(item => <button className="option-row" disabled={w.locked} key={item.id} onClick={() => openSheet("item", { item })}>{item.itemLabelSnapshot} · {item.quantity} {item.unit}</button>)}<button className="secondary-button" disabled={w.locked} onClick={() => openSheet("item")}><Plus size={16} />Add another item</button><button className="secondary-button" disabled={w.locked} onClick={() => launch("project")}>Open bore in Substrata Field<ArrowRight size={16} /></button></details>
  </div></SheetLocked.Provider>;
}

function Subcontractor({ preset, pointId, item, w }) {
  const [value, change] = useSheetValue(`${pointId}:subcontractor:${preset[0]}`, item ? item.quantity > 0 ? "1" : "0" : "", next => w.persist(source => setSheetQuantity(source, preset, pointId, next, w.workspace.catalogues?.items)), w.setError);
  return <label className="daily-subcontractor"><span>{preset[1]}</span><select aria-label={preset[1]} disabled={w.locked} value={value} onChange={e => change(e.target.value)}><option value="">Not recorded</option><option value="1">Used</option><option value="0">Not used</option></select></label>;
}
