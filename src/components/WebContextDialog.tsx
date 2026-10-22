import { useRef, useState, type FormEvent } from "react";
import { Globe } from "lucide-react";
import { makeSource, type Source } from "../api";
import { Modal } from "./ui";

export function WebContextDialog({
  onAdd,
  onClose,
}: {
  onAdd: (sources: Source[]) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    setError("");
    let reference: URL;
    try {
      reference = new URL(url.trim());
      if (!["http:", "https:"].includes(reference.protocol)) throw new Error();
    } catch {
      setError("Enter a valid page URL beginning with http:// or https://.");
      return;
    }
    if (reference.username || reference.password) {
      setError("Use a page URL without embedded credentials.");
      return;
    }
    if (!excerpt.trim()) {
      setError("Paste the page excerpt you want to include.");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await onAdd([
        makeSource("file", title.trim() || reference.hostname.slice(0, 160), {
          content: `Source URL: ${reference.href}\n\n${excerpt.trim()}`,
        }),
      ]);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not add this excerpt. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add web context"
      eyebrow="PAGE EXCERPT"
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form onSubmit={(event) => void add(event)} aria-busy={busy}>
        <div className="padded">
          <p className="field-help">
            Paste the part of the page you want the model to read. The link is
            recorded as a reference; it is not fetched automatically.
          </p>
          <label className="field">
            Page title <span className="muted">optional</span>
            <input
              aria-label="Page title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              disabled={busy}
              placeholder="Documentation or article title"
            />
          </label>
          <label className="field">
            Page URL
            <input
              aria-label="Page URL"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              maxLength={8192}
              disabled={busy}
              placeholder="https://example.com/documentation"
            />
          </label>
          <label className="field">
            Page excerpt
            <textarea
              aria-label="Page excerpt"
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              required
              maxLength={250_000}
              rows={8}
              disabled={busy}
              placeholder="Paste the relevant text from the page…"
            />
          </label>
          {error && (
            <p className="error-inline" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !url.trim() || !excerpt.trim()}
          >
            <Globe size={15} />
            {busy ? "Adding…" : "Add excerpt to context"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
