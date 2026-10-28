import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { ImportRunSummary, StagedChangeView } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { WijzigingBeoordelen } from '@/components/wijziging-beoordelen'
import { getCurrentUser, mag } from '@/lib/session'

export default async function ImportPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!mag(user, 'imports:view')) redirect('/')

  let run: ImportRunSummary
  let wijzigingen: StagedChangeView[]
  try {
    ;[run, wijzigingen] = await Promise.all([
      apiGet<ImportRunSummary>(`/api/imports/runs/${id}`),
      apiGet<StagedChangeView[]>(`/api/imports/runs/${id}/changes`),
    ])
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const open = wijzigingen.filter((w) => w.status === 'PENDING').length

  return (
    <div className="max-w-4xl">
      <Link href="/imports" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Imports
      </Link>

      <div className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {run.supplierName} · {run.capability}
          </h1>
          {run.dryRun && <Badge tone="rest">proefimport</Badge>}
          <Badge tone={run.status === 'SUCCESS' ? 'ok' : run.status === 'FAILED' ? 'alarm' : 'wait'}>
            {run.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-faint">
          {new Date(run.startedAt).toLocaleString('nl-NL')} · {run.itemsSeen} artikelen bekeken
          {run.summary && (
            <>
              {' '}· {run.summary.created} nieuw, {run.summary.updated} gewijzigd,{' '}
              {run.summary.unchanged} ongewijzigd, {run.summary.missing} verdwenen
            </>
          )}
        </p>
        {run.errorSummary && (
          <p className="mt-2 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
            {run.errorSummary}
          </p>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold">
        Voorgestelde wijzigingen
        {open > 0 && <span className="ml-2 font-normal text-ink-faint">{open} nog te beoordelen</span>}
      </h2>

      <WijzigingBeoordelen
        wijzigingen={wijzigingen}
        importRunId={run.id}
        toepasbaar={!run.dryRun}
        magBeoordelen={mag(user, 'imports:update')}
      />
    </div>
  )
}
