export interface Env {
  PSM_STATE: KVNamespace;
  PSM_ADMIN_TOKEN?: string;
  PSM_READ_TOKEN?: string;
  PSM_ALLOWED_ORIGINS?: string;
  PSM_PUBLIC_READS?: string;
  PSM_VERSION?: string;
  PSM_BUILD_NUMBER?: string;
  PSM_GIT_SHA?: string;
}

export async function getJson<T>(
  kv: KVNamespace,
  key: string,
  fallback: T,
): Promise<T> {
  const value = await kv.get(key);
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export async function putJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
): Promise<void> {
  await kv.put(key, JSON.stringify(value));
}

export async function putJsonIfChanged(
  kv: KVNamespace,
  key: string,
  value: unknown,
): Promise<boolean> {
  const next = JSON.stringify(value);
  const current = await kv.get(key);
  if (current === next) return false;
  await kv.put(key, next);
  return true;
}
