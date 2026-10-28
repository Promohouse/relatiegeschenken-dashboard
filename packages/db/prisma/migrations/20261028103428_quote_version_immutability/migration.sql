-- ADR-0007: een vastgezette offerteversie is onveranderlijk.
--
-- Dit wordt in de database afgedwongen en niet in de applicatie. Een
-- digitaal klantakkoord moet aantoonbaar aan een exacte versie vastliggen;
-- dan is "de service doet het netjes" niet genoeg.
--
-- ONTSNAPPINGSLUIK
-- Beheerhandelingen (demodata opruimen, testopruiming, een gecontroleerde
-- correctie) zetten binnen hun transactie:
--     SET LOCAL "rgh.unlock_quotes" = 'on';
-- Dat is bewust omslachtig en zichtbaar: het kan niet per ongeluk gebeuren.

CREATE OR REPLACE FUNCTION rgh_quotes_unlocked() RETURNS boolean AS $$
BEGIN
  RETURN coalesce(current_setting('rgh.unlock_quotes', true), 'off') = 'on';
END;
$$ LANGUAGE plpgsql STABLE;

-- --- quote_versions: niets meer wijzigen zodra lockedAt gevuld is ----------
-- De overgang naar vastgezet is wel toegestaan: dan is OLD."lockedAt" nog leeg.

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
      CASE WHEN TG_OP = 'DELETE' THEN 'verwijderd' ELSE 'gewijzigd' END
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_versions_immutable
  BEFORE UPDATE OR DELETE ON "quote_versions"
  FOR EACH ROW EXECUTE FUNCTION rgh_quote_version_immutable();

-- --- quote_items: ook niet toevoegen aan een vastgezette versie ------------

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
      v_version_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "quote_items"
  FOR EACH ROW EXECUTE FUNCTION rgh_quote_item_immutable();

-- --- quote_item_print_jobs: via de regel naar de versie --------------------

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
      v_item_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_item_print_jobs_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "quote_item_print_jobs"
  FOR EACH ROW EXECUTE FUNCTION rgh_quote_item_print_job_immutable();

-- --- quote_approvals: append-only ------------------------------------------
-- Een klantbeslissing wordt nooit gewijzigd of verwijderd. Een andere
-- beslissing is een nieuwe rij.

CREATE OR REPLACE FUNCTION rgh_quote_approval_append_only() RETURNS trigger AS $$
BEGIN
  IF rgh_quotes_unlocked() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Een offertebeslissing is append-only en kan niet worden %s (ADR-0007).',
    CASE WHEN TG_OP = 'DELETE' THEN 'verwijderd' ELSE 'gewijzigd' END
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_approvals_append_only
  BEFORE UPDATE OR DELETE ON "quote_approvals"
  FOR EACH ROW EXECUTE FUNCTION rgh_quote_approval_append_only();
