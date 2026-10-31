"use client";
import { useFormStatus } from "react-dom";

export function Submit({ children, pendingText, className = "btn" }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "잠시만요…" : children}
    </button>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="mt-3 text-sm text-period-ink">{message}</p>;
}
