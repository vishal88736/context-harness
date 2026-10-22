import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Eye,
  FileCode2,
  GitPullRequest,
  Layers3,
  LoaderCircle,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  X,
} from "lucide-react";
import {
  api,
  shortNumber,
  type Bootstrap,
  type Message,
  type Source,
  type ToolExecution,
} from "../api";
import { CopyButton, Logo, Spinner } from "./ui";
import { ContextOverview } from "./ContextOverview";

function plain(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string" || typeof n === "number"
        ? String(n)
        : isValidElement<{ children?: ReactNode }>(n)
          ? plain(n.props.children)
          : "",
    )
    .join("");
}
export function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={{
          pre({ children }) {
            const code = Children.toArray(children).find((n) =>
              isValidElement(n),
            );
            const className = isValidElement<{ className?: string }>(code)
              ? code.props.className
              : "";
            const language =
              className?.match(/language-([\w+-]+)/)?.[1] ?? "code";
            return (
              <div className="code-block">
                <div className="code-block-header">
                  <span>
                    <Code2 size={13} />
                    {language}
                  </span>
                  <CopyButton text={plain(children)} label="Copy code" />
                </div>
                <pre>{children}</pre>
              </div>
            );
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            return (
              <a
                href={typeof src === "string" ? src : undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                View image{alt ? `: ${alt}` : ""}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
export function ToolCard({
  execution,
  onDecision,
}: {
  execution: ToolExecution;
  onDecision: (id: string, approve: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(execution.status === "pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const Icon =
    execution.name === "run_command"
      ? Terminal
      : execution.name === "propose_write"
        ? GitPullRequest
        : execution.name === "search_repository"
          ? Search
          : FileCode2;
  const titles: Record<string, string> = {
    read_file: "Read file",
    search_repository: "Search repository",
    propose_write: "Proposed file change",
    run_command: "Run command",
  };
  const pending = execution.status === "pending";
  const reason =
    typeof execution.args.reason === "string" ? execution.args.reason : "";
  const command =
    typeof execution.args.command === "string" ? execution.args.command : "";
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await onDecision(execution.id, approve);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`tool-card ${pending ? "pending" : ""}`}>
      <button
        className="tool-card-heading"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded || pending}
      >
        <Icon size={15} />
        <span>
          {titles[execution.name] ?? execution.name}
          <small>
            {String(execution.args.path ?? execution.args.query ?? "").slice(
              0,
              80,
            )}
          </small>
        </span>
        <span className={`tool-status ${execution.status}`}>
          {pending ? "Needs your approval" : execution.status}
        </span>
        <ChevronDown size={14} />
      </button>
      {(expanded || pending) && (
        <div className="tool-card-body">
          {reason && <p>{reason}</p>}
          {command && <pre className="command-preview">$ {command}</pre>}
          {execution.diff && (
            <pre className="diff-preview">
              {execution.diff.split("\n").map((line, i) => (
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
          )}
          {execution.result && (
            <pre className="tool-result">{execution.result}</pre>
          )}
          {pending && (
            <>
              <div className="notice warning">
                <ShieldCheck size={14} />
                <p>
                  {execution.name === "run_command"
                    ? "This command runs as your OS user with access beyond selected context. Review it carefully."
                    : "The diff above is a proposal. Approving writes this file to disk."}
                </p>
              </div>
              <div className="approval-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => decide(false)}
                >
                  Deny
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  {busy
                    ? "Deciding…"
                    : execution.name === "run_command"
                      ? "Approve command"
                      : "Approve & apply diff"}
                </button>
              </div>
            </>
          )}
          {error && <p className="error-inline">{error}</p>}
        </div>
      )}
    </div>
  );
}
export function EmptyWorkspace({
  onSuggestion,
  onContext,
  onAddSource,
  workspaceName,
  sources,
}: {
  onSuggestion: (s: string) => void;
  onContext: () => void;
  onAddSource: () => void;
  workspaceName: string;
  sources: Source[];
}) {
  return (
    <div className="welcome">
      <div className="welcome-topline">
        <span className="welcome-index">01 /</span>
        <span className="eyebrow">NEW CONVERSATION</span>
        <button className="welcome-context-link" onClick={onContext}>
          <span className="status-dot" />
          <strong>{workspaceName}</strong>
          <ArrowRight size={13} />
        </button>
      </div>
      <div className="welcome-hero">
        <div className="welcome-copy">
          <h1>
            Your next build.
            <br />
            <span>In clear context.</span>
          </h1>
          <p className="welcome-description">
            Bring the right files into focus.
            <br />
            Keep your conversation. Shape what your model sees.
          </p>
          <div className="welcome-actions">
            <button className="welcome-add-source" onClick={onAddSource}>
              <Plus size={15} /> Add your context <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="welcome-leaf" aria-hidden="true">
          <Logo />
          <span>canopy</span>
        </div>
      </div>
      <ContextOverview sources={sources} onOpen={onContext} />
      <div className="suggestions-heading">
        <span>A starting point</span>
        <span>OR WRITE YOUR OWN BELOW</span>
      </div>
      <div className="suggestion-grid">
        {[
          [
            Code2,
            "Build something",
            "Turn an idea into working code",
            "Help me build a new feature. First inspect the authorized project files and suggest a focused implementation plan.",
          ],
          [
            Search,
            "Find the root cause",
            "Follow the clues in your code",
            "Help me investigate a bug. Ask what is failing, then use the authorized sources to identify the cause before proposing a fix.",
          ],
          [
            GitPullRequest,
            "Get a fresh perspective",
            "A thoughtful review of your work",
            "Review the authorized code for correctness, edge cases, and security. Prioritize concrete findings with file references.",
          ],
        ].map(([Icon, title, desc, prompt]) => {
          const I = Icon as typeof Code2;
          return (
            <button
              key={String(title)}
              className="suggestion-card"
              onClick={() => onSuggestion(String(prompt))}
            >
              <I size={19} />
              <strong>{String(title)}</strong>
              <span>{String(desc)}</span>
              <ArrowUp size={13} />
            </button>
          );
        })}
      </div>
      <div className="welcome-footnote">
        <Layers3 size={13} />
        <span>Every conversation has a context of its own.</span>
      </div>
    </div>
  );
}
export function MessageList({
  messages,
  executions,
  running,
  progress,
  onInspect,
  onRetry,
  onDecision,
}: {
  messages: Message[];
  executions: ToolExecution[];
  running: boolean;
  progress: string;
  onInspect: (id: string) => void;
  onRetry: (m: Message) => void;
  onDecision: (id: string, approve: boolean) => Promise<void>;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const latestUser = messages.findLastIndex((m) => m.role === "user");
  const latestAssistant = messages.findLastIndex((m) => m.role === "assistant");
  const retryId =
    latestAssistant > latestUser ? messages[latestAssistant]?.id : undefined;
  useEffect(() => {
    if (follow)
      bottom.current?.scrollIntoView({
        behavior: running ? "instant" : "smooth",
        block: "end",
      });
  }, [messages, executions, follow, running]);
  return (
    <div
      className="message-scroll"
      ref={scroll}
      onScroll={() => {
        const e = scroll.current;
        if (e) setFollow(e.scrollHeight - e.scrollTop - e.clientHeight < 140);
      }}
    >
      <div className="messages">
        {messages.map((m, index) => {
          const next = messages
            .slice(index + 1)
            .find((n) => n.role === "assistant");
          const tools =
            m.role === "assistant"
              ? executions.filter(
                  (e) =>
                    e.createdAt >= m.createdAt &&
                    (!next || e.createdAt < next.createdAt),
                )
              : [];
          return (
            <article className={`message ${m.role}`} key={m.id}>
              <div className="message-meta">
                {m.role === "assistant" ? (
                  <Logo small />
                ) : (
                  <span className="user-message-avatar">You</span>
                )}
                <strong>{m.role === "assistant" ? "Canopy" : "You"}</strong>
                <time>
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {m.status === "streaming" && (
                  <span className="streaming-label">
                    <span className="status-dot pulse" />
                    Working
                  </span>
                )}
              </div>
              {m.content ? (
                <MarkdownBody content={m.content} />
              ) : m.status === "streaming" ? (
                <div className="thinking">
                  <span />
                  <span />
                  <span />
                  <small>{progress || "Making the connections…"}</small>
                </div>
              ) : null}
              {tools.length > 0 && (
                <div className="tool-timeline">
                  {tools.map((e) => (
                    <ToolCard
                      key={e.id}
                      execution={e}
                      onDecision={onDecision}
                    />
                  ))}
                </div>
              )}
              {m.error && (
                <div
                  className={`response-error ${m.status === "stopped" ? "stopped" : ""}`}
                  role={m.status === "error" ? "alert" : undefined}
                >
                  {m.error}
                </div>
              )}
              {m.role === "assistant" && m.status !== "streaming" && (
                <div className="message-actions">
                  <CopyButton text={m.content} label="Copy response" />
                  {m.invocationId && (
                    <button onClick={() => onInspect(m.invocationId!)}>
                      <Eye size={13} />
                      View context
                    </button>
                  )}
                  {m.id === retryId && (
                    <button disabled={running} onClick={() => onRetry(m)}>
                      <RotateCcw size={13} />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
        <div ref={bottom} className="scroll-anchor" />
      </div>
      {!follow && (
        <button
          className="scroll-bottom"
          aria-label="Scroll to latest message"
          onClick={() => {
            setFollow(true);
            bottom.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}

export function Composer({
  data,
  value,
  onChange,
  instructions,
  onInstructions,
  attachments,
  onAttachments,
  modelValue,
  onModel,
  onSend,
  onStop,
  onPreview,
  onContext,
  onSettings,
  running,
  busy,
  connected,
  sourceCount,
  navigating,
}: {
  data: Bootstrap;
  value: string;
  onChange: (s: string) => void;
  instructions: string;
  onInstructions: (s: string) => void;
  attachments: Source[];
  onAttachments: (s: Source[]) => void;
  modelValue: string;
  onModel: (s: string) => void;
  onSend: () => void;
  onStop: () => void;
  onPreview: () => void;
  onContext: () => void;
  onSettings: () => void;
  running: boolean;
  busy: boolean;
  connected: boolean;
  sourceCount: number;
  navigating: boolean;
}) {
  const [temp, setTemp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = textarea.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = `${Math.min(190, t.scrollHeight)}px`;
    }
  }, [value]);
  async function upload(files: FileList | File[] | null) {
    if (!files?.length || navigating) return;
    setUploading(true);
    setError("");
    try {
      const added: Source[] = [];
      for (const f of [...files]) {
        if (f.size > 4_000_000) throw new Error(`${f.name} exceeds 4 MB.`);
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        added.push(
          await api<Source>("/attachments", "POST", { name: f.name, data }),
        );
      }
      onAttachments([...attachments, ...added]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <div className="composer-wrap">
      <div
        className={`composer ${running ? "is-running" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
      >
        {attachments.length > 0 && (
          <div className="attachment-chips">
            {attachments.map((a) => (
              <span key={a.id}>
                <Paperclip size={12} />
                {a.name}
                <button
                  onClick={() =>
                    onAttachments(attachments.filter((s) => s.id !== a.id))
                  }
                  aria-label={`Remove attachment ${a.name}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {(temp || instructions) && (
          <div className="temporary-instructions">
            <span>
              <PenIcon />
              Just this request
            </span>
            <textarea
              aria-label="Temporary instructions"
              disabled={navigating}
              value={instructions}
              onChange={(e) => onInstructions(e.target.value)}
              rows={2}
              placeholder="Any extra guidance for this turn?"
            />
            <button
              className="icon-button"
              aria-label="Clear temporary instructions"
              onClick={() => {
                onInstructions("");
                setTemp(false);
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <textarea
          ref={textarea}
          className="prompt-input"
          disabled={navigating}
          id="message-composer"
          aria-label="Message Canopy"
          placeholder="Ask anything. Build something."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (!running && value.trim() && connected && !busy && !uploading)
                onSend();
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void upload(e.clipboardData.files);
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button
              className="icon-button"
              aria-label="Attach files"
              title="Attach files for this request"
              disabled={uploading || navigating}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Plus size={19} />
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button
              className={`composer-tool ${temp || instructions ? "active" : ""}`}
              title="Instructions for this request only"
              disabled={navigating}
              onClick={() => setTemp((v) => !v)}
            >
              <PenIcon />
              <span>Instructions</span>
            </button>
            <button
              className="composer-tool context-composer-button"
              onClick={onContext}
            >
              <Layers3 size={14} />
              <span>Context</span>
              {sourceCount > 0 && <small>{sourceCount}</small>}
            </button>
          </div>
          <div className="composer-send-tools">
            {connected ? (
              <div className="model-select-wrap">
                <span className="model-indicator" />
                <select
                  aria-label="Model for next request"
                  title="Switch provider or model for the next request. Your conversation and selected context stay together; each model’s input limits still apply."
                  disabled={navigating}
                  value={modelValue}
                  onChange={(e) => onModel(e.target.value)}
                >
                  <option value="">Conversation model</option>
                  {data.providers.map((p) => (
                    <optgroup label={p.name} key={p.id}>
                      {p.models.map((m) => (
                        <option value={`${p.id}::${m.id}`} key={m.id}>
                          {p.name} · {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown size={12} />
              </div>
            ) : (
              <button className="connect-model" onClick={onSettings}>
                Connect a model <ArrowRight size={12} />
              </button>
            )}
            {running ? (
              <button
                className="stop-button"
                aria-label="Stop generation"
                onClick={onStop}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                aria-label="Send message"
                disabled={
                  !value.trim() || !connected || busy || uploading || navigating
                }
                onClick={onSend}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="composer-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="composer-caption">
        <span>Switch providers, keep your context.</span>
        <button disabled={busy || running} onClick={onPreview}>
          <Eye size={12} />
          Preview request
        </button>
        <span className="enter-hint">
          ↵ send <i>·</i> ⇧↵ new line
        </span>
      </div>
    </div>
  );
}
function PenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m10.5 2.5 3 3M3 10l7.5-7.5a2.12 2.12 0 0 1 3 3L6 13l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
