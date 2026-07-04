"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RunAgentResult = { email: string; status: "sent" | "error" };

export function RunNowButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/run-agent", { method: "POST" });
      const data: { results?: RunAgentResult[]; error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      const results = data.results ?? [];
      const sent = results.filter((r) => r.status === "sent").length;
      const failed = results.filter((r) => r.status === "error").length;
      setMessage(
        `Done: ${sent} report${sent === 1 ? "" : "s"} sent${
          failed ? `, ${failed} failed` : ""
        }.`
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Running..." : "Run now"}
      </button>
      {message && <p className="mt-2 text-xs text-gray-500">{message}</p>}
    </div>
  );
}
