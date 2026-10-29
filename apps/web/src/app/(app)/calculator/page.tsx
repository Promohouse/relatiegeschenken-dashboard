import { redirect } from 'next/navigation'
import type { PaginatedCustomers, ProductDetail, ShippingMethod } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
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

  // Klanten voor de keuzelijst; zonder het recht erop blijft die leeg en
  // rekent de calculator met de algemene prijs.
  const [klanten, staffelaantallen, verzendwijzen] = await Promise.all([
    mag(user, 'customers:view')
      ? apiGet<PaginatedCustomers>('/api/customers?status=active&pageSize=100&sort=name')
      : Promise.resolve({ items: [] } as unknown as PaginatedCustomers),
    apiGet<number[]>('/api/settings/quote-tiers'),
    apiGet<ShippingMethod[]>('/api/settings/shipping-methods'),
  ])

  // Een product uit de URL, bijvoorbeeld via "Doorrekenen" op de
  // productpagina. Bestaat het niet, dan begint de calculator gewoon leeg.
  let beginProduct: ProductDetail | null = null
  if (productId) {
    try {
      beginProduct = await apiGet<ProductDetail>(`/api/products/${productId}`)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Calculator</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Van inkoopstaffel naar verkoopprijs, met bedrukking, korting en btw. Dezelfde berekening
        die straks onder de offerte zit — er wordt hier niets opgeslagen.
      </p>

      <div className="mt-5">
        <Calculator
          beginProduct={beginProduct}
          klanten={klanten.items.map((k) => ({ id: k.id, name: k.name }))}
          staffelaantallen={staffelaantallen}
          verzendwijzen={verzendwijzen}
        />
      </div>
    </div>
  )
}
