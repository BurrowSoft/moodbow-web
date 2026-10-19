"use client";

import { useEffect, useRef } from "react";

// An element that takes focus when it appears: the start of a view that
// replaces the form whose button had focus (sign-up's "Check your email",
// Forgot password's "sent"), so focus isn't lost and the new view is read
// from there (screen-reader pass).
export function FocusOnMount({
  as: Tag = "h2",
  className,
  children,
  testId,
  role,
}: {
  as?: "h1" | "h2" | "p";
  className?: string;
  children: React.ReactNode;
  testId?: string;
  role?: "status";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Tag ref={ref as React.Ref<never>} tabIndex={-1} role={role} data-testid={testId} className={`outline-none ${className ?? ""}`}>
      {children}
    </Tag>
  );
}
