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
          <CanopyMascot name="roo" className="home-roamer-mascot" priority />
        </div>
      </div>
      <div className="home-roamer-controls">
        <span>Roo</span>
        {control}
      </div>
    </>
  );
}
