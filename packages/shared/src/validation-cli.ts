import { readFileSync } from "node:fs";
import { validateInstallConfig } from "./validation";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: tsx src/validation-cli.ts <config.json>");
  process.exit(2);
}

const json = JSON.parse(readFileSync(filePath, "utf8"));
const issues = validateInstallConfig(json);
if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log(`Config valid: ${filePath}`);
