"use client";

import { useEffect, useState } from "react";

interface Timings {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface AyahEdition {
  text: string;
  surah: { number: number; englishName: string };
  numberInSurah: number;
}

const PRAYERS = [
  { key: "Fajr", label: "Fajr" },
  { key: "Dhuhr", label: "Dhuhr" },
  { key: "Asr", label: "Asr" },
  { key: "Maghrib", label: "Maghrib" },
  { key: "Isha", label: "Isha" },
] as const;

function to12Hour(time: string): string {
  const clean = time.replace(/\s*\(.*?\)/, "").trim();
  const [h, m] = clean.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export default function HomePrayerTimes({ ayah }: { ayah: AyahEdition[] | null }) {
  const [timings, setTimings] = useState<Timings | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      fetchMecca();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords;
        Promise.all([
          fetch(
            `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=2`
          ).then((r) => r.json()),
          fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          ).then((r) => r.json()).catch(() => null),
        ])
          .then(([prayerJson, geoJson]) => {
            if (prayerJson.code === 200) {
              setTimings(prayerJson.data.timings);
              if (geoJson?.address) {
                const a = geoJson.address;
                const city = a.city || a.town || a.village || a.hamlet || a.county || "";
                const country = a.country || "";
                const countryCode = (a.country_code || "").toUpperCase();
                if (countryCode === "US") {
                  const state = a.state || "";
                  setLabel(city && state ? `${city}, ${state}` : city || state || country);
                } else {
                  setLabel(city && country ? `${city}, ${country}` : city || country);
                }
              } else {
                setLabel("Your Location");
              }
            } else {
              fetchMecca();
            }
          })
          .catch(fetchMecca)
          .finally(() => setLoading(false));
      },
      () => fetchMecca()
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fetchMecca() {
    fetch("https://api.aladhan.com/v1/timingsByCity?city=Mecca&country=SA&method=4")
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 200) {
          setTimings(json.data.timings);
          setLabel("Mecca, Saudi Arabia");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  return (
    <section className="bg-[#3d3d3d] px-4 pt-4 pb-20 text-center">

      {/* Prayer times */}
      <h2 className="text-5xl font-serif text-gray-400 mb-3">{"Today's Prayer Times"}</h2>

      {loading ? (
        <div className="flex justify-center mt-8">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : timings ? (
        <>
          <p className="text-white text-sm font-bold tracking-widest uppercase mb-8">{label}</p>
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {PRAYERS.map(({ key, label: pLabel }) => (
              <div
                key={key}
                className="bg-[#b8b8b8] rounded-2xl px-8 py-5 text-center min-w-[120px] shadow"
              >
                <p className="text-xs text-[#4a4a4a] uppercase tracking-widest mb-1">{pLabel}</p>
                <p className="text-lg font-semibold text-[#1a1a1a]">
                  {to12Hour(timings[key])}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Verse of the Day */}
      {ayah && (
        <div className="max-w-2xl mx-auto mt-24 bg-[#5c5c14] rounded-2xl p-8 text-center shadow-lg">
          <p className="text-xs uppercase tracking-widest text-[#c8c870] mb-5 font-semibold">
            Verse of the Day
          </p>
          <p className="arabic text-3xl mb-5 leading-loose text-white">
            {ayah[0]?.text}
          </p>
          <p className="text-[#d4d4a0] text-sm italic mb-3 leading-relaxed">
            &ldquo;{ayah[1]?.text}&rdquo;
          </p>
          <p className="text-xs text-[#a0a060]">
            Surah {ayah[0]?.surah?.englishName} &mdash; Ayah {ayah[0]?.numberInSurah}
          </p>
        </div>
      )}

    </section>
  );
}
