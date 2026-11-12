import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.hit_regions import bounded_regions
class HitTests(unittest.TestCase):
    def test_regions_are_clipped_and_invalid_native_coordinates_are_rejected(self):
        self.assertEqual(bounded_regions([[-2,-1,5,4],[519,419,10,10],[float('nan'),0,1,1],[0,0,-1,2],['x',0,1,1]]),[(0,0,3,3),(519,419,1,1)])
        self.assertEqual(bounded_regions([[0,0,1,1]]*6001),[])
