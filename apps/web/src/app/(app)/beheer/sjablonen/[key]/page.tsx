import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { TemplateView } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { SjabloonFormulier } from '@/components/sjabloon-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function SjabloonBewerken({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!mag(await getCurrentUser(), 'settings:update')) redirect('/beheer/sjablonen')

  let sjabloon: TemplateView
  try {
    sjabloon = await apiGet<TemplateView>(`/api/templates/${key}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  return (
    <div className="max-w-5xl">
      <Link href="/beheer/sjablonen" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Tekstsjablonen
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">{sjabloon.name}</h1>
      <SjabloonFormulier sjabloon={sjabloon} />
    </div>
  )
}
