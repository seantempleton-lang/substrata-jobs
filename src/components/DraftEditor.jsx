import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getEditor, putEditor } from "../foundation/offlineStore";
const EditorContext = createContext(null);

export default function DraftEditor({ id, children, reportError }) {
  const [ready, setReady] = useState(false);
  const fields = useRef({}), writes = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    getEditor(id).then(saved => { if (!cancelled) { fields.current = saved || {}; setReady(true); } }).catch(error => reportError(error.message));
    return () => { cancelled = true; };
  }, [id, reportError]);
  const context = { fields, update(key, value) {
    fields.current[key] = value;
    const snapshot = structuredClone(fields.current);
    writes.current = writes.current.then(() => putEditor(id, snapshot)).catch(error => reportError(error.message));
  } };
  return ready ? <EditorContext.Provider value={context}>{children}</EditorContext.Provider> : <p className="helper-text">Restoring form…</p>;
}

// Stable field names keep editor drafts readable across UI changes.
// eslint-disable-next-line react-refresh/only-export-components
export function useEditorState(key, initial) {
  const context = useContext(EditorContext);
  const [value, setValue] = useState(() => context && Object.hasOwn(context.fields.current, key) ? context.fields.current[key] : initial);
  const change = next => {
    const resolved = typeof next === "function" ? next(value) : next;
    setValue(resolved); context?.update(key, resolved);
  };
  return [value, change];
}
