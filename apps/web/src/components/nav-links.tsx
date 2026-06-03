"use client";

import {
  Activity,
  Bell,
  Boxes,
  GitBranch,
  LayoutDashboard,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Button } from "./ui/button";

type NavIcon =
  | "dashboard"
  | "incidents"
  | "routes"
  | "platforms"
  | "dependents"
  | "venues"
  | "setup";

interface NavItem {
  href: string;
  icon?: string;
  label: string;
  section?: string;
}

interface NavLinksProps {
  items: NavItem[];
}

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const iconMap: Record<
  NavIcon,
  ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  dashboard: LayoutDashboard,
  incidents: Bell,
  routes: GitBranch,
  platforms: Boxes,
  dependents: Users,
  venues: Send,
  setup: Settings,
};

export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname();
  const sections = items.reduce<Array<{ label: string; items: NavItem[] }>>(
    (acc, item) => {
      const label = item.section ?? "Navigation";
      const section = acc.find((group) => group.label === label);
      if (section) section.items.push(item);
      else acc.push({ label, items: [item] });
      return acc;
    },
    [],
  );

  return (
    <nav>
      {sections.map((section) => (
        <div className="nav-section" key={section.label}>
          <span className="nav-section-label">{section.label}</span>
          {section.items.map((item) => {
            const current = isCurrentPath(pathname, item.href);
            const Icon =
              iconMap[
                (item.icon as NavIcon) in iconMap
                  ? (item.icon as NavIcon)
                  : "dashboard"
              ] ?? Activity;
            return (
              <Button
                aria-current={current ? "page" : undefined}
                asChild
                className="nav-link"
                data-current={current ? "true" : "false"}
                key={item.href}
                size="sm"
                variant="ghost"
              >
                <a href={item.href}>
                  <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </a>
              </Button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
