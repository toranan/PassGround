import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

function getSupabaseAnonClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is missing.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader) return "";

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return "";
  return token?.trim() ?? "";
}

export async function getUserByAccessToken(accessToken: string): Promise<AuthenticatedUser | null> {
  const token = accessToken.trim();
  if (!token) return null;

  const anon = getSupabaseAnonClient();
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}

export function getConfiguredAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdminUser(userId: string, email?: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"])
    .limit(1);

  if (data && data.length > 0) {
    return true;
  }

  const adminEmails = getConfiguredAdminEmails();
  if (email && adminEmails.includes(email.toLowerCase())) {
    return true;
  }

  return false;
}
