import { useLayoutEffect, type RefObject } from "react";

const targets = [
  ".home-section-heading",
  ".home-product-preview",
  ".home-feature-grid article",
  ".home-build-mark",
  ".home-provider-list article",
  ".home-provider-note",
  ".home-workflow-section li",
  ".home-faq details",
  ".home-idea-copy",
  ".home-idea-art",
].join(",");

/** Progressive decoration: disabling motion or leaving Home restores readable content. */
export function useHomeReveals(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const container = root.current;
    if (!container || !enabled || typeof IntersectionObserver === "undefined")
      return;

    const elements = [...container.querySelectorAll<HTMLElement>(targets)];
    const finish = (element: HTMLElement) => {
      element.dataset.homeReveal = "done";
      element.style.removeProperty("--home-reveal-delay");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (!entry.isIntersecting || element.dataset.homeReveal !== "pending")
            continue;
          element.dataset.homeReveal = "visible";
          observer.unobserve(element);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );
    const animationEnd = (event: AnimationEvent) => {
      if (
        event.animationName === "canopy-home-reveal" &&
        event.target instanceof HTMLElement &&
        event.target.dataset.homeReveal === "visible"
      )
        finish(event.target);
    };
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>("[data-home-reveal]");
      if (element && container.contains(element)) {
        observer.unobserve(element);
        finish(element);
      }
    };
    container.addEventListener("animationend", animationEnd);
    container.addEventListener("focusin", focus);
    for (const element of elements) {
      if (element.dataset.homeReveal === "done") continue;
      const siblings = [...(element.parentElement?.children ?? [])];
      const index = Math.max(0, siblings.indexOf(element));
      element.style.setProperty(
        "--home-reveal-delay",
        `${Math.min(index, 3) * 65}ms`,
      );
      element.dataset.homeReveal = "pending";
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      container.removeEventListener("animationend", animationEnd);
      container.removeEventListener("focusin", focus);
      for (const element of elements) {
        if (element.dataset.homeReveal === "done") continue;
        delete element.dataset.homeReveal;
        element.style.removeProperty("--home-reveal-delay");
      }
    };
  }, [root, enabled]);
}
