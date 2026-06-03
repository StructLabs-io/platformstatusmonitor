import { writeFileSync } from "node:fs";
import { z } from "zod";
import { installConfigSchema } from "./config-schema";

const outputPath = process.argv[2] ?? "config/install.schema.json";
const schema = {
  title: "PlatformStatusMonitorInstallConfig",
  ...z.toJSONSchema(installConfigSchema)
};

writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Wrote JSON schema: ${outputPath}`);
