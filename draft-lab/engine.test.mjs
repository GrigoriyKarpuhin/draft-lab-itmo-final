import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {sequence,apply,recommend,evaluate,migrateDraft,heroStatistics,banWindow,rankCandidates,draftOutlook} from './engine.mjs';
const heroes=JSON.parse(fs.readFileSync(new URL('./data/heroes.json',import.meta.url)));const fresh=mode=>({mode,first:'radiant',history:[],pool:[]});
test('CM and CD sequences have expected bans and five picks each, independent of first side',()=>{for(const mode of ['cm','cd'])for(const first of ['radiant','dire']){const seq=sequence(mode,first);for(const side of ['radiant','dire']){assert.equal(seq.filter(x=>x.type==='pick'&&x.side===side).length,5);assert.equal(seq.filter(x=>x.type==='ban'&&x.side===side).length,mode==='cm'?7:3);}assert.equal(seq[0].side,first);}});
test('full CM follows recommendations through all steps, with unique roles and heroes',()=>{let s=fresh('cm');for(const a of sequence('cm')){const r=recommend(a.side,a.type,s,heroes)[0];assert.ok(r);s=apply(s,r.hero,r.role,a)}assert.equal(s.history.length,24);assert.equal(new Set(s.history.map(x=>x.id)).size,24);for(const side of ['radiant','dire'])assert.equal(new Set(s.history.filter(x=>x.type==='pick'&&x.side===side).map(x=>x.role)).size,5)});
test('duplicates, occupied roles, and heroes outside CD pool rejected',()=>{let s=apply(fresh('free'),heroes[0],1,{type:'pick',side:'radiant'});assert.throws(()=>apply(s,heroes[0],2,{type:'pick',side:'dire'}));assert.throws(()=>apply(s,heroes[1],1,{type:'pick',side:'radiant'}));s={...fresh('cd'),pool:[heroes[0].id]};assert.throws(()=>apply(s,heroes[1],1,{type:'ban',side:'radiant'}));});
test('enemy matchups change candidate score, bans evaluate opponent and respect all exclusions',()=>{let s=fresh('free');s=apply(s,heroes[1],2,{type:'pick',side:'dire'});const h=heroes[0];const positive={[h.id]:[{hero_id:heroes[1].id,games_played:1000,wins:800}]};assert.ok(evaluate(h,1,'radiant',s,heroes,positive).score>evaluate(h,1,'radiant',s,heroes,{}).score);const rows=recommend('radiant','ban',s,heroes);assert.ok(rows.every(x=>x.role!==2&&x.hero.id!==heroes[1].id));});
test('synergy improves relevant pairing and no unavailable role is proposed',()=>{const v=heroes.find(h=>h.localized_name==='Faceless Void'),w=heroes.find(h=>h.localized_name==='Witch Doctor');let s=apply(fresh('free'),v,1,{type:'pick',side:'radiant'});assert.ok(evaluate(w,5,'radiant',s,heroes).synergy>0);assert.ok(recommend('radiant','pick',s,heroes).every(r=>r.role!==1));});

// The fixture is parsed from Valve's color-coded patch-note tables, independently of engine arrays.
test('every CM action matches the official Valve 7.40 fixture for either first-pick side',()=>{
 const official=JSON.parse(fs.readFileSync(new URL('./data/rules-740.json',import.meta.url)));
 for(const first of ['radiant','dire']){
  const expected=official.steps.map(x=>({...x,side:first==='radiant'?x.side:x.side==='radiant'?'dire':'radiant'}));
  assert.deepEqual(sequence('cm',first).map(({side,type})=>({side,type})),expected);
 }
});

test('CD retains snake picks, including two back-to-back picks for each middle group',()=>{
 const picks=sequence('cd').filter(x=>x.type==='pick').map(x=>x.side);
 assert.equal(picks.map(s=>s==='radiant'?'A':'B').join(''),'ABBAABBAAB');
});

