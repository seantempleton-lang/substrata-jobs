import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CloudOff,
  Database,
  Download,
  Droplets,
  FileText,
  Gauge,
  HardHat,
  History,
  Mail,
  MapPin,
  Menu,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  Route,
  Send,
  Settings2,
  Shovel,
  Signal,
  TimerReset,
  Users,
  Wrench,
  X,
} from "lucide-react";

function localTimeNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function defaultShiftFor(assignmentId) {
  if (assignmentId === "water") return { startTime: "06:30", endTime: "16:30", shiftType: "day" };
  if (assignmentId === "ancillary") return { startTime: "07:00", endTime: "15:30", shiftType: "day" };
  return { startTime: "07:00", endTime: "17:00", shiftType: "day" };
}

const assignments = [
  {
    id: "geotech",
    division: "Geotech",
    icon: Shovel,
    job: "302670",
    client: "Waka Kotahi NZ Transport Agency",
    title: "Northern Corridor ground investigation",
    location: "SH1, Albany",
    rig: "N107",
    shift: "Day · 07:00–17:00",
    crew: ["Sean Templeton", "Leah Baxter", "Tama Rangi"],
    points: ["BH5049", "BH5050"],
    detail: "Rotary sonic drilling · SPT · groundwater observations",
    tone: "gold",
  },
  {
    id: "water",
    division: "Water",
    icon: Droplets,
    job: "302684",
    client: "Watercare Services Limited",
    title: "Rural production bore programme",
    location: "Helensville, Auckland",
    rig: "W12",
    shift: "Day · 06:30–16:30",
    crew: ["Sean Templeton", "Wiremu Te Aho"],
    points: ["WB-03"],
    detail: "Mud rotary drilling · casing installation · development",
    tone: "blue",
  },
  {
    id: "ancillary",
    division: "Ancillary",
    icon: Wrench,
    job: null,
    client: null,
    title: "Workshop and non-job travel",
    location: "Auckland yard",
    rig: "No rig required",
    shift: "Day · 07:00–15:30",
    crew: ["Sean Templeton", "Leah Baxter", "Tama Rangi"],
    points: [],
    detail: "Group record · workshop maintenance · non-job travel",
    tone: "green",
  },
];

const activitySeed = {
  geotech: [
    { id: 1, start: "07:00", end: "07:20", name: "Pre-start and site setup", allocation: "Job 302670", meta: "Site-wide" },
    { id: 2, start: "07:20", end: "09:35", name: "Rotary sonic drilling", allocation: "Job 302670", meta: "BH5049 · 0.0–8.5 m" },
    { id: 3, start: "09:35", end: null, name: "SPT and sampling", allocation: "Job 302670", meta: "BH5049 · 8.5 m" },
  ],
  water: [
    { id: 1, start: "06:30", end: "07:00", name: "Pre-start and site setup", allocation: "Job 302684", meta: "WB-03" },
    { id: 2, start: "07:00", end: null, name: "Mud rotary drilling", allocation: "Job 302684", meta: "WB-03 · 0.0–18.0 m" },
  ],
  ancillary: [
    { id: 1, start: "07:00", end: "08:10", name: "Non-job travel", allocation: "Ancillary · Travel", meta: "Yard to supplier return" },
    { id: 2, start: "08:10", end: null, name: "Workshop maintenance", allocation: "Ancillary · Workshop", meta: "N107 drill-head service" },
  ],
};

const activityOptions = {
  geotech: ["Rotary sonic drilling", "SPT and sampling", "Standpipe installation", "Backfill and reinstatement", "Breakdown / delay"],
  water: ["Mud rotary drilling", "Casing installation", "Air-lift development", "Pumping test", "Breakdown / delay"],
  ancillary: ["Workshop maintenance", "Yard duties", "Non-job travel", "Training", "Leave / other paid time"],
};

