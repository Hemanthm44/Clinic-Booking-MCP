const API_VERSION = "v68.0";
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 300;

type Method = "GET" | "POST" | "PATCH";

export class SalesforceError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorCode?: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "SalesforceError";
  }
}

function config() {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  if (!instanceUrl || !clientId || !clientSecret) {
    throw new SalesforceError("Server is missing SF_INSTANCE_URL, SF_CLIENT_ID or SF_CLIENT_SECRET", 500, "CONFIG");
  }
  return { instanceUrl, clientId, clientSecret };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new SalesforceError("Salesforce is slow to respond", 504, "TIMEOUT", true);
    }
    throw new SalesforceError("Could not reach Salesforce", 503, "NETWORK", true);
  }
}

let cachedToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const { instanceUrl, clientId, clientSecret } = config();
      const res = await fetchWithTimeout(`${instanceUrl}/services/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      });
      const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
      if (!res.ok || !data.access_token) {
        throw new SalesforceError(`Salesforce login failed: ${data.error ?? res.status}`, res.status, data.error, res.status >= 500);
      }
      cachedToken = data.access_token;
      return cachedToken;
    })().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

async function sendOnce(method: Method, path: string, body: unknown, allowRefresh: boolean): Promise<{ status: number; data: any }> {
  const { instanceUrl } = config();
  const token = await getToken();
  const res = await fetchWithTimeout(`${instanceUrl}/services/data/${API_VERSION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && allowRefresh) {
    cachedToken = null;
    return sendOnce(method, path, body, false);
  }

  const text = await res.text();
  let data: any = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (res.ok) return { status: res.status, data };

  const first = Array.isArray(data) ? data[0] : undefined;
  throw new SalesforceError(first?.message ?? `Salesforce error ${res.status}`, res.status, first?.errorCode, res.status >= 500);
}

async function sfRequest(method: Method, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendOnce(method, path, body, true);
    } catch (err) {
      if (err instanceof SalesforceError && err.retryable && attempt < 2) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

export function soqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export async function sfQuery<T = Record<string, any>>(soql: string): Promise<T[]> {
  const { data } = await sfRequest("GET", `/query?q=${encodeURIComponent(soql)}`);
  return (data?.records ?? []) as T[];
}

export async function sfCreate(object: string, fields: Record<string, unknown>): Promise<string> {
  const { data } = await sfRequest("POST", `/sobjects/${object}`, fields);
  return data.id as string;
}

export async function sfUpdate(object: string, id: string, fields: Record<string, unknown>): Promise<void> {
  await sfRequest("PATCH", `/sobjects/${object}/${id}`, fields);
}

export async function sfUpsert(
  object: string,
  externalIdField: string,
  externalId: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const { status, data } = await sfRequest("PATCH", `/sobjects/${object}/${externalIdField}/${encodeURIComponent(externalId)}`, fields);
  return { id: data.id as string, created: status === 201 };
}