export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={[
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">Loading</span>
    </span>
  );
}

interface SkeletonProps {
  className?: string;
  height?: string;
}

export function Skeleton({ className = "", height = "h-4" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "animate-pulse rounded-md bg-raised",
        height,
        className,
      ].join(" ")}
    />
  );
}
