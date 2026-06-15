#!/usr/bin/env node
// Usage inside container: node scripts/reset-password.js <email> <password>
const bcrypt = require('/usr/src/app/backend/node_modules/bcryptjs');
const { Client } = require('/usr/src/app/backend/node_modules/@prisma/client/../../pg') || require('pg');

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node reset-password.js <email> <password>');
  process.exit(1);
}

(async () => {
  const hash = bcrypt.hashSync(password, 10);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(
    `UPDATE auth.users SET encrypted_password = $1 WHERE email = $2 RETURNING id, email`,
    [hash, email],
  );
  if (res.rowCount === 0) {
    console.error('User not found:', email);
    process.exit(1);
  }
  console.log('Password updated for:', res.rows[0].email);
  await client.end();
})().catch(err => { console.error(err.message); process.exit(1); });
