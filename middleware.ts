import { NextResponse, type NextRequest } from 'next/server';

/**
 * Basic auth for the whole app (the app can post to the company account – it must never be open).
 * - APP_PASSWORD set → required (any user name).
 * - APP_PASSWORD missing → allowed only in local development; on Vercel/production the app refuses to serve.
 */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const deployed = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (!password) {
    if (!deployed) return NextResponse.next();
    return new NextResponse('APP_PASSWORD ist nicht gesetzt – die App bleibt gesperrt.', { status: 503 });
  }
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  return new NextResponse('Anmeldung erforderlich', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Pflegeunion Social Studio", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
