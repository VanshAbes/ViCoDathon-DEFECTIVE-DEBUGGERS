import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeft, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {iconLeft && (
          <span className="pointer-events-none absolute left-3 flex items-center text-ink-tertiary">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            "h-9 w-full rounded-sm border border-line-subtle bg-graphite px-3 text-sm text-ink-primary",
            "placeholder:text-ink-tertiary",
            "outline-none transition-colors focus:border-cyan/50",
            iconLeft && "pl-9",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";
