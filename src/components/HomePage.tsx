import { useEffect, useState, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  Code2,
  Eye,
  Files,
  GitPullRequest,
  Layers3,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./ui";
import { CanopyMascot } from "./CanopyMascot";
import { HomeRoamer } from "./HomeRoamer";
import { HomeClosing } from "./HomeClosing";
import "../home-motion.css";

export function HomePage({
  onOpenWorkspace,
  hasWorkspace,
  visible = true,
}: {
  onOpenWorkspace: () => void;
  hasWorkspace: boolean;
  visible?: boolean;
}) {
  const [motionPaused, setMotionPaused] = useState(() => {
    try {
      return localStorage.getItem("canopy.homeMotion") === "paused";
    } catch {
      return false;
    }
  });
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [documentVisible, setDocumentVisible] = useState(
    () => !document.hidden,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setReducedMotion(media.matches);
    const visibility = () => setDocumentVisible(!document.hidden);
    const sync = (event: StorageEvent) => {
      if (event.key === "canopy.homeMotion")
        setMotionPaused(event.newValue === "paused");
    };
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "canopy.homeMotion",
        motionPaused ? "paused" : "auto",
      );
    } catch {
      /* Motion preference remains usable when storage is unavailable. */
    }
  }, [motionPaused]);
  const motionRunning =
    visible && documentVisible && !reducedMotion && !motionPaused;
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onOpenWorkspace();
  }
  const action = hasWorkspace ? "Resume workspace" : "Open workspace";
  const enter = (className: string) => (
    <a className={className} href="/workspace" onClick={open}>
      {action}
      <ArrowRight size={17} />
    </a>
  );
  const motionControl = (
    <button
      type="button"
      className="home-motion-toggle"
      disabled={reducedMotion}
      aria-label={
        reducedMotion
          ? "Roo animation disabled by reduced motion"
          : motionPaused
            ? "Play Roo animation"
            : "Pause Roo animation"
      }
      title={
        reducedMotion
          ? "Your system's reduced-motion preference is enabled."
          : undefined
      }
      onClick={() => setMotionPaused((paused) => !paused)}
    >
      {reducedMotion || motionPaused ? <Play size={12} /> : <Pause size={12} />}
      {reducedMotion ? "Motion off" : motionPaused ? "Play Roo" : "Pause Roo"}
    </button>
  );
  return (
    <div
      className="canopy-home"
      data-motion={motionRunning ? "running" : "paused"}
    >
      <HomeRoamer visible={visible} control={motionControl} />
      <a className="home-skip" href="#home-content">
        Skip to content
      </a>
      <header className="home-header">
        <a
          className="home-brand"
          href="/"
          aria-label="Canopy home"
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            window.history.replaceState({}, "", "/");
            window.scrollTo({ top: 0 });
          }}
        >
          <Logo />
          <span>canopy.</span>
        </a>
        <nav aria-label="Home navigation">
          <a href="#context">Context</a>
          <a href="#providers">Providers</a>
          <a href="#workflow">How it works</a>
        </nav>
        {enter("home-nav-action")}
      </header>
      <main id="home-content">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-eyebrow">
              <span /> A clearer space to build
            </span>
            <h1>
              Your next build.
              <br />
              <em>In clear context.</em>
            </h1>
            <p>
              Give your coding agent the right context.
              <br className="home-wide-break" /> See what it receives. Keep
              control as you build.
            </p>
            <div className="home-hero-actions">
              {enter("home-primary")}
              <a href="#workspace-preview" className="home-text-link">
                Explore Canopy <ArrowDown size={15} />
              </a>
            </div>
            <div className="home-details">
              <span className="home-local-note">
                <ShieldCheck size={14} /> Local workspace. Your choice of model.
              </span>
            </div>
          </div>
          <div className="home-art" aria-hidden="true">
            <div className="home-mascot-orbit home-mascot-orbit-outer" />
            <div className="home-mascot-orbit home-mascot-orbit-inner" />
            <span className="home-orbit-card home-orbit-sources">
              <Files size={16} /> your sources
            </span>
            <span className="home-orbit-card home-orbit-context">
              <Layers3 size={16} /> clear context
            </span>
            <span className="home-orbit-code">
              <Code2 size={24} />
            </span>
            <CanopyMascot
              name="byte"
              className="home-hero-mascot"
              priority={visible}
            />
            <div className="home-art-caption">
              <span className="home-mascot-name">Meet Byte</span>
              <span>A little structure. A lot more clarity.</span>
            </div>
          </div>
        </section>
        <div className="home-capabilities" aria-label="Workspace capabilities">
          <span>
            <Files size={15} /> Files & folders
          </span>
          <span>
            <Layers3 size={15} /> Independent context
          </span>
          <span>
            <Code2 size={15} /> Code workspace
          </span>
          <span>
            <ShieldCheck size={15} /> Reviewed actions
          </span>
        </div>

        <section
          id="workspace-preview"
          className="home-section home-product-section"
        >
          <div className="home-section-heading">
            <h2>See the workspace.</h2>
          </div>
          <figure className="home-product-preview">
            <a
              className="home-preview-image home-preview-light"
              href="/workspace-preview-light.webp"
              aria-label="Open workspace preview"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src="/workspace-preview-light.webp"
                width="1440"
                height="900"
                loading="lazy"
                alt="Canopy workspace showing a sample project's files, code editor, and selected conversation context."
              />
              <span className="home-preview-open">
                <Eye size={14} /> Open workspace preview{" "}
                <ArrowRight size={14} />
              </span>
            </a>
            <a
              className="home-preview-image home-preview-dark"
              href="/workspace-preview-dark.webp"
              aria-label="Open workspace preview"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src="/workspace-preview-dark.webp"
                width="1440"
                height="900"
                loading="lazy"
                alt="Canopy workspace showing a sample project's files, code editor, and selected conversation context."
              />
              <span className="home-preview-open">
                <Eye size={14} /> Open workspace preview{" "}
                <ArrowRight size={14} />
              </span>
            </a>
            <figcaption>
              <span>Actual Canopy workspace, shown with a sample project.</span>
              <span className="home-preview-labels">
                <span>
                  <Files size={13} /> Browse files
                </span>
                <span>
                  <Code2 size={13} /> Edit code
                </span>
                <span>
                  <Layers3 size={13} /> Choose context
                </span>
              </span>
              {enter("home-text-link")}
            </figcaption>
          </figure>
        </section>

        <section id="context" className="home-section home-context-section">
          <div className="home-section-heading">
            <span className="home-eyebrow">01 / Context comes first</span>
            <h2>
              Choose what this
              <br />
              conversation knows.
            </h2>
            <p>
              Every conversation gets its own context. Change a selection,
              switch a model, or come back later. Your conversation stays yours.
            </p>
          </div>
          <div className="home-feature-grid">
            <article>
              <div
                className="home-feature-art home-feature-node"
                aria-hidden="true"
              >
                <CanopyMascot name="node" />
                <span className="home-mascot-name">Node</span>
              </div>
              <h3>Bring the right sources</h3>
              <p>
                Select files, folders, instructions, previous chats, approved
                memories, or attachments. Opening a file in the editor doesn’t
                automatically share it with the AI.
              </p>
            </article>
            <article>
              <div
                className="home-feature-art home-feature-inspect"
                aria-hidden="true"
              >
                <Eye
                  className="home-inspect-glyph"
                  size={54}
                  strokeWidth={1.2}
                />
                <span className="home-mascot-name">Inspect</span>
              </div>
              <h3>See the effective request</h3>
              <p>
                Preview the assembled payload, actual excerpts, included
                history, and estimated tokens. See what was excluded and why
                before you send.
              </p>
            </article>
            <article>
              <div
                className="home-feature-art home-feature-stack"
                aria-hidden="true"
              >
                <CanopyMascot name="stack" />
                <span className="home-mascot-name">Stack</span>
              </div>
              <h3>Keep useful configurations</h3>
              <p>
                Save context profiles for coding, debugging, research, and
                reviews. Apply a profile with conversation-specific additions
                without losing your messages.
              </p>
            </article>
          </div>
        </section>

        <section className="home-build-section home-section">
          <div className="home-build-mark" aria-hidden="true">
            <div className="home-build-grid" />
            <CanopyMascot name="codey" className="home-build-mascot" />
            <div className="home-build-caption">
              <span className="home-mascot-name">Codey</span>
              <span>Room to focus.</span>
            </div>
          </div>
          <div className="home-section-heading">
            <span className="home-eyebrow">02 / Made for the work</span>
            <h2>
              A workspace for
              <br />
              thinking and coding.
            </h2>
            <p>
              Open your project, work across file tabs, and keep the
              conversation close. The context panel is there when you need it.
            </p>
            <ul>
              <li>
                <Code2 size={17} /> Syntax editing, search, folding, and undo
              </li>
              <li>
                <GitPullRequest size={17} /> Review a real diff before saving a
                file
              </li>
              <li>
                <ShieldCheck size={17} /> Separate approvals for agent writes
                and commands
              </li>
              <li>
                <Eye size={17} /> Light, dark, and system themes with editor
                preferences
              </li>
            </ul>
            {enter("home-text-link")}
          </div>
        </section>

        <section id="providers" className="home-section home-provider-section">
          <div className="home-section-heading">
            <span className="home-eyebrow">03 / Your model, your choice</span>
            <h2>
              Switch providers.
              <br />
              <em>Keep your context.</em>
            </h2>
            <p>
              Assign a model to a conversation or choose one for a single
              request. Your selected sources and messages stay with the
              conversation.
            </p>
          </div>
          <div className="home-provider-list">
            {[
              ["Ollama", "Local models through the native Ollama interface."],
              ["Anthropic", "Native model discovery and Messages API."],
              ["Gemini", "Native model discovery and streaming."],
              [
                "Compatible endpoints",
                "Providers that support the Chat Completions protocol.",
              ],
            ].map(([name, description]) => (
              <article key={name}>
                <span>{name}</span>
                <p>{description}</p>
                <ArrowRight size={16} aria-hidden="true" />
              </article>
            ))}
            <p className="home-provider-note">
              Connect your endpoint and credentials in the workspace. Models
              come from discovery or your explicit configuration.
            </p>
          </div>
        </section>

        <section id="workflow" className="home-section home-workflow-section">
          <div className="home-section-heading">
            <span className="home-eyebrow">A simple way in</span>
            <h2>From folder to focused work.</h2>
          </div>
          <ol>
            {[
              [
                "Open your project",
                "Connect an accessible local folder, then select your provider and model.",
              ],
              [
                "Set the context",
                "Choose sources and permissions for this conversation. Preview exactly what will be sent.",
              ],
              [
                "Build, inspect, refine",
                "Chat, edit code, review proposed changes, and adjust context as the work evolves.",
              ],
            ].map(([title, description], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-section home-faq">
          <div className="home-section-heading">
            <span className="home-eyebrow">A few useful details</span>
            <h2>Before you begin.</h2>
          </div>
          <div>
            <details>
              <summary>Does Canopy include an AI model?</summary>
              <p>
                No. Connect a supported hosted provider or a local Ollama
                installation. Inference requires provider access or an installed
                local model.
              </p>
            </details>
            <details>
              <summary>Does opening a folder share every file?</summary>
              <p>
                No. You choose the context for each conversation. Authorized
                folders provide relevant retrieved excerpts, and the inspector
                shows the actual content included.
              </p>
            </details>
            <details>
              <summary>Can I change context without starting over?</summary>
              <p>
                Yes. Enable, disable, replace, or remove sources for subsequent
                requests. Earlier responses and their recorded request snapshots
                remain unchanged.
              </p>
            </details>
            <details>
              <summary>Where is my work stored?</summary>
              <p>
                Conversations, configuration, and invocation records are stored
                locally in SQLite. Selected context is sent to the provider you
                choose. Unsaved editor drafts remain in memory until you save;
                they do not survive a page reload.
              </p>
            </details>
          </div>
        </section>
        <HomeClosing action={enter("home-primary")} />
      </main>
      <footer className="home-footer">
        <span>Canopy · Context-first AI coding</span>
        <a
          href="https://github.com/vishal88736/context-harness"
          target="_blank"
          rel="noreferrer"
        >
          Source & documentation <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  );
}
