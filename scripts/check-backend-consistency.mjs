import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const typesPath = path.join(root, "src", "integrations", "supabase", "types.ts");
const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
const types = fs.readFileSync(typesPath, "utf8");
const requiredTables = ["materials", "flashcards", "quiz_questions", "pipeline_invocations"];
const missing = requiredTables.filter(
  (table) => !new RegExp(`^      ${table}: \\{`, "m").test(types),
);
if (missing.length)
  throw new Error(`Supabase types are missing required tables: ${missing.join(", ")}`);
if (!migrations.some((name) => name.includes("ai_quality_and_learning_events"))) {
  throw new Error("AI quality migration is missing from supabase/migrations.");
}
for (const file of migrations) {
  const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
  if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:SUPABASE_SERVICE_ROLE_KEY|LOVABLE_API_KEY|YOUTUBE_API_KEY)\s*[:=]\s*['"][^'"]{20,}/.test(sql)) {
    throw new Error(`Secret-like value found in migration ${file}`);
  }
}
console.log(
  `Backend consistency check passed: ${migrations.length} migrations, required types present.`,
);
