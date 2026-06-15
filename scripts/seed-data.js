const { Client } = require('C:/Temp/pg-temp/node_modules/pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lawyer_app_db',
  user: 'postgres',
  password: 'postgres',
});

const COMPANY_ID = 'd2b1b417-7748-43e3-828b-678f572f488b';

const DOC_TYPES = [
  'Facture', 'Contrat', 'Attestation', 'Déclaration', 'Formulaire',
  'Acte notarié', 'Déclaration de succession', 'Demande de renseignements',
  'Informations', 'Extrait bancaire', 'Autre'
];

const PERSONS = [
  'NON TROUVE','BOVY Patrice','BELLOT Michelle','DELHEZ Françoise','WILISQUI Patricia',
  'PONSARD Jean-Marie','COLLIGNON aurélie','PONCIN Rose-Marie','SLOSSE Josette',
  'VAN MULDERS Louise','WILMART Alex','FANUEL Lisa','PEYFFERS Tony','MERGEAY Ludovic',
  'SELLIERE Yvonne','DENIS Jacqueline','WILLIEME Rita','RONOWITZ David','MALAISE Daniel',
  'DE CORTE Jeroen','CAPELLE Carole','GIERES Romaine','DUMONT Martine','MOSSAY Alain',
  'MEINGUET Martine','VANDAMME Jean-Marie','JACQMART Johnny','DELEMENNE Noémie',
  'MICHAUX Michel','LEBEAU Pia','DESSAUCY Alain','DOMINIQUE Christine','CLARO Michel',
  'CORNELIS Florian','GALOY Martine','MONTULET Christophe','LINCE Virginie',
  'SERMENT Patrick','PETRY Karin','GALDEROUX Alexandre','CHENAL Aurélien','DUVAL Denise',
  'MENENDEZ ARIAS Nemesia','MORAN MENENDEZ Margarita','DAUNE Laurent','PIRLOT Marie',
  'PONCIN Mireille','VASTARELLA','BAERT JOELLE','SEVRIN Anne','COLLIGNON Nancy',
  'MATON Didier','LAMBINON Laure','MICHEL Jordan','ALLARD Bernard','LEFORT Alain',
  'MOMIN Josette','MALENGREAUX Danielle','GAFRI Angel','BOUKILI Fatima','PIRON Louis',
  'RARY André','HENIN Guy','DE POOTTER Pierre','DEVOUGE Maurine','DOCQUIER Maria',
  'VANHERF Marc','CLARO Aurore','MELCHIOR Tim','LIZIN Camille','GEYSKENS Maria',
  'EVRARD Geneviève','LAURENT Olivia','MOREAU Willy','HERINCKX Roger','VANTUEL Monique',
  'GROSSKOPH Vittorio','DESSY Jean','GRAAS Jean-Marie','OOSTERLINCK Mickael',
  'IPPERSIEL Rayan','DELCROIX Noel','GRANDHENRY','STRENS Martine','CONROD Pol',
  'VERGAELEN Janine','RASQUIN Nelly','WARNANT Myriam','BEURLET Julien','LEDOUX Marie-Anne',
  'LAMBRECHTS Nicole','MARCKX Liliane','ROUELLE Fabian','BLEYS Jean-Claude',
  'XHIGNESSE Jean-François','XHIGNESSE Michaël','VERHULST Josette','ROSIERE Frédérique',
  'OSTYN Yolande','BONHIVERS Stephan','PILETTE Michel','LAMBERT Yonny','HORION Guillaume',
  'SALARNIER Maria','REULAND Chantal','DEMOLIN Ludovic','BASTIN Jeannine',
  'SEBILLE Georgette','NICOLAS Ghislaine','PONSARD Julien','Berthier Georgette',
  'PIRGHAYE Ayrton','Bernard LOUIS','ROOSENS Jules','LAFFINEUSE Eric','FASTRE Marina',
  'PETITJEAN Eloi','MATHIEU Irma','DECLERCK Thierry','ANTHOON Dominique','BOLLE Muriel',
  'LINCZ Guillaume','LIBAN FERNARD','GREGOIRE MC','GOVAERT Joackim','FROIDBISE Marie',
  'BOURGUIGNON Annie','GERARD Freddy','DELACOLETTE Cécile','BARTHELEMY Christiane',
  'NAESSENS Jean','IPPERSIEL Brandon','MARTIN Laurence','VAN DAELE Rosana','CALE Fabienne',
  'DEVILLE Karine','MELLEKER Pierre','LINOTTE Maddy','SCHRIEBER Nino','FAVRESSE NELLY',
  'VERVAEREN Léon','HODVAN Dzhessika-Anna','PERA Stéphanie','LAMBOTTE Monique'
];

