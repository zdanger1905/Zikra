const SONOS_API = "https://api.ws.sonos.com/control/api/v1";
const SONOS_AUTH_URL = "https://api.sonos.com/login/v3/oauth";
const SONOS_TOKEN_URL = "https://api.sonos.com/login/v3/oauth/access";

export function getSonosAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SONOS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "playback-control-all",
    state,
  });
  return `${SONOS_AUTH_URL}?${params}`;
}

function basicAuth() {
  return Buffer.from(
    `${process.env.SONOS_CLIENT_ID}:${process.env.SONOS_CLIENT_SECRET}`
  ).toString("base64");
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch(SONOS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(SONOS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return res.json();
}

export async function getHouseholds(accessToken: string) {
  const res = await fetch(`${SONOS_API}/households`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function getGroups(accessToken: string, householdId: string) {
  const res = await fetch(`${SONOS_API}/households/${householdId}/groups`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function playAudioClip(
  accessToken: string,
  groupId: string,
  streamUrl: string,
  volume: number
) {
  const res = await fetch(`${SONOS_API}/groups/${groupId}/audioClip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Adhan",
      appId: "com.zikra.adhan",
      streamUrl,
      volume,
      clipType: "CUSTOM",
    }),
  });
  return res.json();
}
