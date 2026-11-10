import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {edgeState,mountEdgeNavigation} from '../web/edge-navigation.js';

test('short, top, middle and bottom states tolerate fractional scroll positions',()=>{
 assert.deepEqual(edgeState(0,500,500),{up:false,down:false});
 assert.deepEqual(edgeState(0,501.5,500),{up:false,down:false});
 assert.deepEqual(edgeState(0,1500,500),{up:false,down:true});
 assert.deepEqual(edgeState(500,1500,500),{up:true,down:true});
 assert.deepEqual(edgeState(999.5,1500,500),{up:true,down:false});
});
test('persistent buttons navigate the current scroll panel and obey reduced motion',()=>{
 const dom=new JSDOM('<main><section id="compare"></section></main><nav><button data-edge="up"></button><button data-edge="down"></button></nav>',{pretendToBeVisual:true});
 const {document}=dom.window;const main=document.querySelector('main'),compare=document.querySelector('section'),nav=document.querySelector('nav');
 let target=main,top=0,height=1500,calls=[];
 for(const panel of [main,compare]){
  Object.defineProperties(panel,{scrollTop:{get:()=>top},scrollHeight:{get:()=>height},clientHeight:{value:500}});
  panel.scrollTo=options=>calls.push([panel,options]);
 }
 dom.window.matchMedia=()=>({matches:true});
 const controller=mountEdgeNavigation(nav,()=>target);
 const [up,down]=nav.children;
 assert.equal(up.tabIndex,-1);assert.equal(down.dataset.visible,'true');
 down.click();assert.deepEqual(calls[0],[main,{top:1500,behavior:'auto'}]);
 top=500;controller.update();assert.equal(up.dataset.visible,'true');
 target=compare;up.click();assert.deepEqual(calls[1],[compare,{top:0,behavior:'auto'}]);
 top=1000;controller.update();assert.equal(down.inert,true);assert.equal(up.tabIndex,0);
 height=500;top=0;controller.update();assert.equal(up.dataset.visible,'false');assert.equal(down.dataset.visible,'false');
 assert.equal(nav.children[0],up);assert.equal(nav.children[1],down);
 controller.dispose();up.click();assert.equal(calls.length,2);dom.window.close();
});
