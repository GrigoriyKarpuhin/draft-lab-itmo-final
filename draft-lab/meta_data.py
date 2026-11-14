"""Patch-bounded, ranked public-match statistics. Standard library only."""
import collections
import itertools
import json
import pathlib
import subprocess
import time
import urllib.parse

PATCH_LIST_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english'
COLUMNS = 'match_id, radiant_team, dire_team, radiant_win, start_time, duration, game_mode, lobby_type, avg_rank_tier'
PAGE_SIZE = 10000
MAX_PAGES = 5
WINDOW_DAYS = 7
MIN_RANK = 70


def download(url):
    return subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '45', url], timeout=50)


def patch_window(patches, now):
    released = sorted((p for p in patches if isinstance(p.get('patch_timestamp'), (int, float)) and p['patch_timestamp'] <= now), key=lambda p:p['patch_timestamp'])
    if not released:
        raise ValueError('Valve не вернула список выпущенных патчей')
    current = released[-1]
    # Future announcements cannot prematurely stop the current patch's sample.
    return {'name':current['patch_number'], 'releasedAt':current['patch_timestamp'], 'verifiedAt':now, 'source':PATCH_LIST_URL}


def query_url(before=None):
    # Keyset pagination follows the match_id index; time predicates can time out in the public Explorer.
    cursor = f' AND match_id < {int(before)}' if before is not None else ''
    sql = f'SELECT {COLUMNS} FROM public_matches WHERE avg_rank_tier >= {MIN_RANK} AND game_mode = 22 AND lobby_type = 7{cursor} ORDER BY match_id DESC LIMIT {PAGE_SIZE}'
    return 'https://api.opendota.com/api/explorer?' + urllib.parse.urlencode({'sql':sql})


def checked_rows(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('rows'), list):
        message = payload.get('err', 'Некорректный ответ Explorer') if isinstance(payload, dict) else 'Некорректный ответ Explorer'
        raise ValueError(str(message))
    return payload['rows']


def aggregate(rows, patch, now, known_ids=None):
    cutoff = max(patch['releasedAt'], now-WINDOW_DAYS*86400)
    hero_stats = collections.defaultdict(lambda:{'games':0,'wins':0})
    counters = collections.defaultdict(lambda:collections.defaultdict(lambda:{'games_played':0,'wins':0}))
    synergies = collections.defaultdict(lambda:{'games':0,'wins':0})
    seen, accepted = set(), []
    dropped = collections.Counter()
    for m in rows:
        mid=m.get('match_id')
        if not isinstance(mid,int) or mid in seen:
            dropped['duplicateOrMissingId'] += 1; continue
        seen.add(mid)
        start=m.get('start_time',0)
        if not isinstance(start,(int,float)) or not cutoff <= start <= now:
            dropped['outsideWindow'] += 1; continue
        if m.get('lobby_type') != 7 or m.get('game_mode') != 22 or (m.get('avg_rank_tier') or 0) < MIN_RANK:
            dropped['modeOrRank'] += 1; continue
        radiant, dire = m.get('radiant_team',[]), m.get('dire_team',[])
        both = radiant+dire if isinstance(radiant,list) and isinstance(dire,list) else []
        if not isinstance(radiant,list) or not isinstance(dire,list) or len(radiant)!=5 or len(dire)!=5 or any(not isinstance(h,int) or h<=0 for h in both) or len(set(both))!=10 or (known_ids is not None and not set(both)<=known_ids):
            dropped['invalidLineup'] += 1; continue
        if not isinstance(m.get('radiant_win'),bool) or m.get('duration',0)<600:
            dropped['incompleteOrShort'] += 1; continue
        accepted.append(m)
        for team, won in [(radiant,m['radiant_win']),(dire,not m['radiant_win'])]:
            for h in team:
                hero_stats[h]['games']+=1; hero_stats[h]['wins']+=int(won)
            for a,b in itertools.combinations(sorted(team),2):
                pair=synergies[f'{a}:{b}'];pair['games']+=1;pair['wins']+=int(won)
        for a in radiant:
            for b in dire:
                for own,enemy,won in [(a,b,m['radiant_win']),(b,a,not m['radiant_win'])]:
                    pair=counters[own][enemy];pair['games_played']+=1;pair['wins']+=int(won)
    if not accepted:
        raise ValueError('В выборке нет полных рейтинговых матчей выбранного патча')
    return {
        'schemaVersion':1, 'source':'OpenDota public_matches', 'sourceUrl':'https://docs.opendota.com/',
        'patch':patch, 'generatedAt':now, 'windowFrom':cutoff,'windowTo':now,
        'sampleFrom':min(m['start_time'] for m in accepted),'sampleTo':max(m['start_time'] for m in accepted),
        'matchCount':len(accepted),'scannedCount':len(rows),'rejected':dict(dropped),
        'minRank':MIN_RANK,'rankLabel':'Divine+ (средний ранг матча)',
        'gameMode':'Ranked All Pick','roleSpecific':False,'sampleLimit':MAX_PAGES*PAGE_SIZE,
        'sampling':'До 50 000 последних доступных матчей; не вся популяция игроков',
        'heroStats':dict(hero_stats),
        'matchups':{str(h):[{'hero_id':enemy,**stat} for enemy,stat in pairs.items()] for h,pairs in counters.items()},
        'synergies':dict(synergies),
    }, accepted


