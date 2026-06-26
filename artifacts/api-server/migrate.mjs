import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let Pool;
const pgPaths = [
  path.join(__dirname, "../../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js"),
  path.join(__dirname, "node_modules/pg/lib/index.js"),
];
for (const p of pgPaths) {
  try { ({ Pool } = require(p)); break; } catch { }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Update upload_jobs table
  await pool.query(`
    ALTER TABLE upload_jobs
    ADD COLUMN IF NOT EXISTS local_clip_path TEXT,
    ADD COLUMN IF NOT EXISTS ai_description TEXT,
    ADD COLUMN IF NOT EXISTS ai_tags TEXT,
    ADD COLUMN IF NOT EXISTS ai_location TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE
  `);
  console.log("✅ Migration done — upload_jobs columns updated");

  // Update platform_credentials table
  await pool.query(`
    ALTER TABLE platform_credentials
    ADD COLUMN IF NOT EXISTS login_username TEXT,
    ADD COLUMN IF NOT EXISTS login_password TEXT
  `);
  console.log("✅ Migration done — platform_credentials columns updated");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
} finally {
  await pool.end();
}
