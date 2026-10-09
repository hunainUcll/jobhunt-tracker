import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertLocalRequest } from "@/lib/security";
import { syncGmail } from "@/lib/mail-sync";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request, true);
    const result = await syncGmail();
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gmail sync failed" },
      { status: 400 },
    );
  }
}
