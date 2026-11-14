import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {BUILD_REFERENCE} from './builds.mjs';
import {buildProfile} from './economy.mjs';
import {buildTimeline,developmentAssessment,candidateDevelopment} from './development.mjs';
import {evaluate,positions,roleAffinity,draftOutlook} from './engine.mjs';
const heroes=JSON.parse(fs.readFileSync(new URL('./data/heroes.json',import.meta.url))),h=n=>heroes.find(x=>x.localized_name===n),u=(n,role)=>({hero:h(n),role});
const state=()=>({mode:'free',first:'radiant',pool:[],history:[]});
const pick=(s,n,side,role)=>s.history.push({id:h(n).id,type:'pick',side,role});

test('expanded snapshot preserves source, selected role, sample and frequency semantics',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('./data/build-reference.json',import.meta.url)));
 assert.deepEqual(audit,BUILD_REFERENCE);assert.equal(audit.profiles.length,50);
 assert.equal(new Set(audit.profiles.map(p=>p.hero)).size,45);assert.equal(new Set(audit.profiles.map(p=>p.hero+':'+p.role)).size,50);
 for(const p of audit.profiles){
  assert.ok(h(p.hero));assert.ok(p.matches>=200);assert.ok(p.roleMatches8Days>0);assert.match(p.source,/^https:\/\/dota2protracker\.com\/hero\//);assert.match(p.source,/section=builds/);
  assert.ok(p.period.includes('14'));assert.equal(p.checkedAt,'2026-10-23');
  for(const i of p.items){assert.ok(i.purchase>0&&i.purchase<=1);assert.ok(i.minute>=0);assert.equal(i.reportedRange.length,2);assert.ok(!('winRate' in i));if(i.purchaseKind==='lower-bound')assert.equal(i.purchase,.5);else assert.equal(i.purchaseKind,'exact');}
 }
});
test('every specified player pool is covered on its own position, including Slark mid',()=>{
 const pool={1:['Phantom Assassin','Luna','Spectre','Drow Ranger','Muerta'],2:['Slark'],3:['Night Stalker','Centaur Warrunner','Doom','Dark Seer'],4:['Undying','Skywrath Mage','Bane','Dark Willow'],5:['Crystal Maiden','Disruptor','Shadow Shaman','Lion']};
 for(const [role,names] of Object.entries(pool))for(const name of names)assert.ok(buildProfile(h(name),Number(role)),name+' '+role);
 assert.ok(positions(h('Slark')).includes(2));assert.equal(roleAffinity(h('Slark'),2),1);
});
test('same hero on two positions has independent build observations, with no cross-role fallback',()=>{
 const mid=buildProfile(h('Slark'),2),carry=buildProfile(h('Slark'),1);assert.notEqual(mid.source,carry.source);assert.notEqual(mid.matches,carry.matches);
 const bkb=p=>p.items.find(i=>i.item==='Black King Bar');assert.notEqual(bkb(mid).purchase,bkb(carry).purchase);
 assert.equal(buildProfile(h('Slark'),5),undefined);assert.equal(buildTimeline(h('Slark'),5).known,false);
});
test('early farm investments and early space creators produce different team plans',()=>{
 const slow=developmentAssessment([u('Spectre',1),u('Windranger',2)],[]);
 const supported=developmentAssessment([u('Spectre',1),u('Slark',2)],[]);
 assert.ok(slow.evidence.some(e=>e.key==='overlap'&&e.value<0));assert.ok(supported.evidence.some(e=>e.key==='space'&&e.value>0));assert.ok(supported.score>slow.score);
 assert.equal(buildTimeline(h('Phantom Assassin'),1).farm.item,'Battle Fury');assert.equal(buildTimeline(h('Spectre'),1).farm.item,'Radiance');
});
test('opponent early plans increase exposure and only selected enemy heroes count',()=>{
 const own=[u('Spectre',1),u('Windranger',2)];
 const safe=developmentAssessment(own,[]),pressure=developmentAssessment(own,[u('Earth Spirit',2),u('Legion Commander',3)]);
 assert.ok(pressure.score<safe.score);const e=pressure.evidence.find(e=>e.key==='pressure');assert.ok(e.text.includes('Earth Spirit')&&e.text.includes('Legion Commander'));
 assert.ok(!safe.evidence.some(e=>e.key==='pressure'));
});
test('candidate receives its marginal contribution and does not inherit an existing farm conflict',()=>{
 const allies=[u('Spectre',1),u('Windranger',2)],enemies=[u('Earth Spirit',2),u('Legion Commander',3)];
 const r=candidateDevelopment(h('Bane'),4,allies,enemies);assert.equal(r.score,0);assert.ok(r.teamScore<0);
 const baseline=developmentAssessment([u('Windranger',2)],enemies).score;assert.equal(candidateDevelopment(h('Spectre'),1,[u('Windranger',2)],enemies).score,r.teamScore-baseline);
});
test('unknown role builds and support flexes never inherit core item investments',()=>{
 const d=developmentAssessment([u('Queen of Pain',2),u('Naga Siren',5)],[]);assert.equal(d.known,0);assert.equal(d.score,0);assert.equal(d.evidence.length,0);
 assert.equal(buildTimeline(h('Naga Siren'),5).farm,null);assert.equal(buildTimeline(h('Undying'),4).farm,null);
});
test('observed healing branches are exposed to Ice Blast without granting every core a Satanic',()=>{
 const own=[u('Phantom Assassin',1),u('Leshrac',2)];const d=developmentAssessment(own,[u('Ancient Apparition',5)]);
 const e=d.evidence.find(e=>e.key==='healing');assert.ok(e.value<0);assert.ok(e.text.includes('Satanic')&&e.text.includes('Bloodstone'));
 assert.ok(!developmentAssessment([u('Slark',2)],[u('Ancient Apparition',5)]).evidence.some(e=>e.key==='healing'));
});
test('switch and incompatible patch remove numeric build influence but preserve evidence',()=>{
 const own=[u('Spectre',1),u('Windranger',2)],foe=[u('Earth Spirit',2),u('Legion Commander',3)];
 for(const options of [{enabled:false},{patch:'7.42'}]){const d=developmentAssessment(own,foe,options);assert.equal(d.score,0);assert.equal(d.active,false);assert.ok(d.evidence.length);assert.ok(d.evidence.every(x=>x.value===0));}
 const s=state();pick(s,'Silencer','dire',5);
 const m={patch:{name:'7.42'},heroStats:{},matchups:{},synergies:{}};
 assert.equal(evaluate(h('Leshrac'),2,'radiant',s,heroes,{},m).mechanicsDetail.itemPotential,0);
});
test('real candidate index changes with build context while empirical matchups remain unchanged',()=>{
 const s=state();pick(s,'Windranger','radiant',2);pick(s,'Earth Spirit','dire',2);pick(s,'Legion Commander','dire',3);
 const on=evaluate(h('Spectre'),1,'radiant',s,heroes,{}),off=evaluate(h('Spectre'),1,'radiant',{...s,potentialItems:false},heroes,{});
 assert.ok(on.development<0);assert.equal(off.development,0);assert.ok(on.score<off.score);assert.equal(on.counter,off.counter);assert.equal(on.meta,off.meta);
});
test('complete outlook counts the team plan once and keeps side symmetry',()=>{
 const s=state(),a=[['Spectre',1],['Windranger',2],['Night Stalker',3],['Bane',4],['Disruptor',5]],b=[['Luna',1],['Earth Spirit',2],['Legion Commander',3],['Dark Willow',4],['Lion',5]];
 for(const [side,rows] of [['radiant',a],['dire',b]])for(const[n,r]of rows)pick(s,n,side,r);
 const out=draftOutlook(s,heroes,{}),direct=developmentAssessment(a.map(([n,r])=>u(n,r)),b.map(([n,r])=>u(n,r)));
 assert.equal(out.radiantComponents.development,direct.score);assert.equal(out.explanation.teams.radiant.development.score,direct.score);
 const reversed={...s,history:s.history.map(x=>({...x,side:x.side==='radiant'?'dire':'radiant'}))};assert.equal(draftOutlook(reversed,heroes,{}).radiant,out.dire);
 const off=draftOutlook({...s,potentialItems:false},heroes,{});assert.equal(off.radiantComponents.development,0);assert.equal(off.direComponents.development,0);
});
