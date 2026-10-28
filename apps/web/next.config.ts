import type { NextConfig } from 'next'

const apiUrl = process.env.API_BASE_URL ?? 'http://localhost:3101'

/**
 * Alles onder /api wordt doorgezet naar de api-applicatie.
 *
 * Daardoor ziet de browser één herkomst, en komt de sessiecookie gewoon op het
 * domein van het dashboard te staan. Zonder deze omweg zou de cookie op de
 * api-poort belanden en bij geen enkel verzoek meegestuurd worden.
 */
const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]
  },
}

export default config
