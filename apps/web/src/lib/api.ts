import { cookies } from 'next/headers'

const API = process.env.API_BASE_URL ?? 'http://localhost:3101'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Haalt gegevens op bij de api en stuurt de sessiecookie mee.
 *
 * Server-side gaat het rechtstreeks naar de api; in de browser loopt alles via
 * de doorzetregel in next.config.ts, zodat de cookie op één domein blijft.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const store = await cookies()
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  const res = await fetch(`${API}${path}`, {
    headers: cookie ? { cookie } : {},
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'ONBEKEND',
      body?.error?.message ?? `De api gaf ${res.status}.`,
    )
  }

  return res.json() as Promise<T>
}
