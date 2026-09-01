import { NextResponse } from "next/server";
import { signupOpen } from "@/lib/auth";

// Gate status — single source of truth (same check the signup hook runs):
// admin dial + cohort cap.
export async function GET() {
  const open = await signupOpen();
  return NextResponse.json({ open });
}