test('Dire bans target only Radiant offlane after Radiant fills all other positions, and vice versa',()=>{
 for(const side of ['radiant','dire']){
  const opposite=side==='radiant'?'dire':'radiant';let s=fresh('free');
  for(const [name,role] of [['Juggernaut',1],['Puck',2],['Rubick',4],['Lich',5]])s=apply(s,heroes.find(h=>h.localized_name===name),role,{type:'pick',side});
  const bans=recommend(opposite,'ban',s,heroes).slice(0,6);
  assert.equal(bans.length,6);assert.ok(bans.every(r=>r.role===3));
  assert.ok(bans.every(r=>!['Anti-Mage','Medusa','Wraith King','Phantom Assassin'].includes(r.hero.localized_name)));
 }
});

test('six recommendations represent all five open roles instead of six heroes of one role',()=>{
 const rows=recommend('radiant','pick',fresh('free'),heroes).slice(0,6);
 assert.equal(new Set(rows.map(r=>r.role)).size,5);
 assert.equal(new Set(rows.map(r=>r.hero.id)).size,6);
});

test('known enemy mid reserves extra mid answers while preserving role diversity; filled mid is excluded',()=>{
 let s=apply(fresh('free'),heroes.find(h=>h.localized_name==='Puck'),2,{type:'pick',side:'dire'});
 let rows=recommend('radiant','pick',s,heroes).slice(0,6);
 assert.ok(rows.filter(r=>r.role===2).length>=2);
 assert.equal(new Set(rows.map(r=>r.role)).size,5);
 s=apply(s,heroes.find(h=>h.localized_name==='Queen of Pain'),2,{type:'pick',side:'radiant'});
 rows=recommend('radiant','pick',s,heroes).slice(0,6);
 assert.ok(rows.every(r=>r.role!==2));
});

test('lane bonus follows assigned opposing lane, not the hero name or same team',()=>{
 const puck=heroes.find(h=>h.localized_name==='Puck'),storm=heroes.find(h=>h.localized_name==='Storm Spirit');
 const matches={[puck.id]:[{hero_id:storm.id,games_played:1000,wins:800}]};
 const s=apply(fresh('free'),storm,2,{type:'pick',side:'dire'});
 assert.ok(evaluate(puck,2,'radiant',s,heroes,matches).lane>0);
 assert.equal(evaluate(puck,3,'radiant',s,heroes,matches).lane,0);
 const ally=apply(fresh('free'),storm,2,{type:'pick',side:'radiant'});
 assert.equal(evaluate(puck,3,'radiant',ally,heroes,matches).lane,0);
});

test('banning a threatening reply, or filling its only role, removes that future counter risk',()=>{
 const medusa=heroes.find(h=>h.localized_name==='Medusa'),am=heroes.find(h=>h.localized_name==='Anti-Mage');
 const matches={[am.id]:[{hero_id:medusa.id,games_played:1000,wins:800}]};
 const s=fresh('free');assert.ok(evaluate(medusa,1,'radiant',s,heroes,matches).risk<0);
 const banned=apply(s,am,0,{type:'ban',side:'radiant'});
 assert.equal(evaluate(medusa,1,'radiant',banned,heroes,matches).risk,0);
 const filled=apply(s,heroes.find(h=>h.localized_name==='Juggernaut'),1,{type:'pick',side:'dire'});
 assert.equal(evaluate(medusa,1,'radiant',filled,heroes,matches).risk,0);
});

test('CM rejects an out-of-turn action before mutating the saved history',()=>{
 const s=fresh('cm');assert.throws(()=>apply(s,heroes[0],0,{type:'ban',side:'dire'}),/очередь/);
 assert.equal(s.history.length,0);
});


test('legacy drafts with incorrect turn order preserve all heroes and roles in free mode',()=>{
 const saved={...fresh('cm'),history:[{type:'ban',side:'radiant',id:1,role:null},{type:'ban',side:'dire',id:2,role:null}]};
 const original=JSON.stringify(saved);const migrated=migrateDraft(saved);
 assert.equal(migrated.mode,'free');assert.ok(migrated.migrationNotice);
 assert.deepEqual(migrated.history,saved.history);assert.equal(JSON.stringify(saved),original);
 assert.equal(migrateDraft({...fresh('cm'),history:[]}).mode,'cm');
});

