import { NextRequest, NextResponse } from "next/server";
import { assertLocalRequest } from "@/lib/security";
export function proxy(request: NextRequest) {
  try {
    assertLocalRequest(
      request,
      !["GET", "HEAD", "OPTIONS"].includes(request.method),
    );
    return NextResponse.next();
  } catch {
    return new NextResponse("Local workspace access only", { status: 403 });
  }
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
