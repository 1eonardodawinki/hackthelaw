import { NextResponse } from "next/server";
import { applyNewInformation, findNewInformationFile } from "@/lib/agent/newInformation";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ available: findNewInformationFile() !== null, file: findNewInformationFile() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.clauseId) {
    return NextResponse.json({ error: "clauseId is required" }, { status: 400 });
  }

  try {
    const result = await applyNewInformation(body.clauseId, { model: body.model });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
