import {candidateDevelopment,developmentAssessment,buildEvidenceActive} from './development.mjs?v=20261023a';
import {resourceDemand} from './economy.mjs?v=20261023a';
import {ABILITY_COMBOS,mechanicalAssessment} from './mechanics.mjs?v=20261023a';
export const ROLES=['Carry','Mid','Offlane','Support','Hard support'];
const groups=[
[1,'Anti-Mage,Juggernaut,Phantom Assassin,Phantom Lancer,Medusa,Slark,Spectre,Terrorblade,Luna,Drow Ranger,Ursa,Lifestealer,Faceless Void,Naga Siren,Morphling,Troll Warlord,Sven,Monkey King,Muerta,Kez,Alchemist,Chaos Knight,Clinkz,Riki,Weaver,Wraith King,Gyrocopter,Bloodseeker'],
[2,"Invoker,Storm Spirit,Ember Spirit,Void Spirit,Queen of Pain,Puck,Templar Assassin,Shadow Fiend,Zeus,Tinker,Outworld Destroyer,Outworld Devourer,Sniper,Meepo,Huskar,Lina,Leshrac,Death Prophet,Dragon Knight,Viper,Arc Warden,Kunkka,Tiny,Nature's Prophet,Magnus"],
[3,'Axe,Centaur Warrunner,Tidehunter,Mars,Underlord,Slardar,Bristleback,Legion Commander,Night Stalker,Timbersaw,Dark Seer,Beastmaster,Brewmaster,Primal Beast,Pangolier,Dawnbreaker,Dragon Knight,Sand King,Enigma,Razor,Visage,Lycan,Lone Druid,Broodmother,Necrophos,Wraith King,Doom,Kunkka,Batrider,Magnus,Elder Titan,Omniknight,Abaddon'],
[4,'Earthshaker,Earth Spirit,Spirit Breaker,Tusk,Clockwerk,Nyx Assassin,Bounty Hunter,Hoodwink,Dark Willow,Rubick,Mirana,Techies,Pudge,Marci,Windranger,Phoenix,Tiny,Invoker,Lion,Shadow Shaman,Lina,Muerta,Ringmaster,Ring Master,Skywrath Mage,Snapfire,Pugna,Venomancer'],
[5,'Crystal Maiden,Lich,Disruptor,Oracle,Dazzle,Shadow Demon,Winter Wyvern,Warlock,Witch Doctor,Jakiro,Ancient Apparition,Chen,Enchantress,Io,Ogre Magi,Silencer,Undying,Treant Protector,Bane,Lion,Shadow Shaman,Vengeful Spirit,Abaddon,Grimstroke,Keeper of the Light,Venomancer,Pugna,Snapfire,Ringmaster,Ring Master,Omniknight,Largo,Elder Titan']];
export function positions(h,state=null){
 let p;
 if(affinities[h.localized_name])p=Object.keys(affinities[h.localized_name]).map(Number).filter(r=>affinities[h.localized_name][r]>=0.55);
 else {p=groups.filter(([,s])=>s.split(',').includes(h.localized_name)).map(([p])=>p);if(!p.length)p=h.roles.includes('Support')?[4,5]:h.roles.includes('Carry')?[1,2]:[3,4];}
 return [...new Set([...p,...[1,2,3,4,5].filter(r=>state?.roleOverrides?.[`${h.id}:${r}`]===true)])].sort((a,b)=>a-b);
}
const combos=ABILITY_COMBOS.map(c=>c.heroes);
const counterPairs=[['Anti-Mage','Medusa'],['Axe','Phantom Lancer'],['Earthshaker','Meepo'],['Ancient Apparition','Huskar'],['Ancient Apparition','Alchemist'],['Silencer','Enigma'],['Nyx Assassin','Medusa'],['Slark','Bristleback'],['Oracle','Batrider']];

export const RULES_VERSION = 'cm-7.40-v2';
export function sequence(mode, first = 'radiant') {
  const second = first === 'radiant' ? 'dire' : 'radiant';
  const phase = (type, sides, number) => sides.map(x => ({type, side: x === 0 ? first : second, phase: number}));
  if (mode === 'free') return [];
  if (mode === 'cd') return [
    ...phase('ban', [0,1,0,1,0,1], 1),
    ...phase('pick', [0,1,1,0,0,1,1,0,0,1], 1),
  ];
  // Valve 7.34 pick phases, with the first/third ban phases changed in 7.40.
  return [
    ...phase('ban', [0,0,1,1,0,1,1], 1),
    ...phase('pick', [0,1], 1),
    ...phase('ban', [0,0,1], 2),
    ...phase('pick', [1,0,0,1,1,0], 2),
    ...phase('ban', [0,1,0,1], 3),
    ...phase('pick', [0,1], 3),
  ];
}

export function migrateDraft(saved) {
  if (!saved || !['cm','cd','free'].includes(saved.mode) ||
      !['radiant','dire'].includes(saved.first) || !Array.isArray(saved.history) || !Array.isArray(saved.pool)) return null;
  const expected = sequence(saved.mode, saved.first);
  const incompatible = saved.mode !== 'free' && saved.history.some((x,i) =>
    !expected[i] || expected[i].side !== x.side || expected[i].type !== x.type);
  return {...saved, rulesVersion: RULES_VERSION, ...(incompatible ? {
    mode: 'free',
    migrationNotice: 'Сохранённый драфт использовал старую очередность. Все пики, баны и роли сохранены; продолжение доступно в свободном режиме. Новый драфт использует исправленные правила 7.40.',
  } : {})};
}

