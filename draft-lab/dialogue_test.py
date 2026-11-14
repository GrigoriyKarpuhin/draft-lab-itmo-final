import unittest
from unittest.mock import patch
import assistant

class DialogueTests(unittest.TestCase):
 def setUp(self):
  self.q={'question':'На Свене не умею, кого ещё посмотреть?','state':{'mode':'free','first':'radiant','history':[],'pool':[]},'side':'radiant','type':'pick','role':1,'personalPool':[1,8,42],'metaMode':'fresh','history':[{'role':'user','content':'Хочу выбрать керри.'},{'role':'assistant','content':'Можем сравнить героев из твоего пула.'}]}
 def test_reply_is_natural_text_not_engine_dump_and_keeps_history(self):
  replies=[{'message':{'role':'assistant','content':'','tool_calls':[{'function':{'name':'get_candidates','arguments':{}}}]}},{'message':{'content':'{"answer":"Тогда давай посмотрим Juggernaut: он помогает забирать строения. Сравним его с Wraith King?","follow_up":"","evidence_ids":["engine:8"]}'}}]
  with patch.object(assistant,'ollama_chat',side_effect=replies) as chat:r=assistant.run(self.q)
  self.assertEqual(r['response_mode'],'conversation');self.assertTrue(r['answer'].startswith('Тогда давай'));self.assertNotIn('индекс',r['answer']);self.assertEqual(r['candidate_ids'],[])
  self.assertTrue(any(m.get('content')=='Хочу выбрать керри.' for m in chat.call_args_list[-1].args[0]))
 def test_greeting_can_be_answered_without_second_generation(self):
  self.q['question']='Привет! Чем можешь помочь?'
  with patch.object(assistant,'ollama_chat',return_value={'message':{'role':'assistant','content':'Привет! Помогу выбрать героя и разобраться в драфте. На какой позиции играешь?'}}) as chat:r=assistant.run(self.q)
  self.assertEqual(chat.call_count,1);self.assertIn('Привет!',r['answer'])
 def test_bad_source_does_not_expose_long_baseline(self):
  replies=[{'message':{'role':'assistant','tool_calls':[{'function':{'name':'get_candidates','arguments':{}}}]}},{'message':{'content':'{"answer":"Свен гарантирует победу.","follow_up":"","evidence_ids":["fake"]}'}}]
  with patch.object(assistant,'ollama_chat',side_effect=replies):r=assistant.run(self.q)
  self.assertEqual(r['status'],'fallback');self.assertLess(len(r['answer']),450);self.assertNotIn('гарантирует победу',r['answer']);self.assertNotIn('индекс',r['answer'])

 def test_statistics_reach_the_model(self):
  replies=[{'message':{'tool_calls':[{'function':{'name':'get_candidates','arguments':{}}}]}},{'message':{'content':'{"answer":"Выборка историческая.","follow_up":"","evidence_ids":[]}'}}]
  with patch.object(assistant,'ollama_chat',side_effect=replies) as chat:assistant.run(self.q)
  prompt=chat.call_args_list[-1].args[0][0]['content']
  self.assertIn('winRate',prompt);self.assertIn('games',prompt);self.assertIn('7.41f',prompt)
 def test_explicit_pick_of_selected_hero_is_rejected_but_discussion_is_allowed(self):
  import dialogue
  evidence={'candidates':[], 'selected':[{'name':'Juggernaut','id':8}], 'compositionRisks':[]}
  bad=dialogue.validate({'answer':'Бери Juggernaut на керри.','evidence_ids':[]},evidence,[])
  self.assertEqual(bad['status'],'fallback')
  good=dialogue.validate({'answer':'Juggernaut уже у соперника. Давай обсудим, как против него играть.','evidence_ids':[]},evidence,[])
  self.assertEqual(good['status'],'ok')

 def test_followup_uses_grounded_short_prose_in_one_call(self):
  self.q['question']='На Wraith King не играю. Что насчёт Juggernaut?'
  payload={'message':{'content':'{"answer":"Тогда посмотри Juggernaut: он помогает уничтожать башни противника.","follow_up":"","evidence_ids":["engine:8"]}'}}
  with patch.object(assistant,'ollama_chat',return_value=payload) as chat:r=assistant.run(self.q)
  self.assertEqual(chat.call_count,1);self.assertEqual(r['status'],'ok');self.assertIn('Тогда посмотри Juggernaut',r['answer']);self.assertEqual(r['sources'][0]['id'],'engine:8')
