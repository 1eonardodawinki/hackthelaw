import { NextRequest, NextResponse } from "next/server";
import { snapshotAt } from "@/lib/graph/temporal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/matters/[id]/snapshot">) {
  const { id } = await ctx.params;
  const tParam = req.nextUrl.searchParams.get("t");
  const t = tParam ? Number(tParam) : Date.now();
  if (!Number.isFinite(t)) {
    return NextResponse.json({ error: "t must be an epoch-millisecond number" }, { status: 400 });
  }

  const entries = await snapshotAt(t, { matterId: id });
  return NextResponse.json({ t, entries });
}