export function apply(state, hero, role, action) {
  if (!['radiant','dire'].includes(action.side) || !['pick','ban'].includes(action.type)) throw Error('Неизвестный ход');
  if (state.mode !== 'free') {
    const expected = sequence(state.mode, state.first)[state.history.length];
    if (!expected) throw Error('Драфт завершён');
    if (expected.side !== action.side || expected.type !== action.type) throw Error('Нарушена очередь ходов');
  }
  if (state.history.some(x => x.id === hero.id)) throw Error('Этот герой уже выбран или забанен');
  if (state.mode === 'cd' && state.pool.length < 16) throw Error('Сначала задайте пул: минимум 16 героев');
  if (state.pool.length && !state.pool.includes(hero.id)) throw Error('Герой вне пула');
  if (state.mode === 'cm' && hero.cm_enabled === false) throw Error('Герой недоступен в Captains Mode');
  if (action.type === 'pick') {
    const picks = state.history.filter(x => x.type === 'pick' && x.side === action.side);
    if (picks.length >= 5) throw Error('У этой команды уже пять героев');
    if (![1,2,3,4,5].includes(role) || picks.some(x => x.role === role)) throw Error('Выберите свободную позицию');
  }
  return {...state, rulesVersion: RULES_VERSION, history: [...state.history, {...action, id: hero.id, role: action.type === 'pick' ? role : null}]};
}

const affinities = {
  'Earth Spirit':{2:1,3:0.7,4:1},'Sand King':{2:1,3:1},'Pangolier':{2:1,3:1},
  'Slark':{1:1,2:1},'Undying':{4:1,5:1},'Phoenix':{4:1,5:0.85},
  'Shadow Fiend':{1:1,2:1},'Bane':{4:0.85,5:1},'Necrophos':{2:0.9,3:1},
  'Primal Beast':{2:0.9,3:1},'Timbersaw':{2:0.85,3:1},'Snapfire':{2:0.85,4:1,5:0.85},
  'Keeper of the Light':{2:0.85,4:0.8,5:1},'Razor':{1:0.75,2:0.85,3:1},

  'Wraith King': {1:1, 3:0.3}, 'Lina': {1:0.8, 2:1, 4:0.3},
  'Invoker': {2:1, 4:0.4}, 'Muerta': {1:1, 4:0.55},
  'Kunkka': {2:0.9, 3:1}, 'Tiny': {2:0.9, 3:0.65, 4:0.85},
  'Abaddon': {1:0.65, 3:0.75, 5:1}, 'Elder Titan': {3:0.65, 4:1, 5:0.85},
  'Windranger': {1:0.7, 2:0.85, 3:0.65, 4:0.85},
  'Earthshaker': {2:0.75, 3:0.8, 4:1}, 'Batrider': {2:0.75, 3:0.85, 4:0.8},
  'Lone Druid': {1:1, 2:0.75, 3:0.65}, 'Pugna': {2:0.85, 4:0.8, 5:0.85},
  'Marci': {1:0.65, 3:0.6, 4:1}, 'Nature\'s Prophet': {1:0.85, 2:0.7, 3:0.8, 4:0.65, 5:0.6},
  'Ring Master': {4:0.9, 5:1}, 'Clockwerk': {3:0.7, 4:1, 5:0.7},
};
export function roleAffinity(hero, role, state=null) {
  if(state?.roleOverrides?.[`${hero.id}:${role}`]===true)return 1;
  if (affinities[hero.localized_name]) return affinities[hero.localized_name][role] || 0;
  return positions(hero).includes(role) ? 1 : 0;
}
export function availableRoles(state, side) {
  const taken = new Set(state.history.filter(x => x.type === 'pick' && x.side === side).map(x => x.role));
  return [1,2,3,4,5].filter(x => !taken.has(x));
}
const opposite = side => side === 'radiant' ? 'dire' : 'radiant';
export const laneOpponents = role => ({1:[3,4], 2:[2], 3:[1,5], 4:[1,5], 5:[3,4]})[role] || [];
export function lanePriority(role, side, state) {
  const rivals = state.history.filter(x => x.type === 'pick' && x.side !== side && laneOpponents(role).includes(x.role));
  if (!rivals.length) return 0;
  return role === 2 ? 3 : [1,3].includes(role) ? 2 : 1;
}

function context(heroes, matchups, metaData=null) {
  const byId = new Map(heroes.map(h => [h.id,h]));
  const rows = new Map();
  // A patch-specific sample is never silently mixed with the unfiltered legacy cache.
  const dataset = metaData ? metaData.matchups || {} : matchups;
  for (const [id,matches] of Object.entries(dataset)) for (const row of matches) rows.set(`${id}:${row.hero_id}`,row);
  return {byId,rows,meta:metaData};
}
export function heroStatistics(hero, metaData=null) {
  if (metaData) {
    const row=metaData.heroStats?.[hero.id], n=row?.games||0, wins=row?.wins||0;
    return {n,wins,wr:100*(wins+100)/(n+200),rawWr:n?100*wins/n:null,
      source:'patch',patch:metaData.patch?.name||'не загружен'};
  }
  const n=hero['7_pick']||hero.pub_pick||0;
  const wins=hero['7_pick']?hero['7_win']:hero.pub_win||0;
  return {n,wins,wr:100*(wins+100)/(n+200),rawWr:n?100*wins/n:null,source:'legacy',patch:null};
}
const base=(hero,ctx)=>heroStatistics(hero,ctx?.meta);
function pairEffect(hero, enemy, ctx) {
  const row = ctx.rows.get(`${hero.id}:${enemy.id}`);
  const reverse = ctx.rows.get(`${enemy.id}:${hero.id}`);
  const m = row || reverse;
  if (m && m.games_played > 0) {
    const observed = 100 * (row ? m.wins : m.games_played-m.wins) / m.games_played;
    const expected = 50 + (base(hero,ctx).wr - base(enemy,ctx).wr) / 2;
    return {effect: Math.max(-5, Math.min(5, observed-expected)) * m.games_played/(m.games_played+100),
      observed, n: m.games_played, empirical: true};
  }
  const positive = counterPairs.some(([a,b]) => a === hero.localized_name && b === enemy.localized_name);
  const negative = counterPairs.some(([a,b]) => b === hero.localized_name && a === enemy.localized_name);
  return {effect: positive ? 2 : negative ? -2 : 0, n:0, empirical:false};
}
const farmNeed = resourceDemand;

