"use client";

import { useEffect, useState } from "react";

interface Timings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Sunset: string;
  Maghrib: string;
  Isha: string;
  Midnight: string;
}

interface DateInfo {
  readable: string;
  hijri: {
    date: string;
    month: { en: string };
    year: string;
  };
}

interface PrayerData {
  timings: Timings;
  date: DateInfo;
  meta: {
    timezone: string;
    method: { name: string };
  };
}

const PRAYERS = [
  { key: "Fajr", label: "Fajr", arabic: "الفجر" },
  { key: "Sunrise", label: "Sunrise", arabic: "الشروق" },
  { key: "Dhuhr", label: "Dhuhr", arabic: "الظهر" },
  { key: "Asr", label: "Asr", arabic: "العصر" },
  { key: "Maghrib", label: "Maghrib", arabic: "المغرب" },
  { key: "Isha", label: "Isha", arabic: "العشاء" },
] as const;

const OBLIGATORY = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

function rawTime(time: string): string {
  return time.replace(/\s*\(.*?\)/, "").trim();
}

function to12Hour(time: string): string {
  const clean = rawTime(time);
  const [h, m] = clean.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDate(readable: string): string {
  try {
    const d = new Date(readable);
    if (isNaN(d.getTime())) return readable;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return readable;
  }
}

function getNextPrayer(timings: Timings): string | null {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const { key } of PRAYERS) {
    if (!OBLIGATORY.includes(key)) continue;
    const clean = rawTime(timings[key as keyof Timings]);
    const [h, m] = clean.split(":").map(Number);
    if (!isNaN(h) && h * 60 + m > nowMinutes) return key;
  }
  return "Fajr";
}

export default function PrayerTimesPage() {
  const [data, setData] = useState<PrayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [nextPrayer, setNextPrayer] = useState<string | null>(null);

  function applyData(prayerData: PrayerData) {
    setData(prayerData);
    setNextPrayer(getNextPrayer(prayerData.timings));
  }

  function fetchByCoords(lat: number, lng: number) {
    setLoading(true);
    setError("");
    fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=2`)
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 200) throw new Error();
        applyData(json.data);
      })
      .catch(() => setError("Failed to fetch prayer times."))
      .finally(() => setLoading(false));
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported. Please enter your city.");
      setShowManual(true);
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
      () => {
        setError("Location access denied. Please enter your city manually.");
        setShowManual(true);
        setLoading(false);
      }
    );
  }

  function fetchByCity() {
    if (!city.trim() || !country.trim()) return;
    setLoading(true);
    setError("");
    fetch(
      `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 200) throw new Error();
        applyData(json.data);
      })
      .catch(() => setError("City not found. Check the city/country and try again."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    useLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#3d3d3d]">
    <div className="max-w-xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="arabic text-3xl text-white leading-loose mb-1">
          مَوَاقِيتُ الصَّلَاة
        </p>
        <h1 className="text-3xl font-bold text-white mb-1">Prayer Times</h1>
        {data && (
          <>
            <p className="text-gray-400 text-sm">{formatDate(data.date.readable)}</p>
            <p className="text-[#c8c870] text-sm font-medium">
              {data.date.hijri.date} {data.date.hijri.month.en} {data.date.hijri.year} H
            </p>
          </>
        )}
      </div>

      {/* Location controls */}
      <div className="bg-[#4a4a4a] rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex gap-3 mb-3">
          <button
            onClick={useLocation}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#5a5a5a] hover:bg-[#666] text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
          >
            <LocationIcon className="w-4 h-4" />
            Use My Location
          </button>
          <button
            onClick={() => setShowManual((v) => !v)}
            className="flex-1 py-3 bg-[#555] hover:bg-[#666] text-white rounded-xl font-medium text-sm transition-colors"
          >
            Enter City
          </button>
        </div>

        {showManual && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchByCity()}
              className="flex-1 px-3 py-2 rounded-lg border border-[#666] bg-[#3a3a3a] text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder:text-gray-500"
            />
            <input
              type="text"
              placeholder="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchByCity()}
              className="flex-1 px-3 py-2 rounded-lg border border-[#666] bg-[#3a3a3a] text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder:text-gray-500"
            />
            <button
              onClick={fetchByCity}
              disabled={loading || !city.trim() || !country.trim()}
              className="px-4 py-2 bg-[#5a5a5a] hover:bg-[#666] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Go
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Fetching prayer times...</p>
        </div>
      )}

      {/* Prayer times */}
      {data && !loading && (
        <>
          <div className="space-y-2">
            {PRAYERS.map(({ key, label, arabic }) => {
              const isNext = key === nextPrayer;
              const isObligatory = OBLIGATORY.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between rounded-xl px-5 py-4 transition-all ${
                    isNext
                      ? "bg-[#5a5a5a] text-white shadow-md scale-[1.02]"
                      : isObligatory
                      ? "bg-[#4a4a4a] text-gray-100 shadow-sm"
                      : "bg-[#383838] text-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className={`font-semibold ${isNext ? "text-white" : isObligatory ? "text-gray-100" : "text-gray-500"}`}>
                        {label}
                      </p>
                      {isNext && (
                        <p className="text-gray-300 text-xs">Next Prayer</p>
                      )}
                    </div>
                    <p className={`arabic text-sm ${isNext ? "text-gray-300" : "text-gray-500"}`}>
                      {arabic}
                    </p>
                  </div>

                  <p className={`text-xl font-bold tabular-nums ${
                    isNext ? "text-white" : isObligatory ? "text-[#c8c8c8]" : "text-gray-500"
                  }`}>
                    {to12Hour(data.timings[key as keyof Timings])}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-500 mt-5">
            {data.meta.method.name} &middot; {data.meta.timezone}
          </p>
        </>
      )}
    </div>
    </div>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  );
}
