const SONOS_API = "https://api.ws.sonos.com/control/api/v1";
const SONOS_AUTH_URL = "https://api.sonos.com/login/v3/oauth";
const SONOS_TOKEN_URL = "https://api.sonos.com/login/v3/oauth/access";

export interface SonosTokens {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface SonosPlayer {
  id: string;
  name: string;
  capabilities?: string[];
}

interface SonosGroupRaw {
  id: string;
  name: string;
  playerIds: string[];
}

export interface SonosGroup {
  id: string;
  name: string;
  playerIds: string[];
}

export function sonosRedirectUri(fallbackOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? fallbackOrigin;
  return `${base}/api/sonos/callback`;
}

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

async function tokenRequest(body: Record<string, string>): Promise<SonosTokens> {
  const res = await fetch(SONOS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  return res.json();
}

export function exchangeCodeForTokens(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function getHouseholds(accessToken: string): Promise<{ id: string }[]> {
  const res = await fetch(`${SONOS_API}/households`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`sonos_households_${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.households ?? [];
}

// Returns groups with playerIds narrowed to speakers that can play audio clips.
export async function getGroups(accessToken: string, householdId: string): Promise<SonosGroup[]> {
  const res = await fetch(`${SONOS_API}/households/${householdId}/groups`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`sonos_groups_${res.status}`);
  const data: { groups?: SonosGroupRaw[]; players?: SonosPlayer[] } = await res.json();

  const clipCapable = new Set(
    (data.players ?? []).filter((p) => p.capabilities?.includes("AUDIO_CLIP")).map((p) => p.id)
  );

  return (data.groups ?? [])
    .map((g) => ({ id: g.id, name: g.name, playerIds: g.playerIds.filter((id) => clipCapable.has(id)) }))
    .filter((g) => g.playerIds.length > 0);
}

// Audio clips are played per player, not per group.
export async function playAudioClip(
  accessToken: string,
  playerId: string,
  streamUrl: string,
  volume: number
): Promise<boolean> {
  const res = await fetch(`${SONOS_API}/players/${playerId}/audioClip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Adhan",
      appId: "io.zikra.adhan",
      streamUrl,
      volume,
      clipType: "CUSTOM",
      priority: "HIGH",
    }),
  });
  return res.ok;
}
