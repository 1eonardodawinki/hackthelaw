import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerQuestion } from "@/lib/chat/answer";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.question || typeof body.question !== "string") {
    return NextResponse.json({ error: "question (string) is required" }, { status: 400 });
  }

  // Try the Python backend query agent first — it has full graph traversal,
  // Supabase access, and agentic reasoning. Fall back to the local semantic
  // similarity approach if the backend is unreachable.
  try {
    // Get the Supabase session token to forward to the Python backend
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    // If we have no session token, skip the backend (it will 401 anyway)
    if (!session?.access_token) {
      throw new Error("No session token available for backend auth");
    }

    const res = await fetch(`${BACKEND_URL}/api/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ question: body.question, matterId: body.matterId }),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const errBody = await res.text().catch(() => "");
    console.warn(`[chat] Backend /api/query returned ${res.status}: ${errBody}`);
  } catch (err) {
    console.warn(`[chat] Backend skipped:`, err instanceof Error ? err.message : err);
  }

  // Fallback: local semantic similarity search
  try {
    const result = await answerQuestion(body.question, body.matterId as string | undefined);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
