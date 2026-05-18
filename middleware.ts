import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

// Routes that require authentication
const PROTECTED_ROUTES = ['/desktop', '/api/fs', '/api/desktop', '/api/socket'];

// Routes that should redirect to desktop if already authenticated
const AUTH_ROUTES = ['/login', '/signup', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  // Redirect authenticated users away from auth pages
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (sessionToken) {
      return NextResponse.redirect(new URL('/desktop', request.url));
    }
    return NextResponse.next();
  }

  // Protect routes
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!sessionToken) {
      // API routes return 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      // Page routes redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Root redirect
  if (pathname === '/') {
    if (sessionToken) {
      return NextResponse.redirect(new URL('/desktop', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
