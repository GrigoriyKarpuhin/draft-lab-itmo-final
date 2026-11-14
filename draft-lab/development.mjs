import {buildProfile} from './economy.mjs?v=20261023a';
import {BUILD_REFERENCE} from './builds.mjs?v=20261023a';

// These are bounded expert weights on observed item plans, not gold forecasts or
// learned win probabilities. Marginal purchase frequencies do not prove a joint build.
const farmInvestment=new Map([['Battle Fury',1],['Radiance',1],['Maelstrom',.55],['Mask of Madness',.35],['Hand of Midas',.7]]);
const enablingItems=new Set(['Blink Dagger','Diffusal Blade','Witch Blade','Spirit Vessel','Orchid Malevolence','Rod of Atos','Meteor Hammer','Helm of the Dominator','Drum of Endurance','Desolator']);
const selfDispels=new Set(['Black King Bar','Manta Style','Eul’s Scepter']);
const healingItems=new Set(['Bloodstone','Satanic']);
const cache=new Map();
export function buildTimeline(hero,role){
 const key=hero.localized_name+':'+role;if(cache.has(key))return cache.get(key);
 const profile=buildProfile(hero,role),common=profile?.items.filter(i=>i.purchase>=.5)||[];
 const earliest=list=>[...list].sort((a,b)=>a.minute-b.minute||a.item.localeCompare(b.item))[0]||null;
 const farm=role<=3?earliest(common.filter(i=>farmInvestment.has(i.item))):null;
 const enable=earliest(common.filter(i=>enablingItems.has(i.item)));
 const dispel=earliest(common.filter(i=>selfDispels.has(i.item)));
 const healing=profile?.items.filter(i=>healingItems.has(i.item)&&i.purchase>=.3)||[];
 const sampleWeight=profile?profile.matches/(profile.matches+500):0;
 const timeline={hero:hero.localized_name,role,known:!!profile,profile,farm,enable,dispel,healing,sampleWeight,
  farmLoad:farm?farmInvestment.get(farm.item)*Math.max(.15,Math.min(1,(farm.minute-8)/12)):0};
 cache.set(key,timeline);return timeline;
}

export function buildEvidenceActive(patch){
 return !patch||!/^\d+\.\d+/.test(patch)||patch===BUILD_REFERENCE.pagePatch;
}

export function developmentAssessment(team,enemies,{enabled=true,patch=null}={}){
 const own=[...team].sort((a,b)=>a.role-b.role||a.hero.id-b.hero.id).map(x=>buildTimeline(x.hero,x.role));
 const foe=[...enemies].sort((a,b)=>a.role-b.role||a.hero.id-b.hero.id).map(x=>buildTimeline(x.hero,x.role));
 const active=enabled&&buildEvidenceActive(patch),evidence=[],notes=[];
 const investors=own.filter(x=>x.farmLoad>0);
 const early=(units,rows)=>rows.filter(x=>x.role<=3&&!x.farm&&x.enable&&x.enable.minute<=15&&units.some(u=>u.hero.localized_name===x.hero&&u.hero.roles.some(r=>['Disabler','Initiator'].includes(r))));
 const ownEarly=early(team,own),enemyEarly=early(enemies,foe);
 const add=(key,label,value,text,rows)=>evidence.push({key,label,value:active?value:0,text,sources:rows.filter(x=>x.profile).map(x=>({hero:x.hero,role:x.role,url:x.profile.source,matches:x.profile.matches}))});
 if(investors.length>=2){
  let overlap=0;for(let i=0;i<investors.length;i++)for(let j=i+1;j<investors.length;j++)overlap+=Math.min(investors[i].farmLoad,investors[j].farmLoad)*Math.min(investors[i].sampleWeight,investors[j].sampleWeight);
  add('overlap','Конкуренция за разгон фарма',-Math.min(1.3,.6*overlap),`У ${investors.map(x=>`${x.hero}: ${x.farm.item} ≈${x.farm.minute} мин`).join('; ')} в примерах есть частая покупка для разгона фарма. Придётся делить волны и лагеря; средняя минута не запрещает драться раньше.`,investors);
 }
 if(investors.length&&ownEarly.length){
  const weight=Math.min(...[...investors,...ownEarly].map(x=>x.sampleWeight));
  add('space','Ранний предметный план рядом с фармящим кором',Math.min(.4,.2*ownEarly.length)*weight,`${ownEarly.map(x=>`${x.hero}: ${x.enable.item} ≈${x.enable.minute} мин`).join('; ')} дают возможный план активных действий, пока ${investors.map(x=>x.hero).join(', ')} развиваются. Наличие контроля и предмета не гарантирует захват пространства.`,[...investors,...ownEarly]);
 }
 if(investors.length&&enemyEarly.length>=2){
  const load=investors.reduce((s,x)=>s+x.farmLoad,0),weight=Math.min(...[...investors,...enemyEarly].map(x=>x.sampleWeight));
  add('pressure','Давление на предметный разгон',-Math.min(1,.5*load)*weight,`У соперника ранние примеры входа / контроля: ${enemyEarly.map(x=>`${x.hero}: ${x.enable.item} ≈${x.enable.minute} мин`).join('; ')}. Это риск для безопасного фарма ${investors.map(x=>x.hero).join(', ')}, если линии и территория будут потеряны.`,[...investors,...enemyEarly]);
 }
 if(enemies.some(x=>x.hero.localized_name==='Ancient Apparition')){
  const reliant=own.filter(x=>x.healing.length);
  if(reliant.length){
   const risk=reliant.reduce((s,x)=>s+Math.max(...x.healing.map(i=>i.purchase*Math.min(1,20/i.minute)))*.4*x.sampleWeight,0);
   add('healing','Риск лечебной ветки',-Math.min(.6,risk),`В билдах ${reliant.map(x=>`${x.hero}: ${x.healing.map(i=>i.item).join(' / ')}`).join('; ')} встречается ставка на лечение. Ice Blast может сорвать эту часть плана; предмет не считается уже купленным, а эффект — гарантированным.`,reliant);
  }
 }
 const known=own.filter(x=>x.known).length,enemyKnown=foe.filter(x=>x.known).length;
 notes.push(`Проверенные билды: ${known}/${own.length} выбранных героев; у соперника ${enemyKnown}/${foe.length}. Неизвестная сборка не считается слабой или безопасной и не получает выдуманного предметного плана.`);
 if(!active)notes.push(enabled?'Патч статистики отличается от снимка билдов: числовой вклад билдов отключён.':'Вклад билдов и предметных планов отключён; наблюдения оставлены для просмотра.');
 notes.push('Минуты — средние в примере роли, а не прогноз этой игры. Частоты отдельных покупок не доказывают одновременный инвентарь. Винрейт предметов не прибавляется к шансу победы.');
 return {score:active?Math.max(-3,Math.min(.5,evidence.reduce((s,x)=>s+x.value,0))):0,active,known,total:own.length,enemyKnown,enemyTotal:foe.length,evidence,notes,
  timelines:own.map(x=>({hero:x.hero,role:x.role,known:x.known,source:x.profile?.source||null,matches:x.profile?.matches||0,farm:x.farm,enable:x.enable,dispel:x.dispel}))};
}

// Picks are judged by the change they make, rather than blamed for a pre-existing
// problem. Final team outlook uses the absolute team value once (see engine.mjs).
export function candidateDevelopment(hero,role,allies,enemies,options={}){
 const after=developmentAssessment([{hero,role},...allies],enemies,options);
 const before=developmentAssessment(allies,enemies,options);
 return {...after,score:after.score-before.score,teamScore:after.score};
}
