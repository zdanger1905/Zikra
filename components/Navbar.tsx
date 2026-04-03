"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthModal from "./AuthModal";
import ProfileModal from "./ProfileModal";

const navLinks = [
  { href: "/quran", label: "Quran" },
  { href: "/prayer-times", label: "Prayer Times" },
];

function InstagramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {profileOpen && user && <ProfileModal user={user} onClose={() => setProfileOpen(false)} />}

      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1a1a1a]">
        <div className="px-8 h-12 flex items-center">

          {/* Logo — left */}
          <Link href="/" className="text-white font-serif text-xl tracking-wide w-44">
            Zikra
          </Link>

          {/* Nav links — center */}
          <div className="flex-1 flex items-center justify-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm tracking-wide transition-colors ${
                  pathname.startsWith(link.href)
                    ? "text-white underline underline-offset-4"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="w-44 flex items-center justify-end gap-4">
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Profile"
                >
                  <ProfileIcon />
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 top-8 w-32 bg-[#1e1e1e] border border-[#333] rounded-xl shadow-xl overflow-hidden z-50">
                    {[
                      { label: "Profile",  action: () => { setProfileOpen(true);  setDropdownOpen(false); } },
                      { label: "Saved",    action: () => { router.push("/saved"); setDropdownOpen(false); } },
                      { label: "History",  action: () => { router.push("/history"); setDropdownOpen(false); } },
                      { label: "Settings", action: () => setDropdownOpen(false) },
                    ].map(({ label, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-[#333]" />
                    <button
                      onClick={() => { signOut(auth); setDropdownOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-[#2a2a2a] transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="text-sm text-gray-400 hover:text-white tracking-wide transition-colors"
              >
                Login
              </button>
            )}
            <a href="https://www.instagram.com/zikra_io" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="Instagram">
              <InstagramIcon />
            </a>
            <button className="text-gray-400 hover:text-white transition-colors" aria-label="Facebook">
              <FacebookIcon />
            </button>
            <button className="text-gray-400 hover:text-white transition-colors" aria-label="Twitter">
              <TwitterIcon />
            </button>
          </div>

        </div>
      </nav>
    </>
  );
}
