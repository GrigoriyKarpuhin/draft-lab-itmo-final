import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {positions,roleAffinity,evaluate,recommend,rankCandidates,draftOutlook} from './engine.mjs';
import {ABILITY_COMBOS,SPELL_THREATS,mechanicalAssessment} from './mechanics.mjs';
import {equipmentPlan,resourceAssessment,resourceDemand,buildProfile,SPELL_BLOCK_BREAKERS,spellBlockBreakers} from './economy.mjs';
const heroes=JSON.parse(fs.readFileSync(new URL('./data/heroes.json',import.meta.url))),h=n=>heroes.find(x=>x.localized_name===n);
const unit=(name,role)=>({hero:h(name),role});
const state=()=>({mode:'free',first:'radiant',pool:[],history:[]});
const meta=()=>({patch:{name:'test'},heroStats:Object.fromEntries(heroes.map(h=>[h.id,{games:1000,wins:500}])),matchups:{},synergies:{}});
const pick=(s,name,side,role)=>s.history.push({id:h(name).id,type:'pick',side,role});
test('recognized mid flexes are filterable and recommended without a position penalty',()=>{
 const s=state(),m=meta(),rows=recommend('radiant','pick',s,heroes,{},2,m);
 for(const name of ['Earth Spirit','Sand King','Pangolier']){
  assert.ok(positions(h(name)).includes(2));assert.equal(roleAffinity(h(name),2),1);
  assert.ok(rows.some(x=>x.hero.id===h(name).id&&x.role===2));
  const r=evaluate(h(name),2,'radiant',s,heroes,{},m);assert.ok(r.fit>0);assert.ok(!r.reasons.some(x=>x.includes('не подтверждена')));
 }
});
test('personal role confirmations change catalog, recommendations and final role evidence consistently',()=>{
 const s=state();s.roleOverrides={[`${h('Crystal Maiden').id}:2`]:true};
 assert.ok(positions(h('Crystal Maiden'),s).includes(2));assert.equal(roleAffinity(h('Crystal Maiden'),2,s),1);
 assert.ok(rankCandidates('radiant','pick',s,heroes,{},2,meta()).some(r=>r.hero.id===h('Crystal Maiden').id));
 delete s.roleOverrides[`${h('Crystal Maiden').id}:2`];assert.ok(!positions(h('Crystal Maiden'),s).includes(2));
 const r=evaluate(h('Crystal Maiden'),2,'radiant',s,heroes,{},meta());assert.equal(r.fit,0);assert.ok(r.reasons.some(x=>x.includes('не подтверждена')));
});
test('specific spell combinations explain order and do not stack the old unnamed pair bonus',()=>{
 const s=state();pick(s,'Dark Seer','radiant',3);
 const r=evaluate(h('Sand King'),2,'radiant',s,heroes,{},meta());
 assert.equal(r.mechanicsDetail.combo,1.8);assert.ok(r.reasons.some(x=>x.includes('Vacuum')&&x.includes('Epicenter')));
 const song=mechanicalAssessment(h('Enigma'),3,[unit('Naga Siren',1)],[]);
 assert.ok(song.interactions.some(x=>x.includes('отмена')&&x.includes('неуязвимы')));
});
test('strong allied dispel helps Grip but cannot clear Doom or Ice Blast',()=>{
 const a=[unit('Oracle',5)];
 const grip=mechanicalAssessment(h('Storm Spirit'),2,a,[unit('Bane',5)]);assert.ok(grip.allySave>0);
 const doom=mechanicalAssessment(h('Storm Spirit'),2,a,[unit('Doom',3)]);assert.equal(doom.allySave,0);assert.ok(doom.limits.some(x=>x.includes('не снимается')));
 const ice=mechanicalAssessment(h('Huskar'),2,a,[unit('Ancient Apparition',5)]);assert.equal(ice.allySave,0);assert.ok(ice.combo<1);assert.ok(ice.limits.some(x=>x.includes('False Promise не снимает')));
});
test('a globally silenced save hero is not treated as a freely available dispel',()=>{
 const r=mechanicalAssessment(h('Earth Spirit'),2,[unit('Oracle',5)],[unit('Silencer',5)]);
 assert.equal(r.allySave,0);assert.ok(r.limits.some(x=>x.includes('Oracle тоже может попасть')));
 const bkb=r.items.find(x=>x.item==='Black King Bar');assert.ok(bkb);assert.ok(bkb.condition.includes('после Global Silence'));
});
test('BKB and Force Staff are not credited as answers to Chronosphere and Black Hole',()=>{
 for(const enemy of ['Faceless Void','Enigma']){
  const r=mechanicalAssessment(h('Storm Spirit'),2,[unit('Oracle',5)],[unit(enemy,3)]);
  assert.equal(r.itemPotential,0);assert.equal(r.allySave,0);assert.ok(!r.items.some(x=>x.item==='Black King Bar'||x.item==='Force Staff'));
  assert.ok(r.limits.some(x=>x.includes('Force Staff не работает')));
 }
});
test('a verified build has bounded item credit without rewriting the empirical counter result',()=>{
 const s=state(),m=meta();pick(s,'Silencer','dire',5);m.matchups[h('Leshrac').id]=[{hero_id:h('Silencer').id,games_played:1000,wins:300}];
 const a=evaluate(h('Leshrac'),2,'radiant',s,heroes,{},m),b=evaluate(h('Leshrac'),2,'radiant',{...s,potentialItems:false},heroes,{},m);
 assert.equal(a.counter,b.counter);assert.ok(a.counter<0);assert.ok(a.mechanicsDetail.itemPotential>0);assert.ok(a.mechanicsDetail.itemPotential<=.25);
 assert.equal(b.mechanicsDetail.itemPotential,0);assert.ok(a.score>b.score);assert.ok(a.mechanics<0);
 const unknown=mechanicalAssessment(h('Queen of Pain'),2,[],[unit('Silencer',5)]);assert.equal(unknown.itemPotential,0);
});
test('observed Manta wins the Spectre branch; multiple cheap spells prevent assuming Linken against Bane',()=>{
 const manta=mechanicalAssessment(h('Spectre'),1,[],[unit('Silencer',5)]);assert.equal(manta.items[0].item,'Manta Style');
 const grip=mechanicalAssessment(h('Leshrac'),2,[],[unit('Bane',5)]);assert.ok(!grip.items.some(x=>x.item==='Linken’s Sphere'));
 assert.ok(grip.limits.some(x=>x.includes('Brain Sap')&&x.includes('Nightmare')));
 const duel=mechanicalAssessment(h('Leshrac'),2,[],[unit('Legion Commander',3)]);assert.ok(duel.items.some(x=>x.item==='Linken’s Sphere'&&x.condition.includes('до вражеского каста')));
 assert.ok(duel.itemPotential<.01); // Rare, late branch must not erase Duel.
});
test('Chronosphere friendly fire and healing denial remain explicit constraints',()=>{
 const r=mechanicalAssessment(h('Faceless Void'),1,[unit('Axe',3),unit('Earth Spirit',2)],[]);
 assert.ok(r.conflict<0);assert.ok(r.interactions.some(x=>x.includes('и союзников')));
 const ice=mechanicalAssessment(h('Huskar'),2,[unit('Oracle',5)],[unit('Ancient Apparition',5)]);
 assert.ok(ice.interactions.some(x=>x.includes('Бонус лечебной связки снижен')));
});
test('all explicit spell and threat names are backed by the saved official descriptions',()=>{
 const ref=JSON.parse(fs.readFileSync(new URL('./data/mechanics-reference.json',import.meta.url)));
 const names=n=>ref.heroes[String(h(n).id)].abilities.map(x=>x.name_loc.toLowerCase());
 for(const c of ABILITY_COMBOS)for(let i=0;i<2;i++)assert.ok(names(c.heroes[i]).includes(c.spells[i].toLowerCase()),c.heroes[i]+': '+c.spells[i]);
 for(const t of SPELL_THREATS)assert.ok(names(t.hero).includes(t.ability.toLowerCase()),t.hero+': '+t.ability);
});
test('enemy interruption and dispel reduce conditional combo value rather than treating it as guaranteed',()=>{
 const free=mechanicalAssessment(h('Enigma'),3,[unit('Naga Siren',1)],[]);
 const interrupted=mechanicalAssessment(h('Enigma'),3,[unit('Naga Siren',1)],[unit('Silencer',5),unit('Bane',4)]);
 assert.ok(interrupted.combo<free.combo);assert.ok(interrupted.interactions.some(x=>x.includes('прервать канал')));
 const setup=mechanicalAssessment(h('Mirana'),4,[unit('Bane',5)],[]);
 const cleansed=mechanicalAssessment(h('Mirana'),4,[unit('Bane',5)],[unit('Abaddon',3)]);
 assert.ok(cleansed.combo<setup.combo);
});
test('a second enemy who can silence the save provider reduces coverage against other control',()=>{
 const a=[unit('Oracle',5)],single=mechanicalAssessment(h('Storm Spirit'),2,a,[unit('Bane',5)]);
 const combined=mechanicalAssessment(h('Storm Spirit'),2,a,[unit('Bane',5),unit('Silencer',4)]);
 assert.ok(combined.allySave<single.allySave);assert.ok(combined.saves.some(x=>x.text.includes('самого сейвящего')));
});

