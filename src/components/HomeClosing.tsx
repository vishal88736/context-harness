import type { ReactNode } from "react";
import { Logo } from "./ui";
import "../home-closing.css";

export function HomeClosing({ action }: { action: ReactNode }) {
  return (
    <section className="home-idea-room" aria-labelledby="home-idea-title">
      <div className="home-idea-copy">
        <h2 id="home-idea-title">
          Make room for
          <br />
          your <em>next idea.</em>
        </h2>
        <p>Start with an idea. Bring the right context.</p>
        <div className="home-idea-action">{action}</div>
      </div>
      <div className="home-idea-art" aria-hidden="true">
        <span className="home-idea-paper home-idea-paper-back" />
        <span className="home-idea-paper home-idea-paper-note">
          <svg viewBox="0 0 120 100" fill="none">
            <path d="M20 67c14-31 28-43 41-35 14 9-13 38-18 24-5-15 27-30 50-8M78 43l16 5-8 15" />
          </svg>
        </span>
        <div className="home-idea-window">
          <div className="home-idea-window-edge">
            <span />
            <span />
            <span />
          </div>
          <div className="home-idea-leaf">
            <Logo />
          </div>
          <span className="home-idea-window-line" />
        </div>
        <svg className="home-idea-pencil" viewBox="0 0 340 240" fill="none">
          <path d="M19 171c22 32 73 45 124 26 28-11 45-31 40-44-7-18-47-4-39 14 13 32 99 22 146-29" />
          <path d="m272 140 20-5-3 21" />
        </svg>
        <span className="home-idea-dot" />
      </div>
    </section>
  );
}
