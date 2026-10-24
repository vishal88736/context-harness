import { useLayoutEffect, useRef, type ReactNode } from "react";
import { CanopyMascot } from "./CanopyMascot";
import "../home-roamer.css";

export function HomeRoamer({
  visible,
  control,
}: {
  visible: boolean;
  control: ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!visible || !layer.current) return;
    const element = layer.current;
    const measure = () => {
      element.style.setProperty(
        "--roam-width",
        `${document.documentElement.clientWidth}px`,
      );
      element.style.setProperty(
        "--roam-height",
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <>
      <div className="home-roaming-layer" ref={layer} aria-hidden="true">
        <div className="home-roamer" data-roaming-mascot="roo">
          <div className="home-roamer-heading">
            <svg className="home-roamer-trail" viewBox="0 0 64 36" fill="none">
              <path d="M3 12c18-6 32 5 58-1M13 27c17-6 30 2 44-3" />
            </svg>
            <CanopyMascot name="roo" className="home-roamer-mascot" priority />
          </div>
        </div>
      </div>
      <div className="home-roamer-controls">
        <span>Roo</span>
        {control}
      </div>
    </>
  );
}
