import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, CloudOff, Database, Droplets, FileText, HardHat, History, MapPin, Menu, Plus, RefreshCw, Settings2, Shovel, Users, Wrench, X } from "lucide-react";
import useWorkspace from "./foundation/useWorkspace";
import { createFieldHandoff, getOfficeLogs, getPoints, getServerLog } from "./foundation/api";
import { clearEditor, getEditor, putEditor, getDailyLog, getQueueState, resolveLocalConflict } from "./foundation/offlineStore";
import { changePoint, continueDailyLog, correctActivity, createDailyLog, editDailyLog, endShift, startNextActivity, attendanceConflicts } from "./domain/dailyLog";
import { displayTime, elapsed } from "./domain/time";
import { ActivityForm, AttendanceForm, BoreSetup, ItemForm, Notes, PointForm, PointProgressForm, SetupScreen, ShiftForm, UserPicker } from "./components/LogForms";
import DraftEditor from "./components/DraftEditor";
import SubmissionReview, { AcknowledgementForm } from "./components/SubmissionReview";
import { contentHash, workContent } from "./domain/submission";
import DailySheet from "./components/DailySheet";

const activePoint = log => log.points.find(point => !point.endedAt);

export default function App({ foundation }) {
  const w = useWorkspace(foundation);
  const [screen, setScreen] = useState(null), [selection, setSelection] = useState(null), [previous, setPrevious] = useState(null);
  const [tab, setTab] = useState("work"), [sheet, setSheet] = useState(null), [myOnly, setMyOnly] = useState(true);
  const [officeLogs, setOfficeLogs] = useState(null);
  const [uiReady, setUiReady] = useState(false);
  const view = !w.log && ["active", "review"].includes(screen) ? "home" : screen || (w.log ? "active" : "home"), log = w.log;
  const catalogue = w.workspace?.catalogues || {}, users = w.workspace?.personnel || [foundation.user], assignments = w.workspace?.assignments || [];
  const reportError = w.setError;
  const editorId = `${foundation.user.userId}:${view === "setup" ? `setup:${selection?.assignmentId || "ancillary"}:${previous?.id || "new"}` : `${log?.id}:${sheet?.type}:${sheet?.activity?.id || sheet?.person?.id || sheet?.item?.id || sheet?.point?.id || "new"}`}`;
  useEffect(() => {
    if (!w.ready) return;
    let cancelled = false;
    getEditor(`ui:${foundation.user.userId}`).then(saved => {
      if (cancelled) return;
      if (saved && !w.returnedFromField) {
        setScreen(saved.screen === "office" ? "home" : saved.screen); setTab(saved.tab || "work");
        setSelection(saved.selection); setPrevious(saved.previous); setSheet(saved.sheet);
      }
      setUiReady(true);
    }).catch(error => reportError(error.message));
    return () => { cancelled = true; };
  }, [w.ready, w.returnedFromField, foundation.user.userId, reportError]);
  useEffect(() => {
    if (uiReady) putEditor(`ui:${foundation.user.userId}`, { screen, tab, selection, previous, sheet }).catch(error => reportError(error.message));
  }, [uiReady, foundation.user.userId, screen, tab, selection, previous, sheet, reportError]);
  async function perform(action, close = true) {
    try { await action(); if (close) { await clearEditor(editorId); setSheet(null); } } catch (error) { w.setError(error.message); }
  }
  const mutate = transform => perform(() => w.persist(transform));
  function setup(assignment, source = null) { setSelection(assignment); setPrevious(source); setScreen("setup"); }
  async function start(details) {
    await perform(async () => {
      const record = previous ? continueDailyLog(previous, { ...details, owner: foundation.user }) : createDailyLog({ ...details, assignment: selection, owner: foundation.user, ancillary: !selection?.job });
      await w.persist(record); setScreen("active");
    });
  }
  async function launch(module) {
    await perform(async () => {
      if (!w.online) throw new Error("Reconnect to launch Substrata Field. Your log remains saved offline.");
      await w.sync();
      const latest = await getDailyLog(log.id), mutations = await getQueueState(foundation.user.userId);
      if (mutations.some(m => m.entityId === log.id) || !latest.serverRevision) throw new Error("Complete synchronization before opening Field.");
      const response = await createFieldHandoff({ contractVersion: "1.0", dailyLogId: log.id, jobNumber: log.job.jobNumber,
        pointId: activePoint(latest)?.pointId || "", requestedModule: module, returnUrl: window.location.origin });
      window.location.assign(response.launchUrl);
    });
  }
  const back = () => { setSheet(null); setScreen(view === "review" ? "active" : "home"); };
  return <div className="app-shell">
    <aside className="desktop-context"><img className="brand-mark" src="/favicon.svg" alt="" /><p className="eyebrow">SUBSTRATA JOBS</p><h1>The field record,<br />from shift to sign-off.</h1><p className="desktop-copy">Your shift, crew and site work, saved as you go.</p><div className="context-rule" /><p className="context-label">FIELD WORKSPACE</p><p className="context-value">{foundation.user.displayName}</p></aside>
    <main className="device">
      <header className="topbar"><div className="topbar-title"><img className="mini-mark" src="/favicon.svg" alt="Substrata" />{view !== "home" && <button className="icon-button light" onClick={back} aria-label="Go back"><ArrowLeft size={20} /></button>}<div><span className="topbar-kicker">SUBSTRATA</span><strong>Jobs</strong></div></div><button className={`sync-chip ${!w.online ? "offline" : ""}`} onClick={() => setSheet({ type: "sync" })}>{w.online ? <RefreshCw size={14} /> : <CloudOff size={14} />}{w.syncing ? "Syncing" : log ? w.status(log) : w.online ? "Online" : "Offline"}</button></header>
      {w.error && <div className="workspace-error" role="alert"><span>{w.error}</span><button onClick={() => w.setError("")} aria-label="Dismiss error"><X size={16} /></button>{w.error.includes("Sign in") && <button onClick={foundation.reauthenticate}>Sign in</button>}</div>}
      {!w.ready && <div className="screen form-section"><p>Restoring your field workspace…</p></div>}
      {w.ready && view === "home" && <div className="screen assignments-screen">
        <section className="page-heading"><div><p className="date-label">PLANNED WORK</p><h2>Your field workspace</h2><p>{foundation.user.displayName}</p></div><button className="icon-button" onClick={() => setSheet({ type: "menu" })} aria-label="Workspace menu"><Menu size={20} /></button></section>
        {!w.online && <div className="info-strip"><CloudOff size={17} />Offline · cached assignments and catalogues</div>}
        <div className="filter-row"><button className={`filter-pill ${myOnly ? "active" : ""}`} onClick={() => setMyOnly(!myOnly)}><Check size={14} />My assignments only</button><button className="filter-pill" disabled={!w.online || w.syncing} onClick={w.sync}><RefreshCw size={14} />Refresh</button></div>
        <div className="section-title"><span>Planned assignments</span><span>Next 14 days</span></div><div className="assignment-list">{assignments.filter(a => !myOnly || a.isMine).map(a => <AssignmentCard key={a.assignmentId} assignment={a} choose={() => setup(a)} />)}{!assignments.filter(a => !myOnly || a.isMine).length && <p className="helper-text">No assignments in this window. Refresh online or view all assignments.</p>}</div>
        <div className="section-title space-top"><span>Other work</span></div><button className="ancillary-card" onClick={() => setup(null)}><Wrench size={24} /><span><strong>Start ancillary workday</strong><small>Individual or group · no job or rig required</small></span><ArrowRight size={18} /></button>
        <div className="section-title"><span>My records</span></div><div className="assignment-list record-list">{w.logs.map(record => <button className="assignment-card" key={record.id} onClick={() => perform(async () => { await w.open(record); setScreen("active"); setTab("work"); })}><div className="record-line"><strong>{record.job ? `Job ${record.job.jobNumber} · ${record.equipment.equipmentCode}` : "Ancillary workday"}</strong><span className="valid-chip">{w.status(record)}</span></div><p className="helper-text">{displayTime(record.shift.startedAt)} · {record.shift.endedAt ? "Shift ended" : "In progress"} · {record.status}</p></button>)}{!w.logs.length && <p className="helper-text">Your saved records will appear here.</p>}</div>
      </div>}
      {w.ready && uiReady && view === "setup" && <DraftEditor key={editorId} id={editorId} reportError={w.setError}><SetupScreen assignment={selection} previous={previous} users={users} owner={foundation.user} catalogue={catalogue} busy={w.busy} start={start} /></DraftEditor>}
      {w.ready && view === "active" && log && <div className="screen active-screen">
        <section className="active-header"><div><span className="live-dot">{log.shift.endedAt ? "SHIFT ENDED" : "LIVE"}</span><h2>{log.job ? `Job ${log.job.jobNumber}` : "Ancillary workday"}</h2><p>{log.equipment?.equipmentCode || "Group / individual record"} · {log.shift.label} · {displayTime(log.shift.startedAt)}</p></div><div className="elapsed"><span>SHIFT</span><strong>{elapsed(log.shift.startedAt, log.shift.endedAt || w.currentTime)}</strong></div></section>
        {w.locked && <div className="info-strip">{w.intention ? "Submission pending · recorded work is frozen" : "Submitted record · recorded work is immutable"}</div>}
        <fieldset className="record-fields" disabled={w.locked && !(tab === "work" && log.logType === "rig_shift")}><div className="tab-content">
          {tab === "work" && log.logType === "rig_shift" && <DraftEditor id={`daily-sheet:${foundation.user.userId}:${log.id}`} reportError={w.setError}><DailySheet w={w} openSheet={(type, details = {}) => type === "crewTab" ? setTab("crew") : setSheet({ type, ...details })} launch={launch} /></DraftEditor>}
          {tab === "work" && log.logType !== "rig_shift" && <>
            {log.job && <button className="point-banner" disabled={!!log.shift.endedAt} onClick={() => setSheet({ type: "point" })}><span><MapPin size={18} /><span><small>CURRENT POINT</small><strong>{activePoint(log)?.pointId || "General site work"}</strong></span></span><span>{activePoint(log)?.startDepthM ?? "—"} m<ArrowRight size={17} /></span></button>}
            {log.activities.filter(a => !a.endedAt).map(a => <div className="current-activity" key={a.id}><div className="activity-label"><span className="pulse" />CURRENT ACTIVITY</div><h3>{a.activityLabelSnapshot}</h3><p>{a.notes || "Whole crew"}</p><div className="activity-clock"><Clock3 size={19} /><span>{displayTime(a.startedAt)}</span><strong>{elapsed(a.startedAt, w.currentTime)}</strong></div><div className="allocation-chip">{allocationLabel(a)}</div></div>)}
            {!log.shift.endedAt && <button className="primary-button large" disabled={w.busy} onClick={() => setSheet({ type: "activity" })}><Plus size={19} />Start next activity now</button>}
            <div className="quick-grid"><button onClick={() => setTab("crew")}><Users size={20} /><span>Crew attendance</span><small>{new Set(log.crew.map(p => p.userId || p.displayNameSnapshot)).size} people</small></button><button onClick={() => setSheet({ type: "shift" })}><Clock3 size={20} /><span>Shift timing</span><small>Edit exact timestamps</small></button>{log.job && <><button onClick={() => setTab("data")}><Database size={20} /><span>Site data</span><small>{log.items.length} items recorded</small></button><button onClick={() => setSheet({ type: "field" })}><Shovel size={20} /><span>Substrata Field</span><small>Technical records and points</small></button></>}</div>
            <div className="recent-block"><div className="section-title"><span>Recent activities</span><button onClick={() => setTab("timeline")}>View all</button></div>{log.activities.slice(-3).map(a => <TimelineRow key={a.id} activity={a} log={log} edit={() => setSheet({ type: "activity", activity: a })} />)}</div>
            <Notes key={`work:${log.id}`} log={log} persist={w.persist} error={w.setError} />
            {!!log.points.length && <div className="form-card"><h3>Point progress</h3>{log.points.map(p => <button className="option-row" key={p.id} onClick={() => setSheet({ type: "progress", point: p })}>{p.pointId} · {p.startDepthM ?? "—"} → {p.endDepthM ?? "—"} m · {p.endStatus || "In progress"}</button>)}</div>}
          </>}
          {tab === "timeline" && <><div className="tab-heading"><h3>Activity timeline</h3></div><p className="helper-text">Editing a boundary also updates the adjacent activity.</p>{log.activities.map(a => <TimelineRow key={a.id} activity={a} log={log} edit={() => setSheet({ type: "activity", activity: a })} />)}</>}
          {tab === "crew" && <><div className="tab-heading"><h3>Crew attendance</h3><button className="icon-button" onClick={() => setSheet({ type: "crew" })} aria-label="Add crew member"><Plus size={18} /></button></div>{log.crew.map(p => <button className="attendance-card" key={p.id} onClick={() => setSheet({ type: "attendance", person: p })}><span className="avatar large-avatar">{initials(p.displayNameSnapshot)}</span><div><strong>{p.displayNameSnapshot}</strong><p>{p.roleSnapshot}</p><span>{displayTime(p.attendedFrom)} → {displayTime(p.attendedTo)}</span></div><span className={p.attendedTo ? "left-chip" : "on-chip"}>{p.attendedTo ? "Left" : "On shift"}</span></button>)}<p className="helper-text">Add a new attendance period when someone leaves and returns.</p>{attendanceConflicts(log, w.logs).map((conflict, i) => <div className="workspace-error" key={i}>{conflict.person} also has attendance on {conflict.otherReference}. Resolve overlaps before future payroll export.</div>)}</>}
          {tab === "data" && <><div className="tab-heading"><h3>{log.job ? "Site data" : "Workday details"}</h3>{log.job && <button className="icon-button" onClick={() => setSheet({ type: "item" })} aria-label="Add site item"><Plus size={18} /></button>}</div>{log.job && <><button className="detail-link" onClick={() => setSheet({ type: "setup" })}><Settings2 size={20} /><span><strong>Bore size and setup</strong><small>{log.setup?.boreSize || "No bore size entered"}</small></span><ArrowRight size={18} /></button>{log.items.map(item => <button className="detail-link" key={item.id} onClick={() => setSheet({ type: "item", item })}><Database size={20} /><span><strong>{item.itemLabelSnapshot}</strong><small>{item.quantity} {item.unit} · {item.notes}</small></span><ArrowRight size={18} /></button>)}</>}<Notes key={`details:${log.id}`} log={log} persist={w.persist} error={w.setError} /></>}
        </div></fieldset>
        <div className="finish-row"><button className="finish-button" onClick={() => log.shift.endedAt ? setScreen("review") : setSheet({ type: "finish" })}>{log.shift.endedAt ? "Review completed shift" : "End shift now"}<ArrowRight size={17} /></button></div>
        <nav className="bottom-nav">{[["work", HardHat, log.job ? "Daily log" : "Work"], ["timeline", History, log.job ? "Work details" : "Timeline"], ["crew", Users, "Crew"], ["data", Database, log.job ? "More" : "Details"]].map(([id, Icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
      </div>}
      {view === "review" && log && <SubmissionReview w={w} edit={field => { if (field === "clientAcknowledgement") { setSheet({ type: "acknowledgement" }); return; } setScreen("active"); setTab(field === "crew" ? "crew" : field === "items" ? "data" : field === "points" ? "work" : "timeline"); if (field?.startsWith("shift")) setSheet({ type: "shift" }); }} acknowledge={() => setSheet({ type: "acknowledgement" })} continueWork={() => setup(assignments.find(a => a.assignmentId === log.assignmentId) || log.assignmentSnapshot, log)} />}
      {view === "office" && <div className="screen form-section"><h2>Structured field records</h2><p className="helper-text">Read-only office view. Approval and corrections follow in Step 6.</p>{officeLogs?.map(record => <details className="form-card" key={record.id}><summary>{record.job?.jobNumber || "Ancillary"} · {record.owner.displayName} · {displayTime(record.shift.startedAt)}</summary><pre className="record-json">{JSON.stringify(record, null, 2)}</pre></details>)}</div>}
      {uiReady && sheet && <BottomSheet title={sheetTitle(sheet.type)} close={() => setSheet(null)}><DraftEditor key={editorId} id={editorId} reportError={w.setError}>
        {log && sheet.type === "acknowledgement" && !w.locked && <AcknowledgementForm log={log} busy={w.busy} reportError={w.setError} save={(ack, asset) => perform(() => w.persist(async source => {
          if (asset && await contentHash(workContent(source)) !== ack.contentHash) throw new Error("Recorded work changed while signing. Review it before capturing a new signature.");
          return editDailyLog(source, next => { next.clientAcknowledgement = ack; });
        }, asset))} />}
        {sheet.type === "menu" && <><button className="secondary-button" onClick={() => setSheet({ type: "sync" })}><RefreshCw size={18} />Sync status</button>{["Supervisor", "Administrator", "SuperUser"].includes(foundation.user.appRole) && <button className="secondary-button" onClick={() => perform(async () => { setOfficeLogs((await getOfficeLogs()).logs); setScreen("office"); })}><FileText size={18} />Office records</button>}<button className="text-button" onClick={foundation.logout}>Sign out</button></>}
        {sheet.type === "sync" && <><p className="sheet-intro">{w.online ? "Connected" : "Offline"} · {w.queue.length} queued changes. Work is saved on this device before upload.</p><button className="primary-button" disabled={!w.online || w.syncing} onClick={w.sync}>{w.syncing ? "Syncing…" : "Sync now"}</button>{w.logs.map(record => <div className="form-card" key={record.id}><strong>{record.job?.jobNumber || "Ancillary"} · {w.status(record)}</strong>{w.queue.filter(m => m.entityId === record.id).map(m => <p className="helper-text" key={m.mutationId}>{m.message || m.queueStatus}</p>)}{(w.queue.some(m => m.entityId === record.id && ["conflict", "rejected"].includes(m.queueStatus)) || w.intentions.some(i => i.logId === record.id && i.state === "conflict")) && <button className="secondary-button" disabled={!w.online} onClick={() => perform(async () => { const { log: server } = await getServerLog(record.id); setSheet({ type: "conflict", local: record, server }); }, false)}>Review server version</button>}</div>)}</>}
        {sheet.type === "conflict" && <><p className="sheet-intro">Compare both versions before choosing. Both copies are retained on this device.</p><details><summary>Device version</summary><pre className="record-json">{JSON.stringify(sheet.local, null, 2)}</pre></details><details><summary>Server version · revision {sheet.server.serverRevision}</summary><pre className="record-json">{JSON.stringify(sheet.server, null, 2)}</pre></details>{["server", "local"].map(choice => <button key={choice} className="secondary-button" disabled={choice === "local" && !["draft", "returned", "reopened"].includes(sheet.server.status)} onClick={() => perform(async () => { const resolved = await resolveLocalConflict(sheet.local, sheet.server, choice); if (log?.id === resolved.id) await w.open(resolved); await w.refresh(); })}>{choice === "server" ? "Use server version" : "Keep device version and retry"}</button>)}</>}
        {log && sheet.type === "activity" && <ActivityForm log={log} activity={sheet.activity} catalogue={catalogue} jobs={[...new Map(assignments.filter(a => a.job).map(a => [a.job.jobId, a.job])).values()]} busy={w.busy} save={(details, at) => mutate(source => sheet.activity ? correctActivity(source, sheet.activity.id, details) : editDailyLog(startNextActivity(source, { code: details.activityCode, label: details.activityLabelSnapshot, allocation: details.allocation, notes: details.notes }, at), next => { next.activities.at(-1).pointSegmentId = details.pointSegmentId; }))} />}
        {log && ["point", "finish"].includes(sheet.type) && <PointForm log={log} finish={sheet.type === "finish"} points={log.assignmentSnapshot?.points || assignments.find(a => a.assignmentId === log.assignmentId)?.points || []} busy={w.busy} refreshPoints={() => perform(async () => { const { points } = await getPoints(log.job.jobNumber); await w.persist(source => editDailyLog(source, next => { next.assignmentSnapshot = { ...next.assignmentSnapshot, points }; })); }, false)} launch={() => launch("project")} save={(details, at) => mutate(source => sheet.type === "finish" ? endShift(source, details, at) : changePoint(source, details, at))} />}
        {log && sheet.type === "crew" && <UserPicker users={users} owner={foundation.user} division={log.division} choose={person => mutate(source => editDailyLog(source, next => { next.crew.push({ id: crypto.randomUUID(), userId: person.userId, employeeCodeSnapshot: person.employeeCode, displayNameSnapshot: person.displayName, roleSnapshot: person.roleTitle, attendedFrom: next.shift.endedAt ? next.shift.startedAt : new Date().toISOString(), attendedTo: next.shift.endedAt }); }))} />}
        {log && sheet.type === "attendance" && <AttendanceForm person={sheet.person} log={log} busy={w.busy} save={details => mutate(source => editDailyLog(source, next => Object.assign(next.crew.find(p => p.id === sheet.person.id), details)))} remove={() => mutate(source => editDailyLog(source, next => { next.crew = next.crew.filter(p => p.id !== sheet.person.id); }))} />}
        {log && sheet.type === "item" && <ItemForm item={sheet.item} catalogue={catalogue} log={log} busy={w.busy} save={item => mutate(source => editDailyLog(source, next => { const index = next.items.findIndex(i => i.id === item.id); if (index < 0) next.items.push(item); else next.items[index] = item; }))} remove={() => mutate(source => editDailyLog(source, next => { next.items = next.items.filter(i => i.id !== sheet.item.id); }))} />}
        {log && sheet.type === "shift" && <ShiftForm log={log} busy={w.busy} save={details => mutate(source => editDailyLog(source, next => {
          const before = { ...next.shift }; Object.assign(next.shift, details); next.activities[0].startedAt = details.startedAt; next.activities.at(-1).endedAt = details.endedAt;
          for (const p of next.crew) { if (p.attendedFrom === before.startedAt) p.attendedFrom = details.startedAt; if (p.attendedTo === before.endedAt) p.attendedTo = details.endedAt; }
          for (const p of next.points) { if (p.startedAt === before.startedAt) p.startedAt = details.startedAt; if (p.endedAt && p.endedAt === before.endedAt) p.endedAt = details.endedAt; }
        }))} />}
        {log && sheet.type === "setup" && <BoreSetup log={log} save={details => mutate(source => editDailyLog(source, next => { next.setup = details; }))} />}
        {log && sheet.type === "progress" && <PointProgressForm point={sheet.point} busy={w.busy} save={details => mutate(source => editDailyLog(source, next => Object.assign(next.points.find(p => p.id === sheet.point.id), details)))} />}
        {log && sheet.type === "field" && <><p className="sheet-intro">Open the active point in Field, or create a missing point there. Field may ask you to sign in.</p>{[["project", "Projects and point creation"], ["geology", "Geology"], ["spt", "SPT"], ["core", "Core"], ["installation", "Installations"], ["consumables", "Consumables"], ["photos", "Photos"]].map(([module, label]) => <button className="secondary-button" key={module} onClick={() => launch(module)}>{label}<ArrowRight size={17} /></button>)}</>}
      </DraftEditor></BottomSheet>}
    </main>
  </div>;
}

function AssignmentCard({ assignment: a, choose }) {
  const Icon = !a.job ? Wrench : a.job.division === "Water" ? Droplets : Shovel, tone = !a.job ? "green" : a.job.division === "Water" ? "blue" : "gold";
  return <button className="assignment-card" onClick={choose}><div className="assignment-card-top"><span className={`assignment-icon ${tone}`}><Icon size={23} /></span><span className="assignment-code"><span>{a.job?.division || "Ancillary"}</span><strong>{a.job ? `Job ${a.job.jobNumber}` : a.title}</strong></span>{!a.isMine && <span className="today-badge">OTHER CREW</span>}</div><h3>{a.job?.title || a.title}</h3><p className="client-name">{a.job?.clientName}</p><div className="assignment-meta"><span><MapPin size={14} />{a.job?.siteName || "Ancillary work"}</span><span>{a.equipment?.equipmentCode}</span><span>{a.startsOn} → {a.endsOn}</span></div><div className="crew-stack">{a.personnel.map(p => <span className="avatar" key={p.userId}>{initials(p.displayName)}</span>)}<small>{a.personnel.map(p => p.displayName).join(", ")}</small><ArrowRight size={18} /></div></button>;
}
function initials(name) { return name.split(" ").map(part => part[0]).slice(0, 2).join(""); }
function allocationLabel(a) { return a.allocation.type === "job" ? `Job ${a.allocation.jobNumber}` : `Ancillary · ${a.allocation.ancillaryCode}`; }
function TimelineRow({ activity: a, log, edit }) { return <button className={`timeline-row timeline-button ${!a.endedAt ? "active" : ""}`} onClick={edit}><div className="timeline-time"><strong>{displayTime(a.startedAt)}</strong><span>{displayTime(a.endedAt)}</span></div><div className="timeline-line"><span /></div><div className="timeline-copy"><strong>{a.activityLabelSnapshot}</strong><p>{log.points.find(p => p.id === a.pointSegmentId)?.pointId || "General work"} · {a.notes}</p><small>{allocationLabel(a)}</small></div><ArrowRight size={17} /></button>; }
function BottomSheet({ title, close, children }) { return <div className="sheet-overlay"><button className="sheet-scrim" onClick={close} aria-label="Close dialog" /><section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" /><div className="sheet-header"><h3>{title}</h3><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>{children}</section></div>; }
function sheetTitle(type) { return { acknowledgement: "Client acknowledgement", menu: "Workspace", sync: "Sync status", conflict: "Resolve synchronization", activity: "Activity", point: "Change work point", progress: "Point progress", finish: "End shift", crew: "Add crew member", attendance: "Crew attendance", item: "Site item", shift: "Shift timing", setup: "Bore and setup", field: "Open Substrata Field" }[type]; }
