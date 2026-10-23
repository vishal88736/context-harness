import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronRight, Folder, FolderOpen, Home } from "lucide-react";
import { api, type Workspace } from "../api";
import { Modal, Spinner } from "./ui";

type Folders = {
  path: string;
  parentPath: string | null;
  entries: { name: string; path: string }[];
  shortcuts: { name: string; path: string }[];
  selectable: boolean;
  truncated: boolean;
};

export function FolderPicker({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (workspace: Workspace) => Promise<void>;
}) {
  const [listing, setListing] = useState<Folders | null>(null);
  const [location, setLocation] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  async function browse(path = "") {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await api<Folders>(
        `/folders${path ? `?path=${encodeURIComponent(path)}` : ""}`,
      );
      if (request !== sequence.current) return;
      setListing(next);
      setLocation(next.path);
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void browse();
    return () => {
      sequence.current++;
    };
  }, []);
  async function open() {
    if (!listing?.selectable || loading || opening || location !== listing.path)
      return;
    setOpening(true);
    setError("");
    try {
      const workspace = await api<Workspace>("/workspaces", "POST", {
        root: listing.path,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      await onOpen(workspace);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  return (
    <Modal
      title="Open a project folder"
      eyebrow="LOCAL WORKSPACE"
      onClose={onClose}
      wide
    >
      <div className="folder-picker-body">
        <p className="field-help">
          Choose any project folder this computer can access. Opening a
          workspace does not automatically add its files to AI context.
        </p>
        <form
          className="folder-location"
          onSubmit={(e) => {
            e.preventDefault();
            void browse(location);
          }}
        >
          <button
            type="button"
            className="icon-button"
            aria-label="Parent folder"
            disabled={!listing?.parentPath || loading}
            onClick={() => void browse(listing!.parentPath!)}
          >
            <ArrowUp size={17} />
          </button>
          <input
            aria-label="Folder location"
            disabled={loading || opening}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Absolute path or ~/projects"
          />
          <button
            className="secondary-button"
            disabled={loading || !location.trim()}
          >
            Go
          </button>
        </form>
        <div className="folder-shortcuts">
          {listing?.shortcuts.map((shortcut) => (
            <button
              className="text-button"
              key={shortcut.path}
              onClick={() => void browse(shortcut.path)}
            >
              <Home size={14} />
              {shortcut.name}
            </button>
          ))}
        </div>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        <div
          className="folder-list"
          aria-label="Available folders"
          aria-busy={loading}
        >
          {loading ? (
            <Spinner label="Reading folders…" />
          ) : listing?.entries.length ? (
            listing.entries.map((entry) => (
              <button
                key={entry.path}
                className="folder-entry"
                onClick={() => {
                  setName("");
                  void browse(entry.path);
                }}
              >
                <Folder size={18} />
                <span>{entry.name}</span>
                <ChevronRight size={14} />
              </button>
            ))
          ) : (
            <p className="field-help">
              No accessible subfolders. You can open this folder or enter
              another path.
            </p>
          )}
        </div>
        {listing?.truncated && !loading && (
          <p className="field-help">
            This folder has more entries than can be listed. Enter the full path
            above to open an unlisted folder.
          </p>
        )}
        <label className="field">
          Workspace name <span className="muted">optional</span>
          <input
            aria-label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              listing?.path.split(/[\\/]/).filter(Boolean).pop() || "My project"
            }
          />
        </label>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={
            !listing?.selectable ||
            loading ||
            opening ||
            location !== listing.path
          }
          onClick={() => void open()}
        >
          <FolderOpen size={15} />
          {opening ? "Opening…" : "Open this folder"}
        </button>
      </div>
    </Modal>
  );
}
