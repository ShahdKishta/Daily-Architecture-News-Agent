import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { EMAIL_COOKIE } from "@/lib/constants";

export default async function HomePage({
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
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (userConfig) {
    redirect(`/dashboard?email=${encodeURIComponent(email)}`);
  }

  redirect("/setup");
}
