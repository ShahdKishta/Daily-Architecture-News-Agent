import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

export const gemini = new GoogleGenAI({ apiKey });

export const GEMINI_MODEL = "gemini-2.5-flash";
