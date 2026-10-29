import { Injectable, Logger } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import { buildQuoteDocument, formatEuro, type QuoteDocument } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { RequestContext } from '../../core/context/request-context'
import { QuotesService } from './quotes.service'

/**
 * De offerte als PDF.
 *
 * Twee lagen, bewust gescheiden: `buildQuoteDocument` in `@rgh/contracts`
 * bepaalt wát er staat - teksten uit de sjablonen, bedragen, volgorde - en
 * deze service tekent dat. Zo is "staat de juiste prijs erop" een test en
 * geen kwestie van kijken.
 *
 * De PDF wordt op aanvraag gemaakt en niet opgeslagen. Opslaan hoort bij
 * verzenden: dan wordt de versie vastgezet en komt de controlewaarde van het
 * document erbij (ADR-0007). Daar is de opslagadapter voor nodig, en de
 * workflow-engine om de status te mogen zetten.
 */

const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 56
const INHOUD = A4.breedte - MARGE * 2

@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly quotes: QuotesService,
  ) {}

  async render(quoteId: string): Promise<{ bestandsnaam: string; inhoud: Buffer }> {
    const offerte = await this.quotes.byId(quoteId)
    const bedrijf = await this.settings.company()

    const [sjablonen, klant, gebruiker] = await Promise.all([
      this.prisma.db.documentTemplate.findMany({
        where: { kind: { in: ['QUOTE_INTRO', 'QUOTE_LINE', 'QUOTE_TERMS'] }, isActive: true },
      }),
      this.prisma.db.customer.findUnique({
        where: { id: offerte.customerId },
        select: { number: true, paymentTerm: { select: { name: true } } },
      }),
      this.huidigeGebruiker(),
    ])

    const tekst = (soort: string) => sjablonen.find((s) => s.kind === soort)?.body ?? null

    const document = buildQuoteDocument({
      quote: offerte,
      company: bedrijf,
      templates: {
        intro: tekst('QUOTE_INTRO'),
        line: tekst('QUOTE_LINE'),
        terms: tekst('QUOTE_TERMS'),
      },
      user: gebruiker,
      customerNumber: klant?.number ?? null,
      paymentTerm: klant?.paymentTerm?.name ?? null,
    })

    return {
      bestandsnaam: `${offerte.number}.pdf`,
      inhoud: await this.teken(document, bedrijf.accentColor, bedrijf.logoLight),
    }
  }

  private async huidigeGebruiker(): Promise<{ name: string; email: string }> {
    const id = RequestContext.get()?.userId
    if (!id) return { name: '', email: '' }
    const gebruiker = await this.prisma.db.user.findUnique({
      where: { id },
      select: { name: true, email: true },
    })
    return { name: gebruiker?.name ?? '', email: gebruiker?.email ?? '' }
  }

  /**
   * Het logo van schijf.
   *
   * Het pad staat als instelling en wijst naar de openbare map van het
   * dashboard. Dat werkt zolang beide op dezelfde machine draaien; zodra er
   * een opslagadapter is hoort het daar vandaan te komen. Lukt het niet, dan
   * blijft het logo weg en staat de bedrijfsnaam er - een offerte zonder
   * logo is bruikbaar, een offerte die niet gemaakt wordt niet.
   */
  private logo(pad: string): Buffer | null {
    if (!pad || pad.startsWith('http')) return null
    const wortel = process.env.BRAND_ASSETS_DIR ?? resolve(process.cwd(), '../web/public')
    try {
      return readFileSync(join(wortel, pad.replace(/^\//, '')))
    } catch {
      this.logger.warn(`Logo ${pad} niet gevonden onder ${wortel}; de offerte krijgt alleen tekst.`)
      return null
    }
  }

  private teken(doc: QuoteDocument, accent: string, logoPad: string): Promise<Buffer> {
    const pdf = new PDFDocument({ size: 'A4', margin: MARGE, bufferPages: true })
    const delen: Buffer[] = []
    pdf.on('data', (d: Buffer) => delen.push(d))
    const klaar = new Promise<Buffer>((gereed) => {
      pdf.on('end', () => gereed(Buffer.concat(delen)))
    })

    pdf.info.Title = `Offerte ${doc.quoteNumber}`

    const logo = this.logo(logoPad)
    if (logo) {
      try {
        pdf.image(logo, MARGE, 40, { height: 34 })
      } catch {
        this.logger.warn('Het logo kon niet in de PDF geplaatst worden.')
      }
    }

    // De accentband bovenaan: de huisstijlkleur uit de instellingen, niet een
    // kleur in de code.
    pdf.rect(0, 0, A4.breedte, 6).fill(accent)
    pdf.fillColor('#171a18')

    pdf.font('Helvetica-Bold').fontSize(18).text('Offerte', MARGE, 92)
    pdf.font('Helvetica').fontSize(9).fillColor('#4d5752')

    // Kopgegevens rechts, adres links.
    const kop = [
      ['Offertenummer', doc.quoteNumber],
      ['Datum', doc.date],
      ['Geldig tot', doc.validUntil],
      ...(doc.reference ? [['Uw referentie', doc.reference]] : []),
    ]
    let y = 92
    for (const [label, waarde] of kop) {
      pdf.fillColor('#7c8781').text(label, MARGE + INHOUD - 240, y, { width: 110 })
      pdf.fillColor('#171a18').text(waarde, MARGE + INHOUD - 125, y, { width: 125, align: 'right' })
      y += 14
    }

    pdf.fillColor('#171a18').fontSize(10)
    let links = 126
    for (const regel of doc.addressee) {
      pdf.text(regel, MARGE, links, { width: 260 })
      links += 14
    }

    let cursor = Math.max(y, links) + 24
    if (doc.intro) {
      pdf.fontSize(9.5).fillColor('#171a18').text(doc.intro, MARGE, cursor, { width: INHOUD })
      cursor = pdf.y + 20
    }

    cursor = this.tekenRegels(pdf, doc, cursor, accent)

    if (doc.terms) {
      if (cursor > A4.hoogte - 220) {
        pdf.addPage()
        cursor = MARGE
      }
      pdf.fontSize(8.5).fillColor('#4d5752').text(doc.terms, MARGE, cursor + 16, { width: INHOUD })
    }

    this.tekenVoet(pdf, doc, accent)
    pdf.end()
    return klaar
  }

  private tekenRegels(
    pdf: PDFKit.PDFDocument,
    doc: QuoteDocument,
    begin: number,
    accent: string,
  ): number {
    const kolommen = [
      { x: MARGE, breedte: 250, uit: 'left' as const },
      { x: MARGE + 258, breedte: 48, uit: 'right' as const },
      { x: MARGE + 312, breedte: 70, uit: 'right' as const },
      { x: MARGE + 388, breedte: 95, uit: 'right' as const },
    ]

    let y = begin
    pdf.fontSize(8).fillColor('#7c8781')
    const koppen = ['Omschrijving', 'Aantal', 'Per stuk', 'Totaal']
    koppen.forEach((k, i) =>
      pdf.text(k.toUpperCase(), kolommen[i].x, y, {
        width: kolommen[i].breedte,
        align: kolommen[i].uit,
      }),
    )
    y += 14
    pdf.moveTo(MARGE, y).lineTo(MARGE + INHOUD, y).strokeColor('#dde1db').lineWidth(0.5).stroke()
    y += 10

    for (const regel of doc.lines) {
      // Past de regel nog op deze bladzijde? De voettekst heeft ruimte nodig.
      const hoogte = regel.description.length * 11 + 14
      if (y + hoogte > A4.hoogte - 150) {
        pdf.addPage()
        y = MARGE + 20
      }

      pdf.fontSize(9).fillColor('#171a18')
      let regelY = y
      regel.description.forEach((tekst, i) => {
        pdf.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(i === 0 ? 9 : 8.5)
        pdf.fillColor(i === 0 ? '#171a18' : '#4d5752')
        pdf.text(tekst, kolommen[0].x, regelY, { width: kolommen[0].breedte })
        regelY = pdf.y
      })

      pdf.font('Helvetica').fontSize(9).fillColor('#171a18')
      pdf.text(String(regel.quantity), kolommen[1].x, y, {
        width: kolommen[1].breedte, align: 'right',
      })
      pdf.text(formatEuro(regel.unitPrice), kolommen[2].x, y, {
        width: kolommen[2].breedte, align: 'right',
      })
      pdf.text(formatEuro(regel.lineTotal), kolommen[3].x, y, {
        width: kolommen[3].breedte, align: 'right',
      })

      if (Number(regel.setupCost) > 0) {
        pdf.fontSize(8).fillColor('#7c8781')
        pdf.text(`waarvan instelkosten ${formatEuro(regel.setupCost)}`, kolommen[2].x, y + 12, {
          width: kolommen[2].breedte + kolommen[3].breedte + 6, align: 'right',
        })
      }

      y = Math.max(regelY, y + 14) + 10
      pdf.moveTo(MARGE, y - 5).lineTo(MARGE + INHOUD, y - 5)
        .strokeColor('#eceee9').lineWidth(0.5).stroke()
    }

    // Totalen rechts onder de tabel.
    const totalen: [string, string, boolean][] = [
      ['Subtotaal', doc.subtotalExclVat, false],
      ['Btw', doc.vatAmount, false],
      ['Totaal inclusief btw', doc.totalInclVat, true],
    ]
    y += 6
    for (const [label, bedrag, dik] of totalen) {
      pdf.font(dik ? 'Helvetica-Bold' : 'Helvetica').fontSize(dik ? 10 : 9)
      pdf.fillColor(dik ? '#171a18' : '#4d5752')
      pdf.text(label, kolommen[2].x - 60, y, { width: kolommen[2].breedte + 60, align: 'right' })
      pdf.fillColor('#171a18')
      pdf.text(formatEuro(bedrag), kolommen[3].x, y, {
        width: kolommen[3].breedte, align: 'right',
      })
      if (dik) {
        pdf.moveTo(kolommen[2].x - 60, y - 5).lineTo(MARGE + INHOUD, y - 5)
          .strokeColor(accent).lineWidth(1).stroke()
      }
      y += 16
    }

    pdf.font('Helvetica')
    return y
  }

  /** De bedrijfsgegevens onderaan elke bladzijde, in drie kolommen. */
  private tekenVoet(pdf: PDFKit.PDFDocument, doc: QuoteDocument, accent: string) {
    const bereik = pdf.bufferedPageRange()
    for (let i = bereik.start; i < bereik.start + bereik.count; i++) {
      pdf.switchToPage(i)
      // De ondermarge tijdelijk opheffen. pdfkit begint een nieuwe bladzijde
      // zodra tekst eronder komt, ook met lineBreak uit - en dan krijg je een
      // offerte van zeven pagina's waarvan zes leeg, met op elke lege
      // bladzijde weer een voettekst die er weer een maakt.
      pdf.page.margins.bottom = 0
      const y = A4.hoogte - 78

      pdf.moveTo(MARGE, y).lineTo(MARGE + INHOUD, y)
        .strokeColor(accent).lineWidth(0.8).stroke()

      // Regel voor regel op een vaste plek, met lineBreak uit. Laat je pdfkit
      // zelf afbreken, dan loopt de voettekst over de ondermarge heen en maakt
      // hij er een nieuwe bladzijde van - en dan staat er ineens een offerte
      // van vier pagina's met drie lege.
      pdf.font('Helvetica').fontSize(7.5).fillColor('#7c8781')
      doc.footer.forEach((kolom, k) => {
        kolom.forEach((regel, r) => {
          pdf.text(regel, MARGE + (INHOUD / 3) * k, y + 8 + r * 10, {
            width: INHOUD / 3 - 10,
            lineBreak: false,
          })
        })
      })

      if (bereik.count > 1) {
        pdf.text(`${i - bereik.start + 1} / ${bereik.count}`, MARGE, y - 12, {
          width: INHOUD, align: 'right', lineBreak: false,
        })
      }
    }
  }
}