function App({ foundation }) {
  const [screen, setScreen] = useState(() => localStorage.getItem("sj-screen") || "assignments");
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("sj-scenario") || "geotech");
  const [myOnly, setMyOnly] = useState(true);
  const [activeTab, setActiveTab] = useState("work");
  const [sheet, setSheet] = useState(null);
  const [online, setOnline] = useState(foundation?.mode !== "offline");
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState("");
  const [activities, setActivities] = useState(() => activitySeed[selectedId]);
  const [point, setPoint] = useState(selectedId === "geotech" ? "BH5049" : selectedId === "water" ? "WB-03" : "No point");
  const [currentTime, setCurrentTime] = useState(localTimeNow);
  const [shift, setShift] = useState(() => defaultShiftFor(selectedId));

  const selected = useMemo(() => assignments.find((item) => item.id === selectedId), [selectedId]);

  useEffect(() => {
    localStorage.setItem("sj-screen", screen);
    localStorage.setItem("sj-scenario", selectedId);
  }, [screen, selectedId]);

  useEffect(() => {
    const refreshTime = () => setCurrentTime(localTimeNow());
    const timer = window.setInterval(refreshTime, 30_000);
    window.addEventListener("focus", refreshTime);
    document.addEventListener("visibilitychange", refreshTime);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshTime);
      document.removeEventListener("visibilitychange", refreshTime);
    };
  }, []);

  const chooseAssignment = (id) => {
    setSelectedId(id);
    setActivities(activitySeed[id]);
    setPoint(id === "geotech" ? "BH5049" : id === "water" ? "WB-03" : "No point");
    setShift(defaultShiftFor(id));
    setSent(false);
    setScreen("setup");
  };

  const flash = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const addActivity = (name) => {
    const timestamp = localTimeNow();
    setActivities((current) => {
      const closed = current.map((item) => (item.end ? item : { ...item, end: timestamp }));
      return [
        ...closed,
        {
          id: Date.now(),
          start: timestamp,
          end: null,
          name,
          allocation: selected.job ? `Job ${selected.job}` : `Ancillary · ${name.replace("Non-job ", "")}`,
          meta: selected.points.length ? `${point} · current depth` : "Whole crew",
        },
      ];
    });
    setSheet(null);
    flash(`Started ${name} at ${timestamp}`);
  };

  const goBack = () => {
    if (screen === "setup") setScreen("assignments");
    else if (screen === "active") setScreen("setup");
    else if (screen === "review") setScreen("active");
    else if (screen === "submitted") setScreen("review");
  };

  const resetPrototype = () => {
    localStorage.removeItem("sj-screen");
    localStorage.removeItem("sj-scenario");
    setScreen("assignments");
    setSelectedId("geotech");
    setActivities(activitySeed.geotech);
    setPoint("BH5049");
    setSheet(null);
    setSent(false);
    flash("Prototype reset");
  };

  return (
    <div className="app-shell">
      <div className="desktop-context" aria-hidden="true">
        <img className="brand-mark" src="/favicon.svg" alt="" />
        <p className="eyebrow">SUBSTRATA JOBS</p>
        <h1>The field record,<br />from shift to sign-off.</h1>
        <p className="desktop-copy">Step 1 UX prototype · mocked records · designed for offline field work.</p>
        <div className="context-rule" />
        <p className="context-label">CURRENT WALKTHROUGH</p>
        <p className="context-value">{selected.division} · {selected.job ? `Job ${selected.job}` : "Ancillary day"}</p>
      </div>

      <main className="device" aria-live="polite">
        <header className="topbar">
          <div className="topbar-title">
            <img className="mini-mark" src="/favicon.svg" alt="Substrata" />
            {screen !== "assignments" && (
              <button className="icon-button light" onClick={goBack} aria-label="Go back"><ArrowLeft size={20} /></button>
            )}
            <div>
              <span className="topbar-kicker">SUBSTRATA</span>
              <strong>Jobs</strong>
            </div>
          </div>
          <button className={`sync-chip ${online ? "" : "offline"}`} onClick={() => setOnline((value) => !value)}>
            {online ? <Signal size={14} /> : <CloudOff size={14} />}
            {online ? (foundation?.mode === "live" ? "Live" : "Synced") : "Offline"}
          </button>
        </header>

        {screen === "assignments" && (
          <AssignmentsScreen myOnly={myOnly} setMyOnly={setMyOnly} chooseAssignment={chooseAssignment} openMenu={() => setSheet("prototype")} foundation={foundation} />
        )}
        {screen === "setup" && <SetupScreen assignment={selected} start={(details) => { setShift(details); setScreen("active"); }} />}
        {screen === "active" && (
          <ActiveScreen
            assignment={selected}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            activities={activities}
            point={point}
            currentTime={currentTime}
            shift={shift}
            setSheet={setSheet}
            review={() => setScreen("review")}
          />
        )}
        {screen === "review" && <ReviewScreen assignment={selected} activities={activities} shift={shift} submit={() => setScreen("submitted")} />}
        {screen === "submitted" && <SubmittedScreen assignment={selected} sent={sent} askSend={() => setSheet("send")} newLog={() => { resetPrototype(); }} />}

        {sheet === "activity" && (
          <BottomSheet title="Start next activity" close={() => setSheet(null)}>
            <p className="sheet-intro">The current activity will end and the next will begin at <strong>{currentTime}</strong>. No gap is created.</p>
            <div className="option-list">
              {activityOptions[selectedId].map((name) => (
                <button className="option-row" key={name} onClick={() => addActivity(name)}><span>{name}</span><ArrowRight size={18} /></button>
              ))}
            </div>
          </BottomSheet>
        )}

        {sheet === "point" && (
          <BottomSheet title="Change work point" close={() => setSheet(null)}>
            <div className="form-card compact">
              <label>Finish depth for {point}<div className="input-suffix"><input defaultValue={selectedId === "water" ? "18.0" : "12.4"} inputMode="decimal" /><span>m</span></div></label>
              <label>Point status<select defaultValue="Suspended"><option>Suspended</option><option>Completed</option><option>Abandoned</option></select></label>
            </div>
            {selected.points.filter((name) => name !== point).map((name) => (
              <button className="primary-button" key={name} onClick={() => { setPoint(name); setSheet(null); flash(`Continued on ${name}`); }}>Continue on {name}<ArrowRight size={18} /></button>
            ))}
            <button className="secondary-button"><Plus size={18} />Open point in Substrata Field</button>
          </BottomSheet>
        )}

        {sheet === "crew" && <CrewSheet assignment={selected} close={() => setSheet(null)} flash={flash} currentTime={currentTime} />}
        {sheet === "site" && <SiteDataSheet assignment={selected} close={() => setSheet(null)} flash={flash} />}
        {sheet === "prototype" && (
          <BottomSheet title="Prototype tools" close={() => setSheet(null)}>
            <div className="prototype-note"><Settings2 size={20} /><div><strong>Mocked UX only</strong><p>No records leave this device. Toggle the sync chip to preview offline status.</p></div></div>
            {foundation?.mode !== "prototype" && <div className="prototype-note"><Database size={20} /><div><strong>Ops connection active</strong><p>{foundation?.assignments?.length || 0} planned assignments are cached on this device for the next 14 days.</p></div></div>}
            <button className="secondary-button" onClick={resetPrototype}><TimerReset size={18} />Reset walkthrough</button>
            {foundation?.logout && <button className="text-button" onClick={foundation.logout}>Sign out of Substrata Jobs</button>}
          </BottomSheet>
        )}
        {sheet === "send" && (
          <BottomSheet title="Send draft to client" close={() => setSheet(null)}>
            <div className="send-preview"><Mail size={22} /><div><span>TO</span><strong>site.rep@client.co.nz</strong></div></div>
            <p className="sheet-intro">This deliberate action sends revision 1 as a draft PDF. The send will be recorded in the audit history.</p>
            <button className="primary-button" onClick={() => { setSent(true); setSheet(null); flash("Draft PDF sent to client"); }}><Send size={18} />Confirm and send</button>
            <button className="text-button" onClick={() => setSheet(null)}>Cancel</button>
          </BottomSheet>
        )}

        {toast && <div className="toast"><Check size={16} />{toast}</div>}
      </main>
    </div>
  );
}

