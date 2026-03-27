"use client";

import { useState } from "react";
import {
  updateProfile,
  verifyBeforeUpdateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User,
} from "firebase/auth";
import PasswordInput from "./PasswordInput";

interface ProfileModalProps {
  user: User;
  onClose: () => void;
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":   return "Incorrect password.";
    case "auth/email-already-in-use": return "That email is already in use.";
    case "auth/invalid-email":        return "Invalid email address.";
    case "auth/weak-password":        return "Password must be at least 6 characters.";
    case "auth/requires-recent-login":return "Please log out and log back in, then try again.";
    default:                          return `Something went wrong (${code}).`;
  }
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-gray-100 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#6b9fff] transition-colors";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-xs uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function Msg({ text }: { text: string }) {
  const isSuccess = text.toLowerCase().includes("updated");
  return (
    <p className={`text-xs text-center ${isSuccess ? "text-green-400" : "text-red-400"}`}>
      {text}
    </p>
  );
}

function SaveButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-2 rounded-xl bg-[#6b9fff] hover:bg-[#5a8eee] text-white text-sm font-semibold transition-colors disabled:opacity-50"
    >
      {loading ? "Saving…" : "Save"}
    </button>
  );
}

export default function ProfileModal({ user, onClose }: ProfileModalProps) {
  const isGoogle = user.providerData[0]?.providerId === "google.com";

  // Name
  const [name, setName] = useState(user.displayName ?? "");
  const [nameMsg, setNameMsg] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleNameSave() {
    setNameMsg("");
    setNameLoading(true);
    try {
      await updateProfile(user, { displayName: name.trim() });
      setNameMsg("Name updated.");
    } catch (err: any) {
      setNameMsg(friendlyError(err.code ?? ""));
    } finally {
      setNameLoading(false);
    }
  }

  async function handleEmailSave() {
    setEmailMsg("");
    if (!newEmail.trim()) return;
    setEmailLoading(true);
    try {
      await verifyBeforeUpdateEmail(user, newEmail.trim());
      setEmailMsg("Verification email sent. Check your inbox to confirm the change.");
      setNewEmail("");
    } catch (err: any) {
      setEmailMsg(friendlyError(err.code ?? ""));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSave() {
    setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMsg(friendlyError(err.code ?? ""));
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDelete() {
    setDeleteMsg("");
    setDeleteLoading(true);
    try {
      if (!isGoogle) {
        const credential = EmailAuthProvider.credential(user.email!, deletePassword);
        await reauthenticateWithCredential(user, credential);
      }
      await deleteUser(user);
      onClose();
    } catch (err: any) {
      setDeleteMsg(friendlyError(err.code ?? ""));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[460px] max-w-[92vw] bg-[#1e1e1e] rounded-2xl shadow-2xl border border-[#333] max-h-[90vh] overflow-y-auto">

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
        <div className="pt-8 pb-2 px-8 text-center">
          <p className="text-white font-serif text-2xl tracking-wide mb-1">Profile</p>
          <p className="text-gray-500 text-sm">{user.email}</p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Display Name */}
          <Section title="Display Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={inputCls}
            />
            {nameMsg && <Msg text={nameMsg} />}
            <SaveButton onClick={handleNameSave} loading={nameLoading} />
          </Section>

          {/* Email — email/password users only */}
          {!isGoogle && (
            <Section title="Change Email">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="New email"
                className={inputCls}
              />
              {emailMsg && <Msg text={emailMsg} />}
              <SaveButton onClick={handleEmailSave} loading={emailLoading} />
            </Section>
          )}

          {/* Password — email/password users only */}
          {!isGoogle && (
            <Section title="Change Password">
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
              />
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
              />
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              {passwordMsg && <Msg text={passwordMsg} />}
              <SaveButton onClick={handlePasswordSave} loading={passwordLoading} />
            </Section>
          )}

          {/* Delete account */}
          <div className="border-t border-[#333] pt-6 pb-2">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 rounded-xl border border-red-800 text-red-400 text-sm font-medium hover:bg-red-900/20 transition-colors"
              >
                Delete Account
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-red-400 text-sm text-center font-medium">
                  Are you sure? This cannot be undone.
                </p>
                {!isGoogle && (
                  <PasswordInput
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                  />
                )}
                {deleteMsg && <p className="text-red-400 text-xs text-center">{deleteMsg}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeleteMsg(""); }}
                    className="flex-1 py-2.5 rounded-xl border border-[#444] text-gray-400 text-sm hover:bg-[#2a2a2a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {deleteLoading ? "Deleting…" : "Yes, Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