const patchFixture=()=>({patch:{name:'7.41f'},heroStats:{},matchups:{},synergies:{}});
test('patch win rate replaces legacy statistics and missing patch data remains neutral',()=>{
 const h={...heroes[0],'7_pick':10000,'7_win':8000};const m=patchFixture();m.heroStats[h.id]={games:100,wins:20};
 assert.equal(heroStatistics(h,m).rawWr,20);assert.equal(heroStatistics(h,m).wr,40);
 assert.ok(heroStatistics(h,null).wr>70);
 const absent=heroStatistics(heroes[1],m);assert.equal(absent.n,0);assert.equal(absent.wr,50);assert.equal(absent.rawWr,null);
});

test('missing patch pair does not fall back to a strong legacy counter matchup',()=>{
 const puck=heroes.find(h=>h.localized_name==='Puck'),storm=heroes.find(h=>h.localized_name==='Storm Spirit');
 const s=apply(fresh('free'),storm,2,{type:'pick',side:'dire'});
 const legacy={[puck.id]:[{hero_id:storm.id,games_played:1000,wins:900}]};
 const r=evaluate(puck,2,'radiant',s,heroes,legacy,patchFixture());
 assert.equal(r.counter,0);assert.equal(r.samples,0);assert.equal(r.metaSource,'patch');assert.equal(r.metaPatch,'7.41f');
});

test('fresh same-team pair results change statistical synergy and show the pair sample',()=>{
 const puck=heroes.find(h=>h.localized_name==='Puck'),lich=heroes.find(h=>h.localized_name==='Lich');
 const s=apply(fresh('free'),lich,5,{type:'pick',side:'radiant'});
 const m=patchFixture();m.heroStats[puck.id]={games:2000,wins:1000};m.heroStats[lich.id]={games:2000,wins:1000};
 const key=[puck.id,lich.id].sort((a,b)=>a-b).join(':');m.synergies[key]={games:1000,wins:700};
 const r=evaluate(puck,2,'radiant',s,heroes,{},m);assert.ok(r.synergyStats>0);assert.equal(r.synergySamples,1000);
 m.synergies[key]={games:1000,wins:300};assert.ok(evaluate(puck,2,'radiant',s,heroes,{},m).synergyStats<0);
 const enemy=apply(fresh('free'),lich,5,{type:'pick',side:'dire'});
 assert.equal(evaluate(puck,2,'radiant',enemy,heroes,{},m).synergySamples,0);
});

test('small fresh samples are shrunk rather than treated as certain wins',()=>{
 const m=patchFixture(),h=heroes[0];m.heroStats[h.id]={games:1,wins:1};
 const small=heroStatistics(h,m);assert.equal(small.rawWr,100);assert.ok(small.wr>50&&small.wr<51);
 m.heroStats[h.id]={games:2000,wins:1500};assert.ok(heroStatistics(h,m).wr>70);
});

test('full CM with real patch cache retains all turn, hero and role constraints',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('./data/meta.json',import.meta.url)));let s=fresh('cm');
 for(const a of sequence('cm')){
  const rows=recommend(a.side,a.type,s,heroes,{},0,m);const r=rows[0];assert.ok(r);assert.equal(r.metaSource,'patch');
  s=apply(s,r.hero,r.role,a);
 }
 assert.equal(new Set(s.history.map(x=>x.id)).size,24);
 for(const side of ['radiant','dire'])assert.equal(new Set(s.history.filter(x=>x.type==='pick'&&x.side===side).map(x=>x.role)).size,5);
});

