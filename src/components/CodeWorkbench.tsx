import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { api, type Source, type Workspace } from "../api";
import { Modal, Spinner } from "./ui";
import { SourceEditor } from "./SourceEditor";

type FileEntry = { name: string; path: string; directory: boolean };
type EditorFile = {
  path: string;
  content: string;
  draft: string;
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
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<
    (Proposal & { workspaceId: string; draft: string }) | null
  >(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reloading, setReloading] = useState<string | null>(null);
  const navigation = useRef(0);
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
    if (!reload && session.tabs.some((tab) => tab.path === path)) {
      patch(workspaceId, (s) => ({ ...s, active: path }));
      return;
    }
    patch(workspaceId, (s) => ({ ...s, error: "" }));
    try {
      const result = await api<{
        path: string;
        content: string;
        hash: string;
        redacted: boolean;
      }>(`/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`);
      const next = { ...result, path, draft: result.content };
      patch(workspaceId, (s) => ({
        ...s,
        active: path,
        tabs: s.tabs.some((t) => t.path === path)
          ? s.tabs.map((t) => (t.path === path ? next : t))
          : [...s.tabs, next],
      }));
    } catch (e) {
      patch(workspaceId, (s) => ({ ...s, error: (e as Error).message }));
    }
  }
  function close(path: string) {
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
    <div className="coding-workspace">
      <aside
        className={`file-explorer ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Project files"
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
        <div className="editor-tabs" role="tablist" aria-label="Open files">
          {session.tabs.map((tab) => (
            <div className="editor-tab-wrap" key={tab.path}>
              <button
                className="editor-tab"
                role="tab"
                aria-selected={tab.path === session.active}
                onClick={() =>
                  patch(workspace.id, (s) => ({ ...s, active: tab.path }))
                }
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
                onChange={(value) => {
                  patch(workspace.id, (s) => ({
                    ...s,
                    tabs: s.tabs.map((t) =>
                      t.path === file.path ? { ...t, draft: value } : t,
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
                  ? "Unsaved draft · review a diff to save"
                  : "Saved on disk"}
              </span>
              <span>{file.draft.split("\n").length} lines · UTF-8</span>
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
