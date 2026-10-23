import { lazy, Suspense, useEffect, useState } from "react";
import { HomePage } from "./components/HomePage";
import { Logo, Spinner } from "./components/ui";

const WorkspaceApp = lazy(() =>
  import("./App").then((module) => ({ default: module.App })),
);
const workspacePath = (path: string) =>
  path.replace(/\/+$/, "") === "/workspace";

/** Keep an opened workspace mounted so route navigation preserves drafts and streams. */
export function ApplicationRouter() {
  const [path, setPath] = useState(window.location.pathname);
  const [opened, setOpened] = useState(() =>
    workspacePath(window.location.pathname),
  );
  const inWorkspace = workspacePath(path);
  const atHome = path === "/";

  useEffect(() => {
    const restore = () => {
      const next = window.location.pathname;
      if (workspacePath(next)) setOpened(true);
      setPath(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    document.title = inWorkspace
      ? "Canopy — Workspace"
      : atHome
        ? "Canopy — Context-first AI coding"
        : "Canopy — Page not found";
  }, [inWorkspace, atHome]);

  function navigate(next: "/" | "/workspace") {
    if (next === "/workspace") setOpened(true);
    if (window.location.pathname !== next || window.location.hash)
      window.history.pushState({}, "", next);
    setPath(next);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "instant" }),
    );
  }

  return (
    <>
      <div hidden={!atHome} data-route-page="home">
        <HomePage
          hasWorkspace={opened}
          visible={atHome}
          onOpenWorkspace={() => navigate("/workspace")}
        />
      </div>
      {opened && (
        <div
          hidden={!inWorkspace}
          inert={!inWorkspace ? true : undefined}
          data-route-page="workspace"
        >
          <Suspense
            fallback={
              <main className="app-loading">
                <Logo />
                <Spinner label="Opening your workspace…" />
              </main>
            }
          >
            <WorkspaceApp active={inWorkspace} onHome={() => navigate("/")} />
          </Suspense>
        </div>
      )}
      {!atHome && !inWorkspace && (
        <main className="app-loading">
          <Logo />
          <h1>Page not found</h1>
          <button className="primary-button" onClick={() => navigate("/")}>
            Return home
          </button>
        </main>
      )}
    </>
  );
}
