import type { MouseEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  Code2,
  Eye,
  Files,
  GitPullRequest,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./ui";
import { WelcomeIllustration } from "./WelcomeIllustration";

export function HomePage({
  onOpenWorkspace,
  hasWorkspace,
}: {
  onOpenWorkspace: () => void;
  hasWorkspace: boolean;
}) {
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
  return (
    <div className="canopy-home">
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
              <a href="#context" className="home-text-link">
                Explore Canopy <ArrowDown size={15} />
              </a>
            </div>
            <span className="home-local-note">
              <ShieldCheck size={14} /> Local workspace. Your choice of model.
            </span>
          </div>
          <div className="home-art">
            <WelcomeIllustration />
            <span className="home-art-label">
              A little structure.
              <br />A lot more clarity.
            </span>
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
              <span className="home-feature-icon">
                <Files size={21} />
              </span>
              <h3>Bring the right sources</h3>
              <p>
                Select files, folders, instructions, previous chats, approved
                memories, or attachments. Opening a file in the editor doesn’t
                automatically share it with the AI.
              </p>
            </article>
            <article>
              <span className="home-feature-icon">
                <Eye size={21} />
              </span>
              <h3>See the effective request</h3>
              <p>
                Preview the assembled payload, actual excerpts, included
                history, and estimated tokens. See what was excluded and why
                before you send.
              </p>
            </article>
            <article>
              <span className="home-feature-icon">
                <Layers3 size={21} />
              </span>
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
            <Code2 size={44} />
            <span>Room to focus.</span>
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
        <section className="home-closing">
          <Logo />
          <h2>Make room for your next idea.</h2>
          {enter("home-primary")}
        </section>
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
