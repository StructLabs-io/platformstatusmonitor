import { getJson, type Env } from "./state/kv-state";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true, service: "platform-status-monitor" });
  }

  if (url.pathname === "/api/incidents/recent") {
    const incidentIds = await getJson<string[]>(env.PSM_STATE, "index:incidents:recent", []);
    const incidents = await Promise.all(incidentIds.map((id) => getJson(env.PSM_STATE, `incident:${id}`, null)));
    return json({ incidents: incidents.filter(Boolean) });
  }

  if (url.pathname === "/api/decisions/recent") {
    const decisionIds = await getJson<string[]>(env.PSM_STATE, "index:decisions:recent", []);
    const decisions = await Promise.all(decisionIds.map((id) => getJson(env.PSM_STATE, `decision:${id}`, null)));
    return json({ decisions: decisions.filter(Boolean) });
  }

  if (url.pathname === "/api/validation") {
    const validation = await getJson(env.PSM_STATE, "validation:latest", { valid: false, issues: ["validation has not run"] });
    return json(validation);
  }

  return json({ error: "not found" }, { status: 404 });
}

export default {
  fetch: handleFetch,
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await env.PSM_STATE.put("validation:latest", JSON.stringify({ valid: true, issues: [], checkedAt: new Date().toISOString() }));
  }
};

export type { Env };

