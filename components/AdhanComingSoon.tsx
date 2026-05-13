"use client";

import { useState, useEffect } from "react";

function Modal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl px-12 py-10 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <p className="text-white font-serif text-2xl tracking-wide">Coming Soon</p>
        <p className="text-gray-500 text-sm text-center">The Adhan feature is on its way.</p>
      </div>
    </div>
  );
}

export function AdhanFeatureCard({ icon }: { icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <Modal onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(true)}
        className="group relative block w-full bg-gradient-to-br from-[#505050] to-[#383838] border border-[#606060] hover:border-[#909090] text-white rounded-2xl p-8 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all duration-300 overflow-hidden"
      >
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300 rounded-2xl" />
        <div className="relative z-10">
          <div className="w-10 h-10 mb-5 text-[#c8c8c8]">{icon}</div>
          <h3 className="text-xl font-semibold tracking-wide mb-2">Adhan</h3>
          <p className="text-sm text-gray-400 leading-relaxed">Automatically play the adhan on your Sonos at every prayer time.</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#808080] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>
    </>
  );
}

export function AdhanFooterLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <Modal onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(true)}
        className="text-left text-gray-400 hover:text-white transition-colors underline"
      >
        Adhan
      </button>
    </>
  );
}
