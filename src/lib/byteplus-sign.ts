import crypto from "crypto";

const GATEWAY_HOST = "open.byteplusapi.com";
const REGION = "ap-southeast-1";
const SERVICE = "ark";
const API_VERSION = "2024-01-01";

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export function signRequest(
  action: string,
  body: Record<string, unknown>,
  ak?: string,
  sk?: string
): SignedRequest {
  const accessKey = ak || process.env.BYTEPLUS_AK;
  const secretKey = sk || process.env.BYTEPLUS_SK;

  if (!accessKey || !secretKey) {
    throw new Error("BYTEPLUS_AK and BYTEPLUS_SK are required");
  }

  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateStr = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");
  const dateShort = dateStr.substring(0, 8);

  const payloadHash = sha256Hex(bodyStr);
  const queryString = `Action=${action}&Version=${API_VERSION}`;

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${GATEWAY_HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${dateStr}\n`;

  const signedHeaders = "content-type;host;x-content-sha256;x-date";

  const canonicalRequest = [
    "POST",
    "/",
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateShort}/${REGION}/${SERVICE}/request`;

  const stringToSign = [
    "HMAC-SHA256",
    dateStr,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(secretKey, dateShort);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${GATEWAY_HOST}/?${queryString}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: GATEWAY_HOST,
      "X-Content-Sha256": payloadHash,
      "X-Date": dateStr,
      Authorization: authorization,
    },
    body: bodyStr,
  };
}

export async function callControlPlaneAPI(
  action: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
  const signed = signRequest(action, body);

  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: signed.body,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json();
  return { status: res.status, data };
}
