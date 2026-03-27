"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthModal from "./AuthModal";

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

export default function Navbar() {
  const pathname = usePathname();
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  return (
    <>
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
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
            <>
              <span className="text-sm text-gray-300 tracking-wide truncate max-w-[100px]">
                {user.displayName ?? user.email}
              </span>
              <button
                onClick={() => signOut(auth)}
                className="text-sm text-gray-400 hover:text-white tracking-wide transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="text-sm text-gray-400 hover:text-white tracking-wide transition-colors"
            >
              Login
            </button>
          )}
          <button className="text-gray-400 hover:text-white transition-colors" aria-label="Instagram">
            <InstagramIcon />
          </button>
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
