import {
  ArrowUpRight,
  BookOpen,
  FileCode2,
  Layers3,
  Paperclip,
} from "lucide-react";
import type { Source } from "../api";

/** Selection state only; the request inspector reports actual inclusion. */
export function ContextOverview({
  sources,
  onOpen,
}: {
  sources: Source[];
  onOpen: () => void;
}) {
  const enabled = sources.filter((source) => source.enabled);
  const disabled = sources.length - enabled.length;
  const groups = [
    {
      key: "files",
      label: "Files & folders",
      Icon: FileCode2,
      sources: enabled.filter((s) =>
        ["file", "folder", "retrieved"].includes(s.type),
      ),
    },
    {
      key: "instructions",
      label: "Selected instructions",
      Icon: BookOpen,
      sources: enabled.filter((s) =>
        ["instruction", "project"].includes(s.type),
      ),
    },
    {
      key: "references",
      label: "Chats & memories",
      Icon: Layers3,
      sources: enabled.filter((s) => ["chat", "memory"].includes(s.type)),
    },
    {
      key: "attachments",
      label: "Attachments",
      Icon: Paperclip,
      sources: enabled.filter((s) => s.type === "attachment"),
    },
  ];
  return (
    <button
      className="context-overview"
      onClick={onOpen}
      aria-label="Open conversation context overview"
    >
      <span className="context-overview-title">
        <Layers3 size={15} />
        <span>Conversation context</span>
        <span className="context-selection-label">SELECTION</span>
        <ArrowUpRight size={14} />
      </span>
      <span className="context-summary-grid">
        {groups.map(({ key, label, Icon, sources: selected }) => (
          <span
            className={`context-summary-group context-summary-${key}`}
            key={key}
          >
            <span className="context-summary-label">
              <Icon size={13} />
              <span>{label}</span>
            </span>
            <strong>{selected.length.toString().padStart(2, "0")}</strong>
            <span className="context-summary-detail">
              {selected.length
                ? selected
                    .slice(0, 2)
                    .map((s) => s.name)
                    .join(", ")
                : "Nothing selected"}
            </span>
          </span>
        ))}
      </span>
      <span className="context-overview-footer">
        <span>
          {enabled.length} enabled{disabled ? ` · ${disabled} disabled` : ""}
        </span>
        <span>Preview to verify inclusion</span>
      </span>
    </button>
  );
}