export function evaluate(hero, role, side, state, heroes, matchups = {}, ctx = context(heroes,matchups)) {
  if(ctx && !ctx.byId)ctx=context(heroes,matchups,ctx);
  const picks = state.history.filter(x => x.type === 'pick');
  const allies = picks.filter(x => x.side === side);
  const enemies = picks.filter(x => x.side !== side);
  const stats=base(hero,ctx);
  const {n,wr,rawWr}=stats;
  const meta = (wr-50)*1.15;
  let synergy=0, synergyStats=0, synergySamples=0, counter=0, lane=0, coreDuel=0, composition=0, risk=0, samples=0;
  const reasons=[], laneReasons=[], priorityReasons=[], matchupsDetail=[];
  if(ctx.meta)reasons.push(n?`Мета ${stats.patch}: ${rawWr.toFixed(1)}% · ${n} матчей`:`Мета ${stats.patch}: нет матчей героя, базовая оценка 50%`);
  for (const entry of allies) {
    const ally = ctx.byId.get(entry.id);
    const key=[hero.id,ally.id].sort((a,b)=>a-b).join(':');
    const pair=ctx.meta?.synergies?.[key];
    if(pair?.games>0){
      const observed=100*pair.wins/pair.games;
      const expected=(wr+base(ally,ctx).wr)/2;
      const effect=Math.max(-5,Math.min(5,observed-expected))*pair.games/(pair.games+150)*0.7;
      synergyStats+=effect;synergySamples+=pair.games;
      reasons.push(`Вместе с ${ally.localized_name}: ${observed.toFixed(1)}% · ${pair.games} матчей ${stats.patch}`);
    }


  }
  for (const entry of enemies) {
    const enemy = ctx.byId.get(entry.id);
    const p = pairEffect(hero, enemy, ctx);
    counter += p.effect; samples += p.n;
    matchupsDetail.push({id:enemy.id,name:enemy.localized_name,role:entry.role,...p});
    if(role===1&&entry.role===1){
      // Carry-v-carry is a whole-game matchup, distinct from the laning opponent.
      coreDuel=p.effect*(p.effect<0?1.3:0.8);
      priorityReasons.push(`Carry против Carry · ${enemy.localized_name}: ${p.empirical?`${p.observed.toFixed(1)}% за всю игру · n=${p.n}`:'статистики пары нет'}; ${p.effect<-0.5?'невыгодный матчап':p.effect>0.5?'благоприятный матчап':'нет выраженного преимущества'}`);
    }
    else if(p.effect<-1)priorityReasons.push(`Риск против ${enemy.localized_name} (${ROLES[entry.role-1]}): ${p.empirical?`${p.observed.toFixed(1)}% · n=${p.n}`:'экспертная оценка'}`);
    if (p.empirical) reasons.push(`${enemy.localized_name}: ${p.observed.toFixed(1)}% в ${p.n} матчах за всю игру`);
    else if (p.effect) reasons.push(`${p.effect>0?'Экспертный контрпик':'Экспертный риск'}: ${enemy.localized_name}`);
    if (laneOpponents(role).includes(entry.role)) {
      lane += p.effect * (role === 2 ? 1.1 : [1,3].includes(role) ? 0.7 : 0.35);
      laneReasons.push(`${ROLES[role-1]} против ${enemy.localized_name}: ${p.empirical?'усилен вес матчапа за всю игру':'отдельных данных о линии нет'}`);
    }
  }
  synergyStats=Math.max(-5,Math.min(5,synergyStats));
  synergy+=synergyStats;
  const allyHeroes = allies.map(x => ctx.byId.get(x.id));
  for (const [tag,label] of [['Disabler','Добавляет контроль'],['Initiator','Добавляет инициацию'],['Pusher','Помогает забирать строения']]) {
    if (hero.roles.includes(tag) && !allyHeroes.some(a => a.roles.includes(tag))) {
      composition += 1.8; reasons.push(label);
    }
  }
  if (hero.roles.includes('Durable') && !allyHeroes.some(h => h.roles.includes('Durable'))) {
    composition += 1.2; reasons.push('Добавляет героя передней линии');
  }
  const farm = allies.reduce((sum,x) => sum+farmNeed(ctx.byId.get(x.id),x.role),0);
  if (farmNeed(hero,role)>1.5 && farm>2.5) {
    composition -= (farm-2.5)*1.3; reasons.push('Составу может не хватить фарма для ещё одного жадного героя');
  }
  const partnerRole = ({1:5,5:1,3:4,4:3})[role];
  const partner = allies.find(x => x.role === partnerRole);
  if (partner && ctx.byId.get(partner.id).attack_type !== hero.attack_type) {
    synergy += 0.8; reasons.push('Разная дальность атаки союзников на линии');
  }
  if (hero.roles.includes('Nuker') && allyHeroes.length >= 2 && !allyHeroes.some(a => a.roles.includes('Nuker'))) {
    composition += 1.5; reasons.push('Добавляет урон заклинаниями');
  }
  if (allyHeroes.length >= 2 && allyHeroes.every(a => a.attack_type === hero.attack_type)) {
    composition -= 1; reasons.push('Однообразная дальность атаки');
  }
  // One-step exposure check: banned heroes and already filled enemy roles cannot be future replies.
  const enemyRoles = availableRoles(state,opposite(side));
  const used = new Set(state.history.map(x => x.id));
  const threats = heroes.filter(h => h.id !== hero.id && !used.has(h.id) &&
    (!state.pool.length || state.pool.includes(h.id)) && (state.mode !== 'cm' || h.cm_enabled !== false) &&
    enemyRoles.some(r => roleAffinity(h,r,state) >= 0.6)).map(h => ({hero:h, ...pairEffect(h,hero,ctx)}))
    .filter(p => p.empirical && p.effect > 1.5).sort((a,b) => b.effect-a.effect).slice(0,3);
  if (threats.length) {
    risk = -0.35 * threats.reduce((sum,p)=>sum+p.effect,0)/threats.length;
    reasons.push(`Возможный ответ: ${threats[0].hero.localized_name} на свободную роль соперника`);
  }
  const developmentDetail=candidateDevelopment(hero,role,allies.map(x=>({...x,hero:ctx.byId.get(x.id)})),enemies.map(x=>({...x,hero:ctx.byId.get(x.id)})),{enabled:state.potentialItems!==false,patch:ctx.meta?.patch?.name});
  const development=developmentDetail.score;
  const mechanicsDetail=mechanicalAssessment(hero,role,allies.map(x=>({...x,hero:ctx.byId.get(x.id)})),enemies.map(x=>({...x,hero:ctx.byId.get(x.id)})),{potentialItems:state.potentialItems!==false,buildEvidence:buildEvidenceActive(ctx.meta?.patch?.name)});
  synergy+=mechanicsDetail.combo;
  const mechanics=mechanicsDetail.score;
  const skillReasons=[...mechanicsDetail.interactions,...(developmentDetail.active?developmentDetail.evidence.map(e=>`${e.label}: ${e.text}`):[])];
  if(mechanicsDetail.saves[0]){const x=mechanicsDetail.saves[0];skillReasons.push(`Сейв ${x.ability} (${x.owner}) против ${x.against}: ${x.text}`);}
  if(mechanicsDetail.items[0]){const x=mechanicsDetail.items[0];skillReasons.push(`Возможный ${x.item} · ${x.cost} золота · ${x.owner} против ${x.against}: ${x.condition}${state.potentialItems===false?' Вклад будущих предметов отключён.':''}`);}
  if(mechanicsDetail.threats[0])skillReasons.push(`Механическая угроза: ${mechanicsDetail.threats[0].ability} (${mechanicsDetail.threats[0].hero}); возможный сейв не отменяет статистику пары.`);
  const affinity = roleAffinity(hero,role,state);
  const fit = affinity ? (affinity-0.7)*8 : 0;
  if(affinity<0.55)priorityReasons.unshift(`Роль ${ROLES[role-1]} пока не подтверждена в справочнике${affinity?': экспертная оценка ниже основной роли':'; вклад роли нейтрален'}`);
  if (!reasons.length && !laneReasons.length) reasons.push('Базовая сила и соответствие роли');
  return {hero,role,score:50+meta+synergy+counter+lane+coreDuel+composition+fit+risk+mechanics+development,wr,rawWr,n,metaSource:stats.source,metaPatch:stats.patch,synergyStats,synergySamples,
    meta,synergy,counter,lane,coreDuel,composition,fit,risk,mechanics,mechanicsDetail,development,developmentDetail,samples,matchupsDetail,
    reasons:[...priorityReasons,...skillReasons,...laneReasons,...reasons,...mechanicsDetail.limits],lanePriority:lanePriority(role,side,state)};
}