function uuid() {
  return require('crypto').randomUUID();
}

async function run() {
  await client.connect();
  console.log('Connected to DB');

  // ─── Metadata keys ───────────────────────────────────────────
  await client.query('DELETE FROM public.files_metadata_keys WHERE company_id = $1', [COMPANY_ID]);

  const anneeId = uuid();
  const moisId = uuid();
  const typeId = uuid();
  const moisValues = JSON.stringify(['01','02','03','04','05','06','07','08','09','10','11','12']);
  const typeValues = JSON.stringify(DOC_TYPES);

  await client.query(
    `INSERT INTO public.files_metadata_keys (id, name, value_kind, allowed_values, company_id, created_at, updated_at) VALUES
     ($1,'Année','free_text','[]'::jsonb,$4,now(),now()),
     ($2,'Mois','predefined_list',$5::jsonb,$4,now(),now()),
     ($3,'Type','predefined_list',$6::jsonb,$4,now(),now())`,
    [anneeId, moisId, typeId, COMPANY_ID, moisValues, typeValues]
  );
  console.log('✓ 3 metadata keys created (Année, Mois, Type)');

  // ─── Document types (split presets) ─────────────────────────
  await client.query('DELETE FROM public.document_split_presets WHERE company_id = $1', [COMPANY_ID]);

  for (const dtype of DOC_TYPES) {
    await client.query(
      `INSERT INTO public.document_split_presets (id, name, company_id, metadata_key_ids, naming_instructions, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now(), now())`,
      [uuid(), dtype, COMPANY_ID,
       JSON.stringify([anneeId, moisId, typeId]),
       'Nommer: [Personne]_[Année]_[Mois]_[Jour]_[Type]_[Description courte]']
    );
  }
  console.log(`✓ ${DOC_TYPES.length} document types created`);

  // ─── Persons + root folders ─────────────────────────────────
  // Remove test person
  const testPerson = await client.query(
    'SELECT root_folder_id FROM public.persons WHERE company_id = $1 AND full_name = $2',
    [COMPANY_ID, 'Person Test']
  );
  if (testPerson.rows.length > 0 && testPerson.rows[0].root_folder_id) {
    await client.query('DELETE FROM public.folders WHERE id = $1', [testPerson.rows[0].root_folder_id]);
  }
  await client.query('DELETE FROM public.persons WHERE company_id = $1 AND full_name = $2', [COMPANY_ID, 'Person Test']);

  let created = 0;
  let skipped = 0;
  for (const name of PERSONS) {
    const existing = await client.query(
      'SELECT id FROM public.persons WHERE company_id = $1 AND full_name = $2',
      [COMPANY_ID, name]
    );
    if (existing.rows.length > 0) { skipped++; continue; }

    const folderId = uuid();
    await client.query(
      `INSERT INTO public.folders (id, name, company_id, parent_folder_id, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, now(), now())`,
      [folderId, name, COMPANY_ID]
    );
    await client.query(
      `INSERT INTO public.persons (id, full_name, company_id, root_folder_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [uuid(), name, COMPANY_ID, folderId]
    );
    created++;
  }
  console.log(`✓ ${created} persons created, ${skipped} skipped (already existed)`);

  // ─── Summary ────────────────────────────────────────────────
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM public.files_metadata_keys WHERE company_id = $1) AS keys,
      (SELECT COUNT(*) FROM public.document_split_presets WHERE company_id = $1) AS presets,
      (SELECT COUNT(*) FROM public.persons WHERE company_id = $1) AS persons
  `, [COMPANY_ID]);
  const c = counts.rows[0];
  console.log(`\nDB state: ${c.keys} metadata keys | ${c.presets} doc types | ${c.persons} persons`);

  await client.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
