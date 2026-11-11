import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/server/auth";

// No email infrastructure in this build — always respond with a generic
// message so we never reveal whether an address is registered.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`forgot:ip:${clientIp(req)}`, 5, 15 * 60_000);
  if (limited) return limited;
  return NextResponse.json({
    message: "If an account exists for that email, a reset link is on its way.",
  });
}
