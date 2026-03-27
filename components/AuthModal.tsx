"use client";

import { useState, useRef, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import PasswordInput from "./PasswordInput";

interface AuthModalProps {
  onClose: () => void;
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/invalid-email":           return "Invalid email address.";
    case "auth/user-not-found":          return "No account found with that email.";
    case "auth/wrong-password":          return "Incorrect password.";
    case "auth/invalid-credential":      return "Incorrect email or password.";
    case "auth/email-already-in-use":    return "An account with this email already exists.";
    case "auth/weak-password":           return "Password must be at least 6 characters.";
    case "auth/too-many-requests":       return "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":    return "";
    case "auth/cancelled-popup-request": return "";
    default:                             return "Something went wrong. Please try again.";
  }
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (overlayRef.current === e.target) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function switchTab(t: "login" | "signup") {
    setTab(t);
    setError("");
    setPassword("");
    setConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (tab === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      }
      onClose();
    } catch (err: any) {
      setError(friendlyError(err.code ?? ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      const code = err.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // user dismissed — do nothing
      } else {
        setError(friendlyError(code));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-[420px] max-w-[92vw] bg-[#1e1e1e] rounded-2xl shadow-2xl border border-[#333] overflow-hidden">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 transition-colors z-10"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="pt-8 pb-4 px-8 text-center">
          <p className="text-white font-serif text-2xl tracking-wide mb-1">Zikra</p>
          <p className="text-gray-400 text-sm">
            {tab === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#333] mx-8">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-white border-b-2 border-[#6b9fff] -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <div className="px-8 py-6 space-y-4">

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {tab === "signup" && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors"
            />
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
            {tab === "signup" && (
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                required
              />
            )}

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? "Please wait…" : tab === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#333]" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-1 h-px bg-[#333]" />
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-[#444] bg-[#2a2a2a] text-gray-200 text-sm font-medium hover:bg-[#333] hover:border-[#555] transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Footer switch */}
          <p className="text-center text-xs text-gray-600 pb-2">
            {tab === "login" ? (
              <>Don&apos;t have an account?{" "}
                <button onClick={() => switchTab("signup")} className="text-[#6b9fff] hover:underline">Sign up</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => switchTab("login")} className="text-[#6b9fff] hover:underline">Log in</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
      <path fill="#EA4335" d="M24 9.5c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 3.1 29.5 1 24 1 14.8 1 7 6.7 3.7 14.6l7 5.4C12.4 13.7 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.2-9.9 6.2-16.9z"/>
      <path fill="#FBBC05" d="M10.7 28.5A14.4 14.4 0 0 1 9.5 24c0-1.6.3-3.1.7-4.5L3.2 14C1.2 17.5 0 21.6 0 26s1.2 8.5 3.2 12l7.5-5.5z"/>
      <path fill="#34A853" d="M24 47c5.5 0 10.1-1.8 13.5-4.9l-7.4-5.7c-1.8 1.2-4.1 1.9-6.1 1.9-6.3 0-11.6-4.2-13.5-9.9l-7 5.4C7 41.3 14.8 47 24 47z"/>
    </svg>
  );
}
