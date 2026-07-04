import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable");
}

export const resend = new Resend(apiKey);

// Replace with a verified sending domain/address in your Resend account.
export const REPORT_FROM_ADDRESS = "Daily Architecture News <onboarding@resend.dev>";
