import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, type Source, type Workspace } from "../api";
import {
  defaultEditorPreferences,
  readEditorPreferences,
  writeEditorPreferences,
  type EditorPreferences,
} from "../editor-preferences";
import "../editor-preferences.css";
import { Modal, Spinner, Toggle } from "./ui";
import {
  SourceEditor,
  editorLanguage,
  type EditorCursor,
} from "./SourceEditor";

type FileEntry = { name: string; path: string; directory: boolean };
type EditorFile = {
  path: string;
  content: string;
  draft: string;
  draftVersion: number;
  hash: string;
  redacted: boolean;
};
type Session = {
  folder: string;
  entries: FileEntry[];
  tabs: EditorFile[];
  active: string;
  loading: boolean;
  error: string;
};
type Proposal = {
  id: string;
  path: string;
  diff: string;
  beforeHash: string;
  afterHash: string;
  expiresAt: string;
};
const empty = (): Session => ({
  folder: ".",
  entries: [],
  tabs: [],
  active: "",
  loading: false,
  error: "",
});

export function CodeWorkbench({
  workspace,
  sources,
  onAddSource,
  onOpenFolder,
}: {
  workspace: Workspace;
  sources: Source[];
  onAddSource: (path: string) => Promise<void>;
  onOpenFolder: () => void;
}) {
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const session = sessions[workspace.id] ?? empty();
  const file = session.tabs.find((tab) => tab.path === session.active);
  const [collapsed, setCollapsed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(readEditorPreferences);
  const [cursor, setCursor] = useState<EditorCursor>({ line: 1, column: 1 });
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<
    (Proposal & { workspaceId: string; draft: string }) | null
  >(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reloading, setReloading] = useState<string | null>(null);
  const navigation = useRef(0);
  const fileNavigation = useRef(new Map<string, number>());
  const pendingFileReads = useRef(
    new Map<string, Promise<Omit<EditorFile, "draft" | "draftVersion">>>(),
  );
  useEffect(() => {
    writeEditorPreferences(preferences);
  }, [preferences]);
  function patch(workspaceId: string, update: (previous: Session) => Session) {
    setSessions((previous) => ({
      ...previous,
      [workspaceId]: update(previous[workspaceId] ?? empty()),
    }));
  }
  async function browse(folder = ".") {
    const workspaceId = workspace.id;
    const request = ++navigation.current;
    patch(workspaceId, (s) => ({ ...s, loading: true, error: "" }));
    try {
      const result = await api<{ path: string; entries: FileEntry[] }>(
        `/workspaces/${workspaceId}/files?path=${encodeURIComponent(folder)}`,
      );
      if (request === navigation.current)
        patch(workspaceId, (s) => ({
          ...s,
          folder: result.path,
          entries: result.entries,
          loading: false,
        }));
    } catch (e) {
      if (request === navigation.current)
        patch(workspaceId, (s) => ({
          ...s,
          loading: false,
          error: (e as Error).message,
        }));
    }
  }
  useEffect(() => {
    void browse(sessions[workspace.id]?.folder ?? ".");
  }, [workspace.id]);
  const hasDrafts = Object.values(sessions).some((s) =>
    s.tabs.some((tab) => tab.draft !== tab.content),
  );
  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDrafts]);
  async function open(path: string, reload = false) {
    const workspaceId = workspace.id;
    const intent = (fileNavigation.current.get(workspaceId) ?? 0) + 1;
    fileNavigation.current.set(workspaceId, intent);
    const draftVersion = session.tabs.find(
      (tab) => tab.path === path,
    )?.draftVersion;
    if (!reload && session.tabs.some((tab) => tab.path === path)) {
      patch(workspaceId, (s) => ({ ...s, active: path }));
      return;
    }
    patch(workspaceId, (s) => ({ ...s, error: "" }));
    const key = JSON.stringify([workspaceId, path]);
    let read = pendingFileReads.current.get(key);
    if (!read) {
      read = api<Omit<EditorFile, "draft" | "draftVersion">>(
        `/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`,
      );
      pendingFileReads.current.set(key, read);
    }
    try {
      const result = await read;
      patch(workspaceId, (s) => {
        const existing = s.tabs.find((tab) => tab.path === path);
        // A reload can discard only the draft that the user confirmed.
        if (reload && (!existing || existing.draftVersion !== draftVersion))
          return existing
            ? {
                ...s,
                error:
                  "Your draft changed while reloading. Your edits were kept.",
              }
            : s;
        const next = {
          ...result,
          path,
          draft: result.content,
          draftVersion: (existing?.draftVersion ?? -1) + 1,
        };
        return {
          ...s,
          active:
            fileNavigation.current.get(workspaceId) === intent
              ? path
              : s.active,
          // Normal reads must never replace a tab that opened while awaiting I/O.
          tabs: existing
            ? reload
              ? s.tabs.map((tab) => (tab.path === path ? next : tab))
              : s.tabs
            : [...s.tabs, next],
        };
      });
    } catch (e) {
      if (fileNavigation.current.get(workspaceId) === intent)
        patch(workspaceId, (s) => ({ ...s, error: (e as Error).message }));
    } finally {
      if (pendingFileReads.current.get(key) === read)
        pendingFileReads.current.delete(key);
    }
  }
  function close(path: string) {
    fileNavigation.current.set(
      workspace.id,
      (fileNavigation.current.get(workspace.id) ?? 0) + 1,
    );
    patch(workspace.id, (s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      return {
        ...s,
        tabs,
        active: s.active === path ? (tabs.at(-1)?.path ?? "") : s.active,
      };
    });
    setClosing(null);
  }
  async function review() {
    if (!file) return;
    setBusy(true);
    const workspaceId = workspace.id;
    patch(workspaceId, (s) => ({ ...s, error: "" }));
    try {
      const result = await api<Proposal>(
        `/workspaces/${workspaceId}/file-changes`,
        "POST",
        { path: file.path, content: file.draft, expectedHash: file.hash },
      );
      setProposal({ ...result, workspaceId, draft: file.draft });
    } catch (e) {
      patch(workspaceId, (s) => ({ ...s, error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!proposal) return;
    setBusy(true);
    try {
      const result = await api<{ path: string; content: string; hash: string }>(
        `/workspaces/${proposal.workspaceId}/file-changes/${proposal.id}/apply`,
        "POST",
        { approved: true },
      );
      patch(proposal.workspaceId, (s) => ({
        ...s,
        error: "",
        tabs: s.tabs.map((t) =>
          t.path === proposal.path
            ? {
                ...t,
                content: result.content,
                hash: result.hash,
                draft: t.draft === proposal.draft ? result.content : t.draft,
              }
            : t,
        ),
      }));
      setProposal(null);
    } catch (e) {
      patch(proposal.workspaceId, (s) => ({
        ...s,
        error: (e as Error).message,
      }));
      setProposal(null);
    } finally {
      setBusy(false);
    }
  }
  const added =
    !!file &&
    sources.some((s) => s.enabled && s.type === "file" && s.path === file.path);
  return (
    <div className={`coding-workspace ${focused ? "is-editor-focused" : ""}`}>
      <aside
        className={`file-explorer ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Project files"
        hidden={focused}
      >
        <div className="explorer-header">
          <strong>EXPLORER</strong>
          <button
            className="icon-button"
            aria-label={
              collapsed ? "Expand file explorer" : "Collapse file explorer"
            }
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        {!collapsed && (
          <>
            <button className="explorer-project" onClick={onOpenFolder}>
              <FolderOpen size={16} />
              <span>{workspace.name}</span>
            </button>
            <div className="explorer-breadcrumb">
              <span title={session.folder}>{session.folder}</span>
              <button
                className="icon-button"
                aria-label="Parent directory"
                disabled={session.folder === "."}
                onClick={() =>
                  void browse(
                    session.folder.split("/").slice(0, -1).join("/") || ".",
                  )
                }
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="Refresh explorer"
                onClick={() => void browse(session.folder)}
              >
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="explorer-entries">
              {session.loading ? (
                <Spinner label="Reading files…" />
              ) : (
                session.entries.map((entry) => (
                  <button
                    key={entry.path}
                    className={`explorer-entry ${session.active === entry.path ? "active" : ""}`}
                    aria-label={`${entry.directory ? "Open folder" : "Open file"} ${entry.name}`}
                    onClick={() =>
                      entry.directory
                        ? void browse(entry.path)
                        : void open(entry.path)
                    }
                  >
                    {entry.directory ? (
                      <Folder size={15} />
                    ) : (
                      <FileCode2 size={15} />
                    )}
                    <span>{entry.name}</span>
                    {entry.directory && <ChevronRight size={12} />}
                  </button>
                ))
              )}
              {!session.loading && !session.entries.length && (
                <p className="explorer-empty">
                  No supported files in this folder.
                </p>
              )}
            </div>
            <small className="explorer-footer">
              Browsing files does not add AI context.
            </small>
          </>
        )}
      </aside>
      <section className="code-workbench" aria-label="Code editor">
        <div className="editor-workspace-tools">
          <button
            className="text-button editor-focus-button"
            aria-label={focused ? "Exit editor focus" : "Focus editor"}
            aria-pressed={focused}
            onClick={() => setFocused(!focused)}
          >
            {focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {focused ? "Exit focus" : "Focus editor"}
          </button>
          <button
            className="text-button"
            aria-label="Editor settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={14} />
            Editor settings
          </button>
        </div>
        <div className="editor-tabs" role="tablist" aria-label="Open files">
          {session.tabs.map((tab) => (
            <div className="editor-tab-wrap" key={tab.path}>
              <button
                className="editor-tab"
                role="tab"
                aria-selected={tab.path === session.active}
                onClick={() => void open(tab.path)}
              >
                <FileCode2 size={13} />
                {tab.path.split("/").pop()}
                {tab.draft !== tab.content && (
                  <span aria-label="Unsaved changes">●</span>
                )}
              </button>
              <button
                className="icon-button"
                aria-label={`Close ${tab.path}`}
                onClick={() =>
                  tab.draft !== tab.content
                    ? setClosing(tab.path)
                    : close(tab.path)
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {session.error && (
          <p className="app-error" role="alert">
            {session.error}
          </p>
        )}
        {file ? (
          <>
            <div className="editor-path">
              <span title={file.path}>{file.path}</span>
              <button
                className="icon-button"
                aria-label="Reload file from disk"
                disabled={busy}
                onClick={() =>
                  file.draft !== file.content
                    ? setReloading(file.path)
                    : void open(file.path, true)
                }
              >
                <RefreshCw size={14} />
              </button>
              <button
                className="text-button"
                disabled={added || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAddSource(file.path);
                  } catch (e) {
                    patch(workspace.id, (s) => ({
                      ...s,
                      error: (e as Error).message,
                    }));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {added ? <Check size={14} /> : <Plus size={14} />}
                {added ? "In conversation context" : "Add file to context"}
              </button>
              <button
                className="primary-button"
                disabled={busy || file.redacted || file.draft === file.content}
                onClick={() => void review()}
              >
                <Save size={14} />
                Review & save
              </button>
            </div>
            {file.redacted && (
              <p className="notice warning">
                This preview contains redacted credentials and is read-only.
              </p>
            )}
            <div className="code-editor-frame source-editor-frame">
              <SourceEditor
                documentId={`${workspace.id}:${file.path}`}
                path={file.path}
                readOnly={file.redacted}
                value={file.draft}
                preferences={preferences}
                onCursorChange={(position) => {
                  setCursor((previous) =>
                    previous.line === position.line &&
                    previous.column === position.column
                      ? previous
                      : position,
                  );
                }}
                onChange={(value) => {
                  patch(workspace.id, (s) => ({
                    ...s,
                    tabs: s.tabs.map((t) =>
                      t.path === file.path
                        ? {
                            ...t,
                            draft: value,
                            draftVersion: t.draftVersion + 1,
                          }
                        : t,
                    ),
                  }));
                }}
                onSave={() => {
                  if (!busy && !file.redacted && file.draft !== file.content)
                    void review();
                }}
              />
            </div>
            <div className="editor-status">
              <span>
                {file.draft !== file.content
                  ? "Unsaved draft"
                  : "Saved on disk"}
              </span>
              <span className="editor-position" aria-label="Cursor position">
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span>
                {editorLanguage(file.path)} · Spaces: {preferences.tabSize} ·
                UTF-8
              </span>
            </div>
          </>
        ) : (
          <div className="editor-empty">
            <Code2 size={36} />
            <h2>Your project, within reach.</h2>
            <p>
              Open a file from the explorer to inspect or edit it. Add files to
              conversation context explicitly when the AI should see them.
            </p>
            <button className="secondary-button" onClick={onOpenFolder}>
              <FolderOpen size={15} />
              Open another folder
            </button>
          </div>
        )}
      </section>
      {settingsOpen && (
        <Modal title="Editor settings" onClose={() => setSettingsOpen(false)}>
          <div className="editor-preferences">
            <label className="editor-preference-row">
              <span>Font size</span>
              <select
                aria-label="Editor font size"
                value={preferences.fontSize}
                onChange={(event) =>
                  setPreferences((previous) => ({
                    ...previous,
                    fontSize: Number(
                      event.target.value,
                    ) as EditorPreferences["fontSize"],
                  }))
                }
              >
                {[12, 14, 16, 18].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-preference-row">
              <span>Indentation</span>
              <select
                aria-label="Editor indentation"
                value={preferences.tabSize}
                onChange={(event) =>
                  setPreferences((previous) => ({
                    ...previous,
                    tabSize: Number(
                      event.target.value,
                    ) as EditorPreferences["tabSize"],
                  }))
                }
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </select>
            </label>
            <div className="editor-preference-row">
              <span>Word wrap</span>
              <Toggle
                label="Editor word wrap"
                checked={preferences.wordWrap}
                onChange={() =>
                  setPreferences((previous) => ({
                    ...previous,
                    wordWrap: !previous.wordWrap,
                  }))
                }
              />
            </div>
            <div className="editor-shortcuts" aria-label="Editor shortcuts">
              <span>
                Review changes <kbd>Ctrl / ⌘ S</kbd>
              </span>
              <span>
                Find / replace <kbd>Ctrl / ⌘ F</kbd>
              </span>
              <span>
                Leave editor <kbd>Esc, then Tab</kbd>
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setPreferences({ ...defaultEditorPreferences })}
            >
              Reset editor settings
            </button>
            <button
              className="primary-button"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}
      {proposal && (
        <Modal
          title="Review your file change"
          eyebrow="EXPLICIT FILE APPROVAL"
          onClose={() => !busy && setProposal(null)}
          wide
        >
          <div className="padded">
            <p className="field-help">
              Applying this diff changes <strong>{proposal.path}</strong> on
              disk. A changed file will require a new review.
            </p>
            <pre className="diff-preview">
              {proposal.diff.split("\n").map((line, i) => (
                <span
                  key={i}
                  className={
                    line.startsWith("+")
                      ? "diff-add"
                      : line.startsWith("-")
                        ? "diff-remove"
                        : ""
                  }
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setProposal(null)}
            >
              Keep editing
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Applying…" : "Apply file change"}
            </button>
          </div>
        </Modal>
      )}
      {closing && (
        <Modal title="Discard this draft?" onClose={() => setClosing(null)}>
          <p className="padded">
            Unsaved edits to {closing} will be discarded. The file on disk is
            unchanged.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setClosing(null)}
            >
              Keep editing
            </button>
            <button className="danger-button" onClick={() => close(closing)}>
              Discard draft
            </button>
          </div>
        </Modal>
      )}
      {reloading && (
        <Modal title="Reload this file?" onClose={() => setReloading(null)}>
          <p className="padded">
            Reloading {reloading} discards its unsaved draft and reads the
            current file from disk.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setReloading(null)}
            >
              Keep editing
            </button>
            <button
              className="danger-button"
              onClick={() => {
                void open(reloading, true);
                setReloading(null);
              }}
            >
              Reload from disk
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
