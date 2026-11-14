"""Resolve explicit conversational role constraints before scoring; never mutate the UI draft."""
import re

def mentioned_roles(text):
 text=text.lower().replace('ё','е').strip()
 if re.fullmatch(r'[1-5][.!]?',text):return [int(text[0])]
 # Discard negated role labels rather than turning them into requests.
 text=re.sub(r'\bне\s+(?:саппорт\w*|керри|мидер\w*|оффлейнер\w*)','',text)
 numeric=re.findall(r'(?:позици\w*|поз\.?|pos)\s*([1-5])\b|\b([1-5])\s*(?:позици\w*|поз\b)',text)
 if numeric:return sorted({int(a or b) for a,b in numeric})
 for stem,role in [('перв',1),('втор',2),('трет',3),('четверт',4),('пят',5)]:
  if re.search(stem+r'\w*\s+позици',text):return [role]
 if re.search(r'пятерк|пятероч|хард.?саппорт|полной поддержки',text):return [5]
 if re.search(r'четверк|четвероч|роумер',text):return [4]
 if re.search(r'\bкерри\b|\bcarry\b',text):return [1]
 if re.search(r'\bмид\w*',text):return [2]
 if re.search(r'офф?лейн|\bтройк',text):return [3]
 if re.search(r'саппорт|сапорт|\bsupport\b',text):return [4,5]
 return []

def resolve_request(q):
 result={**q};roles=mentioned_roles(q['question'])
 if re.search(r'я хочу|мне нужен|мне нужна',q['question'],re.I) and re.search(r'пик|брать|взять',q['question'],re.I):result['type']='pick'
 if not roles:
  for m in reversed(q.get('history',[])):
   if m.get('role')=='user' and not m['content'].startswith('[Предыдущее состояние драфта]'):
    roles=mentioned_roles(m['content'])
    if roles:break
 if not roles and q.get('role'):roles=[q['role']]
 result['requestedRoles']=roles
 if roles:result['role']=roles[0] if len(roles)==1 else 0
 result['enemySynergies']=bool(re.search(r'связк|синерги|комбинац',q['question'],re.I) and re.search(r'враг|враж|соперник|противник',q['question'],re.I))
 result['needsRole']=not roles and bool(re.search(r'взять|брать|посовет|пик|противодейств|контр|кого',q['question'],re.I))
 return result
