import crypto from "node:crypto";

/**
 * 签名:base64url(payload).hmac
 * 解码时校验 hmac,失败返回 null
 */

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function hmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signCookie(obj: unknown, secret: string): string {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(obj), "utf8"));
  const sig = hmac(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyCookie<T = unknown>(value: string, secret: string): T | null {
  const i = value.indexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = hmac(payload, secret);
  // 防时序攻击
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(b64urlDecode(payload).toString("utf8")) as T;
  } catch {
    return null;
  }
}
