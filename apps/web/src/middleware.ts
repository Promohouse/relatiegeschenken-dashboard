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
  /**
   * Alles behalve de api, de bestanden van Next en losse bestanden uit
   * `public`. Dat laatste is `.*\\..*`: een pad met een punt erin is een
   * bestand en geen pagina.
   *
   * Zonder die uitzondering stuurt deze middleware ook het ophalen van een
   * afbeelding naar het inlogscherm. De beeldoptimalisatie van Next haalt het
   * bronbestand namelijk zelf op, zonder sessiecookie, en krijgt dan een
   * omleiding in plaats van een plaatje - met als resultaat dat het logo niet
   * verschijnt terwijl de pagina verder klopt.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
