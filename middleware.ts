import { NextResponse, type NextRequest } from "next/server";
import { trackReferralCode } from "@profullstack/referrals/next";

export function middleware(request: NextRequest) {
  return trackReferralCode(request, NextResponse.next() as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
