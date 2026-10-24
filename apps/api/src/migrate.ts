import { config } from 'dotenv';
import { fileURLToPath as envFileURLToPath } from 'node:url';
config({path:envFileURLToPath(new URL('../../../.env',import.meta.url))});
import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const sql=postgres(process.env.DATABASE_URL ?? 'postgres://portal:portal@localhost:5432/portal',{max:1});
const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
    await sql.begin(async tx=>{
      await tx`SELECT pg_advisory_xact_lock(912345)`;
      const done=await tx`SELECT 1 FROM schema_migrations WHERE name=${name}`;
      if(done.length) return;
      await tx.unsafe(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
      await tx`INSERT INTO schema_migrations(name) VALUES(${name})`;
      console.log('Applied',name);
    });
  }
} finally {await sql.end();}
