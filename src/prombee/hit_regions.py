"""Bound browser-supplied alpha rectangles before passing them to native window APIs."""
import math
from .floating import ORB_WIDTH, ORB_HEIGHT


def bounded_regions(rectangles):
    if not isinstance(rectangles, list) or len(rectangles) > 6000: return []
    result=[]
    for rect in rectangles:
        if not isinstance(rect, list) or len(rect)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in rect): continue
        x,y,w,h=rect
        right,bottom=min(ORB_WIDTH,x+w),min(ORB_HEIGHT,y+h)
        x,y=max(0,x),max(0,y)
        if right>x and bottom>y:result.append((x,y,right-x,bottom-y))
    return result
