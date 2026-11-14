import copy
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from meta_data import aggregate, patch_window, collect

NOW=2000000
PATCH={'name':'7.41f','releasedAt':NOW-1000,'verifiedAt':NOW}
def match(mid=1,**kw):
    return {'match_id':mid,'start_time':NOW-100,'duration':2000,'game_mode':22,'lobby_type':7,
            'avg_rank_tier':75,'radiant_win':True,'radiant_team':[1,2,3,4,5],'dire_team':[6,7,8,9,10],**kw}

class MetaTests(unittest.TestCase):
    def test_current_patch_ignores_future_announcements(self):
        rows=[{'patch_number':'old','patch_timestamp':NOW-2000}, {'patch_number':'7.41f','patch_timestamp':NOW-1000}, {'patch_number':'future','patch_timestamp':NOW+100}]
        self.assertEqual(patch_window(rows,NOW)['name'],'7.41f')

    def test_win_counts_counter_direction_and_synergy_are_consistent(self):
        rows=[match(),match(2,radiant_win=False)]
        meta,accepted=aggregate(rows,PATCH,NOW)
        self.assertEqual(meta['matchCount'],2)
        self.assertEqual(sum(x['games'] for x in meta['heroStats'].values()),20)
        self.assertEqual(sum(x['wins'] for x in meta['heroStats'].values()),10)
        self.assertEqual(meta['heroStats'][1],{'games':2,'wins':1})
        pair=next(p for p in meta['matchups']['1'] if p['hero_id']==6)
        self.assertEqual(pair,{'hero_id':6,'games_played':2,'wins':1})
        self.assertEqual(meta['synergies']['1:2'],{'games':2,'wins':1})
        self.assertNotIn('1:6',meta['synergies'])
        self.assertEqual(sum(p['games'] for p in meta['synergies'].values()),40)
        self.assertEqual(sum(p['games_played'] for rows in meta['matchups'].values() for p in rows),100)

    def test_wrong_patch_mode_rank_bad_lineups_and_duplicates_do_not_enter_stats(self):
        rows=[match(),match(),match(2,start_time=NOW-2000),match(3,start_time=NOW+1),match(4,game_mode=23),
              match(5,lobby_type=0),match(6,avg_rank_tier=65),match(7,duration=100),
              match(8,radiant_team=[0,2,3,4,5]),match(9,radiant_team=None),match(10,radiant_team=[6,2,3,4,5])]
        meta,accepted=aggregate(rows,PATCH,NOW,set(range(1,11)))
        self.assertEqual(meta['matchCount'],1)
        self.assertEqual(meta['sampleFrom'],NOW-100)
        self.assertEqual(meta['rejected']['duplicateOrMissingId'],1)
        self.assertEqual(meta['heroStats'][1]['games'],1)

    def test_seven_day_window_applies_even_if_patch_is_older(self):
        old={**PATCH,'releasedAt':NOW-30*86400}
        meta,_=aggregate([match(),match(2,start_time=NOW-8*86400)],old,NOW)
        self.assertEqual(meta['matchCount'],1)
        self.assertEqual(meta['windowFrom'],NOW-7*86400)

    def test_upstream_failure_preserves_previous_meta_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);(root/'data').mkdir();old={'previous':'snapshot'}
            (root/'data/meta.json').write_text(json.dumps(old))
            patches={'patches':[{'patch_number':'7.41f','patch_timestamp':NOW-1000}]}
            with patch('meta_data.time.time',return_value=NOW),patch('meta_data.download',side_effect=[json.dumps(patches).encode(),b'{"err":"timeout"}']):
                with self.assertRaisesRegex(ValueError,'timeout'):collect(root)
            self.assertEqual(json.loads((root/'data/meta.json').read_text()),old)

if __name__=='__main__':unittest.main()
