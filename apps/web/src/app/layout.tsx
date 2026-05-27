import type { Metadata } from "next";
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
  { href: "/setup", label: "Agent Setup" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <aside>
          <h1>Platform Status Monitor</h1>
          <nav>
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}

