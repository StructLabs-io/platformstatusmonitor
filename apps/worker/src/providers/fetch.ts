const maxProviderBytes = 512_000;
const providerTimeoutMs = 10_000;
const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export async function safeFetchResponse(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  assertAllowedProviderUrl(url);
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(providerTimeoutMs),
  });
}

export async function safeFetchText(
  url: string,
  init: RequestInit = {},
): Promise<{ response: Response; text: string }> {
  const response = await safeFetchResponse(url, init);
  const reader = response.body?.getReader();
  if (!reader) return { response, text: "" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxProviderBytes) {
      await reader.cancel();
      throw new Error("provider response too large");
    }
    chunks.push(value);
  }

  return {
    response,
    text: new TextDecoder().decode(concat(chunks, size)),
  };
}

export function assertAllowedProviderUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("provider URL must use https");
  const hostname = url.hostname.toLowerCase();
  if (blockedHosts.has(hostname)) throw new Error("provider URL host is blocked");
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("provider URL must not target local or private networks");
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