// Reserve a representative for every available role; spend extra slots on known lane matchups.
// Hero uniqueness is global, even when a flex hero is strong in several roles.
export function diversify(candidates, roles, priorities, limit=6) {
  const sorted = [...candidates].sort((a,b)=>b.score-a.score || a.hero.id-b.hero.id);
  const selected=[], used=new Set();
  const take = role => {
    const row=sorted.find(x => !used.has(x.hero.id) && (!role || x.role === role));
    if (row) {selected.push(row);used.add(row.hero.id);}
    return !!row;
  };
  // Cover scarce roles first so a flex pick cannot steal their only viable hero.
  const coverage = [...roles].sort((a,b) =>
    sorted.filter(x=>x.role===a).length-sorted.filter(x=>x.role===b).length || (priorities[b]||0)-(priorities[a]||0));
  for (const role of coverage) if (selected.length<limit) take(role);
  const focus=[...roles].sort((a,b)=>(priorities[b]||0)-(priorities[a]||0));
  const highest=priorities[focus[0]]||0;
  const focusRoles=focus.filter(r=>highest>0 && priorities[r]===highest);
  while (selected.length<limit && focusRoles.length) {
    let added=false;
    for (const role of focusRoles) if (selected.length<limit) added=take(role)||added;
    if (!added) break;
  }
  while (selected.length<limit && take(0)) {}
  const rest=[];
  for (const row of sorted) if (!used.has(row.hero.id)) {rest.push(row);used.add(row.hero.id);}
  return [...selected.sort((a,b)=>b.score-a.score),...rest];
}

