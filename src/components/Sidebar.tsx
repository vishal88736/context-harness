import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Folder,
  FolderPlus,
  Layers3,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Search,
  House,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { Bootstrap, Conversation } from "../api";
import { Logo } from "./ui";

function dateGroup(timestamp: string) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const days = Math.floor(
    (d.getTime() - new Date(timestamp).getTime()) / 86400000,
  );
  return days < 0
    ? "Today"
    : days < 1
      ? "Yesterday"
      : days < 7
        ? "Previous 7 Days"
        : "Older";
}
export function Sidebar({
  onHome,
  data,
  activeId,
  workspaceId,
  search,
  setSearch,
  onSelect,
  onNew,
  onWorkspace,
  onContext,
  onProfiles,
  onSettings,
  onAction,
  mobile,
  onClose,
  sources,
}: {
  onHome: () => void;
  data: Bootstrap;
  activeId?: string;
  workspaceId: string;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onWorkspace: (id: string) => void;
  onContext: () => void;
  onProfiles: () => void;
  onSettings: (tab?: string) => void;
  onAction: (c: Conversation, action: string) => void;
  mobile: boolean;
  onClose: () => void;
  sources: number;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const chats = data.conversations.filter(
    (c) =>
      c.workspaceId === workspaceId &&
      c.title.toLowerCase().includes(search.toLowerCase()),
  );
  const workspace = data.workspaces.find((w) => w.id === workspaceId);
  const groups = ["Pinned", "Today", "Yesterday", "Previous 7 Days", "Older"];
  return (
    <>
      {mobile && (
        <button
          className="sidebar-scrim"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
      <aside
        inert={narrow && !mobile ? true : undefined}
        aria-hidden={narrow && !mobile ? true : undefined}
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
        aria-label="Conversation sidebar"
      >
        <div className="brand-row">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              if (
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              )
                return;
              e.preventDefault();
              onHome();
            }}
          >
            <Logo />
            <span>
              canopy<span className="brand-dot">.</span>
            </span>
          </a>
          <button
            className="icon-button sidebar-mobile-close"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Home"
            title="Home"
            onClick={onHome}
          >
            <House size={17} />
          </button>
        </div>
        <button
          className="new-chat"
          onClick={onNew}
          aria-label="Start new conversation"
        >
          <Plus size={17} />
          <span>New conversation</span>
          <kbd>⌘ N</kbd>
        </button>
        <div className="sidebar-search">
          <Search size={15} />
          <input
            ref={input}
            id="conversation-search"
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="workspace-picker">
          <button
            className="workspace-button"
            aria-expanded={workspacesOpen}
            onClick={() => setWorkspacesOpen((v) => !v)}
          >
            <span className="workspace-icon">
              <Folder size={16} />
            </span>
            <span>
              <small>WORKSPACE</small>
              <strong>{workspace?.name ?? "Select workspace"}</strong>
            </span>
            <ChevronDown size={14} />
          </button>
          {workspacesOpen && (
            <div className="dropdown workspace-dropdown">
              {data.workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    onWorkspace(w.id);
                    setWorkspacesOpen(false);
                  }}
                >
                  <Folder size={14} />
                  <span>{w.name}</span>
                  {w.id === workspaceId && <span className="status-dot" />}
                </button>
              ))}
              <button
                onClick={() => {
                  setWorkspacesOpen(false);
                  onSettings("workspace");
                }}
              >
                <FolderPlus size={14} />
                Manage workspaces
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
        </div>
        <div
          className="history-scroll"
          role="navigation"
          aria-label="Chat history"
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".chat-link",
              ),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            buttons[
              (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
            ]?.focus();
            e.preventDefault();
          }}
        >
          {!chats.length && (
            <div className="history-empty">
              <MessageSquare size={22} />
              <p>
                {search
                  ? "No matching conversations"
                  : "A little space to think."}
              </p>
              <span>
                {search
                  ? "Try another search."
                  : "Your conversations will live here."}
              </span>
            </div>
          )}
          {groups.map((group) => {
            const groupChats = chats.filter((c) =>
              c.pinned ? group === "Pinned" : dateGroup(c.updatedAt) === group,
            );
            return groupChats.length ? (
              <section key={group} className="chat-group">
                <h3>
                  {group === "Pinned" && <Pin size={10} />} {group}
                </h3>
                {groupChats.map((c) => (
                  <div
                    key={c.id}
                    className={`chat-row ${activeId === c.id ? "active" : ""}`}
                  >
                    <button
                      className="chat-link"
                      onClick={() => onSelect(c.id)}
                      title={c.title}
                      aria-current={activeId === c.id ? "page" : undefined}
                    >
                      <MessageSquare size={14} />
                      <span>{c.title}</span>
                    </button>
                    <button
                      className="chat-menu-button"
                      aria-label={`Actions for ${c.title}`}
                      aria-expanded={menu === c.id}
                      onClick={() => setMenu(menu === c.id ? null : c.id)}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {menu === c.id && (
                      <>
                        <div
                          className="menu-dismiss"
                          onClick={() => setMenu(null)}
                        />
                        <div className="dropdown chat-dropdown">
                          <button
                            onClick={() => {
                              setMenu(null);
                              onAction(c, "rename");
                            }}
                          >
                            <Pencil size={13} />
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              setMenu(null);
                              onAction(c, "pin");
                            }}
                          >
                            <Pin size={13} />
                            {c.pinned ? "Unpin" : "Pin conversation"}
                          </button>
                          <button
                            className="danger-text"
                            onClick={() => {
                              setMenu(null);
                              onAction(c, "delete");
                            }}
                          >
                            <Trash2 size={13} />
                            Delete conversation
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </section>
            ) : null;
          })}
        </div>
        <div className="sidebar-context">
          <span className="eyebrow">MAKE IT YOURS</span>
          <button onClick={onContext}>
            <Layers3 size={16} />
            <span>Conversation context</span>
            <span className="count">{sources}</span>
          </button>
          <button onClick={onProfiles} aria-label="Context profiles">
            <Folder size={16} />
            <span>Context profiles</span>
            <span className="tiny-tag">5+</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className="sidebar-footer-link"
            onClick={() => onSettings("providers")}
          >
            <span className="provider-dot" />
            <span>Models & providers</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="workspace-status">
            <div className="avatar">V</div>
            <span>
              <strong>Local workspace</strong>
              <small>
                <span className="status-dot" /> Saved on this device
              </small>
            </span>
            <button
              className="icon-button"
              aria-label="Settings"
              onClick={() => onSettings()}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
