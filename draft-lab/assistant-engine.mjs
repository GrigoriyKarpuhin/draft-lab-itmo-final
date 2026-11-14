import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {apply,rankCandidates,evaluate,draftOutlook,ROLES,sequence,positions} from './engine.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL(`./data/${name}`,import.meta.url)));
const heroes=read('heroes.json'),meta=read('meta.json'),ids=new Set(heroes.map(h=>h.id));
const matchups=Object.fromEntries(heroes.map(h=>{try{return [h.id,read(`matchups-${h.id}.json`)]}catch{return [h.id,[]]}}));
const fail=msg=>{throw new Error(msg)};
export function analyzeDraft(q){
 const s=q?.state;if(!s||!['cm','cd','free'].includes(s.mode)||!['radiant','dire'].includes(s.first)||!Array.isArray(s.history)||s.history.length>24)fail('Некорректное состояние драфта');
 if(!['radiant','dire'].includes(q.side)||!['pick','ban'].includes(q.type)||!Number.isInteger(q.role)||q.role<0||q.role>5||!['fresh','legacy'].includes(q.metaMode))fail('Некорректная сторона, действие, роль или источник');
 for(const list of [s.pool,q.personalPool])if(!Array.isArray(list)||list.length>heroes.length||list.some(id=>!ids.has(id))||new Set(list).size!==list.length)fail('Некорректный пул героев');
 const overrides=s.roleOverrides||{};if(typeof overrides!=='object'||Array.isArray(overrides)||Object.entries(overrides).some(([k,v])=>!/^\d+:[1-5]$/.test(k)||!ids.has(+k.split(':')[0])||v!==true))fail('Некорректные назначения ролей');
 let checked={mode:s.mode,first:s.first,pool:[...s.pool],history:[],roleOverrides:overrides,potentialItems:s.potentialItems!==false};
 for(const a of s.history){if(!a||!ids.has(a.id)||(a.type==='pick'?(!Number.isInteger(a.role)||a.role<1||a.role>5):a.role!==null&&a.role!==0))fail('Неизвестный герой или роль');checked=apply(checked,heroes.find(h=>h.id===a.id),a.role,{side:a.side,type:a.type});}
 if(q.requestedRoles!==undefined&&(!Array.isArray(q.requestedRoles)||q.requestedRoles.some(r=>!Number.isInteger(r)||r<1||r>5)))fail('Некорректные запрошенные роли');
 const source=q.metaMode==='fresh'?meta:null;
 let rows=rankCandidates(q.side,q.type,checked,heroes,matchups,q.role,source,{includeUnusual:false,targetRole:q.type==='ban'?q.role||undefined:undefined});
 if(q.requestedRoles?.length)rows=rows.filter(r=>q.requestedRoles.includes(r.role));
 // Personal pool belongs to our picks, never to the opponents whose heroes we ban.
 if(q.type==='pick'&&q.personalPool.length)rows=rows.filter(r=>q.personalPool.includes(r.hero.id));
 const seen=new Set();rows=rows.filter(r=>!seen.has(r.hero.id)&&seen.add(r.hero.id));
 if(q.compareIds!==undefined){if(!Array.isArray(q.compareIds)||q.compareIds.length>3||q.compareIds.some(id=>!ids.has(id)))fail('Некорректные герои сравнения');rows=rows.filter(r=>q.compareIds.includes(r.hero.id));}
 const leaders=(q.requestedRoles||[]).map(role=>rows.find(r=>r.role===role)).filter(Boolean);
 rows=[...leaders,...rows.filter(r=>!leaders.includes(r))];
 const candidates=rows.slice(0,6).map(r=>({id:r.hero.id,name:r.hero.localized_name,role:r.role,roleName:ROLES[r.role-1],score:+r.score.toFixed(2),games:r.n,winRate:+r.rawWr.toFixed(2),reasons:r.reasons.slice(0,5),components:Object.fromEntries(['meta','counter','synergy','composition','fit','risk','mechanics','development'].map(k=>[k,+(r[k]||0).toFixed(2)])),evidenceId:`engine:${r.hero.id}`}));
 const words=(' '+[q.question,...(Array.isArray(q.history)?q.history:[]).filter(m=>m?.role==='user').map(m=>m.content)].join(' ').toLowerCase().replace(/[^a-z '-]/g,' ')+' ').replace(/\s+/g,' ');
 const discussedHeroes=heroes.filter(h=>words.includes(' '+h.localized_name.toLowerCase()+' ')).slice(0,6).map(h=>({id:h.id,name:h.localized_name,positions:positions(h),evidenceId:`catalog:${h.id}`}));
 const enemyPairs=[];
 if(q.enemySynergies){
  const enemySide=q.side==='radiant'?'dire':'radiant';
  const enemies=checked.history.filter(a=>a.type==='pick'&&a.side===enemySide);
  const named=enemies.filter(a=>String(q.question).toLowerCase().includes(heroes.find(h=>h.id===a.id).localized_name.toLowerCase()));
  const eligible=rankCandidates(enemySide,'pick',checked,heroes,matchups,0,source,{includeUnusual:false});
  for(const anchor of (named.length?named:enemies)){
   const seenPairs=new Set();const pairs=[];
   for(const r of eligible){
    if(seenPairs.has(r.hero.id))continue;seenPairs.add(r.hero.id);
    const pair=source?.synergies?.[[anchor.id,r.hero.id].sort((a,b)=>a-b).join(':')];
    if(!pair||pair.games<100)continue;
    pairs.push({id:r.hero.id,name:r.hero.localized_name,role:r.role,with:heroes.find(h=>h.id===anchor.id).localized_name,games:pair.games,winRate:+(100*pair.wins/pair.games).toFixed(1),ranking:(pair.wins+50)/(pair.games+100),evidenceId:`enemy-pair:${anchor.id}:${r.hero.id}`});
   }
   enemyPairs.push(...pairs.sort((a,b)=>b.ranking-a.ranking).slice(0,3).map(({ranking,...p})=>p));
  }
 }
 const outlook=draftOutlook(checked,heroes,matchups,source);
 const own=checked.history.filter(a=>a.type==='pick'&&a.side===q.side);
 let risks=outlook?.explanation.teams[q.side].risks||own.flatMap(a=>evaluate(heroes.find(h=>h.id===a.id),a.role,a.side,{...checked,history:checked.history.filter(x=>x!==a)},heroes,matchups,source).reasons.filter(r=>/Риск|Возможный ответ|не подтверж|Нет /i.test(r)).slice(0,2));
 if(!outlook&&own.length<5)risks.unshift(`Состав ${q.side} ещё не завершён: выбрано ${own.length} из 5 героев. Оценка предварительная.`);
 const compositionRisks=[...new Set(risks)].slice(0,6).map((text,i)=>({id:`composition:${q.side}:${i}`,text}));
 return {candidates,enemyPairs,discussedHeroes,requestedRoles:q.requestedRoles||[],compositionRisks,side:q.side,type:q.type,role:q.role,state:checked,currentAction:s.mode==='free'?null:sequence(s.mode,s.first)[s.history.length]||null,selected:checked.history.map(a=>({...a,name:heroes.find(h=>h.id===a.id).localized_name})),source:{patch:source?.patch.name||'без фильтра патча',matches:source?.matchCount||null,generatedAt:source?.generatedAt||null,roleSpecific:false,mode:q.metaMode},outlook:outlook?{radiant:outlook.radiant,dire:outlook.dire,explanation:outlook.explanation}:null,limitations:['Индекс и итоговые проценты — эвристика, не проверенная вероятность победы.','Статистика Ranked All Pick, Divine+; не размечена по ролям и не доказывает причинность.','Сохранённый снимок данных, актуальность патча на сегодня не проверена.','Справочник механик неполный. Окончательный выбор делает игрок.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{let input='';for await(const chunk of process.stdin)input+=chunk;process.stdout.write(JSON.stringify(analyzeDraft(JSON.parse(input))))}catch(e){process.stderr.write(e.message);process.exitCode=1}
}
