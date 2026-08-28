import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const controlBase = [
  "w-full rounded-md border bg-field px-3.5 text-sm text-text-primary",
  "placeholder:text-[var(--mt-field-placeholder)]",
  "transition-colors duration-150",
  "focus:outline-none focus:ring-2 focus:ring-[var(--mt-focus-ring)]",
  "disabled:opacity-50 disabled:pointer-events-none",
].join(" ");

function stateClasses(hasError: boolean, hasValid: boolean): string {
  if (hasError) return "border-negative focus:border-negative";
  if (hasValid) return "border-positive focus:border-positive";
  return "border-border hover:border-border-strong focus:border-[var(--mt-accent-primary)]";
}

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-text-secondary"
        >
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
  valid?: boolean;
}

export function Input({ error = false, valid = false, className = "", ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={[controlBase, stateClasses(error, valid), "h-11", className]
        .filter(Boolean)
        .join(" ")}
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
        stateClasses(error, false),
        "h-11 appearance-none pr-9 bg-no-repeat cursor-pointer",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236f7485%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
        "bg-position-x-[right_0.75rem] bg-position-y-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({
  error = false,
  className = "",
  ...rest
}: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={[controlBase, stateClasses(error, false), "py-2.5 min-h-[88px] resize-y", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