function AssignmentsScreen({ myOnly, setMyOnly, chooseAssignment, openMenu, foundation }) {
  const firstName = foundation?.user?.displayName?.split(" ")[0] || "Sean";
  return (
    <div className="screen assignments-screen">
      <section className="page-heading">
        <div><p className="date-label">MONDAY, 20 JULY</p><h2>Good morning, {firstName}.</h2><p>Choose today’s work to begin a daily record.</p></div>
        <button className="icon-button" onClick={openMenu} aria-label="Prototype menu"><Menu size={21} /></button>
      </section>

      <div className="filter-row">
        <button className={`filter-pill ${myOnly ? "active" : ""}`} onClick={() => setMyOnly((value) => !value)}>
          <Check size={15} />My assignments only
        </button>
        <button className="filter-pill"><Clock3 size={15} />Today<ChevronDown size={14} /></button>
      </div>

      {foundation?.mode === "offline" && <div className="info-strip offline-foundation"><CloudOff size={17} /><span>Offline · using assignments cached {foundation.cachedAt ? new Date(foundation.cachedAt).toLocaleString() : "on this device"}.</span></div>}
      {foundation?.mode === "live" && <div className="info-strip live-foundation"><Database size={17} /><span>Ops connected · {foundation.assignments?.length || 0} live assignments cached. Prototype walkthroughs are shown below.</span></div>}
      <div className="section-title"><span>Prototype walkthroughs</span><span>2 assignments</span></div>
      <div className="assignment-list">
        {assignments.filter((a) => a.id !== "ancillary").map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} choose={() => chooseAssignment(assignment.id)} />
        ))}
      </div>

      <div className="section-title space-top"><span>Other work</span></div>
      <button className="ancillary-card" onClick={() => chooseAssignment("ancillary")}>
        <span className="assignment-icon green"><Wrench size={22} /></span>
        <span><strong>Start an ancillary day</strong><small>Yard, workshop, travel, training or leave</small></span>
        <ArrowRight size={19} />
      </button>

      {!myOnly && <div className="info-strip"><Users size={17} /><span>Showing team assignments as well as your own.</span></div>}
    </div>
  );
}

