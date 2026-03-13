-- Migration: Auto-generate API key when a new company is inserted directly via SQL.
-- This is a safety net for direct DB inserts; the application layer (Prisma middleware)
-- also handles API key generation and role seeding for companies created via the API.

CREATE OR REPLACE FUNCTION public.generate_company_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only generate if api_key was not explicitly provided
  IF NEW.api_key IS NULL THEN
    NEW.api_key := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_insert_generate_api_key ON public.companies;

CREATE TRIGGER on_company_insert_generate_api_key
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_company_api_key();
