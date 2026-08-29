import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

const controlBase = [
  "w-full h-12 rounded-lg border bg-field px-3 text-base text-text-primary",
  "placeholder:text-[var(--mt-field-placeholder)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)]",
  "disabled:opacity-50 disabled:pointer-events-none",
].join(" ");

function stateClass(hasError: boolean): string {
  return hasError ? "border-negative" : "border-border-strong";
}

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
          {label}
          {required ? <span className="text-negative"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ error = false, className = "", ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={[controlBase, stateClass(error), className].filter(Boolean).join(" ")}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ error = false, className = "", children, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={[
        controlBase,
        stateClass(error),
        "appearance-none cursor-pointer pr-9",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </select>
  );
}
