import { cookies } from "next/headers";
import { supabase, type UserConfig } from "@/lib/supabase";
import { EMAIL_COOKIE } from "@/lib/constants";
import { SetupForm } from "./SetupForm";

export default async function SetupPage({
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

  let existingConfig: UserConfig | null = null;
  if (email) {
    const { data } = await supabase
      .from("user_config")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    existingConfig = data;
  }

  return <SetupForm existingConfig={existingConfig} />;
}
