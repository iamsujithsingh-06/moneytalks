import { Link } from "react-router-dom";
import { Logo } from "../components/ui/Logo.js";

export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo size="lg" />
      <div>
        <p className="font-numeric text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-xl font-bold text-text-primary">Page not found</h1>
        <p className="mt-1 text-sm text-text-muted">
          The page you're looking for doesn't exist or has moved.
        </p>
      </div>
      <Link
        to="/dashboard"
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
