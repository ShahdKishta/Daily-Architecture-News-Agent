import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase, type DailyReport, type DailyReportArticle } from "@/lib/supabase";
import { EMAIL_COOKIE } from "@/lib/constants";
import { RunNowButton } from "./RunNowButton";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = (
    searchParams.email ??
    cookies().get(EMAIL_COOKIE)?.value ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!email) {
    redirect("/setup");
  }

  const { data: userConfig } = await supabase
    .from("user_config")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (!userConfig) {
    redirect("/setup");
  }

  const { data: reports } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("user_config_id", userConfig.id)
    .order("created_at", { ascending: false });

  const reportList = (reports ?? []) as DailyReport[];

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Your digest</h1>
            <p className="mt-1 text-sm text-gray-500">{userConfig.email}</p>
          </div>
          <RunNowButton />
        </div>

        <div className="mt-8 space-y-6">
          {reportList.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              No reports yet. Click &quot;Run now&quot; to generate your
              first digest.
            </div>
          )}

          {reportList.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      </div>
    </main>
  );
}

function ReportCard({ report }: { report: DailyReport }) {
  const dateLabel = new Date(report.created_at).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  const articles = (report.articles ?? []) as DailyReportArticle[];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-medium text-gray-400">{dateLabel}</div>
      <div className="mt-4 space-y-4">
        {articles.map((article, index) => (
          <div
            key={index}
            className={index > 0 ? "border-t border-gray-100 pt-4" : ""}
          >
            <div className="font-semibold text-gray-900">{article.title}</div>
            <p className="mt-1 text-sm text-gray-600">{article.summary}</p>
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-blue-600 hover:underline"
            >
              Read source →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
