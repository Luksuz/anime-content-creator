import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Ensure cookies have the proper SameSite and Secure settings for production
              const cookieOptions = {
                ...options,
                sameSite: "lax" as const,
                secure: process.env.NODE_ENV === "production",
              };
              cookieStore.set(name, value, cookieOptions);
            });
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.warn("Warning: Unable to set cookies in Server Component", error);
          }
        },
      },
    }
  );
}
