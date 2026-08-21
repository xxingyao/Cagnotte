import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // If the user tries to access the root path, redirect them to /login
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};