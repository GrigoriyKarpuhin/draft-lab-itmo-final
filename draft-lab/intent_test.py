import unittest,json
from unittest.mock import patch
import assistant,dialogue
class IntentTests(unittest.TestCase):
 def q(self,text):return {'question':text,'state':{'mode':'free','first':'radiant','history':[{'id':85,'side':'dire','type':'pick','role':5}],'pool':[]},'side':'radiant','type':'pick','role':0,'personalPool':[],'metaMode':'fresh','history':[]}
 def test_user_support_request_filters_before_generation(self):
  q=self.q('я хочу первым пиком брать саппорта который хорош против undying')
  response={'message':{'content':json.dumps({'answer':'Уточни: четвёртая или пятая позиция?','follow_up':'','evidence_ids':[]})}}
  with patch.object(assistant,'ollama_chat',return_value=response):r=assistant.run(q)
  self.assertEqual(r['details']['requested_roles'],[4,5])
  self.assertTrue(r['details']['candidates'])
  self.assertTrue(all(h['role'] in (4,5) for h in r['details']['candidates']))
  self.assertNotIn('Doom',[h['name'] for h in r['details']['candidates']])
 def test_role_history_and_first_pick(self):
  from intent import resolve_request
  q=self.q('а кого ещё?');q['history']=[{'role':'user','content':'нужен саппорт пятой позиции'}]
  self.assertEqual(resolve_request(q)['requestedRoles'],[5])
  q['question']='теперь хочу керри';self.assertEqual(resolve_request(q)['requestedRoles'],[1])
  q=self.q('первым пиком хочу саппорта');self.assertEqual(resolve_request(q)['requestedRoles'],[4,5])
 def test_technical_weights_not_in_model_context(self):
  e=assistant.analyze(self.q('кого взять?'));c=dialogue.compact_context(e)
  self.assertNotIn('усилен вес',json.dumps(c,ensure_ascii=False))
 def test_enemy_pairs_have_their_own_evidence(self):
  q=self.q('какие у вражеской команды могут быть хорошие связки с undying? что лучше всего брать в противодействие')
  with patch.object(assistant,'ollama_chat',return_value={'message':{'content':'{"answer":"Уточни свою позицию.","follow_up":"","evidence_ids":[]}'}}):r=assistant.run(q)
  self.assertTrue(r['details']['enemy_pairs']);self.assertEqual(r['details']['candidates'],[])

 def test_wrong_role_recommendation_id_is_rejected(self):
  from intent import resolve_request
  e=assistant.analyze(resolve_request(self.q('хочу саппорта против undying')))
  r=dialogue.validate({'answer':'Выбери Doom на саппорта.','recommended_ids':[69],'evidence_ids':[]},e,[])
  self.assertEqual(r['status'],'fallback')
 def test_explicit_pick_request_overrides_ban_for_analysis_only(self):
  from intent import resolve_request
  q=self.q('я хочу первым пиком брать саппорта');q['type']='ban'
  self.assertEqual(resolve_request(q)['type'],'pick');self.assertEqual(q['type'],'ban')

 def test_support_context_contains_both_slots(self):
  from intent import resolve_request
  e=assistant.analyze(resolve_request(self.q('нужен саппорт')))
  self.assertEqual({h['role'] for h in dialogue.compact_context(e)['candidates']},{4,5})
 def test_recommendation_requires_an_explanation(self):
  e=assistant.analyze(self.q('кого взять?'));h=e['candidates'][0]
  r=dialogue.validate({'answer':'Возьми '+h['name'], 'recommended_ids':[h['id']],'evidence_ids':[h['evidenceId']]},e,[])
  self.assertEqual(r['status'],'fallback')

 def test_doom_role_is_known_even_when_not_a_candidate(self):
  from intent import resolve_request,mentioned_roles
  e=assistant.analyze(resolve_request(self.q('Doom не саппорт, нужен саппорт')))
  self.assertEqual(next(h['positions'] for h in e['discussedHeroes'] if h['name']=='Doom'),[3])
  self.assertEqual(mentioned_roles('5'),[5])
