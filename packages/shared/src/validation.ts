import { installConfigSchema, type InstallConfig } from "./config-schema";

export function validateInstallConfig(input: unknown): string[] {
  const parsed = installConfigSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }

  const config = parsed.data;
  const issues: string[] = [];

  config.routingRules.forEach((rule, ruleIndex) => {
    rule.actions.forEach((action, actionIndex) => {
      if (!config.venues[action.venue]) {
        issues.push(`routingRules[${ruleIndex}].actions[${actionIndex}].venue references unknown venue: ${action.venue}`);
      }
    });
  });

  Object.entries(config.dependents).forEach(([dependentId, dependent]) => {
    dependent.dependencies.forEach((dependency, dependencyIndex) => {
      const platform = config.platforms[dependency.platform];
      if (!platform) {
        issues.push(`dependents.${dependentId}.dependencies[${dependencyIndex}].platform references unknown platform: ${dependency.platform}`);
        return;
      }

      dependency.services.forEach((service) => {
        if (!platform.services[service]) {
          issues.push(`dependents.${dependentId}.dependencies[${dependencyIndex}].services references unknown service: ${dependency.platform}.${service}`);
        }
      });
    });
  });

  return issues;
}

export function assertValidInstallConfig(input: unknown): InstallConfig {
  const parsed = installConfigSchema.parse(input);
  const issues = validateInstallConfig(parsed);
  if (issues.length > 0) {
    throw new Error(issues.join("\n"));
  }
  return parsed;
}

