-- ============================================================
-- Seed data for Dossier tenant (ControlC)
-- Company ID: d2b1b417-7748-43e3-828b-678f572f488b
-- ============================================================

DO $$
DECLARE
  cid UUID := 'd2b1b417-7748-43e3-828b-678f572f488b';
  key_annee UUID;
  key_mois  UUID;
  key_type  UUID;
  person_names TEXT[];
  pname TEXT;
  folder_id UUID;
  person_id UUID;
BEGIN

-- ─── 1. METADATA KEYS ────────────────────────────────────────
-- Delete existing to avoid duplicates on re-run
DELETE FROM public.files_metadata_keys WHERE company_id = cid;

INSERT INTO public.files_metadata_keys (id, name, value_kind, allowed_values, company_id, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Année',  'free_text',       '[]'::jsonb, cid, now(), now()),
  (gen_random_uuid(), 'Mois',   'predefined_list',
    '["01","02","03","04","05","06","07","08","09","10","11","12"]'::jsonb, cid, now(), now()),
  (gen_random_uuid(), 'Type',   'predefined_list',
    '["Facture","Contrat","Attestation","Déclaration","Formulaire","Acte notarié","Déclaration de succession","Demande de renseignements","Informations","Extrait bancaire","Autre"]'::jsonb,
    cid, now(), now())
RETURNING id INTO key_annee; -- only captures last; we query below

SELECT id INTO key_annee FROM public.files_metadata_keys WHERE company_id = cid AND name = 'Année';
SELECT id INTO key_mois  FROM public.files_metadata_keys WHERE company_id = cid AND name = 'Mois';
SELECT id INTO key_type  FROM public.files_metadata_keys WHERE company_id = cid AND name = 'Type';

-- ─── 2. DOCUMENT TYPES (split presets) ───────────────────────
DELETE FROM public.document_split_presets WHERE company_id = cid;

INSERT INTO public.document_split_presets (id, name, company_id, metadata_key_ids, naming_instructions, created_at, updated_at)
SELECT
  gen_random_uuid(),
  dtype,
  cid,
  jsonb_build_array(key_annee::text, key_mois::text, key_type::text),
  'Name: [Personne]_[Année]_[Mois]_[Jour]_[Type]_[Description courte]',
  now(),
  now()
FROM unnest(ARRAY[
  'Facture',
  'Contrat',
  'Attestation',
  'Déclaration',
  'Formulaire',
  'Acte notarié',
  'Déclaration de succession',
  'Demande de renseignements',
  'Informations',
  'Extrait bancaire',
  'Autre'
]) AS dtype;

-- ─── 3. PERSONS + ROOT FOLDERS ───────────────────────────────
-- Remove Person Test placeholder
DELETE FROM public.persons WHERE company_id = cid AND full_name = 'Person Test';

person_names := ARRAY[
  'NON TROUVE',
  'BOVY Patrice',
  'BELLOT Michelle',
  'DELHEZ Françoise',
  'WILISQUI Patricia',
  'PONSARD Jean-Marie',
  'COLLIGNON aurélie',
  'PONCIN Rose-Marie',
  'SLOSSE Josette',
  'VAN MULDERS Louise',
  'WILMART Alex',
  'FANUEL Lisa',
  'PEYFFERS Tony',
  'MERGEAY Ludovic',
  'SELLIERE Yvonne',
  'DENIS Jacqueline',
  'WILLIEME Rita',
  'RONOWITZ David',
  'MALAISE Daniel',
  'DE CORTE Jeroen',
  'CAPELLE Carole',
  'GIERES Romaine',
  'DUMONT Martine',
  'MOSSAY Alain',
  'MEINGUET Martine',
  'VANDAMME Jean-Marie',
  'JACQMART Johnny',
  'DELEMENNE Noémie',
  'MICHAUX Michel',
  'LEBEAU Pia',
  'DESSAUCY Alain',
  'DOMINIQUE Christine',
  'CLARO Michel',
  'CORNELIS Florian',
  'GALOY Martine',
  'MONTULET Christophe',
  'LINCE Virginie',
  'SERMENT Patrick',
  'PETRY Karin',
  'GALDEROUX Alexandre',
  'CHENAL Aurélien',
  'DUVAL Denise',
  'MENENDEZ ARIAS Nemesia',
  'MORAN MENENDEZ Margarita',
  'DAUNE Laurent',
  'PIRLOT Marie',
  'PONCIN Mireille',
  'VASTARELLA',
  'BAERT JOELLE',
  'SEVRIN Anne',
  'COLLIGNON Nancy',
  'MATON Didier',
  'LAMBINON Laure',
  'MICHEL Jordan',
  'ALLARD Bernard',
  'LEFORT Alain',
  'MOMIN Josette',
  'MALENGREAUX Danielle',
  'GAFRI Angel',
  'BOUKILI Fatima',
  'PIRON Louis',
  'RARY André',
  'HENIN Guy',
  'DE POOTTER Pierre',
  'DEVOUGE Maurine',
  'DOCQUIER Maria',
  'VANHERF Marc',
  'CLARO Aurore',
  'MELCHIOR Tim',
  'LIZIN Camille',
  'GEYSKENS Maria',
  'EVRARD Geneviève',
  'LAURENT Olivia',
  'MOREAU Willy',
  'HERINCKX Roger',
  'VANTUEL Monique',
  'GROSSKOPH Vittorio',
  'DESSY Jean',
  'GRAAS Jean-Marie',
  'OOSTERLINCK Mickael',
  'IPPERSIEL Rayan',
  'DELCROIX Noel',
  'GRANDHENRY',
  'STRENS Martine',
  'CONROD Pol',
  'VERGAELEN Janine',
  'RASQUIN Nelly',
  'WARNANT Myriam',
  'BEURLET Julien',
  'LEDOUX Marie-Anne',
  'LAMBRECHTS Nicole',
  'MARCKX Liliane',
  'ROUELLE Fabian',
  'BLEYS Jean-Claude',
  'XHIGNESSE Jean-François',
  'XHIGNESSE Michaël',
  'VERHULST Josette',
  'ROSIERE Frédérique',
  'OSTYN Yolande',
  'BONHIVERS Stephan',
  'PILETTE Michel',
  'LAMBERT Yonny',
  'HORION Guillaume',
  'SALARNIER Maria',
  'REULAND Chantal',
  'DEMOLIN Ludovic',
  'BASTIN Jeannine',
  'SEBILLE Georgette',
  'NICOLAS Ghislaine',
  'PONSARD Julien',
  'Berthier Georgette',
  'PIRGHAYE Ayrton',
  'Bernard LOUIS',
  'ROOSENS Jules',
  'LAFFINEUSE Eric',
  'FASTRE Marina',
  'PETITJEAN Eloi',
  'MATHIEU Irma',
  'DECLERCK Thierry',
  'ANTHOON Dominique',
  'BOLLE Muriel',
  'LINCZ Guillaume',
  'LIBAN FERNARD',
  'GREGOIRE MC',
  'GOVAERT Joackim',
  'FROIDBISE Marie',
  'BOURGUIGNON Annie',
  'GERARD Freddy',
  'DELACOLETTE Cécile',
  'BARTHELEMY Christiane',
  'NAESSENS Jean',
  'IPPERSIEL Brandon',
  'MARTIN Laurence',
  'VAN DAELE Rosana',
  'CALE Fabienne',
  'DEVILLE Karine',
  'MELLEKER Pierre',
  'LINOTTE Maddy',
  'SCHRIEBER Nino',
  'FAVRESSE NELLY',
  'VERVAEREN Léon',
  'HODVAN Dzhessika-Anna',
  'PERA Stéphanie',
  'LAMBOTTE Monique'
];

FOREACH pname IN ARRAY person_names LOOP
  -- Skip if already exists
  IF EXISTS (SELECT 1 FROM public.persons WHERE company_id = cid AND full_name = pname) THEN
    CONTINUE;
  END IF;

  -- Create root folder
  folder_id := gen_random_uuid();
  INSERT INTO public.folders (id, name, company_id, parent_folder_id, created_at, updated_at)
  VALUES (folder_id, pname, cid, NULL, now(), now());

  -- Create person
  person_id := gen_random_uuid();
  INSERT INTO public.persons (id, full_name, company_id, root_folder_id, created_at, updated_at)
  VALUES (person_id, pname, cid, folder_id, now(), now());
END LOOP;

RAISE NOTICE 'Seed complete: % metadata keys, % doc types, % persons',
  (SELECT COUNT(*) FROM public.files_metadata_keys WHERE company_id = cid),
  (SELECT COUNT(*) FROM public.document_split_presets WHERE company_id = cid),
  (SELECT COUNT(*) FROM public.persons WHERE company_id = cid);

END $$;
