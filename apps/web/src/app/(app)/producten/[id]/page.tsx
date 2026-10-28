import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Package, Printer, Truck } from 'lucide-react'
import { formatEuro, type ProductDetail } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

const ofStreepje = (waarde: string | null) => waarde ?? '—'

export default async function ProductPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!mag(user, 'products:view')) redirect('/')

  let product: ProductDetail
  try {
    product = await apiGet<ProductDetail>(`/api/products/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  return (
    <div className="max-w-5xl">
      <Link href="/producten" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Producten
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            {!product.isActive && <Badge tone="rest">inactief</Badge>}
            {product.isDemo && <Badge tone="wait">demodata</Badge>}
          </div>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-sm text-ink-faint">
            {product.articleNumber}
            {product.brand && <span className="font-[family-name:inherit]"> · {product.brand}</span>}
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-bold tabular">{product.variantCount}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Varianten</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular">
              {product.purchasePrice === null || Number(product.purchasePrice) === 0
                ? '—'
                : formatEuro(product.purchasePrice)}
            </p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Inkoop vanaf 1</p>
          </div>
        </div>
      </div>

      {product.suppliers.length > 0 && Number(product.suppliers[0].purchasePrice) === 0 && (
        <p className="mt-4 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          Dit product heeft nog geen inkoopprijs. Zonder prijs weigert de calculatie een
          verkoopprijs te bepalen — draai een prijsimport bij{' '}
          <Link href="/imports" className="font-medium underline">
            Imports
          </Link>
          .
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section className="rounded border border-rule bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Package size={14} aria-hidden className="text-ink-faint" />
            Kenmerken
          </h2>
          <dl className="mt-3 grid gap-3">
            <Veld label="Categorie">{ofStreepje(product.categoryName)}</Veld>
            <Veld label="Materiaal">{ofStreepje(product.material)}</Veld>
            <Veld label="Afmetingen">{ofStreepje(product.dimensions)}</Veld>
            <Veld label="Land van herkomst">{ofStreepje(product.countryOfOrigin)}</Veld>
            <Veld label="Goederencode">
              <span className="font-[family-name:var(--font-mono)]">
                {ofStreepje(product.commodityCode)}
              </span>
            </Veld>
            <Veld label="Bedrukbaar">
              {product.printable === null ? '—' : product.printable ? 'ja' : 'nee'}
            </Veld>
          </dl>
        </section>

        <section className="rounded border border-rule bg-surface p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Truck size={14} aria-hidden className="text-ink-faint" />
            Leveranciers en inkoopstaffels
          </h2>

          {product.suppliers.length === 0 ? (
            <p className="mt-3 text-sm text-alarm">
              Geen leverancier gekoppeld. Zonder leverancier is er geen inkoopprijs en dus geen
              calculatie.
            </p>
          ) : (
            <div className="mt-3 grid gap-4">
              {product.suppliers.map((leverancier) => (
                <div key={leverancier.id}>
                  <p className="text-sm font-medium">
                    {leverancier.supplierName}
                    {leverancier.isPreferred && (
                      <Badge tone="ok" className="ml-2">
                        voorkeur
                      </Badge>
                    )}
                    {!leverancier.isActive && (
                      <Badge tone="rest" className="ml-2">
                        inactief
                      </Badge>
                    )}
                    <span className="ml-2 font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                      {leverancier.supplierArticleNumber}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Minimale afname {leverancier.minimumOrderQuantity}
                    {leverancier.leadTimeDays !== null && <> · levertijd {leverancier.leadTimeDays} dagen</>}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {leverancier.tiers.length === 0 ? (
                      <span className="tabular">
                        {Number(leverancier.purchasePrice) === 0 ? (
                          <span className="text-alarm">nog geen prijs</span>
                        ) : (
                          <>vanaf 1: {formatEuro(leverancier.purchasePrice)}</>
                        )}
                      </span>
                    ) : (
                      leverancier.tiers.map((t) => (
                        <span key={t.minQuantity} className="tabular">
                          <span className="text-ink-faint">vanaf {t.minQuantity}:</span>{' '}
                          {formatEuro(t.unitPrice)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-5 rounded border border-rule bg-surface p-5">
        <h2 className="text-sm font-semibold">Varianten</h2>
        {product.variants.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">Dit product heeft nog geen varianten.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left">
                  {['Variantnummer', 'Kleur', 'Code', 'Pantone', 'Maat', 'EAN', 'Status'].map((k) => (
                    <th key={k} className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-4 font-[family-name:var(--font-mono)] text-xs">{v.sku}</td>
                    <td className="py-2 pr-4">
                      {ofStreepje(v.colorName)}
                      {v.colorGroup && v.colorGroup !== v.colorName && (
                        <span className="block text-xs text-ink-faint">{v.colorGroup}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-[family-name:var(--font-mono)] text-xs">
                      {ofStreepje(v.colorCode)}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{ofStreepje(v.pmsColor)}</td>
                    <td className="py-2 pr-4">{ofStreepje(v.size)}</td>
                    <td className="py-2 pr-4 font-[family-name:var(--font-mono)] text-xs text-ink-soft tabular">
                      {ofStreepje(v.eanCode)}
                    </td>
                    <td className="py-2">
                      {v.isActive ? (
                        <Badge tone="ok">leverbaar</Badge>
                      ) : (
                        <Badge tone="rest">niet meer in de bron</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          Een variant die de leverancier niet meer levert gaat op inactief en wordt nooit verwijderd:
          er kunnen orderregels aan hangen.
        </p>
      </section>

      {product.printOptions.length > 0 && (
        <section className="mt-5 rounded border border-rule bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Printer size={14} aria-hidden className="text-ink-faint" />
            Bedrukopties
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left">
                  {['Techniek', 'Positie', 'Max. kleuren', 'Bedrukvlak', 'Instelkosten'].map((k) => (
                    <th key={k} className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.printOptions.map((o) => (
                  <tr key={o.id} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-4">{o.printMethodName}</td>
                    <td className="py-2 pr-4">
                      {o.printPositionName}
                      {o.supplierLabel && o.supplierLabel !== o.printPositionName && (
                        <span className="block text-xs text-ink-faint">
                          leverancier: {o.supplierLabel}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular">{o.maxColors}</td>
                    <td className="py-2 pr-4 text-ink-soft">{ofStreepje(o.printArea)}</td>
                    <td className="py-2 pr-4 tabular">{formatEuro(o.setupCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {product.description && (
        <section className="mt-5 rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Omschrijving</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{product.description}</p>
        </section>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        Dit product wordt bijgewerkt via de importpijplijn. Handmatig aanmaken en wijzigen komt later;
        tot die tijd verandert er niets aan de catalogus zonder dat iemand een voorstel goedkeurt.
      </p>
    </div>
  )
}