function candidateRows(side,type,state,heroes,matchups={},filterRole=0,metaData=null,options={}) {
  const target = type === 'ban' ? opposite(side) : side;
  // A catalog filter must never silently narrow bans intended for the other team.
  const roles = availableRoles(state,target).filter(r=>options.targetRole?r===options.targetRole:(type==='ban'||!filterRole||r===filterRole));
  if (!roles.length || (state.mode==='cd' && !state.pool.length)) return [];
  const used = new Set(state.history.map(x=>x.id)), ctx=context(heroes,matchups,metaData);
  const candidates=[];
  for (const h of heroes) {
    if (used.has(h.id) || (state.pool.length&&!state.pool.includes(h.id)) || (state.mode==='cm'&&h.cm_enabled===false)) continue;
    // Exclude niche flex roles while normal alternatives remain; manual selection stays available.
    const normal=roles.filter(role=>roleAffinity(h,role,state)>=0.55);
    const considered=normal.length?normal:(options.includeUnusual&&type==='pick'?roles:[]);
    for (const role of considered) candidates.push(evaluate(h,role,target,state,heroes,matchups,ctx));
  }
  const scored=type==='ban'?strategicBans(side,state,heroes,matchups,ctx,candidates):candidates;
  return scored.sort((a,b)=>b.score-a.score||a.hero.id-b.hero.id||a.role-b.role);
}

export function rankCandidates(...args){
  const seen=new Set();
  return candidateRows(...args).filter(row=>!seen.has(row.hero.id)&&seen.add(row.hero.id));
}

export function recommend(side,type,state,heroes,matchups={},filterRole=0,metaData=null,options={}) {
  // Retain all role alternatives for the diversity pass, then deduplicate by hero there.
  const target=type==='ban'?opposite(side):side;
  const roles=availableRoles(state,target).filter(r=>options.targetRole?r===options.targetRole:(type==='ban'||!filterRole||r===filterRole));
  const rows=candidateRows(side,type,state,heroes,matchups,filterRole,metaData,options);
  return diversify(rows,roles,Object.fromEntries(roles.map(r=>[r,lanePriority(r,target,state)])));
}

// A transparent heuristic conversion, deliberately separate from candidate indices.
// No player skill, team execution or calibrated predictive accuracy is claimed.
export function draftOutlook(state,heroes,matchups={},metaData=null){
  const picks=state.history.filter(x=>x.type==='pick');
  if(picks.length!==10||['radiant','dire'].some(side=>availableRoles(state,side).length))return null;
  const ctx=context(heroes,matchups,metaData);
  const rows=picks.map(entry=>evaluate(ctx.byId.get(entry.id),entry.role,entry.side,
    {...state,history:state.history.filter(x=>x!==entry)},heroes,matchups,ctx));
  const components=['meta','counter','coreDuel','lane','synergy','composition','fit','mechanics','development'];
  const team=side=>{
    const selected=rows.filter((_,i)=>picks[i].side===side);
    const own=picks.filter(x=>x.side===side).map(x=>({...x,hero:ctx.byId.get(x.id)})),enemy=picks.filter(x=>x.side!==side).map(x=>({...x,hero:ctx.byId.get(x.id)}));
    return Object.fromEntries(components.map(k=>[k,k==='development'?developmentAssessment(own,enemy,{enabled:state.potentialItems!==false,patch:ctx.meta?.patch?.name}).score:selected.reduce((s,r)=>s+r[k],0)/5]));
  };
  const radiantComponents=team('radiant'),direComponents=team('dire');
  const delta=components.reduce((s,k)=>s+radiantComponents[k]-direComponents[k],0);
  const radiant=Math.round(Math.max(5,Math.min(95,100/(1+Math.exp(-delta/18)))));
  return {radiant,dire:100-radiant,delta,radiantComponents,direComponents,method:'heuristic-v1',calibrated:false,
    explanation:explainDraft(picks,ctx,radiantComponents,direComponents,state)};
}

