export type MascotName = "byte" | "codey" | "node" | "stack" | "roo";

/** Decorative brand artwork never represents an agent action or permission. */
export function CanopyMascot({
  name,
  className = "",
  priority = false,
}: {
  name: MascotName;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      className={`canopy-mascot ${className}`.trim()}
      data-mascot={name}
      src={`/mascots/${name}.webp`}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
    />
  );
}
