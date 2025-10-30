"use client";

import React from "react";

export type Badge = {
  id: string;
  name: string;
  emoji: string;
  threshold: number;
  earnedAt?: string | null;
};

export default function StarBank({
  bank,
  badges,
  currentStreak,
  mode = "view",
  onClose,
  onRequestReset,
}: {
  bank: number;
  badges: Badge[];
  currentStreak?: number;
  mode?: "view" | "manage"; // "manage" shows Reset (Quiz); "view" is read-only (Tutor)
  onClose: () => void;
  onRequestReset?: () => void;
}) {
  const nextBadge = (() => {
    const unlocked = [...badges].sort((a, b) => a.threshold - b.threshold);
    for (const b of unlocked) if (bank < b.threshold) return b.threshold;
    return null;
  })();

  return (
    <div>
      <h3 className="text-2xl font-semibold">⭐ Star Bank</h3>
      <p className="mt-1 text-gray-600">Your total stars across all quizzes and practice.</p>

      {/* 3-column responsive layout */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto pr-1">
       {/* Column 1 — Summary */}
        <section className="space-y-4">
          <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-100">
            <p className="text-sm text-yellow-900 flex items-center gap-1.5">Total Stars</p>
            <p className="mt-1 text-4xl font-bold">{bank}</p>
          </div>

          {typeof currentStreak === "number" && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-900">Current Streak</p>
              <p className="mt-1 text-3xl font-bold">{currentStreak}</p>
              {currentStreak >= 7 ? (
                <p className="text-xs mt-2 text-rose-700">🔥 3× boost active</p>
              ) : currentStreak >= 3 ? (
                <p className="text-xs mt-2 text-orange-700">🔥 2× boost active</p>
              ) : (
                <p className="text-xs mt-2 text-gray-600">Keep going to activate a boost!</p>
              )}
            </div>
          )}

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-sm text-emerald-900">Next Badge At</p>
            <p className="mt-1 text-2xl font-semibold">{nextBadge ?? "Maxed!"}</p>
            <p className="text-xs mt-1 text-emerald-700">
              Badges unlock automatically when you reach the total.
            </p>
          </div>
        </section>

        {/* Column 2 — Badges */}
        <section className="lg:col-span-1">
          <h4 className="text-lg font-semibold mb-3">Badges</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badges.map((b) => {
              const earned = !!b.earnedAt;
              const canClaim = bank >= b.threshold;
              return (
                <li
                  key={b.id}
                  className={`p-3 rounded-xl border ${
                    earned
                      ? "border-emerald-200 bg-emerald-50"
                      : canClaim
                      ? "border-yellow-200 bg-yellow-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{b.emoji}</span>
                    <div className="flex-1">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-gray-500">{b.threshold} stars</p>
                      {earned ? (
                        <p className="text-xs text-emerald-700 mt-1">Unlocked ✓</p>
                      ) : canClaim ? (
                        <p className="text-xs text-yellow-700 mt-1">Ready to unlock (keep earning!)</p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          {Math.max(0, b.threshold - bank)} more to go
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Column 3 — Actions / Tips */}
        <section className="space-y-3">
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
            <h5 className="font-semibold mb-2">Actions</h5>
            <div className="flex flex-col gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-left"
              >
                Close
              </button>
              {mode === "manage" && onRequestReset && (
                <button
                  onClick={onRequestReset}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-left"
                  title="Protected by Parental PIN"
                >
                  Reset Bank & Badges
                </button>
              )}
              {mode === "view" && (
                <p className="text-xs text-gray-500 mt-1">
                  To reset or manage PIN, use the Quiz page’s Star Bank panel.
                </p>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <h5 className="font-semibold mb-2">Tips</h5>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Earn stars in Quiz or Tutor — they’re shared!</li>
              <li>Complete 3 days in a row for a 2× boost.</li>
              <li>Complete 7 days in a row for a 3× boost.</li>
              <li>Quiet Mode mutes sound and softens effects.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
