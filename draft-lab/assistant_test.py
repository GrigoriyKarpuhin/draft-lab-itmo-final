import unittest
from unittest.mock import patch
import assistant

class AgentTests(unittest.TestCase):
 def setUp(self):
  self.q={'question':'Объясни выбор','state':{'mode':'free','first':'radiant','history':[],'pool':[]},'side':'radiant','type':'pick','role':1,'personalPool':[1,8,42],'metaMode':'fresh','history':[]}
 def test_bad_question_rejected(self):
  for value in ['', 'a'*2001, None]:
   self.q['question']=value
   with self.assertRaises(ValueError): assistant.run(self.q)
 def test_unknown_tool_is_rejected(self):
  with self.assertRaises(ValueError):assistant.execute_tool('run_shell',{'cmd':'echo unsafe'},self.q,{})
 def test_facts_have_source_and_unknown_hero_rejected(self):
  result=assistant.get_facts([41]);self.assertTrue(result['facts']);self.assertTrue(all(f['url'].startswith('https://') for f in result['facts']))
  with self.assertRaises(ValueError):assistant.get_facts([99999])
 def test_invalid_citation_and_unavailable_candidate_fall_back(self):
  evidence={'candidates':[{'id':42,'name':'Wraith King','score':58,'role':1,'reasons':['Контроль'],'evidenceId':'engine:42'}],'limitations':['Ограничение']}
  for answer in [{'answer':'Придумано','candidate_ids':[999],'evidence_ids':['engine:42'],'risk':'риск'}, {'answer':'Придумано','candidate_ids':[42],'evidence_ids':['fake:42'],'risk':'риск'}]:
   result=assistant.validate_answer(answer,evidence,[]);self.assertEqual(result['status'],'fallback');self.assertNotIn('Придумано',result['answer'])
 def test_model_connection_error_is_explicit(self):
  with patch.object(assistant,'ollama_chat',side_effect=ConnectionError('offline')):
   with self.assertRaises(ConnectionError):assistant.run(self.q)
 def test_tool_execution_then_structured_answer(self):
  replies=[{'message':{'role':'assistant','content':'','tool_calls':[{'function':{'name':'get_candidates','arguments':{}}}]},'eval_count':10,'prompt_eval_count':100}, {'message':{'role':'assistant','content':'{"mode":"explain","candidate_ids":[42],"reason_ids":["reason:42:1"],"fact_ids":[],"note_code":"data_limited"}'},'eval_count':40,'prompt_eval_count':400}]
  with patch.object(assistant,'ollama_chat',side_effect=replies):r=assistant.run_evidence_legacy(self.q)
  self.assertEqual(r['status'],'ok');self.assertEqual(r['trace'][0]['tool'],'get_candidates');self.assertEqual(r['usage']['output_tokens'],50)

 def test_prepared_facts_have_no_unresolved_template_tokens(self):
  result=assistant.get_facts([41]);self.assertTrue(any(f['ability']=='Chronosphere' for f in result['facts']))
  self.assertTrue(all('%backtrack_duration%' not in f['text'] for f in result['facts']))
 def test_same_context_tool_arguments_are_accepted_but_changes_rejected(self):
  evidence={'candidates':[]}
  self.assertEqual(assistant.execute_tool('get_candidates',{'role':1,'side':'radiant'},self.q,evidence),evidence)
  with self.assertRaises(ValueError):assistant.execute_tool('get_candidates',{'role':2},self.q,evidence)
 def test_selection_cannot_invent_claims_or_change_ranking(self):
  evidence={'candidates':[{'id':42,'name':'Wraith King','score':58.89,'role':1,'reasons':['Добавляет контроль'],'evidenceId':'engine:42'},{'id':8,'name':'Juggernaut','score':55.97,'role':1,'reasons':['Помогает забирать строения'],'evidenceId':'engine:8'}],'limitations':['Индекс не вероятность']}
  selected={'mode':'compare','candidate_ids':[8,42],'reason_ids':['reason:42:0','reason:8:0'],'fact_ids':[],'note_code':'data_limited','answer':'100% победа'}
  result=assistant.render_selection(selected,evidence,[])
  self.assertNotIn('100%',result['answer']);self.assertLess(result['answer'].index('Wraith King'),result['answer'].index('Juggernaut'));self.assertIn('Добавляет контроль',result['answer'])
 def test_selection_unknown_fact_falls_back(self):
  e={'candidates':[],'limitations':[]};r=assistant.render_selection({'mode':'facts','candidate_ids':[],'reason_ids':[],'fact_ids':['invented'],'note_code':'data_limited'},e,[])
  self.assertEqual(r['status'],'fallback')
 def test_complete_draft_risks_do_not_require_candidates(self):
  e={'candidates':[],'limitations':[],'compositionRisks':[{'id':'composition:radiant:0','text':'Нет героя с тегом Pusher.'}]}
  r=assistant.render_selection({'mode':'risks','candidate_ids':[],'reason_ids':['composition:radiant:0'],'fact_ids':[],'note_code':'data_limited'},e,[])
  self.assertEqual(r['status'],'ok');self.assertIn('Нет героя с тегом Pusher',r['answer']);self.assertNotIn('кандидатов нет',r['answer'])
 def test_selected_fact_is_displayed_even_if_model_chooses_explain_mode(self):
  e={'candidates':[],'limitations':[]};facts=[{'id':'mechanics:41:chrono','hero':'Faceless Void','ability':'Chronosphere','text':'Creates a blister in spacetime.'}]
  s={'mode':'explain','candidate_ids':[],'reason_ids':[],'fact_ids':['mechanics:41:chrono'],'note_code':'data_limited'}
  r=assistant.render_selection(s,e,facts);self.assertIn('Creates a blister',r['answer']);self.assertIn('mechanics:41:chrono',r['evidence_ids'])
 def test_explanation_includes_available_alternative_and_engine_risk(self):
  e={'candidates':[{'id':42,'name':'Wraith King','score':58.89,'role':1,'reasons':['Добавляет контроль','Возможный ответ: Dragon Knight'],'evidenceId':'engine:42'},{'id':8,'name':'Juggernaut','score':55.97,'role':1,'reasons':['Помогает забирать строения'],'evidenceId':'engine:8'}],'limitations':[]}
  s={'mode':'explain','candidate_ids':[42],'reason_ids':['reason:42:0'],'fact_ids':[],'note_code':'data_limited'}
  r=assistant.render_selection(s,e,[]);self.assertIn('Juggernaut',r['answer']);self.assertIn('Dragon Knight',r['answer']);self.assertIn(8,r['candidate_ids'])
 def test_explicit_best_request_cannot_skip_engine_leader(self):
  e={'candidates':[{'id':42,'name':'Wraith King','score':58.89,'role':1,'reasons':['Добавляет контроль'],'evidenceId':'engine:42'},{'id':8,'name':'Juggernaut','score':55.97,'role':1,'reasons':['Помогает забирать строения'],'evidenceId':'engine:8'}]}
  s={'mode':'compare','candidate_ids':[8],'reason_ids':[],'fact_ids':[],'note_code':'no_facts'}
  n=assistant.normalize_selection(s,{'question':'Объясни лучшую рекомендацию'},e)
  self.assertEqual(n['mode'],'explain');self.assertEqual(n['candidate_ids'],[42]);self.assertEqual(n['note_code'],'data_limited')
