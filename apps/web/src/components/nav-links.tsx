"use client";

import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

interface NavLinksProps {
  items: NavItem[];
}

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav>
      {items.map((item) => {
        const current = isCurrentPath(pathname, item.href);
        return (
          <a aria-current={current ? "page" : undefined} href={item.href} key={item.href}>
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
