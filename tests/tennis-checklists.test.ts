import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogCardIdentity } from '../lib/catalog-card-identity';
import { loadChecklist, expandChecklist } from '../scripts/import-tennis-checklists.mjs';

test('checklists expand without collisions and preserve release corrections', () => {
  const a=expandChecklist(loadChecklist(2024));
  const b=expandChecklist(loadChecklist(2026));
  assert.equal(a.length,6538); assert.equal(b.length,11137);
  assert.equal(new Set([...a,...b].map((r:any)=>r.slug)).size,a.length+b.length);
  assert.equal(a.filter((r:any)=>r.card_name.includes('Center Court') && r.parallel.endsWith(' - Base')).length,10);
  assert.ok(!b.some((r:any)=>/Gustavo Kuerten|Margaret Court|Rod Laver/.test(r.player_name)));
  assert.equal(b.filter((r:any)=>r.card_name.includes('Hidden Gems')).length,5);
  assert.ok(b.some((r:any)=>r.player_name==='Alycia Parks' && r.card_name.includes('#88') && r.serial_number==='/50'));
  assert.ok(b.some((r:any)=>r.card_name.includes('#AT-APS') && r.serial_number==='/250'));
  assert.ok(b.filter((r:any)=>r.serial_number==='Unnumbered').every((r:any)=>r.print_run===null));
});
test('variants group by checklist identity, preserving separate inserts and legacy Sapphire', () => {
 const card={slug:'one',cardName:'Tennis - Aces #AC-1',cardNumber:null,player:'Novak Djokovic'};
 assert.equal(catalogCardIdentity(card),catalogCardIdentity({...card,slug:'two'}));
 assert.notEqual(catalogCardIdentity(card),catalogCardIdentity({...card,cardName:'Tennis - Auto #AO-NDC'}));
 assert.notEqual(catalogCardIdentity(card),catalogCardIdentity({...card,player:'Other'}));
 const legacy={...card,cardName:'Sapphire',sourceUrl:'https://example.com/novak-ca-ndc-red'};
 assert.equal(catalogCardIdentity(legacy),catalogCardIdentity({...legacy,slug:'other',sourceUrl:'https://example.com/novak-ca-ndc-orange'}));
});
