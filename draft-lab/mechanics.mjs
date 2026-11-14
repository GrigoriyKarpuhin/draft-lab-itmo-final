import {equipmentPlan} from './economy.mjs?v=20261023a';
// Audited against data/mechanics-reference.json (Valve, 7.41f). Bounded expert rules, not combat simulation.
export const ABILITY_COMBOS=[
 {heroes:['Faceless Void','Invoker'],spells:['Chronosphere','Sun Strike'],score:2.2,text:'Chronosphere удерживает цели для Sun Strike; Invoker должен остаться вне сферы.'},
 {heroes:['Faceless Void','Witch Doctor'],spells:['Chronosphere','Death Ward'],score:1.8,text:'Death Ward может наносить урон по удержанным целям; Witch Doctor ставит вард и поддерживает канал вне Chronosphere.'},
 {heroes:['Faceless Void','Snapfire'],spells:['Chronosphere','Mortimer Kisses'],score:1.8,text:'Chronosphere задаёт область для Mortimer Kisses; Snapfire нужен безопасный канал снаружи.'},
 {heroes:['Faceless Void','Phoenix'],spells:['Chronosphere','Supernova'],score:1.5,text:'Удержание врагов помогает защищать Supernova; не накрывать Phoenix во время подготовки, согласовать позицию и порядок ультимейтов.'},
 {heroes:['Dark Seer','Earthshaker'],spells:['Vacuum','Echo Slam'],score:2,text:'Vacuum собирает цели для Echo Slam; требуется согласованный вход и готовность обоих героев.'},
 {heroes:['Dark Seer','Sand King'],spells:['Vacuum','Epicenter'],score:1.8,text:'Vacuum помогает удержать несколько целей в области Epicenter; подготовить урон до короткого окна стяжки.'},
 {heroes:['Dark Seer','Enigma'],spells:['Vacuum','Black Hole'],score:1.8,text:'Vacuum может собрать несколько целей под Black Hole; заранее согласовать порядок применения.'},
 {heroes:['Magnus','Juggernaut'],spells:['Empower','Omnislash'],score:1.7,text:'Empower усиливает атаки Juggernaut; Reverse Polarity помогает подготовить бой. Это не гарантирует изолированный Omnislash.'},
 {heroes:['Mars','Phoenix'],spells:['Arena Of Blood','Supernova'],score:1.8,text:'Arena Of Blood помогает ограничить доступ к Supernova; расположение яйца и способы атаки соперника остаются важны.'},
 {heroes:['Mars','Snapfire'],spells:['Arena Of Blood','Mortimer Kisses'],score:1.8,text:'Arena Of Blood задаёт область для Mortimer Kisses; Snapfire нужна безопасная позиция для канала.'},
 {heroes:['Shadow Demon','Mirana'],spells:['Disruption','Sacred Arrow'],score:1.6,text:'Sacred Arrow рассчитывается к выходу врага из Disruption; пока цель изгнана, она неуязвима.'},
 {heroes:['Bane','Mirana'],spells:['Nightmare','Sacred Arrow'],score:1.5,text:'Nightmare с удержанием на месте готовит Sacred Arrow; учесть первую секунду неуязвимости и возможность движения спящей цели.'},
 {heroes:['Naga Siren','Enigma'],spells:['Song of the Siren','Black Hole'],score:1.5,text:'Song of the Siren → согласованная отмена сна → Black Hole. Во время Song цели неуязвимы, наносить урон в спящих целей нельзя.'},
 {heroes:['Naga Siren','Sand King'],spells:['Song of the Siren','Epicenter'],score:1.5,text:'Подготовить Epicenter во время Song of the Siren и согласовать отмену сна: до неё цели неуязвимы.'},
 {heroes:['Grimstroke','Lich'],spells:['Soulbind','Chain Frost'],score:1.5,text:'Soulbind создаёт возможность повторного применения целевого Chain Frost; важны дистанция связанных целей и возможные другие отскоки.'},
 {heroes:['Oracle','Huskar'],spells:['False Promise','Life Break'],score:1.7,healing:true,text:'False Promise даёт Huskar окно отложенного урона и усиленного лечения; Ice Blast и Doom могут сорвать лечебную часть плана.'},
];
const spellReliant=new Set(['Storm Spirit','Earth Spirit','Sand King','Pangolier','Puck','Queen of Pain','Invoker','Enigma','Witch Doctor','Crystal Maiden','Ember Spirit','Void Spirit','Leshrac','Tinker']);
const healing=new Set(['Huskar','Alchemist','Necrophos','Oracle','Abaddon','Dazzle','Winter Wyvern']);
const strongSaves={Oracle:'False Promise',Abaddon:'Aphotic Shield','Legion Commander':'Press The Attack'};
const hideSaves={'Shadow Demon':'Disruption','Outworld Devourer':'Astral Imprisonment',Tusk:'Snowball'};
export const SPELL_THREATS=[
 {hero:'Silencer',ability:'Global Silence',kind:'basicSilence',global:true,weight:1.3},
 {hero:'Skywrath Mage',ability:'Ancient Seal',kind:'basicSilence',targeted:true,weight:1.1},
 {hero:'Riki',ability:'Smoke Screen',kind:'silenceField',weight:1.1},
 {hero:'Bane',ability:"Fiend's Grip",kind:'strongDisable',pierces:true,targeted:true,weight:1.3},
 {hero:'Batrider',ability:'Flaming Lasso',kind:'strongDisable',pierces:true,targeted:true,weight:1.3},
 {hero:'Axe',ability:"Berserker's Call",kind:'strongDisable',pierces:true,weight:1.1},
 {hero:'Doom',ability:'Doom',kind:'undispellable',pierces:true,targeted:true,weight:1.6},
 {hero:'Legion Commander',ability:'Duel',kind:'undispellable',pierces:true,targeted:true,weight:1.3},
 {hero:'Faceless Void',ability:'Chronosphere',kind:'field',pierces:true,weight:1.3},
 {hero:'Enigma',ability:'Black Hole',kind:'field',pierces:true,weight:1.3},
 {hero:'Ancient Apparition',ability:'Ice Blast',kind:'healBlock',pierces:true,weight:1.5},
 {hero:'Skywrath Mage',ability:'Mystic Flare',kind:'magicBurst',weight:0.8},
 {hero:'Juggernaut',ability:'Omnislash',kind:'physicalBurst',weight:0.7},
];
export function mechanicalAssessment(hero,role,allies,enemies,{potentialItems=true,buildEvidence=true}={}){
 const all=[{hero,role},...allies],ownNames=new Set(all.map(x=>x.hero.localized_name)),enemyNames=new Set(enemies.map(x=>x.hero.localized_name));
 const combos=ABILITY_COMBOS.filter(c=>c.heroes.includes(hero.localized_name)&&c.heroes.every(n=>ownNames.has(n))).map(c=>{
  let scale=1;const caveats=[];
  if(c.healing&&(enemyNames.has('Ancient Apparition')||enemyNames.has('Doom'))){scale*=0.35;caveats.push('Бонус лечебной связки снижен из-за запрета лечения.');}
  if(c.spells.some(x=>['Black Hole','Death Ward','Mortimer Kisses'].includes(x))&&enemyNames.has('Silencer')){scale*=0.7;caveats.push('Global Silence может прервать канал; уже активный BKB не предотвращает этот сайленс.');}
  if(c.spells.includes('Black Hole')&&enemyNames.has('Bane')){scale*=0.75;caveats.push('Bane вне Black Hole может прервать канал через Fiend’s Grip даже под BKB.');}
  if(c.spells.includes('Nightmare')&&enemies.some(x=>strongSaves[x.hero.localized_name])){scale*=0.7;caveats.push('У соперника есть союзный сильный диспел: подготовку через Nightmare могут снять.');}
  return {...c,score:c.score*scale,caveats};
 });
 const interactions=combos.map(c=>`${c.spells.join(' + ')}: ${c.text} ${c.caveats.join(' ')}`.trim());
 let conflict=0;
 if(ownNames.has('Faceless Void')&&all.filter(x=>x.hero.localized_name!=='Faceless Void'&&x.hero.attack_type==='Melee').length>=2){conflict=-0.6;interactions.push('Chronosphere останавливает и союзников: несколько героев ближнего боя должны ждать окончания сферы или входить до неё.');}
 const plan=equipmentPlan(all,enemies,SPELL_THREATS.filter(t=>enemyNames.has(t.hero)),{potentialItems,buildEvidence});
 const threats=[],saves=[],items=plan.items.filter(x=>x.target===hero.localized_name),limits=[...plan.limits];let rawRisk=0,allySave=0,itemPotential=items.reduce((sum,x)=>sum+x.credit,0);
 if(ownNames.has('Winter Wyvern')&&['Lina','Leshrac','Invoker','Skywrath Mage'].some(n=>enemyNames.has(n)))limits.push('Cold Embrace блокирует физический урон, но не магический или чистый: не обездвиживать союзника под готовый урон заклинаниями.');
 for(const t of SPELL_THREATS){
  if(!enemyNames.has(t.hero))continue;
  const silenceScale=['basicSilence','silenceField'].includes(t.kind)&&role<4&&!spellReliant.has(hero.localized_name)?0.55:1;
  if(t.kind==='healBlock'&&!healing.has(hero.localized_name)&&!allies.some(x=>healing.has(x.hero.localized_name)))continue;
  const weight=t.weight*silenceScale*(role>=4&&['field','undispellable','strongDisable'].includes(t.kind)?0.7:1);
  rawRisk+=weight;threats.push({...t,weight,target:hero.localized_name});
  let save=0;
  const strong=allies.find(x=>strongSaves[x.hero.localized_name]);
  if(strong&&['strongDisable','basicSilence'].includes(t.kind)&&!t.global){save=weight*0.45;saves.push({owner:strong.hero.localized_name,ability:strongSaves[strong.hero.localized_name],against:t.ability,target:hero.localized_name,text:'Сильный диспел может снять этот контроль, если союзник свободен, в радиусе и способность готова.'});}
  if(t.global&&strong)limits.push(`${strong.hero.localized_name} тоже может попасть под Global Silence: его сейв не считается готовым ответом без собственного снятия сайленса.`);
  const hide=allies.find(x=>hideSaves[x.hero.localized_name]);
  if(hide&&t.kind==='magicBurst'){save=Math.max(save,weight*0.35);saves.push({owner:hide.hero.localized_name,ability:hideSaves[hide.hero.localized_name],against:t.ability,target:hero.localized_name,text:'Временное укрытие может переждать часть урона; требуется доступ к союзнику и правильный момент, это не диспел.'});}
  if(t.kind==='physicalBurst'&&allies.some(x=>x.hero.localized_name==='Winter Wyvern')){save=Math.max(save,weight*0.4);saves.push({owner:'Winter Wyvern',ability:'Cold Embrace',against:t.ability,target:hero.localized_name,text:'Блокирует физический урон, но обездвиживает союзника и не защищает от магического урона.'});}
  if(save>0&&enemyNames.has('Silencer')){save*=0.5;for(const x of saves.filter(x=>x.against===t.ability&&x.target===hero.localized_name))x.text+=' Вклад снижен: Global Silence может выключить самого сейвящего героя.';}
  // Share one available save across possible recipients; no five simultaneous casts.
  allySave+=save/Math.max(1,all.length-1);
  if(t.pierces&&t.kind!=='basicSilence')limits.push(`${t.ability} проходит сквозь debuff immunity: BKB не считается снятием этой угрозы.`);
  if(t.kind==='field')limits.push(`Force Staff не работает по цели внутри ${t.ability}; basic/strong dispel не освобождает от этой области.`);
  if(t.kind==='undispellable'||t.kind==='healBlock')limits.push(`${t.ability} не снимается обычным или сильным диспелом; Manta, Lotus и союзный strong dispel не считаются его очисткой.`);
  if(t.kind==='healBlock')limits.push('Под Ice Blast нельзя рассчитывать на обычное лечение; False Promise не снимает Ice Blast.');
 }
 const scale=rawRisk>3.5?3.5/rawRisk:1;
 const spellRisk=-rawRisk*scale;allySave*=scale;itemPotential=Math.min(0.25,itemPotential*scale);
 const score=spellRisk+allySave+itemPotential+conflict;
 return {score,combo:Math.min(4,combos.reduce((s,c)=>s+c.score,0)),spellRisk,allySave,itemPotential,conflict,interactions,threats,saves,items,resources:plan.resources,limits:[...new Set(limits)],potentialItems};
}