function banScenario(){
 const h=name=>heroes.find(x=>x.localized_name===name);let s=fresh('free');
 for(const [name,role] of [['Juggernaut',1],['Axe',3],['Rubick',4],['Oracle',5]])s=apply(s,h(name),role,{side:'radiant',type:'pick'});
 for(const [name,role] of [['Anti-Mage',1],['Puck',2],['Mars',3],['Tusk',4]])s=apply(s,h(name),role,{side:'dire',type:'pick'});
 s.pool=['Storm Spirit','Silencer','Lich'].map(n=>h(n).id);
 const m=patchFixture();for(const hero of heroes)m.heroStats[hero.id]={games:1000,wins:500};
 m.matchups[h('Silencer').id]=[{hero_id:h('Storm Spirit').id,games_played:1000,wins:900}];
 return {s,m,h};
}
test('ban explicitly opens an unpicked hero and explains the future plan',()=>{
 const {s,m,h}=banScenario();const r=recommend('radiant','ban',s,heroes,{},0,m).find(x=>x.hero.id===h('Silencer').id);
 assert.ok(r.setup>0);assert.equal(r.protection,0);assert.equal(r.banPlan[0].name,'Storm Spirit');assert.ok(r.reasons.some(x=>x.includes('Открывает план')));
});
test('an equally strong surviving answer removes the setup benefit of a ban',()=>{
 const {s,m,h}=banScenario();m.matchups[h('Lich').id]=[{hero_id:h('Storm Spirit').id,games_played:1000,wins:900}];
 const r=recommend('radiant','ban',s,heroes,{},0,m).find(x=>x.hero.id===h('Silencer').id);assert.equal(r.setup,0);
});
test('protecting an existing hero is distinct from protecting an unpicked plan',()=>{
 const {s,m,h}=banScenario();s.history.push({id:h('Storm Spirit').id,side:'radiant',type:'pick',role:2});
 const r=recommend('radiant','ban',s,heroes,{},0,m).find(x=>x.hero.id===h('Silencer').id);
 assert.ok(r.protection>0);assert.equal(r.setup,0);assert.ok(r.reasons.some(x=>x.includes('Защищает выбранного')));
});
test('schedule includes intervening picks and bans and the upcoming double pick',()=>{
 let s={...fresh('cm'),history:Array.from({length:10},()=>({}))};let w=banWindow(s,'radiant');
 assert.equal(w.enemyPicks,1);assert.equal(w.enemyBans,1);assert.equal(w.picksInRow,2);
 s.history.push({});w=banWindow(s,'dire');assert.equal(w.enemyPicks,0);assert.equal(w.enemyBans,0);
 assert.equal(banWindow(fresh('free'),'radiant').known,false);
});
test('bans already made remove their protected targets and cannot be recommended again',()=>{
 const {s,m,h}=banScenario();s.history.push({id:h('Storm Spirit').id,side:'dire',type:'ban',role:null});
 const rows=recommend('radiant','ban',s,heroes,{},0,m);assert.ok(rows.every(r=>r.banPlan.every(p=>p.name!=='Storm Spirit')));
 assert.ok(rows.every(r=>r.hero.id!==h('Storm Spirit').id));
});

test('banning your uniquely strong flex option carries an opportunity cost',()=>{
 const {s,m,h}=banScenario();s.history=s.history.map(x=>x.side==='dire'&&x.role===3?{...x,id:h('Silencer').id,role:5}:x);
 s.pool=['Dragon Knight','Storm Spirit','Tidehunter'].map(n=>h(n).id);m.heroStats[h('Dragon Knight').id]={games:1000,wins:900};
 const r=recommend('radiant','ban',s,heroes,{},0,m).find(x=>x.hero.id===h('Dragon Knight').id);
 assert.ok(r.opportunity>0);assert.ok(r.banPlan.every(p=>p.id!==r.hero.id));
});

