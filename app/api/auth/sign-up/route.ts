import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const parsedBody: unknown = await request.json().catch(() => null);
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "A valid sign-up request is required." }, { status: 400 });
  }
  const { email, password } = parsedBody as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "A valid email and password of at least 8 characters are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data.user, session: data.session }, { status: 201 });
}
