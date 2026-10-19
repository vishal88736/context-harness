import { useState } from "react";
import {
  ArrowRight,
  Check,
  CircleSlash,
  Eye,
  History,
  Layers3,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { shortNumber, type Snapshot } from "../api";
import { CopyButton, Modal } from "./ui";

export function Inspector({
  snapshot,
  onClose,
  onSend,
  preview,
  busy,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  onSend?: () => void;
  preview: boolean;
  busy?: boolean;
}) {
  const [tab, setTab] = useState("overview");
  const included = snapshot.sources.filter((s) => s.status === "included");
  const excluded = snapshot.sources.filter((s) => s.status === "excluded");
  const payload = JSON.stringify(snapshot.payload, null, 2);
  return (
    <Modal
      title={
        preview ? "Your next request, unpacked." : "What the model received."
      }
      eyebrow={preview ? "EFFECTIVE CONTEXT PREVIEW" : "RECORDED INVOCATION"}
      onClose={onClose}
      wide
    >
      <div className="inspector-model">
        <div className="model-glyph">
          <Layers3 size={20} />
        </div>
        <span>
          <strong>{snapshot.model.name}</strong>
          <small>
            {snapshot.providerName} ·{" "}
            {shortNumber(snapshot.model.contextWindow)} context ·{" "}
            {snapshot.model.contextSource === "fallback"
              ? "Fallback limit"
              : snapshot.model.contextSource === "user"
                ? "User-configured limit"
                : "Provider-reported limit"}
          </small>
        </span>
        <span className="snapshot-badge">
          {preview ? "Not sent yet" : "Immutable record"}
        </span>
      </div>
      <div className="inspector-tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={tab === "instructions" ? "active" : ""}
          onClick={() => setTab("instructions")}
        >
          Instructions
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          History{" "}
          <span>{snapshot.history.filter((h) => h.included).length}</span>
        </button>
        <button
          className={tab === "payload" ? "active" : ""}
          onClick={() => setTab("payload")}
        >
          Request payload
        </button>
      </div>
      <div className="inspector-body">
        {tab === "overview" ? (
          <>
            <div className="budget-summary">
              <div>
                <strong>~{shortNumber(snapshot.budget.estimated)}</strong>
                <span>estimated input</span>
              </div>
              <div>
                <strong>{shortNumber(snapshot.budget.outputReserve)}</strong>
                <span>reserved output</span>
              </div>
              <div>
                <strong>{shortNumber(snapshot.budget.remaining)}</strong>
                <span>remaining capacity</span>
              </div>
            </div>
            <div className="budget-track inspector-track">
              <span
                style={{
                  width: `${(snapshot.budget.estimated / snapshot.budget.limit) * 100}%`,
                }}
              />
              <i
                style={{
                  width: `${(snapshot.budget.outputReserve / snapshot.budget.limit) * 100}%`,
                }}
              />
            </div>
            <p className="field-help">{snapshot.budget.method}</p>
            <h3 className="inspector-section-heading">
              <Check size={15} />
              Included sources <span>{included.length}</span>
            </h3>
            {!included.length && (
              <p className="muted small-text">
                No selected source content is included. Base instructions and
                your prompt are still present.
              </p>
            )}
            {included.map((s) => (
              <details className="inspector-source" key={s.id}>
                <summary>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.path ?? s.type}</small>
                  </span>
                  <span>~{shortNumber(s.tokens)} tokens</span>
                </summary>
                {s.reason && <p className="notice warning">{s.reason}</p>}
                <pre>{s.content ?? s.excerpt}</pre>
                {s.hash && <small className="hash">SHA-256 {s.hash}</small>}
              </details>
            ))}
            {snapshot.sources.some((s) => s.status === "available") && (
              <>
                <h3 className="inspector-section-heading">
                  <Eye size={15} />
                  Available for retrieval
                </h3>
                {snapshot.sources
                  .filter((s) => s.status === "available")
                  .map((s) => (
                    <div className="excluded-source" key={s.id}>
                      <strong>{s.name}</strong>
                      <p>{s.reason}</p>
                    </div>
                  ))}
              </>
            )}
            {excluded.length > 0 && (
              <>
                <h3 className="inspector-section-heading">
                  <CircleSlash size={15} />
                  Excluded sources <span>{excluded.length}</span>
                </h3>
                {excluded.map((s) => (
                  <div className="excluded-source" key={s.id}>
                    <strong>{s.name}</strong>
                    <p>{s.reason}</p>
                  </div>
                ))}
              </>
            )}
            <h3 className="inspector-section-heading">
              <ShieldCheck size={15} />
              Enforced tool permissions
            </h3>
            <div className="permission-chips">
              {Object.entries(snapshot.permissions).map(([name, value]) => (
                <span key={name}>
                  {name}
                  <strong className={value === "deny" ? "muted" : ""}>
                    {value === "ask"
                      ? "Approval required"
                      : value === "allow"
                        ? "Allowed"
                        : "Blocked"}
                  </strong>
                </span>
              ))}
            </div>
            <p className="field-help">
              Advertised tools:{" "}
              {(
                (snapshot.payload.tools as
                  | { function: { name: string } }[]
                  | undefined) ?? []
              )
                .map((t) => t.function.name)
                .join(", ") || "none"}
            </p>
          </>
        ) : tab === "instructions" ? (
          <>
            <div className="notice">
              <SlidersHorizontal size={15} />
              <p>
                Precedence: harness → workspace → project → conversation →
                request. Reference data cannot grant permissions.
              </p>
            </div>
            <h3>Harness instructions</h3>
            <pre className="inspector-pre">{snapshot.instructions.base}</pre>
            <h3>Workspace instructions</h3>
            <pre className="inspector-pre">
              {snapshot.instructions.workspace ||
                "No workspace instructions configured."}
            </pre>
            {snapshot.sources
              .filter(
                (s) =>
                  ["project", "instruction"].includes(s.type) &&
                  s.status === "included",
              )
              .map((s) => (
                <div key={s.id}>
                  <h3>{s.name}</h3>
                  <pre className="inspector-pre">{s.content}</pre>
                </div>
              ))}
          </>
        ) : tab === "history" ? (
          <>
            <p className="field-help">
              Messages stay in your conversation even when omitted from a
              request. Replies from a different context configuration are
              excluded to prevent stale source data from returning.
            </p>
            {!snapshot.history.length && (
              <div className="context-empty">
                <History size={25} />
                <h3>A fresh conversation.</h3>
                <p>No previous turns are included.</p>
              </div>
            )}
            {snapshot.history.map((h, i) => (
              <div
                className={`history-inspector-row ${!h.included ? "excluded" : ""}`}
                key={h.id}
              >
                <span>
                  {h.included ? <Check size={15} /> : <CircleSlash size={15} />}
                </span>
                <div>
                  <strong>
                    Turn {i + 1} · {h.role}
                  </strong>
                  <small>
                    {h.included
                      ? "Included in the assembled request"
                      : h.reason}
                  </small>
                  <code>{h.id}</code>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="payload-heading">
              <p className="field-help">
                The provider request body, without authentication headers. Image
                data is represented by metadata in this view.
              </p>
              <CopyButton text={payload} label="Copy JSON" />
            </div>
            <pre className="payload-code">{payload}</pre>
          </>
        )}
        {snapshot.warnings.length > 0 && (
          <details className="inspector-warnings">
            <summary>
              {snapshot.warnings.length} context notice
              {snapshot.warnings.length === 1 ? "" : "s"}
            </summary>
            {snapshot.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </details>
        )}
      </div>
      <div className="modal-actions inspector-actions">
        <small>
          {new Date(snapshot.createdAt).toLocaleString()}
          <br />
          Snapshot {snapshot.id.slice(0, 8)} ·{" "}
          {snapshot.previewHash.slice(0, 12)}
        </small>
        <button className="secondary-button" onClick={onClose}>
          Close inspector
        </button>
        {onSend && (
          <button className="primary-button" disabled={busy} onClick={onSend}>
            Send this request <ArrowRight size={15} />
          </button>
        )}
      </div>
    </Modal>
  );
}
