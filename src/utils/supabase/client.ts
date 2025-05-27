import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Add logging to see if environment variables are correctly loaded
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("Missing Supabase environment variables in client!");
  } else {
    console.log("Supabase client config loaded with URL:", 
      process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 12) + "...");
  }
  
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Using the correct cookieOptions format
      cookieOptions: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7 // 1 week
      }
    }
  );
}