test('full catalog ranks all available heroes by score rather than the diversified shortlist',()=>{
 const s=fresh('free'),m=patchFixture();
 const rows=rankCandidates('radiant','pick',s,heroes,{},0,m,{includeUnusual:true});
 assert.equal(rows.length,heroes.length);assert.equal(new Set(rows.map(r=>r.hero.id)).size,rows.length);
 assert.ok(rows.every((r,i)=>i===0||rows[i-1].score>=r.score));
 const bans=rankCandidates('radiant','ban',s,heroes,{},0,m);
 assert.ok(bans.every((r,i)=>i===0||bans[i-1].score>=r.score));
});
test('explicit sidebar role filters picks and enemy ban roles without reopening filled roles',()=>{
 const s=fresh('free');s.history.push({id:heroes.find(h=>h.localized_name==='Juggernaut').id,type:'pick',side:'dire',role:1});
 assert.ok(recommend('radiant','pick',s,heroes,{},0,null,{targetRole:3}).every(r=>r.role===3));
 assert.ok(recommend('radiant','ban',s,heroes,{},0,null,{targetRole:2}).every(r=>r.role===2));
 assert.equal(recommend('radiant','ban',s,heroes,{},0,null,{targetRole:1}).length,0);
});
test('Shadow Fiend remains inspectable as carry when mid is filled',()=>{
 const s=fresh('free'),sf=heroes.find(h=>h.localized_name==='Shadow Fiend');
 s.history.push({id:heroes.find(h=>h.localized_name==='Lina').id,type:'pick',side:'radiant',role:2});
 const r=rankCandidates('radiant','pick',s,heroes,{},1,patchFixture(),{includeUnusual:true}).find(r=>r.hero.id===sf.id);
 assert.ok(r);assert.equal(r.role,1);assert.ok(Number.isFinite(r.score));assert.ok(r.fit>0);assert.ok(!r.reasons.some(x=>x.includes('не подтверждена')));
});
test('a bad carry duel remains prominent despite a favorable matchup with the enemy support',()=>{
 const s=fresh('free'),h=n=>heroes.find(x=>x.localized_name===n),m=patchFixture();
 s.history.push({id:h('Juggernaut').id,type:'pick',side:'dire',role:1},{id:h('Spirit Breaker').id,type:'pick',side:'dire',role:4});
 m.matchups[h('Spectre').id]=[{hero_id:h('Juggernaut').id,games_played:1000,wins:400},{hero_id:h('Spirit Breaker').id,games_played:1000,wins:600}];
 const r=evaluate(h('Spectre'),1,'radiant',s,heroes,{},m);
 assert.ok(r.coreDuel<0);assert.ok(r.reasons[0].includes('Juggernaut'));assert.ok(r.reasons[0].includes('невыгодный'));
 assert.equal(r.matchupsDetail.length,2);assert.ok(r.coreDuel+r.lane<0);
});
function completedDraft(){
 const s=fresh('free');
 for(const [side,names] of [['radiant',['Spectre','Lina','Axe','Bane','Crystal Maiden']],['dire',['Juggernaut','Outworld Devourer','Mars','Spirit Breaker','Witch Doctor']]])
 names.forEach((name,i)=>s.history.push({id:heroes.find(h=>h.localized_name===name).id,type:'pick',side,role:i+1}));
 return s;
}
test('final percentages require ten unique positions, sum to 100 and swap with sides',()=>{
 const s=completedDraft(),m=patchFixture();
 const a=draftOutlook(s,heroes,{},m);assert.equal(a.radiant+a.dire,100);assert.equal(a.calibrated,false);
 const swapped={...s,history:s.history.map(x=>({...x,side:x.side==='radiant'?'dire':'radiant'}))};
 const b=draftOutlook(swapped,heroes,{},m);assert.equal(a.radiant,b.dire);assert.equal(a.dire,b.radiant);
 s.history.pop();assert.equal(draftOutlook(s,heroes,{},m),null);
 const invalid=completedDraft();invalid.history[0].role=2;assert.equal(draftOutlook(invalid,heroes,{},m),null);
});
test('final outlook responds to whole-draft counters and pair synergy, excluding future reply risk',()=>{
 const s=completedDraft(),m=patchFixture(),h=n=>heroes.find(x=>x.localized_name===n);
 const before=draftOutlook(s,heroes,{},m);
 m.matchups[h('Spectre').id]=[{hero_id:h('Juggernaut').id,games_played:1000,wins:300}];
 const bad=draftOutlook(s,heroes,{},m);assert.ok(bad.radiant<before.radiant);
 const key=[h('Spectre').id,h('Lina').id].sort((a,b)=>a-b).join(':');m.synergies[key]={games:1000,wins:900};
 const synergy=draftOutlook(s,heroes,{},m);assert.ok(synergy.radiant>bad.radiant);
 assert.ok(Object.values(synergy.radiantComponents).every(Number.isFinite));
});

