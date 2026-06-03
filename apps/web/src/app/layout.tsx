import { NavLinks } from "../components/nav-links";
import type { Metadata } from "next";
import { ThemeToggle } from "../components/theme-toggle";
import "./styles.css";

export const metadata: Metadata = {
  title: "Platform Status Monitor",
  description: "Read-only platform status routing dashboard"
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/platforms", label: "Platforms" },
  { href: "/dependents", label: "Dependents" },
  { href: "/routes", label: "Routes" },
  { href: "/venues", label: "Venues" },
  { href: "/setup", label: "Agent Setup" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <aside>
          <div className="brand-row">
            <h1>Platform Status Monitor</h1>
            <ThemeToggle />
          </div>
          <NavLinks items={navItems} />
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