test('the screenshot draft never proposes team-wide Linken and exposes missing role evidence',()=>{
 const a=[unit('Spectre',1),unit('Leshrac',2),unit('Night Stalker',3),unit('Bane',4),unit('Disruptor',5)];
 const b=[unit('Phantom Lancer',1),unit('Windranger',2),unit('Legion Commander',3),unit('Dark Willow',4),unit('Grimstroke',5)];
 for(const [own,enemy] of [[a,b],[b,a]]){
  const rows=own.map(x=>mechanicalAssessment(x.hero,x.role,own.filter(y=>y!==x),enemy));
  const plans=rows.flatMap(x=>x.items);assert.ok(plans.length<=1);assert.ok(!plans.some(x=>x.item==='Linken’s Sphere'));
  assert.ok(rows.reduce((s,x)=>s+x.itemPotential,0)<=.25);
  const res=resourceAssessment(own);assert.equal(res.rows.length,5);
  for(const row of res.rows.filter(r=>!r.verified))assert.ok(row.path.includes('пока нет'));
 }
 const s=state();for(const [side,team] of [['radiant',a],['dire',b]])for(const x of team)pick(s,x.hero.localized_name,side,x.role);
 const report=draftOutlook(s,heroes,{},meta()).explanation;
 assert.ok(report.teams.radiant.mechanics.resources.rows.some(x=>x.hero==='Spectre'&&x.path.includes('Radiance')));
 const saves=report.teams.dire.mechanics.saves;assert.equal(saves.length,1);assert.ok(saves[0].text.includes('общий кулдаун'));
});
test('one shared purchase is credited once even with several vulnerable allies and threats',()=>{
 const own=[unit('Spectre',1),unit('Leshrac',2),unit('Dark Willow',4),unit('Disruptor',5)];
 const enemy=[unit('Silencer',5),unit('Skywrath Mage',4),unit('Riki',1)];
 const rows=own.map(x=>mechanicalAssessment(x.hero,x.role,own.filter(y=>y!==x),enemy));
 assert.equal(rows.flatMap(x=>x.items).length,1);assert.ok(rows.reduce((s,x)=>s+x.itemPotential,0)<=.25);
 const plan=equipmentPlan(own,enemy,SPELL_THREATS.filter(t=>enemy.some(e=>e.hero.localized_name===t.hero)));
 const reversed=equipmentPlan([...own].reverse(),enemy,SPELL_THREATS.filter(t=>enemy.some(e=>e.hero.localized_name===t.hero)));
 assert.deepEqual(plan.items,reversed.items);
 const off=equipmentPlan(own,enemy,SPELL_THREATS.filter(t=>enemy.some(e=>e.hero.localized_name===t.hero)),{potentialItems:false});
 assert.equal(off.items[0].item,plan.items[0].item);assert.equal(off.items[0].credit,0);
});
test('builds and resource demand are position-specific and do not copy core farm onto support flexes',()=>{
 assert.ok(buildProfile(h('Dark Willow'),4));assert.equal(buildProfile(h('Dark Willow'),2),undefined);
 assert.ok(buildProfile(h('Bane'),5));assert.ok(buildProfile(h('Bane'),4));assert.notEqual(buildProfile(h('Bane'),4).source,buildProfile(h('Bane'),5).source);assert.equal(buildProfile(h('Bane'),3),undefined);
 assert.ok(resourceDemand(h('Naga Siren'),1)>1.5);assert.equal(resourceDemand(h('Naga Siren'),5),.15);
 const r=resourceAssessment([unit('Spectre',1),unit('Medusa',2),unit('Bane',4)]);
 assert.ok(r.notes.some(x=>x.includes('Spectre')&&x.includes('Medusa')));
});
test('a single allied save is shared among potential recipients instead of credited as four casts',()=>{
 const own=[unit('Spectre',1),unit('Leshrac',2),unit('Night Stalker',3),unit('Oracle',4),unit('Disruptor',5)];
 const rows=own.map(x=>mechanicalAssessment(x.hero,x.role,own.filter(y=>y!==x),[unit('Bane',5)],{potentialItems:false}));
 assert.ok(rows.reduce((s,x)=>s+x.allySave,0)<=1.3*.45);
});
test('each explicit Linken breaker has an official ability reference and excludes the protected spell',()=>{
 const ref=JSON.parse(fs.readFileSync(new URL('./data/mechanics-reference.json',import.meta.url)));
 for(const [name,spells] of Object.entries(SPELL_BLOCK_BREAKERS))for(const spell of spells)assert.ok(ref.heroes[String(h(name).id)].abilities.some(a=>a.name_loc===spell),name+': '+spell);
 assert.ok(!spellBlockBreakers([unit('Bane',5)],'Nightmare').some(x=>x.ability==='Nightmare'));
});
