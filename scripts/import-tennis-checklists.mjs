import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const slugify = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function loadChecklist(year) {
  return JSON.parse(readFileSync(new URL(`../data/checklists/topps-chrome-tennis-${year}.json`, import.meta.url), 'utf8'));
}
export function expandChecklist(checklist) {
  const rows = [];
  const identities = new Set();
  for (const section of checklist.sections) {
    const codes = new Set();
    for (const card of section.cards) {
      if (codes.has(card.code)) throw new Error(`Duplicate card: ${section.name} ${card.code}`);
      codes.add(card.code);
      for (const variant of section.variants) {
        if (!card.name || !card.code || !variant.name || !variant.serial) throw new Error('Incomplete checklist entry');
        if (variant.printRun !== null && (!Number.isInteger(variant.printRun) || variant.printRun < 1)) throw new Error('Invalid print run');
        const slug = slugify(`${checklist.slug} ${section.name} ${card.code} ${card.name} ${variant.name}`);
        if (identities.has(slug)) throw new Error(`Duplicate variant: ${slug}`);
        identities.add(slug);
        rows.push({ slug, player_name: card.name, card_name: `${checklist.name} - ${section.name}${/Signatures/.test(section.name) ? ' Autograph' : ''} #${card.code}${card.rookie ? ' Rookie' : ''}${card.firstCard ? ' 1st' : ''}`, card_number: /^\d+$/.test(card.code) ? Number(card.code) : null, parallel: section.name === 'Base' ? variant.name : `${section.name} - ${variant.name}`, serial_number: variant.serial, print_run: variant.printRun, source_name: `Checklist: ${section.name} #${card.code} | ${card.name} | ${variant.name}`, source_url: section.sourceUrl ?? checklist.sourceUrl });
      }
    }
  }
  if (checklist.sections.find(s => s.name === 'Base')?.cards.length !== (checklist.expectedBaseCount ?? 200)) throw new Error('Unexpected base card count');
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(x => !['--apply','--env'].includes(x) && !x.endsWith('.local'))) throw new Error('Usage: node scripts/import-tennis-checklists.mjs [--apply] [--env path.env.local]');
  const lists = readdirSync(new URL('../data/checklists/', import.meta.url)).filter(name => /^topps-chrome-(sapphire-)?tennis-\d{4}\.json$/.test(name)).map(name => JSON.parse(readFileSync(new URL(`../data/checklists/${name}`, import.meta.url), 'utf8'))).map(checklist => ({ checklist, rows: expandChecklist(checklist) }));
  for (const {checklist,rows} of lists) console.log(`${checklist.name}: ${checklist.sections.length} sections, ${rows.length} variants`);
  if (!args.includes('--apply')) { console.log('Validated only. Use --apply to insert missing checklist entries.'); return; }
  const {config} = await import('dotenv');
  config({path: args.includes('--env') ? args[args.indexOf('--env')+1] : '.env.local', quiet:true});
  const {Client} = await import('pg');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const db = new Client({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:10000, statement_timeout:60000});
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('tennis-checklists-2024-2026'))");
    for (const {checklist,rows} of lists) {
      await db.query("INSERT INTO sets (name,slug,brand,year,sport) VALUES ($1,$2,'Topps',$3,'Tennis') ON CONFLICT (slug) DO NOTHING", [checklist.name,checklist.slug,checklist.year]);
      const {rows:[set]} = await db.query('SELECT id,year FROM sets WHERE slug=$1',[checklist.slug]);
      if (set.year !== checklist.year) throw new Error('Existing set year mismatch');
      let inserted=0;
      for(let offset=0;offset<rows.length;offset+=250) {
        const chunk=rows.slice(offset,offset+250);
        const result=await db.query(`INSERT INTO cards (set_id,slug,player_name,card_name,card_number,parallel,serial_number,print_run,source_name,source_url,status)
          SELECT $1::uuid,x.slug,x.player_name,x.card_name,x.card_number,x.parallel,x.serial_number,x.print_run,x.source_name,x.source_url,'open'
          FROM jsonb_to_recordset($2::jsonb) AS x(slug text,player_name text,card_name text,card_number integer,parallel text,serial_number text,print_run integer,source_name text,source_url text)
          ON CONFLICT (slug) DO NOTHING`,[set.id,JSON.stringify(chunk)]);
        inserted+=result.rowCount;
      }
      const {rows:[found]}=await db.query('SELECT count(*)::int AS n FROM cards WHERE set_id=$1 AND slug=ANY($2::text[])',[set.id,rows.map(r=>r.slug)]);
      if(found.n!==rows.length) throw new Error('Post-import verification failed');
      console.log(`${checklist.name}: inserted ${inserted}; verified ${found.n}`);
    }
    await db.query('COMMIT');
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
