// src/types/supabase.ts

// Define a Profile type that matches your Supabase 'profiles' table
export interface Profile {
    id: number; // Primary key of the profiles table (bigint)
    user_id: string; // Foreign key to auth.users.id (uuid)
    is_admin: boolean | null;
    created_at: string; // timestamp with time zone not null
    // email is not in the profiles table as per the provided schema
  }
  
// Renaming DbJob to VideoRecord to match the table definition provided by the user.
// This interface now reflects the columns of the 'video_records' table.
export interface DbJob { // This will represent a VideoRecord
    id: string; // uuid not null default gen_random_uuid()
    user_id: string; // text not null (should ideally be uuid and FK to auth.users.id)
    image_urls: string[]; // jsonb not null (assuming array of image urls)
    audio_url: string; // text not null
    status: string | null; // text null default 'pending'::text
    final_video_url: string | null; // text null
    error_message: string | null; // text null
    created_at: string | null; // timestamp with time zone null default now()
    updated_at: string | null; // timestamp with time zone null default now()
    minutes_taken: number | null; // numeric null
    thumbnail_url: string | null; // text null
    shotstack_id: string | null; // text null
    subtitles_url: string | null; // text null
}
  
  // It can be useful to have a type for the Supabase User object if you extend it or need to reference it often
  // However, often you can just use `User` from '@supabase/supabase-js'
  // Example if you have custom user metadata:
  /*
  import { User as SupabaseUser } from '@supabase/supabase-js';
  
  export interface AppUser extends SupabaseUser {
    app_metadata: {
      is_admin?: boolean; // Example: if you store admin status in app_metadata
      // other custom app metadata
    };
    user_metadata: {
      // custom user metadata
      preferred_theme?: string;
    };
  }
  */
  