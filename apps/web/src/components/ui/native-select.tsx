import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background focus-visible:ring-ring flex h-9 w-full min-w-0 appearance-none rounded-md border px-3 py-1 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2",
        className,
      )}
      data-slot="native-select"
      {...props}
    >
      {children}
    </select>
  );
}

export { NativeSelect };
