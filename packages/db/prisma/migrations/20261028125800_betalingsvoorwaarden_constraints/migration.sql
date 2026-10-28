-- Wat de Prisma-schemataal niet kan uitdrukken, maar de database wel moet
-- afdwingen. Vergelijk ADR-0007: een invariant hoort in de database, niet in
-- de discipline van de aanroeper.

-- Hoogstens een standaard betalingsvoorwaarde. Een partiele unieke index is
-- hier het juiste gereedschap: meerdere rijen met false mogen, maar true
-- hoogstens een keer.
CREATE UNIQUE INDEX "payment_terms_een_standaard"
  ON "payment_terms" ("isDefault")
  WHERE "isDefault";

ALTER TABLE "payment_terms"
  ADD CONSTRAINT "payment_terms_dagen_niet_negatief"
    CHECK ("days" >= 0),
  ADD CONSTRAINT "payment_terms_vooruitbetaling_percentage"
    CHECK ("prepaymentPercent" IS NULL
           OR ("prepaymentPercent" >= 0 AND "prepaymentPercent" <= 100));

ALTER TABLE "customer_price_agreements"
  ADD CONSTRAINT "customer_price_agreements_aantal_positief"
    CHECK ("minQuantity" >= 1),
  ADD CONSTRAINT "customer_price_agreements_prijs_niet_negatief"
    CHECK ("unitPrice" >= 0),
  -- Een geldigheidsvenster dat eindigt voordat het begint is geen afspraak
  -- maar een typefout.
  ADD CONSTRAINT "customer_price_agreements_geldigheid"
    CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom");
