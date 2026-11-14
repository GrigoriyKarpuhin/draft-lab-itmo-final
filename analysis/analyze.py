"""Reproducible audit of existing snapshot; no simulated dirt added."""
import json,pathlib,collections,re,html,hashlib,statistics,datetime
ROOT=pathlib.Path(__file__).resolve().parent
DATA=ROOT.parent/'draft-lab/data'
read=lambda p:json.loads(p.read_text())
rows=read(DATA/'meta-matches.json');heroes=read(DATA/'heroes.json');known={h['id'] for h in heroes};meta=read(DATA/'meta.json')
counts=collections.Counter();seen=set();cleaned=[]
for r in rows:
 reason=None
 if type(r.get('match_id')) is not int:reason='invalid_id'
 elif r['match_id'] in seen:reason='duplicate'
 elif not isinstance(r.get('radiant_team'),list) or not isinstance(r.get('dire_team'),list):reason='invalid_teams'
 else:
  ids=r['radiant_team']+r['dire_team']
  if len(r['radiant_team'])!=5 or len(r['dire_team'])!=5 or len(set(ids))!=10 or any(type(i) is not int or i not in known for i in ids):reason='invalid_lineup'
  elif type(r.get('radiant_win')) is not bool:reason='invalid_outcome'
  elif not isinstance(r.get('duration'),(int,float)) or r['duration']<600:reason='invalid_duration'
  elif r.get('game_mode')!=22 or r.get('lobby_type')!=7 or (r.get('avg_rank_tier') or 0)<70:reason='scope'
  elif not meta['windowFrom']<=r.get('start_time',0)<=meta['windowTo']:reason='outside_snapshot_window'
 if reason:counts[reason]+=1;continue
 seen.add(r['match_id']);cleaned.append(r)
(ROOT/'matches_prepared.json').write_text(json.dumps(cleaned,separators=(',',':')))
# Normalize actual HTML, whitespace and unresolved template parameters in ability descriptions.
mechanics=read(DATA/'mechanics-reference.json');corpus=[];changes=collections.Counter();excluded=[]
for hid,h in mechanics['heroes'].items():
 for a in h.get('abilities',[]):
  raw=a.get('desc_loc','')
  if not raw.strip():changes['empty_descriptions_excluded']+=1;excluded.append({'hero_id':int(hid),'ability':a['name']});continue
  text=html.unescape(re.sub(r'<[^>]*>',' ',raw));text=re.sub(r'\s+',' ',text).strip()
  if text!=raw:changes['markup_or_whitespace_normalized']+=1
  params=re.findall(r'%[^%\s]+%',text)
  if params:changes['unresolved_parameters_flagged']+=1
  text=re.sub(r'%[^%\s]+%','[значение не сохранено]',text)
  corpus.append({'id':f"mechanics:{hid}:{a['name']}",'hero_id':int(hid),'hero':h['name'],'ability':a.get('name_loc',a['name']),'text':text,'url':h['url'],'patch':mechanics['patch'],'unresolved_parameters':params})
(ROOT/'mechanics_prepared.json').write_text(json.dumps(corpus,ensure_ascii=False,indent=2))
# The site consumes the same cleaned corpus we document.
(DATA/'mechanics-prepared.json').write_text(json.dumps(corpus,ensure_ascii=False,indent=2))
hero_games=collections.Counter(i for r in cleaned for i in r['radiant_team']+r['dire_team']);names={h['id']:h['localized_name'] for h in heroes}
rank=collections.Counter(str(r['avg_rank_tier']) for r in cleaned);dur=sorted(r['duration'] for r in cleaned)
def quantile(p):
 pos=(len(dur)-1)*p;i=int(pos);return (dur[i]+(dur[min(i+1,len(dur)-1)]-dur[i])*(pos-i))/60
prepared_stats=collections.defaultdict(lambda:{'games':0,'wins':0})
for r in cleaned:
 for team,won in [('radiant_team',r['radiant_win']),('dire_team',not r['radiant_win'])]:
  for hid in r[team]:prepared_stats[str(hid)]['games']+=1;prepared_stats[str(hid)]['wins']+=int(won)
summary={'source':'Сохранённый снимок OpenDota из Draft Lab, новый сетевой сбор не выполнялся','original_records':len(rows),'prepared_records':len(cleaned),'dropped':dict(counts),'historical_collection':{'scanned':meta['scannedCount'],'accepted':meta['matchCount'],'rejected':meta['rejected'],'note':'Метаданные прежнего сбора; отклонённые исходные записи не сохранены.'},'sha256_original':hashlib.sha256((DATA/'meta-matches.json').read_bytes()).hexdigest(),'unique_heroes':len(hero_games),'radiant_wins':sum(r['radiant_win'] for r in cleaned),'radiant_win_rate':100*sum(r['radiant_win'] for r in cleaned)/len(cleaned),'duration_minutes':{'min':min(dur)/60,'median':statistics.median(dur)/60,'mean':statistics.mean(dur)/60,'p95':quantile(.95),'max':max(dur)/60},'time_utc':{'from':datetime.datetime.fromtimestamp(min(r['start_time'] for r in cleaned),datetime.timezone.utc).isoformat(),'to':datetime.datetime.fromtimestamp(max(r['start_time'] for r in cleaned),datetime.timezone.utc).isoformat()},'top_heroes':[{'id':i,'name':names[i],'games':n,'pick_rate':100*n/len(cleaned)} for i,n in hero_games.most_common(10)],'rank_distribution':dict(sorted(rank.items())),'aggregate_matches_existing':dict(prepared_stats)==meta['heroStats'],'mechanics':{'original_heroes':len(mechanics['heroes']),'prepared_facts':len(corpus),'changes':dict(changes),'excluded':excluded,'example':next((x for x in corpus if x['unresolved_parameters']),corpus[0])},'missing_fields':{k:sum(k not in r or r[k] is None for r in rows) for k in ['match_id','radiant_team','dire_team','radiant_win','start_time','duration','game_mode','lobby_type','avg_rank_tier']},'records_example':cleaned[:3]}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k not in ['records_example','rank_distribution','top_heroes']},ensure_ascii=False,indent=2))
# A separate optional Pillow renderer keeps data validation dependency-free.
