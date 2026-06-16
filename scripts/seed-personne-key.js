/**
 * One-time script: creates (or updates) the "Personne" FilesMetadataKey
 * for every company that has Person records, with allowed_values = sorted person names.
 *
 * Usage:  node scripts/seed-personne-key.js
 */
// pg is not in the workspace root; use the temporary install used for other seed scripts
let Client;
try {
  ({ Client } = require('pg'));
} catch {
  ({ Client } = require('C:/Temp/pg-temp/node_modules/pg'));
}
const path = require('path');

// Load .env from repo root
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dossier_app_db';

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected to DB');

  // Find all companies that have persons
  const { rows: companies } = await client.query(`
    SELECT DISTINCT company_id FROM public.persons
  `);

  console.log(`Found ${companies.length} company(ies) with persons`);

  for (const { company_id } of companies) {
    // Get sorted person names
    const { rows: persons } = await client.query(
      `SELECT full_name FROM public.persons WHERE company_id = $1 ORDER BY full_name ASC`,
      [company_id],
    );
    const names = persons.map((p) => p.full_name);
    const allowedValues = JSON.stringify(names);

    // Upsert the metadata key
    const { rows: existing } = await client.query(
      `SELECT id FROM public.files_metadata_keys WHERE company_id = $1 AND name = 'Personne'`,
      [company_id],
    );

    if (existing.length > 0) {
      await client.query(
        `UPDATE public.files_metadata_keys SET allowed_values = $1::jsonb, updated_at = now() WHERE id = $2`,
        [allowedValues, existing[0].id],
      );
      console.log(`  Updated "Personne" key for company ${company_id} with ${names.length} names`);
    } else {
      await client.query(
        `INSERT INTO public.files_metadata_keys (company_id, name, value_kind, allowed_values)
         VALUES ($1, 'Personne', 'predefined_list', $2::jsonb)`,
        [company_id, allowedValues],
      );
      console.log(`  Created "Personne" key for company ${company_id} with ${names.length} names`);
    }
  }

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
