-- De triggers uit de vorige migratie gebruikten ERRCODE 'restrict_violation'
-- (SQLSTATE 23001). Prisma vertaalt die code naar "Foreign key constraint
-- violated" en gooit de eigenlijke melding weg. Zonder expliciete ERRCODE
-- gebruikt plpgsql P0001 en komt de tekst wel bij de aanroeper terecht - wat
-- nodig is omdat die melding uitlegt waarom de wijziging geweigerd is.
--
-- Alleen de functies worden vervangen; de triggers blijven ongewijzigd.

CREATE OR REPLACE FUNCTION rgh_quote_version_immutable() RETURNS trigger AS $$
BEGIN
  IF rgh_quotes_unlocked() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF OLD."lockedAt" IS NOT NULL THEN
    RAISE EXCEPTION
      'Offerteversie % is vastgezet op % en kan niet worden %s (ADR-0007).',
      OLD.id, OLD."lockedAt",
      CASE WHEN TG_OP = 'DELETE' THEN 'verwijderd' ELSE 'gewijzigd' END;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rgh_quote_item_immutable() RETURNS trigger AS $$
DECLARE
  v_version_id uuid;
  v_locked     timestamp(3);
BEGIN
  IF rgh_quotes_unlocked() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_version_id := CASE WHEN TG_OP = 'DELETE'
                       THEN OLD."quoteVersionId"
                       ELSE NEW."quoteVersionId" END;

  SELECT "lockedAt" INTO v_locked FROM "quote_versions" WHERE id = v_version_id;

  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION
      'Offerteversie % is vastgezet; offerteregels kunnen niet meer worden gewijzigd (ADR-0007).',
      v_version_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rgh_quote_item_print_job_immutable() RETURNS trigger AS $$
DECLARE
  v_item_id uuid;
  v_locked  timestamp(3);
BEGIN
  IF rgh_quotes_unlocked() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."quoteItemId" ELSE NEW."quoteItemId" END;

  SELECT qv."lockedAt" INTO v_locked
    FROM "quote_items" qi
    JOIN "quote_versions" qv ON qv.id = qi."quoteVersionId"
   WHERE qi.id = v_item_id;

  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION
      'De offerteversie van regel % is vastgezet; bedrukkingen kunnen niet meer worden gewijzigd (ADR-0007).',
      v_item_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rgh_quote_approval_append_only() RETURNS trigger AS $$
BEGIN
  IF rgh_quotes_unlocked() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Een offertebeslissing is append-only en kan niet worden %s (ADR-0007).',
    CASE WHEN TG_OP = 'DELETE' THEN 'verwijderd' ELSE 'gewijzigd' END;
END;
$$ LANGUAGE plpgsql;
