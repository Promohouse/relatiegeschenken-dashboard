import { NextResponse, type NextRequest } from 'next/server'

/**
 * Stuurt wie niet ingelogd lijkt naar het inlogscherm. Dit is gemak, geen
 * beveiliging: de echte controle doet de api bij elk verzoek.
 */
export function middleware(request: NextRequest) {
  const heeftSessie = request.cookies.getAll().some((c) => c.name.includes('session_token'))
  const opInlogscherm = request.nextUrl.pathname.startsWith('/login')

  if (!heeftSessie && !opInlogscherm) {
    const url = new URL('/login', request.url)
    if (request.nextUrl.pathname !== '/') url.searchParams.set('verder', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (heeftSessie && opInlogscherm) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
