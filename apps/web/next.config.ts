import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

const safeExec = (cmd: string, fallback: string): string => {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

const buildNumber =
  process.env.NEXT_PUBLIC_BUILD_NUMBER ??
  safeExec("git rev-list --count HEAD", "dev");
const gitSha =
  process.env.NEXT_PUBLIC_GIT_SHA ??
  safeExec("git rev-parse --short HEAD", "dev");

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_PSM_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;
