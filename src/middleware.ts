import { createClient } from '@/utils/supabase/middleware';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes (accessible without authentication)
  const publicRoutes = ['/login', '/register', '/auth/callback', '/api/auth/', '/terms', '/privacy'];
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Check if the user is authenticated
  const supabase = createClient(request);
  const { data: { session } } = await supabase.auth.getSession();

  // If not authenticated and trying to access a protected route
  if (!session && !pathname.startsWith('/api/')) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

// Apply this middleware to specific paths
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
