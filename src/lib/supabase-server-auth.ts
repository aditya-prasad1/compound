import { NextResponse } from "next/server";

type AuthenticatedUser = { id: string };

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !apiKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: authorization },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = await response.json() as Partial<AuthenticatedUser>;
  return typeof user.id === "string" ? { id: user.id } : null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Supabase authentication is required." }, { status: 401 });
}
