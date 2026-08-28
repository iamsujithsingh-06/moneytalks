import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth-context.js";
import { useAsyncTask } from "../../lib/use-api.js";
import { Alert, LoadingBlock } from "../../components/ui/page.js";
import { Field, Input } from "../../components/ui/forms.js";
import { Button } from "../../components/ui/Button.js";
import { AuthLayout, AuthLink } from "./AuthLayout.js";

export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const task = useAsyncTask(async (email: string, password: string) => {
    await login({ email, password });
    navigate("/dashboard", { replace: true });
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (status === "loading") return <LoadingBlock label="Checking session…" />;
  if (user) return <Navigate to="/dashboard" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void task.run(email, password);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see how your money is moving."
      footer={
        <>
          Don't have an account?{" "}
          <AuthLink to="/register">Create one free</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {task.error ? <Alert tone="error">{task.error.message}</Alert> : null}
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
