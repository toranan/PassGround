// Apple 푸시 알림(APNs) 발송. .p8 키로 JWT를 만들어 HTTP/2로 직접 보낸다(외부 서비스 없음).
import { createPrivateKey, sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PushEnvironment = "sandbox" | "production";
type PushDevice = { token: string; environment: PushEnvironment };
export type PushMessage = { title: string; body: string; data?: Record<string, string> };

const HOSTS: Record<PushEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function apnsConfig() {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  const keyBase64 = process.env.APNS_PRIVATE_KEY_BASE64?.trim();
  if (!keyId || !teamId || !bundleId || !keyBase64) return null;
  return { keyId, teamId, bundleId, privateKey: Buffer.from(keyBase64, "base64").toString("utf8") };
}

// 애플은 같은 토큰을 20분~1시간 재사용하길 권장한다.
let cachedJwt: { token: string; issuedAt: number } | null = null;

function providerToken(config: NonNullable<ReturnType<typeof apnsConfig>>): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.token;
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64Url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  const token = `${header}.${claims}.${base64Url(signature)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

function sendOne(session: ClientHttp2Session, jwt: string, bundleId: string, token: string, payload: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    request.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      let reason: string | undefined;
      try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { reason = undefined; }
      resolve({ status, reason });
    });
    request.on("error", () => resolve({ status: 0, reason: "network" }));
    request.end(payload);
  });
}

// 등록된 기기에 알림을 보내고, 더 이상 유효하지 않은 토큰은 지운다.
export async function sendPushToDevices(devices: PushDevice[], message: PushMessage): Promise<{ sent: number; failed: number }> {
  const config = apnsConfig();
  if (!config || !devices.length) return { sent: 0, failed: 0 };
  const jwt = providerToken(config);
  const payload = JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    ...(message.data ?? {}),
  });

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];
  for (const environment of ["production", "sandbox"] as const) {
    const targets = devices.filter((device) => device.environment === environment);
    if (!targets.length) continue;
    const session = connect(HOSTS[environment]);
    session.on("error", () => undefined);
    try {
      for (let index = 0; index < targets.length; index += 50) {
        const results = await Promise.all(
          targets.slice(index, index + 50).map(async (device) => ({
            device,
            result: await sendOne(session, jwt, config.bundleId, device.token, payload),
          }))
        );
        for (const { device, result } of results) {
          if (result.status === 200) sent += 1;
          else {
            failed += 1;
            if (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
              invalidTokens.push(device.token);
            }
          }
        }
      }
    } finally {
      session.close();
    }
  }

  if (invalidTokens.length) {
    await getSupabaseAdmin().from("push_devices").delete().in("token", invalidTokens);
  }
  return { sent, failed };
}

// 최신뉴스가 올라오면 알림을 켜 둔 모든 기기에 보낸다.
export async function sendNewsPush(params: { title: string; postId: string }): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("push_devices")
    .select("token,environment")
    .eq("news_enabled", true)
    .limit(10000);
  if (error) {
    console.warn("push_devices 조회 실패:", error.message);
    return;
  }
  const result = await sendPushToDevices((data ?? []) as PushDevice[], {
    title: "📰 합격판 최신뉴스",
    body: params.title,
    data: { type: "news", postId: params.postId, boardSlug: "news" },
  });
  console.info(`news push sent=${result.sent} failed=${result.failed}`);
}
