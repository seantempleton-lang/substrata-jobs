import { useCallback, useEffect, useRef, useState } from "react";
import { cacheFoundation, getCachedFoundation, getActiveLog, getDailyLogs, getDailyLog, getQueueState, saveDailyLog, setActiveLog, getWorkflowRecords, queueSubmission } from "./offlineStore";
import { syncPendingDailyLogs } from "./syncManager";
import { getBootstrap } from "./api";

export default function useWorkspace(foundation) {
  const userId = foundation.user.userId;
  const [workspace, setWorkspace] = useState(foundation.bootstrap);
  const [logs, setLogs] = useState([]);
  const [log, setLog] = useState(null);
  const [queue, setQueue] = useState([]);
  const [intentions, setIntentions] = useState([]), [signatures, setSignatures] = useState([]);
  const [ready, setReady] = useState(false);
  const [returnedFromField, setReturnedFromField] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date().toISOString());
  const current = useRef(null), saves = useRef(Promise.resolve()), syncingRef = useRef(false);
  useEffect(() => {
    const refreshTime = () => setCurrentTime(new Date().toISOString());
    const timer = window.setInterval(refreshTime, 30000);
    window.addEventListener("focus", refreshTime);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshTime); };
  }, []);

  const refresh = useCallback(async () => {
    const [records, mutations, intents, assets] = await Promise.all([getDailyLogs(userId), getQueueState(userId), getWorkflowRecords("submissions", userId), getWorkflowRecords("signatures", userId)]);
    setIntentions(intents); setSignatures(assets);
    setLogs(records); setQueue(mutations);
    if (current.current) {
      const latest = records.find(record => record.id === current.current.id);
      if (latest) { current.current = latest; setLog(latest); }
      else { current.current = null; setLog(null); }
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true; setSyncing(true);
    try {
      await saves.current.catch(() => {});
      await syncPendingDailyLogs(userId);
      await saves.current;
      await refresh();
      const bootstrap = await getBootstrap();
      const cached = (await getCachedFoundation())?.bootstrap || foundation.bootstrap;
      for (const assignment of bootstrap.assignments) {
        if (assignment.pointFeedAvailable === false) assignment.points = cached.assignments.find(a => a.assignmentId === assignment.assignmentId)?.points || [];
      }
      await cacheFoundation({ session: { user: foundation.user, expiresAt: foundation.expiresAt }, bootstrap, cachedAt: new Date().toISOString() });
      setWorkspace(bootstrap); setError("");
    } catch (failure) { setError(failure.status === 401 ? "Session expired. Sign in again to sync; your work remains saved on this device." : failure.message); }
    finally { await refresh(); syncingRef.current = false; setSyncing(false); }
  }, [userId, refresh, foundation.bootstrap, foundation.user, foundation.expiresAt]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        await refresh();
        const params = new URLSearchParams(window.location.search);
        const id = params.get("dailyLogId") || await getActiveLog(userId);
        const record = id ? await getDailyLog(id) : null;
        if (!cancelled && record?.owner.userId === userId) {
          current.current = record; setLog(record);
          if (params.has("dailyLogId")) {
            setReturnedFromField(true); await setActiveLog(userId, record.id);
            const url = new URL(window.location.href); url.searchParams.delete("dailyLogId");
            window.history.replaceState(null, "", url.pathname + url.search + url.hash);
          }
        }
        if (!cancelled) setReady(true);
      } catch (failure) { if (!cancelled) setError(`Device storage unavailable: ${failure.message}`); }
    }
    restore();
    return () => { cancelled = true; };
  }, [refresh, userId]);

  useEffect(() => {
    if (!ready) return;
    sync();
    const timer = window.setInterval(sync, 30000);
    const connected = () => { setOnline(true); sync(); };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { clearInterval(timer); window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [ready, sync]);

  const persist = useCallback((update, signature = null) => {
    setBusy(true);
    const action = saves.current.catch(() => {}).then(async () => {
      const commit = async () => {
        const latest = current.current ? await getDailyLog(current.current.id) : null;
        const next = typeof update === "function" ? await update(latest) : update;
        await saveDailyLog(next, next.serverRevision || 0, signature);
        await setActiveLog(userId, next.id);
        current.current = await getDailyLog(next.id); setLog(current.current);
        await refresh(); setError(""); return current.current;
      };
      return navigator.locks ? navigator.locks.request(`substrata-jobs-edit:${current.current?.id || userId}`, commit) : commit();
    });
    saves.current = action;
    return action.catch(failure => { setError(failure.message); throw failure; }).finally(() => setBusy(false));
  }, [refresh, userId]);

  const submit = useCallback(async () => {
    setBusy(true);
    const action = saves.current.catch(() => {}).then(async () => {
      const commit = () => queueSubmission(current.current.id, userId);
      await (navigator.locks ? navigator.locks.request(`substrata-jobs-edit:${current.current.id}`, commit) : commit());
      await refresh();
    });
    saves.current = action;
    try { await action; await sync(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }, [refresh, sync, userId]);

  const open = useCallback(async record => { await saves.current; current.current = record; setLog(record); await setActiveLog(userId, record?.id ?? null); }, [userId]);
  function status(record) {
    const intent = intentions.find(i => i.logId === record?.id && i.state !== "completed");
    if (intent) return intent.state === "conflict" ? "Conflict" : intent.state === "failed" ? "Failed" : "Submit pending";
    const mutations = queue.filter(m => m.entityId === record?.id);
    if (mutations.some(m => m.queueStatus === "conflict")) return "Conflict";
    if (mutations.some(m => ["failed", "rejected"].includes(m.queueStatus))) return "Failed";
    if (mutations.length) return online ? "Pending" : "Local";
    return record?.serverRevision ? "Synced" : "Local";
  }
  const intention = intentions.find(i => i.logId === log?.id && i.state !== "completed");
  const locked = !!intention || !!log && !["draft", "returned", "reopened"].includes(log.status);
  return { workspace, logs, log, queue, intentions, intention, signatures, locked, submit, ready, returnedFromField, busy, syncing, error, setError, online, currentTime, persist, open, sync, refresh, status };
}
