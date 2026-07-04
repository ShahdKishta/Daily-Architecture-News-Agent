"use client";

import { useState, type FormEvent } from "react";
import { saveUserConfig } from "./actions";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_KEYWORDS = "Architecture, Sustainable Design, BIM, Green Building";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [newsCount, setNewsCount] = useState(5);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [runTime, setRunTime] = useState("13");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const keywordList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const result = await saveUserConfig({
        email,
        newsCount,
        keywords: keywordList,
        runTime,
        telegramChatId,
      });

      // If we get here without a redirect having happened, either the
      // server returned a validation error, or something unexpected
      // occurred. Either way, surface it and stop loading.
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
    } catch (err) {
      // Next.js redirect() throws a special error to trigger navigation;
      // let anything that isn't that propagate normally, otherwise ignore.
      if (
        err instanceof Error &&
        err.message === "NEXT_REDIRECT"
      ) {
        throw err;
      }
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Set up your daily digest</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tell us what to track and when to send it. You can come back to
          this page anytime to update your preferences.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Used to identify your account. Digests are delivered via
              Telegram, not email.
            </p>
          </div>

          <div>
            <label
              htmlFor="telegramChatId"
              className="block text-sm font-medium text-gray-700"
            >
              Telegram Chat ID
            </label>
            <input
              id="telegramChatId"
              type="text"
              required
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="123456789"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Your daily digest is delivered here via Telegram. Message our
              bot, then message @userinfobot to find your chat ID.
            </p>
          </div>

          <div>
            <label
              htmlFor="newsCount"
              className="block text-sm font-medium text-gray-700"
            >
              Number of news items to summarize
            </label>
            <input
              id="newsCount"
              type="number"
              min={1}
              max={20}
              required
              value={newsCount}
              onChange={(e) => setNewsCount(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="keywords"
              className="block text-sm font-medium text-gray-700"
            >
              Keywords to track
            </label>
            <input
              id="keywords"
              type="text"
              required
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={DEFAULT_KEYWORDS}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Comma-separated</p>
          </div>

          <div>
            <label
              htmlFor="runTime"
              className="block text-sm font-medium text-gray-700"
            >
              Preferred daily run time (UTC)
            </label>
            <select
              id="runTime"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              {HOURS.map((h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
