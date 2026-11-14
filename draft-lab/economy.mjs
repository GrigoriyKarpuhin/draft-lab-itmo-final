import {BUILD_REFERENCE} from './builds.mjs?v=20261023a';

const profiles=new Map(BUILD_REFERENCE.profiles.map(p=>[p.hero+':'+p.role,p]));
export const buildProfile=(hero,role)=>profiles.get(hero.localized_name+':'+role);
const farmHeavy=new Set(['Anti-Mage','Medusa','Naga Siren','Terrorblade','Phantom Lancer','Alchemist','Arc Warden','Tinker','Meepo','Spectre']);
export const resourceDemand=(hero,role)=>role>=4?0.15:farmHeavy.has(hero.localized_name)?2.2:role===1?1.7:role===2?1.2:0.8;
export function resourceAssessment(team){
 const rows=[...team].sort((a,b)=>a.role-b.role).map(({hero,role})=>{
  const p=buildProfile(hero,role);
  const focus=role===1?'Приоритет безопасного фарма до ключевой покупки.':role===2?'Волны, уровни и свой первый боевой предмет; затем согласовать переход к давлению.':role===3?'Ресурсы до предмета входа / ауры, затем отвоёвывать карту.':'Опыт, обзор, расходники и свободные волны; дорогой личный сейв не считается доступным заранее.';
  return {hero:hero.localized_name,role,verified:!!p,path:p?.path||'Проверенного билда на эту позицию в локальном справочнике пока нет.',focus:p?.focus||focus,source:p?.source||null,matches:p?.matches||0};
 });
 const heavy=team.filter(x=>resourceDemand(x.hero,x.role)>1.5);
 const notes=['Золото принадлежит отдельным игрокам: доход Carry нельзя потратить на предмет саппорта. Позиции задают исходный приоритет фарма; его можно временно менять ради важного Blink или сейва.',
 'Волны и лагеря нужно делить по маршрутам. Давление на башни и вражескую часть карты открывает дополнительный доступ к фарму; проигранные драки и потеря обзора его сокращают. Стаки полезны, только если их можно безопасно забрать подходящим героем.',
 'Саппорты получают ресурсы через участие в игре, стаки и свободные волны, но тратятся на обзор, обнаружение, Smoke и перемещения. Им не приписывается доход кора.'];
 if(heavy.length>=2)notes.push(`За безопасные ресурсы могут конкурировать ${heavy.map(x=>x.hero.localized_name).join(', ')}. Развести маршруты и окна фарма; защитная покупка сверх основы задержит боевое усиление.`);
 return {rows,notes,checkedAt:BUILD_REFERENCE.checkedAt,patch:BUILD_REFERENCE.pagePatch,count:BUILD_REFERENCE.profiles.length};
}

// Explicit examples, checked against Valve descriptions. Not every unit-targeted spell
// is a breaker (exceptions/upgrades exist). Unknown spells are not treated as absent.
export const SPELL_BLOCK_BREAKERS={
 Bane:['Enfeeble','Brain Sap','Nightmare'],Disruptor:['Thunder Strike','Glimpse'],
 Grimstroke:["Phantom's Embrace"], 'Dark Willow':['Cursed Crown'],
 'Phantom Lancer':['Spirit Lance'], Windranger:['Shackleshot'],
 Leshrac:['Lightning Storm'],'Night Stalker':['Void'],Lion:['Hex'],
 'Skywrath Mage':['Ancient Seal'],'Outworld Devourer':['Astral Imprisonment'],
};
export function spellBlockBreakers(enemies,against){
 return enemies.flatMap(x=>(SPELL_BLOCK_BREAKERS[x.hero.localized_name]||[]).filter(a=>a!==against).map(ability=>({hero:x.hero.localized_name,ability})));
}

