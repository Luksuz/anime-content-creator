import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
// import { Database } from '@/types/supabase-dynamic'; // Using a more generic type for now

export async function POST(request: Request) {

  const supabase = createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('API delete-user: Auth error or no user', authError);
      return NextResponse.json({ error: 'Not authenticated or auth error.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('API delete-user: Error fetching profile for user ' + user.id + ':', profileError);
      return NextResponse.json({ error: 'Could not verify admin status.' }, { status: 500 });
    }

    if (!profile || !profile.is_admin) {
      console.warn('API delete-user: User ' + user.id + ' is not an admin. Attempt to delete user denied.');
      return NextResponse.json({ error: 'Forbidden. You are not an admin.' }, { status: 403 });
    }
    
    const { user_id: userIdToDelete } = await request.json();

    if (!userIdToDelete || typeof userIdToDelete !== 'string') {
      return NextResponse.json({ error: 'user_id (string) is required in the request body.' }, { status: 400 });
    }
    
    console.log('Admin ' + (user.email || 'N/A') + ' (ID: ' + user.id + ') is attempting to delete user: ' + userIdToDelete);

    const { data, error } = await supabase.auth.admin.deleteUser(userIdToDelete);


    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to delete user.', details: data }, { status: 500 });
    }

    return NextResponse.json({ message: 'User deleted successfully.', deleted_user_id: userIdToDelete, details: data });

  } catch (error: any) {
    console.error('API delete-user: Unexpected error:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        errorMessage = "Invalid JSON in request body."
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 