def write_json(path, data):
    path=pathlib.Path(path)
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    temp.replace(path)


def collect(root, progress=None, seed=None):
    root=pathlib.Path(root)
    report=progress or (lambda **kw:None)
    now=time.time()
    report(stage='Проверяем текущий патч Valve',scanned=0)
    patches=json.loads(download(PATCH_LIST_URL))['patches']
    patch=patch_window(patches,now)
    cutoff=max(patch['releasedAt'],now-WINDOW_DAYS*86400)
    rows=[];before=None
    for page in range(MAX_PAGES):
        report(stage=f'Загружаем матчи {patch["name"]} · страница {page+1}/{MAX_PAGES}',scanned=len(rows))
        payload=seed if page==0 and seed is not None else json.loads(download(query_url(before)))
        batch=checked_rows(payload)
        if not batch:break
        ids=[m.get('match_id') for m in batch if isinstance(m.get('match_id'),int)]
        if not ids:raise ValueError('Explorer вернул матчи без идентификаторов')
        cursor=min(ids)
        if before is not None and cursor>=before:raise ValueError('Explorer не продвигает страницу матчей')
        rows.extend(batch)
        before=cursor
        starts=[m.get('start_time',0) for m in batch]
        if max(starts)<cutoff or len(batch)<PAGE_SIZE:break
        if page+1<MAX_PAGES:time.sleep(1.2)
    report(stage='Считаем мету, контрпики и совместные результаты',scanned=len(rows))
    known={h['id'] for h in json.loads((root/'data/heroes.json').read_text())}
    result,accepted=aggregate(rows,patch,now,known)
    result['windowCapped']=len(rows)>=MAX_PAGES*PAGE_SIZE and result['sampleFrom']>cutoff
    write_json(root/'data/meta-matches.json',accepted)
    write_json(root/'data/meta.json',result)
    report(stage='Готово',scanned=len(rows),matches=result['matchCount'],patch=patch['name'])
    return result


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--seed');args=parser.parse_args()
    seed=json.loads(pathlib.Path(args.seed).read_text()) if args.seed else None
    result=collect(pathlib.Path(__file__).resolve().parent,lambda **kw:print(json.dumps(kw,ensure_ascii=False),flush=True),seed)
    print(json.dumps({'patch':result['patch']['name'],'matches':result['matchCount'],'heroes':len(result['heroStats'])},ensure_ascii=False))