function AssignmentCard({ assignment, choose }) {
  const Icon = assignment.icon;
  return (
    <button className="assignment-card" onClick={choose}>
      <div className="assignment-card-top">
        <span className={`assignment-icon ${assignment.tone}`}><Icon size={22} /></span>
        <div className="assignment-code"><span>{assignment.division}</span><strong>Job {assignment.job}</strong></div>
        <span className="today-badge">TODAY</span>
      </div>
      <h3>{assignment.title}</h3>
      <p className="client-name">{assignment.client}</p>
      <div className="assignment-meta">
        <span><MapPin size={15} />{assignment.location}</span>
        <span><Gauge size={15} />Rig {assignment.rig}</span>
        <span><Clock3 size={15} />{assignment.shift}</span>
      </div>
      <div className="crew-stack">
        <span className="avatar">ST</span><span className="avatar">LB</span><span className="avatar">TR</span>
        <small>{assignment.crew.length} planned crew</small><ArrowRight size={18} />
      </div>
    </button>
  );
}

function SetupScreen({ assignment, start }) {
  const isAncillary = assignment.id === "ancillary";
  const defaults = defaultShiftFor(assignment.id);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [shiftType, setShiftType] = useState(defaults.shiftType);
  return (
    <div className="screen setup-screen">
      <section className="record-hero">
        <span className={`record-type ${assignment.tone}`}>{assignment.division}</span>
        <h2>{isAncillary ? "New ancillary daily" : `Job ${assignment.job}`}</h2>
        <p>{assignment.title}</p>
        {!isAncillary && <div className="hero-meta"><span>Rig {assignment.rig}</span><span>{assignment.location}</span></div>}
      </section>

      <div className="form-section">
        <div className="form-section-title"><span>SHIFT</span><small>Exact times feed future payroll</small></div>
        <div className="time-grid">
          <label>Start time<div className="time-control"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /><button type="button" onClick={() => setStartTime(localTimeNow())}>Now</button></div></label>
          <label>Expected end<div className="time-control"><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /><button type="button" onClick={() => setEndTime(localTimeNow())}>Now</button></div></label>
        </div>
        <div className="segment-control" role="group" aria-label="Shift type">
          <button type="button" className={shiftType === "day" ? "active" : ""} aria-pressed={shiftType === "day"} onClick={() => setShiftType("day")}>Day</button>
          <button type="button" className={shiftType === "night" ? "active" : ""} aria-pressed={shiftType === "night"} onClick={() => setShiftType("night")}>Night</button>
        </div>
      </div>

      {!isAncillary && (
        <div className="form-section">
          <div className="form-section-title"><span>STARTING POINT</span><small>Owned by Field / Ops Manager</small></div>
          <button className="select-card"><span><MapPin size={18} /><span><strong>{assignment.points[0]}</strong><small>{assignment.id === "water" ? "Planned production bore" : "Planned borehole · start 0.0 m"}</small></span></span><ChevronDown size={18} /></button>
          {assignment.points.length > 1 && <p className="helper-text">Also planned today: {assignment.points.slice(1).join(", ")}</p>}
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title"><span>CREW</span><small>Whole-crew record</small></div>
        {assignment.crew.map((name, index) => (
          <div className="crew-row" key={name}><span className="avatar light-avatar">{initials(name)}</span><span><strong>{name}</strong><small>{index === 0 ? "Driller / leading hand" : "Drilling assistant"}</small></span><span className="checked"><Check size={14} /></span></div>
        ))}
        <button className="inline-add"><Plus size={17} />Add or replace crew member</button>
      </div>

      <div className="sticky-action">
        <div className="offline-copy"><CloudOff size={16} /><span>Safe to start offline</span></div>
        <button className="primary-button" onClick={() => start({ startTime, endTime, shiftType })}>Start daily record<ArrowRight size={18} /></button>
      </div>
    </div>
  );
}

function ActiveScreen({ assignment, activeTab, setActiveTab, activities, point, currentTime, shift, setSheet, review }) {
  const current = activities.find((item) => !item.end);
  return (
    <div className="screen active-screen">
      <section className="active-header">
        <div><span className="live-dot">LIVE</span><h2>{assignment.job ? `Job ${assignment.job}` : "Ancillary daily"}</h2><p>{assignment.rig === "No rig required" ? "Group record" : `Rig ${assignment.rig}`} · {shift.shiftType === "night" ? "Night" : "Day"} shift started {shift.startTime}</p></div>
        <div className="elapsed"><span>ELAPSED</span><strong>{assignment.id === "water" ? "4h 12m" : "3h 42m"}</strong></div>
      </section>

      {activeTab === "work" && (
        <div className="tab-content">
          {assignment.points.length > 0 && (
            <button className="point-banner" onClick={() => setSheet("point")}>
              <span><MapPin size={18} /><span><small>CURRENT POINT</small><strong>{point}</strong></span></span>
              <span><span>{assignment.id === "water" ? "18.0 m" : point === "BH5049" ? "12.4 m" : "0.0 m"}</span><ArrowRight size={17} /></span>
            </button>
          )}

          <div className="current-activity">
            <div className="activity-label"><span className="pulse" />CURRENT ACTIVITY</div>
            <h3>{current?.name}</h3>
            <p>{current?.meta}</p>
            <div className="activity-clock"><Clock3 size={19} /><span>Started {current?.start}</span><strong>{elapsedFrom(current?.start)}</strong></div>
            <div className="allocation-chip"><BriefcaseBusiness size={15} />{current?.allocation}</div>
          </div>

          <button className="primary-button large" onClick={() => setSheet("activity")}><Plus size={20} />Start next activity <span>{currentTime}</span></button>

          <div className="quick-grid">
            {assignment.points.length > 0 && <button onClick={() => setSheet("point")}><MapPin size={20} /><span>Change point</span></button>}
            <button onClick={() => setSheet("crew")}><Users size={20} /><span>Crew</span><small>{assignment.crew.length} on shift</small></button>
            <button onClick={() => setSheet("site")}><ClipboardCheck size={20} /><span>Site data</span><small>{assignment.id === "water" ? "3 items" : "5 items"}</small></button>
            <button><Route size={20} /><span>Open Field</span><small>{assignment.points.length ? point : "Not required"}</small></button>
          </div>

          <div className="recent-block">
            <div className="section-title"><span>Recent activity</span><button onClick={() => setActiveTab("timeline")}>See timeline</button></div>
            {activities.slice(-3, -1).reverse().map((item) => <TimelineRow key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="tab-content">
          <div className="tab-heading"><div><p className="date-label">CONTINUOUS RECORD</p><h3>Shift timeline</h3></div><span className="valid-chip"><CheckCircle2 size={16} />No gaps</span></div>
          <div className="timeline-list">{activities.map((item) => <TimelineRow key={item.id} item={item} full />)}</div>
          <button className="secondary-button"><Plus size={18} />Add earlier activity</button>
        </div>
      )}

      {activeTab === "crew" && (
        <div className="tab-content">
          <div className="tab-heading"><div><p className="date-label">WHOLE-CREW RECORD</p><h3>Crew attendance</h3></div><button className="icon-button" onClick={() => setSheet("crew")}><Plus size={19} /></button></div>
          {assignment.crew.map((name, index) => (
            <div className="attendance-card" key={name}>
              <span className="avatar large-avatar">{initials(name)}</span><div><strong>{name}</strong><p>{index === 0 ? "Driller / leading hand" : "Drilling assistant"}</p><span><Clock3 size={14} />{shift.startTime} – {index === 1 && assignment.id === "geotech" ? "10:15" : "On shift"}</span></div>
              {index === 1 && assignment.id === "geotech" ? <span className="left-chip">LEFT</span> : <span className="on-chip">ON</span>}
            </div>
          ))}
          <div className="payroll-note"><History size={18} /><div><strong>Future payroll-ready</strong><p>Attendance periods and activity allocations are recorded separately so per-person time can be derived later.</p></div></div>
        </div>
      )}

      {activeTab === "more" && (
        <div className="tab-content">
          <div className="tab-heading"><div><p className="date-label">DAILY RECORD</p><h3>More details</h3></div></div>
          <button className="detail-link" onClick={() => setSheet("site")}><ClipboardCheck size={20} /><span><strong>Materials, services and measurements</strong><small>Review field quantities and site details</small></span><ArrowRight size={18} /></button>
          <button className="detail-link"><FileText size={20} /><span><strong>Shift notes</strong><small>Weather, delays and general notes</small></span><ArrowRight size={18} /></button>
          <button className="detail-link"><RefreshCw size={20} /><span><strong>Sync and audit history</strong><small>All changes saved on this device</small></span><ArrowRight size={18} /></button>
        </div>
      )}

      <div className="finish-row"><button className="finish-button" onClick={review}>Finish shift & review<ArrowRight size={18} /></button></div>
      <nav className="bottom-nav">
        <NavButton active={activeTab === "work"} onClick={() => setActiveTab("work")} icon={HardHat} label="Work" />
        <NavButton active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")} icon={History} label="Timeline" />
        <NavButton active={activeTab === "crew"} onClick={() => setActiveTab("crew")} icon={Users} label="Crew" />
        <NavButton active={activeTab === "more"} onClick={() => setActiveTab("more")} icon={MoreHorizontal} label="More" />
      </nav>
    </div>
  );
}

function ReviewScreen({ assignment, activities, shift, submit }) {
  const [clientMode, setClientMode] = useState(assignment.id === "water" ? "signature" : "reason");
  return (
    <div className="screen review-screen">
      <section className="review-hero"><p className="date-label">SHIFT COMPLETE</p><h2>Review daily record</h2><p>{assignment.job ? `Job ${assignment.job} · Rig ${assignment.rig}` : "Group ancillary record"}</p></section>

      <div className="summary-grid">
        <div><span>SHIFT</span><strong>{shift.startTime}–{shift.endTime} · {shift.shiftType === "night" ? "Night" : "Day"}</strong></div>
        <div><span>CREW</span><strong>{assignment.crew.length} people</strong></div>
        <div><span>ACTIVITIES</span><strong>{activities.length} entries</strong></div>
        <div><span>POINTS</span><strong>{assignment.points.length || "N/A"}</strong></div>
      </div>

      <section className="validation-card">
        <div className="validation-title"><CheckCircle2 size={22} /><div><strong>Ready to submit</strong><p>Required record checks have passed.</p></div></div>
        {["Shift has exact start and end times", "Activity timeline is continuous", "Crew attendance is complete", assignment.points.length ? "Point depths and statuses are recorded" : "Ancillary allocations are complete"].map((item) => (
          <div className="validation-row" key={item}><Check size={15} />{item}</div>
        ))}
      </section>

      {assignment.id !== "ancillary" && (
        <section className="client-section">
          <div className="form-section-title"><span>CLIENT ACKNOWLEDGEMENT</span><small>Optional</small></div>
          <div className="segment-control client-toggle"><button className={clientMode === "signature" ? "active" : ""} onClick={() => setClientMode("signature")}><PenLine size={16} />Sign now</button><button className={clientMode === "reason" ? "active" : ""} onClick={() => setClientMode("reason")}><X size={16} />No signature</button></div>
          {clientMode === "signature" ? <SignaturePad /> : (
            <div className="form-card compact">
              <label>Reason<select defaultValue="Client representative unavailable"><option>Client representative unavailable</option><option>Client declined to sign</option><option>Remote / unattended site</option><option>Other</option></select></label>
              <label>Client representative name<input placeholder="Optional" /></label>
            </div>
          )}
          <label className="email-field">Client email for draft PDF<input type="email" defaultValue="site.rep@client.co.nz" /><small>The PDF will not be sent automatically.</small></label>
        </section>
      )}

      <section className="pdf-preview"><FileText size={25} /><div><strong>Draft PDF will be created</strong><p>Revision 1 · internal payroll and review data excluded</p></div></section>

      <div className="sticky-action submit-action"><p>Submitting locks this revision. Corrections create an auditable new revision.</p><button className="primary-button" onClick={submit}>Submit as draft<ArrowRight size={18} /></button></div>
    </div>
  );
}

function SubmittedScreen({ assignment, sent, askSend, newLog }) {
  return (
    <div className="screen submitted-screen">
      <section className="success-hero"><div className="success-icon"><Check size={32} /></div><p className="date-label">DRAFT SUBMITTED</p><h2>Daily record saved.</h2><p>Revision 1 is synced and ready for supervisor review.</p></section>
      <div className="record-receipt">
        <div><span>LOG ID</span><strong>SJ-7F2A-91C4</strong></div>
        <div><span>RECORD</span><strong>{assignment.job ? `${assignment.job} · ${assignment.rig}` : "Ancillary · Group"}</strong></div>
        <div><span>PDF</span><strong>Revision 1 · Draft</strong></div>
        <div><span>STATUS</span><strong className="status-review">Supervisor review</strong></div>
      </div>
      <button className="secondary-button" onClick={() => window.print()}><Download size={18} />Open draft PDF</button>
      {assignment.id !== "ancillary" && (
        sent ? <div className="sent-confirmation"><CheckCircle2 size={20} /><div><strong>Sent to client</strong><p>site.rep@client.co.nz · just now</p></div></div> : <button className="primary-button" onClick={askSend}><Send size={18} />Send draft to client</button>
      )}
      <div className="what-next"><span>WHAT HAPPENS NEXT</span><div><span className="step-number">1</span><p><strong>Supervisor reviews in Ops Manager</strong>They can approve or return the log with comments.</p></div><div><span className="step-number">2</span><p><strong>Material corrections return to you</strong>Time, quantity, personnel or work changes need your confirmation.</p></div></div>
      <button className="text-button" onClick={newLog}>Return to assignments</button>
    </div>
  );
}

function CrewSheet({ assignment, close, flash, currentTime }) {
  const [left, setLeft] = useState(assignment.id === "geotech");
  return (
    <BottomSheet title="Crew attendance" close={close}>
      {assignment.crew.map((name, index) => (
        <div className="crew-sheet-row" key={name}><span className="avatar light-avatar">{initials(name)}</span><div><strong>{name}</strong><small>{index === 0 ? "Driller / leading hand" : "Drilling assistant"}</small></div>{index === 1 && left ? <button className="time-tag" onClick={() => setLeft(false)}>Left 10:15</button> : <button className="on-tag" onClick={() => { if (index === 1) setLeft(true); }}>On shift</button>}</div>
      ))}
      <button className="secondary-button"><Plus size={18} />Add crew member at {currentTime}</button>
      <button className="primary-button" onClick={() => { close(); flash("Crew attendance saved"); }}>Save attendance</button>
    </BottomSheet>
  );
}

function SiteDataSheet({ assignment, close, flash }) {
  const water = assignment.id === "water";
  return (
    <BottomSheet title="Site data" close={close}>
      <p className="sheet-intro">Quantities remain editable until submission. Changes after submission create a new revision.</p>
      <div className="data-entry"><span>{water ? "Steel casing 150 mm" : "SPT tests"}</span><div><button>−</button><strong>{water ? "18.0 m" : "4"}</strong><button>+</button></div></div>
      <div className="data-entry"><span>{water ? "Bentonite" : "Standpipe 50 mm"}</span><div><button>−</button><strong>{water ? "6 bags" : "12.0 m"}</strong><button>+</button></div></div>
      <div className="data-entry"><span>{water ? "Water delivered" : "Cement grout"}</span><div><button>−</button><strong>{water ? "5,000 L" : "8 bags"}</strong><button>+</button></div></div>
      <button className="inline-add"><Plus size={17} />Add material, service or measurement</button>
      <label className="email-field">Daily notes<textarea defaultValue={water ? "Formation change at 14.5 m. Circulation maintained." : "Traffic management in place. No incidents or environmental issues."} /></label>
      <button className="primary-button" onClick={() => { close(); flash("Site data saved"); }}>Save site data</button>
    </BottomSheet>
  );
}

function SignaturePad() {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const position = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event) => { drawing.current = true; const ctx = canvasRef.current.getContext("2d"); const p = position(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const draw = (event) => { if (!drawing.current) return; const ctx = canvasRef.current.getContext("2d"); const p = position(event); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0F1E2E"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const stop = () => { drawing.current = false; };
  return (
    <div className="signature-wrap"><canvas ref={canvasRef} width="640" height="220" onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerLeave={stop} /><span>Sign above</span><button onClick={() => canvasRef.current.getContext("2d").clearRect(0, 0, 640, 220)}>Clear</button></div>
  );
}

function BottomSheet({ title, close, children }) {
  return <div className="sheet-overlay" role="dialog" aria-modal="true"><button className="sheet-scrim" onClick={close} aria-label="Close" /><section className="bottom-sheet"><div className="sheet-handle" /><div className="sheet-header"><h3>{title}</h3><button className="icon-button" onClick={close}><X size={20} /></button></div>{children}</section></div>;
}

function TimelineRow({ item, full = false }) {
  return (
    <div className={`timeline-row ${item.end ? "" : "active"}`}><div className="timeline-time"><strong>{item.start}</strong><span>{item.end || "NOW"}</span></div><div className="timeline-line"><span /></div><div className="timeline-copy"><strong>{item.name}</strong><p>{item.meta}</p>{full && <small>{item.allocation}</small>}</div>{!full && <CheckCircle2 size={17} />}</div>
  );
}

function NavButton({ active, onClick, icon: Icon, label }) {
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={20} /><span>{label}</span></button>;
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("");
}

function elapsedFrom(start) {
  if (start === "09:35") return "1h 07m";
  if (start === "08:10") return "2h 32m";
  return "3h 42m";
}

export default App;
