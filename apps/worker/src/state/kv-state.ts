export interface Env {
  PSM_STATE: KVNamespace;
}

export async function getJson<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  const value = await kv.get(key);
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export async function putJson(kv: KVNamespace, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value, null, 2));
}

