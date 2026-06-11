/**
 * notification-filter — gates which incidents reach Telegram.
 *
 * Pure function; no I/O. Layered BEFORE the existing active-hours and
 * dependent-matching checks in the Telegram notifier. The dashboard continues
 * to display every incident regardless of these filters.
 *
 * Evaluation order (an incident passes only if ALL pass):
 *   1. severityFloor — incident.severity must be in the configured floor list.
 *   2. perPlatform[id].enabled — explicit `false` silences the platform entirely.
 *   3. componentAllowlist — if set, incident.services must intersect.
 *   4. componentDenylist — if set, incident.services must NOT intersect.
 *   5. regionAllowlist — if set, incident.zones must intersect.
 *
 * Pass-through default: when a platform has no `perPlatform` entry, the only
 * filter that applies is the severity floor.
 */

import type { Incident } from "./incident";
import type { InstallConfig } from "./config-schema";

export type SilenceReason =
  | "severity-floor"
  | "platform-disabled"
  | "component-not-allowed"
  | "component-denied"
  | "region-not-allowed";

export interface SilenceDecision {
  silenced: boolean;
  reason?: SilenceReason;
}

const PASS: SilenceDecision = { silenced: false };

function intersects(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a || !b) return false;
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  for (const value of b) {
    if (set.has(value)) return true;
  }
  return false;
}

export function shouldSilenceTelegram(
  incident: Incident,
  filters: InstallConfig["notificationFilters"] | undefined,
): SilenceDecision {
  // No filters configured at all → pass-through (preserve legacy behavior).
  if (!filters) return PASS;

  // 1. Severity floor. Default per schema is ["critical", "major"]; respect explicit
  //    empty array as "let everything through the floor" (operator choice).
  const floor = filters.severityFloor;
  if (Array.isArray(floor) && floor.length > 0) {
    if (!floor.includes(incident.severity as "critical" | "major")) {
      return { silenced: true, reason: "severity-floor" };
    }
  }

  // 2..5. Per-platform rules. Absent entry → pass-through.
  const perPlatform = filters.perPlatform ?? {};
  const rule = perPlatform[incident.platform];
  if (!rule) return PASS;

  if (rule.enabled === false) {
    return { silenced: true, reason: "platform-disabled" };
  }

  if (rule.componentAllowlist && rule.componentAllowlist.length > 0) {
    if (!intersects(rule.componentAllowlist, incident.services)) {
      return { silenced: true, reason: "component-not-allowed" };
    }
  }

  if (rule.componentDenylist && rule.componentDenylist.length > 0) {
    if (intersects(rule.componentDenylist, incident.services)) {
      return { silenced: true, reason: "component-denied" };
    }
  }

  if (rule.regionAllowlist && rule.regionAllowlist.length > 0) {
    if (!intersects(rule.regionAllowlist, incident.zones)) {
      return { silenced: true, reason: "region-not-allowed" };
    }
  }

  return PASS;
}
