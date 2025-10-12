import type { ReactNode } from "react";

export default function Container({
  className = "",
  children,
}: { className?: string; children: ReactNode }) {
  return (
    <div className={`max-w-6xl mx-auto px-6 md:px-20 ${className}`}>
      {children}
    </div>
  );
}
