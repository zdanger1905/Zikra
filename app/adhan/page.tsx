"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import AuthModal from "@/components/AuthModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SonosGroup {
  id: string;
  name: string;
  playerIds: string[];
}

interface SonosConnection {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  householdId: string;
  groupId: string;
  groupName: string;
}

interface PrayerToggles {
  fajr: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
}

interface AdhanSettings {
  sonos: SonosConnection | null;
  prayers: PrayerToggles;
  adhanAudio: string;
  volume: number;
  location: { city: string; country: string } | null;
}

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADHAN_OPTIONS = [
  { id: "makkah",  label: "Makkah",           url: "https://www.islamcan.com/audio/adhan/azan1.mp3" },
  { id: "madinah", label: "Madinah",           url: "https://www.islamcan.com/audio/adhan/azan2.mp3" },
  { id: "egypt",   label: "Egyptian (Classic)", url: "https://www.islamcan.com/audio/adhan/azan3.mp3" },
  { id: "turkey",  label: "Turkish",            url: "https://www.islamcan.com/audio/adhan/azan4.mp3" },
];

const DEFAULT_SETTINGS: AdhanSettings = {
  sonos: null,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  adhanAudio: "makkah",
  volume: 40,
  location: null,
};

const PRAYER_LABELS: { key: keyof PrayerToggles; label: string }[] = [
  { key: "fajr",    label: "Fajr" },
  { key: "dhuhr",   label: "Dhuhr" },
  { key: "asr",     label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha",    label: "Isha" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdhanPage() {
  return (
    <Suspense>
      <AdhanPageInner />
    </Suspense>
  );
}

function AdhanPageInner() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [settings, setSettings] = useState<AdhanSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<SonosGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [testingPlay, setTestingPlay] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [connectingState, setConnectingState] = useState(false);

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
          setSettings(snap.data() as AdhanSettings);
          const loc = (snap.data() as AdhanSettings).location;
          if (loc) { setCityInput(loc.city); setCountryInput(loc.country); }
        }
      }
    });
  }, []);

  // Consume the Sonos OAuth session cookie after redirect
  useEffect(() => {
    if (!searchParams.get("connected") || !user) return;
    setConnectingState(true);
    fetch("/api/sonos/session")
      .then((r) => r.json())
      .then(async (session) => {
        if (!session?.access_token) { showToast("Connection failed.", false); return; }
        const updatedSettings: AdhanSettings = {
          ...settings,
          sonos: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            tokenExpiry: Date.now() + session.expires_in * 1000,
            householdId: session.householdId,
            groupId: "",
            groupName: "",
          },
        };
        setSettings(updatedSettings);
        await saveSettings(user, updatedSettings);
        showToast("Sonos connected!");
      })
      .catch(() => showToast("Connection failed.", false))
      .finally(() => setConnectingState(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Show error param
  useEffect(() => {
    const err = searchParams.get("error");
    if (err) showToast("Could not connect to Sonos. Please try again.", false);
  }, [searchParams]);

  // Fetch groups when connected
  useEffect(() => {
    if (!settings.sonos?.accessToken || !settings.sonos.householdId) return;
    setLoadingGroups(true);
    fetch("/api/sonos/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: settings.sonos.accessToken,
        refreshToken: settings.sonos.refreshToken,
        tokenExpiry: settings.sonos.tokenExpiry,
        householdId: settings.sonos.householdId,
      }),
    })
      .then((r) => r.json())
      .then(({ groups: g, newAccessToken }) => {
        setGroups(g ?? []);
        if (newAccessToken && user) {
          const updated = { ...settings, sonos: { ...settings.sonos!, accessToken: newAccessToken } };
          setSettings(updated);
          saveSettings(user, updated);
        }
      })
      .finally(() => setLoadingGroups(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sonos?.accessToken]);

  // Fetch prayer times when location set
  useEffect(() => {
    const loc = settings.location;
    if (!loc) return;
    fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=2`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.timings) setPrayerTimes(d.data.timings as PrayerTimes);
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

  function startSonosConnect() {
    const base = window.location.origin;
    const redirectUri = `${base}/api/sonos/callback`;
    const state = Math.random().toString(36).slice(2);
    const clientId = process.env.NEXT_PUBLIC_SONOS_CLIENT_ID;
    if (!clientId) { showToast("Sonos integration not configured.", false); return; }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "playback-control-all",
      state,
    });
    window.location.href = `https://api.sonos.com/login/v3/oauth?${params}`;
  }

  function disconnectSonos() {
    persistSettings({ ...settings, sonos: null });
    setGroups([]);
  }

  async function setLocation() {
    if (!cityInput.trim() || !countryInput.trim()) return;
    await persistSettings({ ...settings, location: { city: cityInput.trim(), country: countryInput.trim() } });
  }

  const testPlay = useCallback(async () => {
    if (!settings.sonos?.groupId) { showToast("Select a speaker first.", false); return; }
    const audioOpt = ADHAN_OPTIONS.find((a) => a.id === settings.adhanAudio) ?? ADHAN_OPTIONS[0];
    setTestingPlay(true);
    fetch("/api/sonos/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: settings.sonos.accessToken,
        refreshToken: settings.sonos.refreshToken,
        tokenExpiry: settings.sonos.tokenExpiry,
        groupId: settings.sonos.groupId,
        streamUrl: audioOpt.url,
        volume: settings.volume,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.id) showToast("Adhan playing on your Sonos!");
        else showToast("Could not play. Check your Sonos is online.", false);
      })
      .catch(() => showToast("Playback error.", false))
      .finally(() => setTestingPlay(false));
  }, [settings]);

  const connected = !!settings.sonos?.accessToken;

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
              {!connected ? (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm mb-5">Connect your Sonos account to enable automatic adhan playback.</p>
                  <button
                    onClick={startSonosConnect}
                    disabled={connectingState}
                    className="inline-flex items-center gap-2.5 px-6 py-3 bg-[#000] text-white rounded-full text-sm font-semibold hover:bg-[#111] transition-colors disabled:opacity-50"
                  >
                    <SonosIcon />
                    {connectingState ? "Connecting…" : "Connect Sonos"}
                  </button>
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
                    <label className="block text-xs text-gray-500 mb-2 uppercase tracking-widest">Speaker / Room</label>
                    {loadingGroups ? (
                      <p className="text-gray-500 text-sm">Loading speakers…</p>
                    ) : groups.length === 0 ? (
                      <p className="text-gray-500 text-sm">No speakers found. Make sure your Sonos is online.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {groups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => persistSettings({ ...settings, sonos: { ...settings.sonos!, groupId: g.id, groupName: g.name } })}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                              settings.sonos?.groupId === g.id
                                ? "bg-white text-[#1a1a1a] border-white"
                                : "bg-transparent text-gray-300 border-[#555] hover:border-gray-300"
                            }`}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
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
                  <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                    <span
                      onClick={() => persistSettings({ ...settings, adhanAudio: opt.id })}
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
            {connected && settings.sonos?.groupId && (
              <button
                onClick={testPlay}
                disabled={testingPlay}
                className="w-full py-3 bg-[#5a5a5a] hover:bg-[#666] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {testingPlay ? "Playing…" : "▶ Test Adhan on " + (settings.sonos.groupName || "Speaker")}
              </button>
            )}

            {saving && <p className="text-center text-xs text-gray-600">Saving…</p>}

            {/* ── How it works ── */}
            <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-2xl p-6 mt-4">
              <h3 className="text-white text-sm font-semibold mb-3">How it works</h3>
              <ol className="space-y-2 text-gray-400 text-sm list-decimal list-inside leading-relaxed">
                <li>Connect your Sonos account and select a speaker.</li>
                <li>Choose which prayers you want the adhan to play for.</li>
                <li>Set your city so we can calculate the correct prayer times.</li>
                <li>At each prayer time, the adhan will play on your Sonos automatically.</li>
              </ol>
              <p className="text-gray-600 text-xs mt-4">
                Automatic scheduling requires the Zikra tab to remain open in your browser.
                A background scheduling service is coming soon.
              </p>
            </div>

          </div>
        )}
      </div>

      {/* Background scheduler (runs while page is open) */}
      {user && connected && <AdhanScheduler settings={settings} onPlay={testPlay} />}
    </div>
  );
}

// ─── Background Scheduler ─────────────────────────────────────────────────────

function AdhanScheduler({ settings, onPlay }: { settings: AdhanSettings; onPlay: () => void }) {
  useEffect(() => {
    if (!settings.location) return;

    let lastFired = "";

    const interval = setInterval(async () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const key = hhmm;
      if (lastFired === key) return;

      const loc = settings.location!;
      const res = await fetch(
        `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(loc.city)}&country=${encodeURIComponent(loc.country)}&method=2`
      ).then((r) => r.json()).catch(() => null);

      if (!res?.data?.timings) return;
      const timings: Record<string, string> = res.data.timings;

      const prayerMap: Record<keyof PrayerToggles, string> = {
        fajr: rawTime(timings.Fajr),
        dhuhr: rawTime(timings.Dhuhr),
        asr: rawTime(timings.Asr),
        maghrib: rawTime(timings.Maghrib),
        isha: rawTime(timings.Isha),
      };

      for (const [prayer, time] of Object.entries(prayerMap)) {
        if (time === hhmm && settings.prayers[prayer as keyof PrayerToggles]) {
          lastFired = key;
          onPlay();
          break;
        }
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [settings, onPlay]);

  return null;
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