test('expanded final report explains both teams with their actual carry, mid and initiators',()=>{
 const result=draftOutlook(completedDraft(),heroes,{},patchFixture()),r=result.explanation;
 assert.equal(r.teams.radiant.winConditions.length,3);assert.equal(r.teams.dire.winConditions.length,3);
 assert.ok(r.teams.radiant.winConditions.some(x=>x.text.includes('Axe')));
 assert.ok(r.teams.radiant.winConditions.some(x=>x.text.includes('Spectre')&&x.text.includes('Lina')));
 assert.ok(r.teams.dire.winConditions.some(x=>x.text.includes('Mars')));
 assert.equal(r.teams.radiant.carryMatchup.hero,'Spectre');assert.equal(r.teams.dire.carryMatchup.hero,'Juggernaut');
 assert.doesNotThrow(()=>JSON.stringify(result));
});
test('report distinguishes missing pair evidence from a statistical advantage and cannot invent lane win rates',()=>{
 const r=draftOutlook(completedDraft(),heroes,{},patchFixture()).explanation;
 assert.equal(r.teams.radiant.carryMatchup.empirical,false);
 assert.equal(r.teams.radiant.carryMatchup.n,0);
 assert.ok(!r.teams.radiant.strengths.some(x=>x.startsWith('Статистическая опора')));
 assert.equal(r.lanes.length,3);assert.ok(r.lanes.every(x=>x.knownPairs===0));
 assert.ok(r.lanes.every(x=>!('winRate' in x)));
});
test('win conditions and risks change for farm-heavy drafts without a marked initiator',()=>{
 const s=completedDraft(),h=n=>heroes.find(x=>x.localized_name===n);
 const names=['Anti-Mage','Tinker','Arc Warden','Crystal Maiden','Lich'];
 s.history=s.history.map(x=>x.side==='radiant'?{...x,id:h(names[x.role-1]).id}:x);
 const r=draftOutlook(s,heroes,{},patchFixture()).explanation.teams.radiant;
 assert.ok(r.winConditions.some(x=>x.title==='Развести фарм и боевые задачи'));
 assert.ok(r.winConditions.some(x=>x.title==='Играть от информации и удобного контакта'));
 assert.ok(r.risks.some(x=>x.includes('Конкуренция за ресурсы')));
 assert.ok(r.risks.some(x=>x.includes('Роли вне справочника')));
});
test('report identifies the actual unfavorable carry pair and uses only selected-patch ally evidence',()=>{
 const s=completedDraft(),m=patchFixture(),h=n=>heroes.find(x=>x.localized_name===n);
 m.matchups[h('Spectre').id]=[{hero_id:h('Juggernaut').id,games_played:1000,wins:300}];
 const key=[h('Spectre').id,h('Lina').id].sort((a,b)=>a-b).join(':');m.synergies[key]={games:800,wins:640};
 const report=draftOutlook(s,heroes,{},m).explanation;
 assert.equal(report.teams.radiant.carryMatchup.observed,30);
 assert.equal(report.teams.dire.carryMatchup.observed,70);
 assert.ok(report.teams.radiant.risks.some(x=>x.includes('Spectre против Juggernaut')&&x.includes('1000')));
 assert.ok(report.teams.radiant.synergies.some(x=>x.n===800&&x.observed===80));
 const swapped={...s,history:s.history.map(x=>({...x,side:x.side==='radiant'?'dire':'radiant'}))};
 const swappedReport=draftOutlook(swapped,heroes,{},m).explanation;
 assert.deepEqual(swappedReport.teams.dire.winConditions,report.teams.radiant.winConditions);
});
