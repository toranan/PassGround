"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type RouteDropdownOption = {
  key: string;
  label: string;
  href: string;
  disabled?: boolean;
};

type RouteDropdownProps = {
  value: string;
  options: RouteDropdownOption[];
  ariaLabel: string;
  className?: string;
};

export function RouteDropdown({ value, options, ariaLabel, className }: RouteDropdownProps) {
  const router = useRouter();

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        const target = options.find((option) => option.key === event.target.value);
        if (!target || target.disabled) return;
        router.push(target.href);
      }}
      className={cn(
        "h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 outline-none transition-colors hover:border-gray-300",
        className
      )}
    >
      {options.map((option) => (
        <option key={option.key} value={option.key} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
