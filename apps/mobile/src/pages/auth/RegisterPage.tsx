import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { passwordSchema } from "@moneytalks/validation";
import { useAuth } from "../../state/auth-context.js";
import { useAsyncTask } from "../../lib/use-api.js";
import { AuthLayout, AuthLink } from "../../components/auth/AuthLayout.js";
import { Field, Input } from "../../components/ui/form.js";
import { Button } from "../../components/ui/Button.js";
import { PageLoader } from "../../components/ui/feedback.js";

function validatePassword(password: string): string | null {
  const result = passwordSchema.safeParse(password);
  if (result.success) return null;
  const failed = new Set(result.error.issues.map((i) => i.message));
  const missing: string[] = [];
  if (failed.has("Password must be at least 12 characters")) missing.push("at least 12 characters");
  if (failed.has("Password must contain at least one lowercase letter")) missing.push("a lowercase letter");
  if (failed.has("Password must contain at least one uppercase letter")) missing.push("an uppercase letter");
  if (failed.has("Password must contain at least one digit")) missing.push("a number");
  return `Password must be ${missing.join(", ")}.`;
}

export function RegisterPage() {
  const { user, status, register } = useAuth();
  const navigate = useNavigate();
  const task = useAsyncTask(async (name: string, email: string, password: string) => {
    await register({ email, password, name: name || undefined });
    navigate("/login", { replace: true, state: { registered: true } });
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (status === "loading") return <PageLoader label="Checking session…" />;
  if (user) return <Navigate to="/home" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setLocalError(pwError);
      return;
    }
    void task.run(name, email, password);
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking your money automatically, free."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {task.error || localError ? (
          <div role="alert" className="rounded-lg border border-negative-soft bg-negative-soft/30 px-3 py-2 text-sm text-negative">
            {task.error?.message ?? localError}
          </div>
        ) : null}
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
        <Field label="Password" htmlFor="password" required hint="At least 12 characters with uppercase, lowercase and a number.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="At least 12 characters"
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