function explainDraft(picks,ctx,radiantComponents,direComponents,state){
  const units=side=>picks.filter(x=>x.side===side).map(x=>({...x,hero:ctx.byId.get(x.id)}));
  const names=items=>items.map(x=>x.hero.localized_name).join(', ');
  const componentLabels={meta:'Базовая сила героев в выбранной статистике',counter:'Матчапы против полного состава соперника',coreDuel:'Дополнительный вес пары Carry–Carry',lane:'Матчапы предполагаемых противников по линии',synergy:'Союзные пары и экспертные комбинации',composition:'Покрытие задач состава',fit:'Подтверждённость назначенных позиций',mechanics:'Способности, доступные сейвы и потенциальные предметы',development:'Предметные планы и доступ к ресурсам'};
  const factors=Object.keys(componentLabels).map(key=>({key,label:componentLabels[key],delta:radiantComponents[key]-direComponents[key]}))
    .filter(x=>Math.abs(x.delta)>=0.4).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3);
  const teams={};
  for(const side of ['radiant','dire']){
    const own=units(side),enemy=units(opposite(side));
    const tagged=tag=>own.filter(x=>x.hero.roles.includes(tag));
    const initiators=tagged('Initiator').sort((a,b)=>[3,4,2,1,5].indexOf(a.role)-[3,4,2,1,5].indexOf(b.role));
    const control=tagged('Disabler'),pushers=tagged('Pusher');
    const frontline=own.filter(x=>x.role<=3&&x.hero.roles.includes('Durable'));
    const core=own.find(x=>x.role===1),mid=own.find(x=>x.role===2);
    const farming=own.filter(x=>farmNeed(x.hero,x.role)>1.5);
    const unusual=own.filter(x=>roleAffinity(x.hero,x.role,state)<0.55);
    const matchups=own.flatMap(a=>enemy.map(b=>({hero:a.hero.localized_name,role:a.role,enemy:b.hero.localized_name,enemyRole:b.role,
      ...pairEffect(a.hero,b.hero,ctx),priority:a.role===1&&b.role===1?2:a.role===2&&b.role===2?1.4:1})))
      .filter(x=>x.n>0||x.effect!==0).sort((a,b)=>Math.abs(b.effect)*b.priority-Math.abs(a.effect)*a.priority);
    const favorable=matchups.find(x=>x.effect>0.75),bad=matchups.find(x=>x.effect< -0.75);
    const allied=[];
    for(let i=0;i<own.length;i++)for(let j=i+1;j<own.length;j++){
      const a=own[i].hero,b=own[j].hero,key=[a.id,b.id].sort((a,b)=>a-b).join(':');
      const pair=ctx.meta?.synergies?.[key],expert=combos.some(p=>p.includes(a.localized_name)&&p.includes(b.localized_name));
      const observed=pair?.games?100*pair.wins/pair.games:null;
      const effect=pair?.games?Math.max(-5,Math.min(5,observed-(base(a,ctx).wr+base(b,ctx).wr)/2))*pair.games/(pair.games+150)*0.7:0;
      if(expert||Math.abs(effect)>=0.5)allied.push({heroes:[a.localized_name,b.localized_name],expert,observed,n:pair?.games||0,effect});
    }
    allied.sort((a,b)=>(Math.abs(b.effect)+(b.expert?3:0))-(Math.abs(a.effect)+(a.expert?3:0)));
    const strengths=[],risks=[],winConditions=[];
    if(initiators.length)strengths.push(`Первый контакт: ${names(initiators)}. В справочнике отмечены как инициаторы; составу есть через кого начинать бой.`);
    if(control.length>=2)strengths.push(`Несколько источников контроля: ${names(control)}. Можно распределить контроль между целью первого входа и её союзниками.`);
    if(frontline.length)strengths.push(`Передняя линия среди коров: ${names(frontline)}. Есть кому принимать первый контакт, пока остальные выбирают позицию.`);
    if(pushers.length)strengths.push(`Давление на строения: ${names(pushers)} отмечены как Pusher. У состава есть профильные средства превращать преимущество в потерю башен соперника.`);
    if(favorable)strengths.push(`Статистическая опора: ${favorable.hero} против ${favorable.enemy} — ${favorable.empirical?`${favorable.observed.toFixed(1)}% побед в ${favorable.n} играх; результат выше ожидаемого по базовым WR`:'экспертная контрпара'}. Это результат всей игры, не гарантия дуэли.`);
    if(!strengths.length)strengths.push(`Опора по назначенным ролям: ${core.hero.localized_name} на Carry и ${mid.hero.localized_name} на Mid. Выраженных дополнительных преимуществ по справочнику и выборке не найдено.`);
    if(initiators.length){
      const follow=control.filter(x=>x.id!==initiators[0].id);
      winConditions.push({title:'Начать бой первым и связать контроль',text:`Искать подготовленный вход через ${initiators[0].hero.localized_name}${follow.length?`, затем продолжать контроль через ${names(follow.slice(0,2))}`:''}. ${core.hero.localized_name} и ${mid.hero.localized_name} должны успевать подключиться к выбранной цели. Не разменивать все средства контроля на одну цель, если рядом остаются другие угрозы.`});
    }else winConditions.push({title:'Играть от информации и удобного контакта',text:`Явного инициатора по тегам справочника нет. Готовить обзор и встречать соперника на своей территории${control.length?`; ${names(control)} могут продолжать контакт контролем`:''}. Для ${core.hero.localized_name} важнее возможность безопасно наносить урон, чем вынужденный вход без информации.`});
    winConditions.push(farming.length>=2?{title:'Развести фарм и боевые задачи',text:`${names(farming)} требуют ресурсов по экспертной модели. Заранее разделить безопасные линии и зоны фарма; остальной частью команды защищать доступ к ним. Преимущество появится, если ключевые герои успеют получить свои предметы, а команда не потеряет за это всю карту.`}:{title:'Связать развитие Carry с действиями команды',text:`Сохранять доступ ${core.hero.localized_name} к безопасному фарму и заранее договариваться, к каким боям он подключается. Через ${mid.hero.localized_name} и героев контроля искать возможности занять территорию.`});
    winConditions.push(pushers.length?{title:'Закреплять выигранный эпизод строениями',text:`После убийства или отступления соперника использовать ${names(pushers)} для давления на башни, а остальными героями прикрывать подходы. Возвращаться к фарму, когда безопасное окно закончилось; не продолжать осаду только потому, что предыдущая драка была выиграна.`}:{title:'Сначала создать окно для осады',text:'В справочнике нет выраженного Pusher. Стараться выходить к строениям после выгодного размена или вынужденного отступления соперника. Без численного или территориального преимущества завершение игры может требовать больше подготовки.'});
    if(bad){
      const helpers=control.filter(x=>x.hero.localized_name!==bad.hero).slice(0,2);
      winConditions.push({title:'Страховать неудобный встречный матчап',text:`В выбранных данных ${bad.hero} имеет неблагоприятный эффект против ${bad.enemy}. Возможный ответ команды — подготовленный бой с поддержкой${helpers.length?` через ${names(helpers)}`:''}, а не ставка на изолированный контакт. При угрозе для ${bad.hero} сохранять средства помощи; ${bad.enemy} не должен получать удобный вход без ответа.`});
    }else if(favorable)winConditions.push({title:'Создавать удобные сочетания в бою',text:`Пара ${favorable.hero} против ${favorable.enemy} выделяется положительно в выбранных данных. Искать эпизоды, где ${favorable.hero} может подключиться с поддержкой союзников.`});
    if(bad)risks.push(`${bad.hero} против ${bad.enemy}: ${bad.empirical?`${bad.observed.toFixed(1)}% побед в ${bad.n} играх, ниже ожидания по базовым WR`:'невыгодная экспертная контрпара'}. Планировать помощь союзников и численное преимущество; статистика не описывает конкретный эпизод один на один.`);
    if(farming.length>=2)risks.push(`Конкуренция за ресурсы: ${names(farming)}. Если безопасного фарма не хватит, сразу несколько коров могут отстать.`);
    if(!initiators.length)risks.push('По тегам нет явного инициатора: начинать бой без подготовки и информации будет сложнее. Это признак справочника, а не полный анализ способностей.');
    if(control.length<2)risks.push(`Мало отмеченных источников контроля${control.length?`: ${names(control)}`:''}. После их использования может быть трудно удержать несколько целей.`);
    if(!frontline.length)risks.push('Среди назначенных коров нет героя с тегом Durable: особенно важно, кто принимает первый контакт. Предметы могут изменить эту картину.');
    if(!pushers.length)risks.push('Нет героя с тегом Pusher: выигранные драки могут медленнее превращаться в башни. Это не означает, что состав не умеет пушить.');
    if(unusual.length)risks.push(`Роли вне справочника: ${unusual.map(x=>`${x.hero.localized_name} · ${ROLES[x.role-1]}`).join(', ')}. Такие назначения не объявляются ошибочными автоматически; можно подтвердить роль в окне героя.`);
    const weakPair=allied.find(x=>x.effect< -0.75);
    if(weakPair)risks.push(`Совместный результат ${weakPair.heroes.join(' + ')} ниже среднего базового WR этих героев в выборке. Это корреляция, а не доказательство несовместимости.`);
    if(!risks.length)risks.push('Выраженных структурных слабостей по доступным признакам не найдено. Это не исключает проблем с исполнением, предметами или неизвестными модели механиками.');
    const mechanical=own.map(x=>mechanicalAssessment(x.hero,x.role,own.filter(a=>a.id!==x.id),enemy,{potentialItems:state.potentialItems!==false,buildEvidence:buildEvidenceActive(ctx.meta?.patch?.name)}));
    const distinct=list=>[...new Map(list.map(x=>[typeof x==='string'?x:JSON.stringify(x),x])).values()];
    const saveGroups=new Map();
    for(const save of mechanical.flatMap(x=>x.saves)){
      const key=save.owner+':'+save.ability+':'+save.against;
      const group=saveGroups.get(key)||{...save,targets:[]};
      if(!group.targets.includes(save.target))group.targets.push(save.target);
      saveGroups.set(key,group);
    }
    const saves=[...saveGroups.values()].map(g=>({...g,target:g.targets.join(' / '),text:g.text+' Это альтернативные цели одного сейва: один каст и общий кулдаун, одновременно всем защита не засчитывается.'}));
    const mechanics={interactions:distinct(mechanical.flatMap(x=>x.interactions)),saves,items:distinct(mechanical.flatMap(x=>x.items)),resources:mechanical[0]?.resources,limits:distinct(mechanical.flatMap(x=>x.limits)),potentialItems:state.potentialItems!==false};
    const enemyCarry=enemy.find(x=>x.role===1);
    const carryMatchup={hero:core.hero.localized_name,role:1,enemy:enemyCarry.hero.localized_name,enemyRole:1,...pairEffect(core.hero,enemyCarry.hero,ctx)};
    const development=developmentAssessment(own,enemy,{enabled:state.potentialItems!==false,patch:ctx.meta?.patch?.name});
    teams[side]={strengths,winConditions,risks,carryMatchup,mechanics,development,matchups:matchups.filter(x=>x.role!==1||x.enemyRole!==1).slice(0,3),synergies:allied.slice(0,3)};
  }
  const radiant=units('radiant'),dire=units('dire');
  const lanes=[['Mid',[2],[2]],['Лёгкая Radiant / сложная Dire',[1,5],[3,4]],['Сложная Radiant / лёгкая Dire',[3,4],[1,5]]].map(([label,a,b])=>{
    const left=radiant.filter(x=>a.includes(x.role)),right=dire.filter(x=>b.includes(x.role));
    const pairs=left.flatMap(x=>right.map(y=>pairEffect(x.hero,y.hero,ctx)));
    return {label,radiant:names(left),dire:names(right),effect:pairs.reduce((s,x)=>s+x.effect,0)/pairs.length,knownPairs:pairs.filter(x=>x.empirical).length,expertPairs:pairs.filter(x=>!x.empirical&&x.effect!==0).length,totalPairs:pairs.length};
  });
  return {teams,factors,lanes};
}

