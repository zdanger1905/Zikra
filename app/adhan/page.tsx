"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import AuthModal from "@/components/AuthModal";
import {
  ADHAN_OPTIONS,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AdhanSettings,
  type PrayerKey,
} from "@/lib/adhan";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SonosGroup {
  id: string;
  name: string;
  playerIds: string[];
}

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRAYER_LABELS: { key: PrayerKey; label: string }[] = [
  { key: "fajr",    label: "Fajr" },
  { key: "dhuhr",   label: "Dhuhr" },
  { key: "asr",     label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha",    label: "Isha" },
];

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Sonos access was not granted.",
  invalid_state: "That Sonos sign-in link expired. Please try again.",
  no_household: "No Sonos system was found on that account. Sign in with the account your speakers are set up on in the Sonos app.",
  households_failed: "Sonos returned an error while looking up your system. Please try again.",
  not_connected: "Connect your Sonos first.",
  no_speaker: "Select a speaker first.",
  token_expired: "Your Sonos connection expired. Please reconnect.",
  play_failed: "Could not play. Check your Sonos is online.",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdhanPage() {
  return (
    <Suspense>
      <AdhanPageInner />
    </Suspense>
  );
}

async function authFetch(user: User, url: string, method = "GET") {
  const token = await user.getIdToken();
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

function AdhanPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [settings, setSettings] = useState<AdhanSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [groups, setGroups] = useState<SonosGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [testingPlay, setTestingPlay] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [connectingState, setConnectingState] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid, "adhan", "settings"));
        if (snap.exists()) {
          const loaded = normalizeSettings(snap.data());
          setSettings(loaded);
          if (loaded.location) { setCityInput(loaded.location.city); setCountryInput(loaded.location.country); }
          // Older versions stored Sonos tokens here; rewrite the doc without them.
          if ("sonos" in snap.data()) saveSettings(u, loaded);
        }
      }
    });
  }, []);

  // Result of the Sonos OAuth redirect
  useEffect(() => {
    const err = searchParams.get("error");
    if (searchParams.get("connected")) showToast("Sonos connected! Now pick a speaker.");
    else if (err === "no_household") setWrongAccount(true);
    else if (err) showToast(ERROR_MESSAGES[err] ?? "Could not connect to Sonos. Please try again.", false);
    if (err || searchParams.get("connected")) router.replace("/adhan");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGroups = useCallback(async (u: User) => {
    setLoadingGroups(true);
    try {
      const d = await authFetch(u, "/api/sonos/groups");
      setConnected(!!d.connected);
      setGroups(d.groups ?? []);
      if (d.error === "token_expired") showToast(ERROR_MESSAGES.token_expired, false);
    } catch {
      setConnected(false);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  // Connection status and speakers
  useEffect(() => {
    if (user) loadGroups(user);
    else { setConnected(false); setGroups([]); }
  }, [user, loadGroups]);

  // Fetch prayer times when location set
  useEffect(() => {
    const loc = settings.location;
    if (!loc) return;
    fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=2`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.timings) setPrayerTimes(d.data.timings as PrayerTimes);
        else showToast("Couldn't find prayer times for that location.", false);
      })
      .catch(() => {});
  }, [settings.location]);

  async function saveSettings(u: User, s: AdhanSettings) {
    await setDoc(doc(db, "users", u.uid, "adhan", "settings"), s);
  }

  async function persistSettings(updated: AdhanSettings) {
    setSettings(updated);
    if (!user) return;
    setSaving(true);
    await saveSettings(user, updated).finally(() => setSaving(false));
  }

  async function startSonosConnect() {
    if (!user) return;
    setConnectingState(true);
    try {
      const d = await authFetch(user, "/api/sonos/connect", "POST");
      if (!d.url) throw new Error();
      window.location.href = d.url;
    } catch {
      showToast("Sonos integration not available right now.", false);
      setConnectingState(false);
    }
  }

  async function disconnectSonos() {
    if (!user) return;
    await authFetch(user, "/api/sonos/disconnect", "POST").catch(() => {});
    setConnected(false);
    setGroups([]);
    persistSettings({ ...settings, speaker: null });
  }

  async function setLocation() {
    if (!cityInput.trim() || !countryInput.trim()) return;
    await persistSettings({ ...settings, location: { city: cityInput.trim(), country: countryInput.trim() } });
  }

  async function testPlay() {
    if (!user) return;
    setTestingPlay(true);
    try {
      const d = await authFetch(user, "/api/adhan/test", "POST");
      if (d.ok) showToast("Adhan playing on your Sonos!");
      else showToast(ERROR_MESSAGES[d.error] ?? "Playback error.", false);
    } catch {
      showToast("Playback error.", false);
    } finally {
      setTestingPlay(false);
    }
  }

  const ready = connected && !!settings.speaker && !!settings.location;

  return (
    <div className="min-h-screen bg-[#3d3d3d] pt-8">
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg text-center max-w-[90vw] w-max ${toast.ok ? "bg-green-700 text-white" : "bg-red-700 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-0 pb-8 sm:pt-2 sm:pb-12">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Adhan</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Connect your Sonos speaker and have the adhan play automatically at each prayer time.
          </p>
        </div>

        {/* Not logged in */}
        {!user && (
          <div className="bg-[#2e2e2e] border border-[#444] rounded-2xl p-8 text-center">
            <p className="text-gray-300 mb-4">Sign in to connect your Sonos and configure your adhan schedule.</p>
            <button
              onClick={() => setAuthOpen(true)}
              className="px-6 py-2.5 bg-white text-[#1a1a1a] rounded-full text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Sign in
            </button>
          </div>
        )}

        {user && (
          <div className="space-y-5">

            {/* ── Sonos Connection ── */}
            <Section title="Sonos Speaker">
              {loadingGroups && !connected ? (
                <p className="text-gray-500 text-sm">Checking connection…</p>
              ) : !connected ? (
                <div className="text-center py-4">
                  {wrongAccount ? (
                    <div className="text-left bg-[#3a2a2a] border border-[#6b3a3a] rounded-xl p-4 mb-5">
                      <p className="text-white text-sm font-medium mb-2">That Sonos account has no speakers</p>
                      <p className="text-gray-400 text-sm mb-3">
                        Sonos signed you in with an account that has no speaker system. Sonos remembers
                        that sign-in, so switch accounts like this:
                      </p>
                      <ol className="text-gray-300 text-sm list-decimal list-inside space-y-1.5">
                        <li>
                          <a
                            href="https://www.sonos.com/logout"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-white"
                          >
                            Sign out of Sonos
                          </a>{" "}
                          (opens in a new tab).
                        </li>
                        <li>
                          Come back and click <span className="text-white">Try again</span>, then sign in with the
                          email shown in your Sonos app under Settings → Account.
                        </li>
                      </ol>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm mb-5">Connect your Sonos account to enable automatic adhan playback.</p>
                  )}
                  <button
                    onClick={startSonosConnect}
                    disabled={connectingState}
                    className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#000] text-white rounded-full text-sm font-semibold hover:bg-[#111] transition-colors disabled:opacity-50"
                  >
                    <SonosIcon />
                    {connectingState ? "Connecting…" : wrongAccount ? "Try again" : "Connect Sonos"}
                  </button>
                  {!wrongAccount && (
                    <p className="text-gray-600 text-xs mt-4">
                      Need a different Sonos account?{" "}
                      <a
                        href="https://www.sonos.com/logout"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-gray-300"
                      >
                        Sign out of Sonos
                      </a>{" "}
                      first.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      <span className="text-white text-sm font-medium">Sonos connected</span>
                    </div>
                    <button
                      onClick={disconnectSonos}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* Group / speaker selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs text-gray-500 uppercase tracking-widest">Speaker / Room</label>
                      <button
                        onClick={() => loadGroups(user)}
                        className="text-xs text-gray-500 hover:text-white transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                    {loadingGroups ? (
                      <p className="text-gray-500 text-sm">Loading speakers…</p>
                    ) : groups.length === 0 ? (
                      <p className="text-gray-500 text-sm">No compatible speakers found. Make sure your Sonos is online.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {groups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => persistSettings({ ...settings, speaker: { groupId: g.id, name: g.name, playerIds: g.playerIds } })}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                              settings.speaker?.groupId === g.id
                                ? "bg-white text-[#1a1a1a] border-white"
                                : "bg-transparent text-gray-300 border-[#555] hover:border-gray-300"
                            }`}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Group ids change when rooms are regrouped; the saved speakers still work. */}
                    {settings.speaker && groups.length > 0 && !groups.some((g) => g.id === settings.speaker!.groupId) && (
                      <p className="text-gray-500 text-xs mt-2">Currently playing on: {settings.speaker.name}</p>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* ── Prayer Selection ── */}
            <Section title="Prayers">
              <div className="space-y-3">
                {PRAYER_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <span className="text-white text-sm font-medium">{label}</span>
                      {prayerTimes && (
                        <span className="text-gray-500 text-xs ml-2">{to12h(prayerTimes[capitalize(key) as keyof PrayerTimes])}</span>
                      )}
                    </div>
                    <Toggle
                      on={settings.prayers[key]}
                      onChange={(v) => persistSettings({ ...settings, prayers: { ...settings.prayers, [key]: v } })}
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Location ── */}
            <Section title="Location">
              <p className="text-gray-500 text-xs mb-3">Used to calculate accurate prayer times for your area.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="City"
                  className="flex-1 bg-[#333] border border-[#555] text-white text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-400"
                />
                <input
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  placeholder="Country"
                  className="flex-1 sm:w-32 sm:flex-none bg-[#333] border border-[#555] text-white text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-400"
                />
                <button
                  onClick={setLocation}
                  className="w-full sm:w-auto px-4 py-2 bg-[#555] text-white text-sm rounded-lg hover:bg-[#666] transition-colors"
                >
                  Save
                </button>
              </div>
              {settings.location && (
                <p className="text-green-400 text-xs mt-2">
                  ✓ {settings.location.city}, {settings.location.country}
                </p>
              )}
            </Section>

            {/* ── Adhan Audio ── */}
            <Section title="Adhan">
              <div className="space-y-2">
                {ADHAN_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    onClick={() => persistSettings({ ...settings, adhanAudio: opt.id })}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                        settings.adhanAudio === opt.id
                          ? "bg-[#6b9fff] border-[#666]"
                          : "bg-transparent border-[#666] group-hover:border-gray-400"
                      }`}
                    />
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{opt.label}</span>
                  </label>
                ))}
              </div>
            </Section>

            {/* ── Volume ── */}
            <Section title="Volume">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={settings.volume}
                  onChange={(e) => setSettings((s) => ({ ...s, volume: Number(e.target.value) }))}
                  onMouseUp={() => persistSettings(settings)}
                  onTouchEnd={() => persistSettings(settings)}
                  className="flex-1 accent-white"
                />
                <span className="text-white text-sm w-8 text-right">{settings.volume}</span>
              </div>
            </Section>

            {/* ── Test Play ── */}
            {connected && settings.speaker && (
              <button
                onClick={testPlay}
                disabled={testingPlay}
                className="w-full py-3 bg-[#5a5a5a] hover:bg-[#666] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {testingPlay ? "Playing…" : "▶ Test Adhan on " + settings.speaker.name}
              </button>
            )}

            {saving && <p className="text-center text-xs text-gray-600">Saving…</p>}

            {ready && (
              <p className="text-center text-xs text-green-400">
                ✓ All set. The adhan will play on {settings.speaker!.name} at each selected prayer time.
              </p>
            )}

            {/* ── How it works ── */}
            <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl p-6 mt-4">
              <h3 className="text-white text-sm font-semibold mb-3">How it works</h3>
              <ol className="space-y-2 text-gray-400 text-sm list-decimal list-inside leading-relaxed">
                <li>Connect your Sonos account and select a speaker.</li>
                <li>Choose which prayers you want the adhan to play for.</li>
                <li>Set your city so we can calculate the correct prayer times.</li>
                <li>At each prayer time, the adhan will play on your Sonos automatically. You don&apos;t need to keep this page open.</li>
              </ol>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#2e2e2e] border border-[#444] rounded-2xl p-6">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-[#6b9fff]" : "bg-[#555]"}`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full transition-all ${on ? "left-5 bg-white" : "left-1 bg-[#888]"}`}
      />
    </button>
  );
}

function SonosIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawTime(t: string) {
  return t?.replace(/\s*\(.*\)/, "").trim() ?? "";
}

function to12h(t: string) {
  const clean = rawTime(t);
  const [h, m] = clean.split(":").map(Number);
  if (isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