// One next defensive branch, shared by every hero evaluation. This is a conservative
// scenario, not a game restriction on how many items a team may buy. No invented GPM
// or pooled gold budget. A purchase protects one target in the model, once.
export function equipmentPlan(team,enemies,threats,{potentialItems=true,buildEvidence=true}={}){
 const options=[],limits=[],ordered=[...team].sort((a,b)=>a.role-b.role||a.hero.id-b.hero.id);
 for(const t of threats){
  const breakers=spellBlockBreakers(enemies,t.ability);
  if(t.targeted){
   limits.push(`Linken’s Sphere стоит 4 800: не включается в базовый план позиций 4–5 и откладывает основные предметы кора. Это ограничение сценария, а не запрет покупки.`);
   if(breakers.length)limits.push(`Перед ${t.ability} Linken могут сбить: ${breakers.slice(0,5).map(x=>`${x.hero} — ${x.ability}`).join('; ')}. Нужны доступ к цели и готовый спелл; перечень неполный, неизвестные способности не считаются безопасными.`);
  }
  const add=(u,target,item,cost,fraction,condition)=>{
   const p=buildProfile(u.hero,u.role),observed=p?.items.find(i=>i.item===item);
   // Unresearched build branches are explanatory alternatives, with no numeric credit.
   const availability=observed?observed.purchase*Math.min(1,20/Math.max(1,observed.minute))*p.matches/(p.matches+200):0;
   const credit=potentialItems&&buildEvidence?Math.min(.25,t.weight*fraction*availability):0;
   const path=p?`Частые покупки роли (не обязательный совместный инвентарь): ${p.path}. Выборка билда n=${p.matches}.`:'Билд на этой позиции не проверен; числовой бонус не начисляется.';
   const timing=observed?`В примере D2PT: в среднем ${observed.minute} мин${observed.purchaseKind==='lower-bound'?', CORE (≥50%)':`, ${Math.round(observed.purchase*1000)/10}% покупок`}; это не прогноз этой игры.`:'';
   const opportunity=u.role>=4?'Конкурирует с обзором, расходниками и первой полезной командной покупкой.':'Если купить раньше основы, задержит фарм / урон / вход в бой; если позже — не защитит в раннем окне.';
   options.push({owner:u.hero.localized_name,ownerRole:u.role,target:target.hero.localized_name,item,cost,against:t.ability,enemy:t.hero,condition:`${condition} ${path} ${timing} ${opportunity}`,credit,priority:t.weight*fraction*(availability||.015)*(target.role<=2?1.2:1),source:p?.source||null,observed:!!observed});
  };
  for(const u of ordered){
   const p=buildProfile(u.hero,u.role),has=item=>p?.items.some(i=>i.item===item);
   if(t.kind==='basicSilence'){
    if(u.role<=3||has('Black King Bar'))add(u,u,'Black King Bar',4050,.22,t.global?'Активировать после Global Silence для basic dispel. Global Silence действует и по уже активному BKB.':'Снимает basic-dispellable сайленс; нужен готовый предмет.');
    if(has('Manta Style'))add(u,u,'Manta Style',4650,.28,'Basic dispel снимает этот сайленс; Manta не снимает стан или неснимаемый эффект.');
    if(has('Eul’s Scepter'))add(u,u,'Eul’s Scepter',2600,.18,'Самоциклон даёт basic dispel, но выключает героя из боя; Eul нельзя применить к союзнику.');
    if(!t.global&&u.role===3&&has('Lotus Orb'))add(u,ordered[0],'Lotus Orb',3850,.12,'Basic dispel может снять сайленс с одного союзника; отражение не блокирует исходное заклинание. Это поздняя покупка поверх первого предметного плана.');
   }
   if(t.targeted&&u.role<=2&&has('Linken’s Sphere')&&breakers.length<2)add(u,u,'Linken’s Sphere',4800,breakers.length?.025:.08,'Нужен до вражеского каста. Блокирует один целевой спелл, не весь контроль. Редкая поздняя развилка, а не обязательная покупка; без подтверждения доступа противника к цели эффективность неизвестна.');
   if(t.kind==='silenceField'&&(u.role>=3||has('Force Staff'))){const target=ordered[0];add(u,target,'Force Staff',2200,.18,'Может вывести одного союзника из Smoke Screen по направлению взгляда; нужен доступ к цели. Не освобождает из Duel, Chronosphere или Black Hole.');}
   if(t.kind==='magicBurst'&&u.role>=4){const target=ordered[0];add(u,target,'Glimmer Cape',2150,.18,'Магический барьер на одну цель; не очищает контроль, невидимость не гарантирует спасения.');}
  }
 }
 options.sort((a,b)=>b.priority-a.priority||a.cost-b.cost||a.ownerRole-b.ownerRole||a.owner.localeCompare(b.owner));
 return {items:options.slice(0,1),limits:[...new Set(limits)],resources:resourceAssessment(team),potentialItems};
}
