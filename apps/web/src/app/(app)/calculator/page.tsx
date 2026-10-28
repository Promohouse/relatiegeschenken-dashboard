import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PaginatedCustomers, PaginatedProducts, ProductDetail } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Calculator } from '@/components/calculator'
import { getCurrentUser, mag } from '@/lib/session'

export default async function CalculatorPagina({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>
}) {
  const user = await getCurrentUser()
  if (!mag(user, 'quotes:view')) redirect('/')

  const { product: productId } = await searchParams
  const [producten, klanten] = await Promise.all([
    apiGet<PaginatedProducts>('/api/products?status=active&pageSize=100&sort=name'),
    mag(user, 'customers:view')
      ? apiGet<PaginatedCustomers>('/api/customers?status=active&pageSize=100&sort=name')
      : Promise.resolve({ items: [] } as unknown as PaginatedCustomers),
  ])

  const gekozen = productId ?? producten.items[0]?.id
  const product = gekozen ? await apiGet<ProductDetail>(`/api/products/${gekozen}`) : null

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Calculator</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Van inkoopstaffel naar verkoopprijs, met bedrukking, korting en btw. Dezelfde berekening
        die straks onder de offerte zit — er wordt hier niets opgeslagen.
      </p>

      {producten.items.length === 0 ? (
        <p className="mt-5 rounded border border-rule bg-surface p-4 text-sm text-ink-soft">
          Er zijn nog geen producten. Die komen uit een import; kijk bij{' '}
          <Link href="/imports" className="text-accent hover:underline">
            Imports
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-2">
            <form action="/calculator" className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="product" className="text-sm font-medium text-ink-soft">
                  Product
                </label>
                <select
                  id="product"
                  name="product"
                  defaultValue={gekozen}
                  className="h-9 w-96 rounded border border-rule bg-surface px-2 text-sm focus:border-accent focus:outline-none"
                >
                  {producten.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.articleNumber} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded border border-rule-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-sunk"
              >
                Kies
              </button>
            </form>
            {product && (
              <Link
                href={`/producten/${product.id}`}
                className="h-9 text-sm leading-9 text-ink-soft hover:text-ink"
              >
                Naar het product
              </Link>
            )}
          </div>

          {product && (
            <div className="mt-5">
              <Calculator product={product} klanten={klanten.items.map((k) => ({ id: k.id, name: k.name }))} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
