import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../state/auth-context.js";
import { useAsyncTask } from "../../lib/use-api.js";
import { Alert, LoadingBlock } from "../../components/ui/page.js";
import { Field, Input } from "../../components/ui/forms.js";
import { Button } from "../../components/ui/Button.js";
import { AuthLayout, AuthLink } from "./AuthLayout.js";

export function RegisterPage() {
  const { user, status, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = Boolean((location.state as { registered?: boolean } | null)?.registered);
  const task = useAsyncTask(async (name: string, email: string, password: string) => {
    await register({ email, password, name: name || undefined });
    navigate("/login", { replace: true, state: { registered: true } });
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (status === "loading") return <LoadingBlock label="Checking session…" />;
  if (user) return <Navigate to="/dashboard" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    void task.run(name, email, password);
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking your money in minutes, free."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      {registered ? (
        <div className="mb-4">
          <Alert tone="info">Account created. Sign in below to get started.</Alert>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {task.error ? <Alert tone="error">{task.error.message}</Alert> : null}
        {localError ? <Alert tone="error">{localError}</Alert> : null}
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            placeholder="Priya Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
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
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" fullWidth loading={task.loading}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
