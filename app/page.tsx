import Link from "next/link";
import HomePrayerTimes from "@/components/HomePrayerTimes";

interface AyahEdition {
  text: string;
  surah: { number: number; englishName: string };
  numberInSurah: number;
}

async function getRandomAyah(): Promise<AyahEdition[] | null> {
  try {
    const num = Math.floor(Math.random() * 6236) + 1;
    const res = await fetch(
      `https://api.alquran.cloud/v1/ayah/${num}/editions/quran-uthmani,en.asad`,
      { next: { revalidate: 86400 } }
    );
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const ayah = await getRandomAyah();

  return (
    <div className="min-h-screen bg-[#3d3d3d]">

      {/* Hero — full screen with background image (place your image at /public/hero.jpg) */}
      <section
        className="relative flex items-center justify-center text-center"
        style={{
          height: "calc(100vh - 3rem)",
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10">
          <h1 className="text-7xl font-serif text-white mb-4 tracking-wide">Zikra</h1>
          <p className="text-white/80 text-lg tracking-wide">Your path to remembrance.</p>
        </div>
      </section>

      {/* Bismillah + Feature cards */}
      <section className="bg-[#3d3d3d] px-4 py-20 text-center">
        <p className="arabic text-4xl mb-3 leading-loose text-white">
          بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ
        </p>
        <p className="text-sm text-gray-400 mb-14 tracking-wide">
          In the name of Allah, the Most Gracious, the Most Merciful
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
          <FeatureCard href="/quran" title="The Holy Quran" description="Browse all 114 surahs with Arabic text and translation." icon={<QuranIcon />} />
          <FeatureCard href="/prayer-times" title="Prayer Times" description="Accurate daily prayer times based on your location." icon={<MoonIcon />} />
          <DeadCard title="Books" description="Curated Islamic literature and reading." icon={<BooksIcon />} />
          <FeatureCard href="/recitation" title="Recitation" description="Arabic-only reader with audio, word highlighting, and loop practice." icon={<RecitationIcon />} />
        </div>
      </section>

      {/* Prayer Times + Verse of the Day */}
      <HomePrayerTimes ayah={ayah} />

      {/* Footer */}
      <footer className="bg-[#2a2a2a] px-10 py-12">
        <div className="max-w-5xl mx-auto flex items-start justify-between">
          {/* Left */}
          <div>
            <p className="text-white font-serif text-2xl mb-2 tracking-wide">Zikra</p>
            <p className="text-gray-500 text-sm mb-6">Your path to remembrance.</p>
            <div className="flex items-center gap-4 text-gray-500">
              <button className="cursor-default hover:text-gray-300 transition-colors" aria-label="Instagram">
                <InstagramIcon />
              </button>
              <button className="cursor-default hover:text-gray-300 transition-colors" aria-label="Facebook">
                <FacebookIcon />
              </button>
              <button className="cursor-default hover:text-gray-300 transition-colors" aria-label="Twitter">
                <TwitterIcon />
              </button>
            </div>
          </div>

          {/* Right — nav links */}
          <div className="flex gap-16 text-sm">
            <div className="flex flex-col gap-3">
              <Link href="/quran" className="text-gray-400 hover:text-white transition-colors underline">Quran</Link>
              <Link href="/prayer-times" className="text-gray-400 hover:text-white transition-colors underline">Prayer Times</Link>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/recitation" className="text-gray-400 hover:text-white transition-colors underline">Recitation</Link>
              <span className="text-gray-600 underline cursor-default select-none">Books</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

function FeatureCard({ href, title, description, icon }: { href: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative block bg-gradient-to-br from-[#505050] to-[#383838] border border-[#606060] hover:border-[#909090] text-white rounded-2xl p-8 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all duration-300 overflow-hidden"
    >
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300 rounded-2xl" />
      <div className="relative z-10">
        <div className="w-10 h-10 mb-5 text-[#c8c8c8]">{icon}</div>
        <h3 className="text-xl font-semibold tracking-wide mb-2">{title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#808080] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </Link>
  );
}

function DeadCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="relative bg-gradient-to-br from-[#484848] to-[#343434] border border-[#555] text-white rounded-2xl p-8 shadow-lg cursor-default select-none overflow-hidden opacity-75">
      <div className="w-10 h-10 mb-5 text-[#a0a0a0]">{icon}</div>
      <h3 className="text-xl font-semibold tracking-wide mb-2 text-gray-300">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      <span className="absolute top-4 right-4 text-xs text-gray-600 tracking-widest uppercase">Soon</span>
    </div>
  );
}

function QuranIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}

function BooksIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
    </svg>
  );
}

function ResourcesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  );
}

function RecitationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
    </svg>
  );
}
