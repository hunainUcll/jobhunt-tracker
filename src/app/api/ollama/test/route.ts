import { NextRequest, NextResponse } from "next/server";
import { assertLocalRequest } from "@/lib/security";
import { localAiSettingsSchema } from "@/lib/ai-config";
import { verifyLocalModel } from "@/lib/local-ai";
export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request, true);
  } catch {
    return NextResponse.json(
      { error: "Local workspace access only" },
      { status: 403 },
    );
  }
  try {
    const parsed = localAiSettingsSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    const result = await verifyLocalModel(parsed.data);
    return NextResponse.json({
      success: `Connected to local Ollama. ${result.model} is installed locally. No email content was sent.`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Ollama unavailable. Rules remain available.",
      },
      { status: 503 },
    );
  }
}