// Public schedule information only: no invented opponent preferences or probabilities.
export function banWindow(state,side){
  if(state.mode==='free')return {known:false,enemyPicks:0,enemyBans:0,ownBans:0,steps:0,picksInRow:1};
  const rest=sequence(state.mode,state.first).slice(state.history.length+1);
  let enemyPicks=0,enemyBans=0,ownBans=0,steps=0;
  for(let i=0;i<rest.length;i++){
    const a=rest[i];
    if(a.side===side&&a.type==='pick'){
      let picksInRow=1;
      for(let j=i+1;j<rest.length&&rest[j].side===side&&rest[j].type==='pick';j++)picksInRow++;
      return {known:true,enemyPicks,enemyBans,ownBans,steps,picksInRow};
    }
    if(a.side!==side){if(a.type==='pick')enemyPicks++;else enemyBans++;}
    else if(a.type==='ban')ownBans++;
    steps++;
  }
  return {known:true,enemyPicks,enemyBans,ownBans,steps,picksInRow:0};
}

function strategicBans(side,state,heroes,matchups,ctx,candidates){
  const foe=opposite(side), ownRoles=availableRoles(state,side), foeRoles=availableRoles(state,foe);
  const used=new Set(state.history.map(x=>x.id));
  const eligible=heroes.filter(h=>!used.has(h.id)&&(!state.pool.length||state.pool.includes(h.id))&&(state.mode!=='cm'||h.cm_enabled!==false));
  const window=banWindow(state,side);
  const plans=[],roleOptions=new Map();
  for(const role of ownRoles){
    const options=eligible.filter(h=>roleAffinity(h,role,state)>=0.55).map(h=>evaluate(h,role,side,state,heroes,matchups,ctx)).sort((a,b)=>b.score-a.score);
    roleOptions.set(role,options);
    for(const r of options.slice(0,3))plans.push({...r,current:false,quality:Math.exp((r.score-options[0].score)/5)});
  }
  const current=state.history.filter(x=>x.type==='pick'&&x.side===side).map(x=>({hero:ctx.byId.get(x.id),role:x.role,current:true,quality:1}));
  const targets=[...current,...plans].map(plan=>{
    const answers=eligible.filter(h=>h.id!==plan.hero.id&&foeRoles.some(r=>roleAffinity(h,r,state)>=0.55))
      .map(h=>({id:h.id,...pairEffect(h,plan.hero,ctx)})).filter(p=>p.effect>0).sort((a,b)=>b.effect-a.effect);
    return {...plan,answers};
  });
  return candidates.map(row=>{
    const reasons=[],future=[],protectedNow=[];
    for(const plan of targets){
      if(plan.hero.id===row.hero.id)continue;
      const direct=plan.answers.find(p=>p.id===row.hero.id);
      if(!direct||direct.effect<0.75)continue;
      const before=plan.answers[0]?.effect||0;
      const after=plan.answers.find(p=>p.id!==row.hero.id)?.effect||0;
      // The value is the reduction in the strongest surviving answer, not just a favorable pair.
      const removed=Math.max(0,before-after)*(direct.empirical?1:0.6);
      if(removed<=0.05)continue;
      let access=window.known?1/(1+0.08*window.steps):0.65;
      const stealable=foeRoles.some(r=>roleAffinity(plan.hero,r,state)>=0.55);
      if(!plan.current&&window.enemyPicks&&stealable)access*=0.55;
      if(!plan.current&&window.enemyBans)access*=1/(1+0.3*window.enemyBans);
      const gain=removed*plan.quality*(plan.current?1:access);
      const item={hero:plan.hero,role:plan.role,gain,remaining:after,stealable:!plan.current&&window.enemyPicks>0&&stealable};
      (plan.current?protectedNow:future).push(item);
    }
    protectedNow.sort((a,b)=>b.gain-a.gain);future.sort((a,b)=>b.gain-a.gain);
    // A hero evaluated in multiple flex roles is still a single plan.
    const seen=new Set();const uniqueFuture=future.filter(x=>!seen.has(x.hero.id)&&seen.add(x.hero.id));
    const protection=Math.min(6,1.5*((protectedNow[0]?.gain||0)+0.3*(protectedNow[1]?.gain||0)));
    const setup=Math.min(6,1.5*((uniqueFuture[0]?.gain||0)+0.3*(uniqueFuture[1]?.gain||0)));
    let opportunity=0;
    for(const [role,options] of roleOptions){
      if(options[0]?.hero.id!==row.hero.id)continue;
      const alternative=options.find(x=>x.hero.id!==row.hero.id);
      opportunity=Math.max(opportunity,alternative?Math.min(6,0.5*Math.max(0,options[0].score-alternative.score)):6);
    }
    if(protectedNow[0])reasons.push(`Защищает выбранного ${protectedNow[0].hero.localized_name} (${ROLES[protectedNow[0].role-1]})`);
    if(uniqueFuture[0]){
      const p=uniqueFuture[0];reasons.push(`Открывает план: ${p.hero.localized_name} · ${ROLES[p.role-1]}`);
      if(p.stealable)reasons.push(`До вашего пика соперник может забрать ${p.hero.localized_name}; вес плана снижен`);
      if(p.remaining>1.5)reasons.push('У соперника остаётся другой сильный ответ — защита неполная');
    }
    if(opportunity>0.2)reasons.push('Цена бана: теряете сильный вариант собственного пика');
    if(window.known&&window.picksInRow===2&&setup>0)reasons.push('В следующем окне у вас два пика подряд');
    if(!window.known&&setup>0)reasons.push('Свободный режим: очередь неизвестна, вес будущего плана снижен');
    if(!reasons.length)reasons.push('Основная цель: убрать сильный вариант соперника');
    return {...row,score:row.score+protection+setup-opportunity,denial:row.score-50,protection,setup,opportunity,
      banPlan:uniqueFuture.slice(0,2).map(p=>({id:p.hero.id,name:p.hero.localized_name,role:p.role,gain:p.gain})),
      banWindow:window,reasons:[...reasons,...row.reasons]};
  });
}
