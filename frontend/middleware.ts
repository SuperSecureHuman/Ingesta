import { NextRequest, NextResponse } from 'next/server';

const PROTECTED = ['/library', '/project', '/settings', '/profile'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!isProtected) return NextResponse.next();

  // Only checks presence of the session cookie — not validity.
  // Each page does a real checkAuth() call as the authoritative guard.
  if (!request.cookies.get('session')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/library/:path*', '/project/:path*', '/settings', '/profile'],
};
