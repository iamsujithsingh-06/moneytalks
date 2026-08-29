import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth-context.js";
import { useAsyncTask } from "../../lib/use-api.js";
import { AuthLayout, AuthLink } from "../../components/auth/AuthLayout.js";
import { Field, Input } from "../../components/ui/form.js";
import { Button } from "../../components/ui/Button.js";
import { PageLoader } from "../../components/ui/feedback.js";

export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const task = useAsyncTask(async (email: string, password: string) => {
    await login({ email, password });
    navigate("/home", { replace: true });
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (status === "loading") return <PageLoader label="Checking session…" />;
  if (user) return <Navigate to="/home" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void task.run(email, password);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep your money in sync."
      footer={
        <>
          Don't have an account? <AuthLink to="/register">Create one free</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {task.error ? (
          <div role="alert" className="rounded-lg border border-negative-soft bg-negative-soft/30 px-3 py-2 text-sm text-negative">
            {task.error.message}
          </div>
        ) : null}
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" fullWidth loading={task.loading}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
