const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually parse .env from project directory
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {}

const databaseUrl = process.env.DATABASE_URL;
const isRemote = databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
const client = new Client({
  connectionString: databaseUrl,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT * FROM projects LIMIT 1");
  if (res.rows.length > 0) {
    console.log("Projects Columns:", Object.keys(res.rows[0]));
    console.log("Sample project:", res.rows[0]);
  } else {
    console.log("No projects found in database.");
  }
  await client.end();
}
main().catch(console.error);
