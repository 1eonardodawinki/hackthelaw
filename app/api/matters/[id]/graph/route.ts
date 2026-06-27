import { NextRequest, NextResponse } from "next/server";
import { getMatterGraph } from "@/lib/graph/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/matters/[id]/graph">) {
  const { id } = await ctx.params;
  const tParam = req.nextUrl.searchParams.get("t");
  const t = tParam ? Number(tParam) : Date.now();
  if (!Number.isFinite(t)) {
    return NextResponse.json({ error: "t must be an epoch-millisecond number" }, { status: 400 });
  }

  const graph = await getMatterGraph(id, t);
  return NextResponse.json(graph);
}
