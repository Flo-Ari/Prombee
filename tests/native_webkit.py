"""Reusable GTK/WebKit UI regression harness; run explicitly on a desktop display.

All prompt fixtures and screenshots are confined to .cache/prombee/native-ui.
"""
from pathlib import Path
import sys,json,os,copy,subprocess
root=Path(__file__).resolve().parents[1];sys.path[:0]=[str(root),str(root/'backend')]
from prombee.services.library import Library
from prombee.server import valid
folder=root/('.cache/prombee/native-ui/ui-data-'+str(os.getpid()))
lib=Library(root,folder,valid);package=lib.load();state=package['state']
def h(id,level,text):return dict(id=id,kind='heading',level=level,html=text)
def b(id,text=''):return dict(id=id,kind='item',level=1,html=text)
state['documents']=[dict(id='r1',name='第1轮',nodes=[h('p',1,'父'),b('pb','父正文'),h('e',2,'空子级'),b('eb'),h('ec',3,'空孙级'),b('ecb'),h('f',2,'有正文子级'),b('fb','保留'),h('last',1,'空顶级'),b('lastb')])];state['current']='r1'
state['editorSession']={'page':'editor','views':{'editor:r1':{'top':0,'active':'fb','caret':{'start':[0],'startOffset':2,'end':[0],'endOffset':2},'selected':[]}}}
lib.save(dict(state=state,setId=package['set']['id'],baseRevision=package['revision'],baseFingerprint=package['fingerprint']))
skill=folder/'fixture-skills/native-check/SKILL.md';skill.parent.mkdir(parents=True);skill.write_text('---\nname: native-check\ndescription: Native completion fixture\n---\nTest only',encoding='utf-8')
from prombee.services.other import OtherSettings
OtherSettings(folder).skill_folder('codex',str(skill.parent.parent))
from prombee.adapters.linux import host as desktop
exec(compile((root/'backend/prombee/adapters/linux/host.py').read_text().replace('app.prombee.Prombee','app.prombee.UITest'+str(os.getpid())),str(root/'backend/prombee/adapters/linux/host.py'),'exec'),desktop.__dict__)
from prombee.adapters.linux.floating import GtkFloating
start_server = desktop.start_server
def test_server(*args, **kwargs):
 server = start_server(*args, **kwargs)
 server.services.library.temporary_dir=folder/'temporary/data'
 server.services.updater.change(status='ready', latest='0.99.0', updateAvailable=True, cached=True)
 return server
desktop.start_server = test_server
original=GtkFloating.__init__;success=[False]
script=r'''(async()=>{try{
 const $=id=>document.getElementById(id),assert=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(test,label)=>{const end=Date.now()+5000;while(!test()){if(Date.now()>end)throw Error(label+' '+JSON.stringify({status:$('status').textContent,toast:$('toast').textContent,errors:window.prombeeErrors}));await wait(30);}};
 await until(()=>$('settingsTab').classList.contains('has-update'),'update badge');
 $('settingsTab').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));assert($('settingsTab').title.includes('可更新至 0.99.0'),'update hint survives shortcuts');
 const dot=$('settingsTab').querySelector('.update-dot');assert(getComputedStyle(dot).display==='block'&&dot.getBoundingClientRect().width===7,'visible update dot');
 const field=id=>document.querySelector('.content[data-id="'+id+'"]');
 assert(document.activeElement===field('fb')&&getSelection().anchorOffset===2,'restored editor focus and caret');
 assert($('listType').value==='all-unordered'&&document.querySelector('[data-select-id=listType] .dropdown-label').textContent==='全部无序','initial global unordered label');
 assert($('deleteEmpty').getAttribute('aria-pressed')==='true','exclude empty defaults on');
 assert((await (await fetch('/api/other?preferences=1')).json()).enabled===true,'application jump defaults on');
 field('p').focus();field('p').dispatchEvent(new KeyboardEvent('keydown',{key:'q',ctrlKey:true,bubbles:true,cancelable:true}));assert(!$('headingMenu').hidden,'Ctrl+Q add');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 field('p').dispatchEvent(new KeyboardEvent('keydown',{key:'e',ctrlKey:true,bubbles:true,cancelable:true}));assert(field('pb').closest('.row').hidden,'Ctrl+E collapse');field('p').dispatchEvent(new KeyboardEvent('keydown',{key:'e',ctrlKey:true,bubbles:true,cancelable:true}));assert(!field('pb').closest('.row').hidden,'Ctrl+E expand');

 const caret=(el,end=true)=>{el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(!end);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));};
 assert(getComputedStyle(field('p')).fontSize==='24px','H1 18pt');assert(Math.abs(parseFloat(getComputedStyle(field('e')).fontSize)-21.333)<.05,'H2 16pt');assert(Math.abs(parseFloat(getComputedStyle(field('ec')).fontSize)-18.667)<.05,'H3 14pt');
 assert(getComputedStyle(field('p')).color!==getComputedStyle(field('e')).color,'heading colors');
 caret(field('fb'));const original=field('fb').textContent;field('fb').dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'new',bubbles:true}));field('fb').textContent+='new';field('fb').dispatchEvent(new Event('input',{bubbles:true}));caret(field('fb'));$('undo').click();assert(document.activeElement===field('fb')&&field('fb').textContent===original,'undo caret retained');
 caret(field('eb'));field('eb').dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));assert(!field('eb')&&document.activeElement===field('e'),'Backspace previous');$('undo').click();caret(field('eb'));field('eb').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));assert(document.activeElement===field('ec'),'Delete next');$('undo').click();
 $('listType').value='all-ordered';$('listType').dispatchEvent(new Event('change'));assert(/1/.test(field('pb').closest('.row').querySelector('.marker').textContent),'global lists');caret(field('e'));$('listType').value='none';$('listType').dispatchEvent(new Event('change'));assert(field('eb').closest('.row').querySelector('.marker').textContent==='','heading local descendants');assert(/1/.test(field('pb').closest('.row').querySelector('.marker').textContent),'sibling list intact');assert($('listType').value==='all-ordered','local command preserves global state');const listButton=document.querySelector('[data-select-id=listType] .dropdown-trigger');assert(listButton.textContent==='全部有序','global state label');listButton.click();assert(document.querySelector('.dropdown-option[aria-selected=true]').dataset.value==='all-ordered','global state popup');assert(![...document.querySelectorAll('.dropdown-option[aria-selected=true]')].some(e=>!e.dataset.value.startsWith('all-')),'local actions have no selected state');listButton.click();
 const handle=$('paper').querySelector('.display-resizer.right');assert(handle,'paper resize grip');handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));await wait(200);assert((await (await fetch('/api/display')).json()).width===1100,'display saved');
 const file=new File(['long code fixture'],'代码.txt',{type:'text/plain'});const asset=await (await fetch('/api/attachments/upload?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})).json();
 const paste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{files:[file],getData:()=>''}});caret(field('pb'));field('pb').dispatchEvent(paste);await wait(600);assert(document.querySelectorAll('.attachment-card').length===1,'gallery attachment');assert(getComputedStyle($('attachmentGallery')).backgroundColor==='rgba(255, 255, 255, 0.5)','attachment background 50%');assert(getComputedStyle(document.querySelector('.attachment-card')).opacity==='1','card remains opaque');assert(/代码(?:\(\d+\))?/.test(field('pb').textContent) && !field('pb').textContent.includes('file:///'),'paste file reference');
 $('copy').click();await until(()=>$('documents').selectedOptions[0].textContent.includes('✓'),'copied check');
 const nativePaste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(nativePaste,'clipboardData',{value:{files:[],getData:()=>''}});caret(field('fb'));field('fb').dispatchEvent(nativePaste);await until(()=>/代码(?:\\(\\d+\\))?/.test(field('fb').textContent),'native paste');assert(document.querySelectorAll('.attachment-card').length===1&&/代码(?:\(\d+\))?/.test(field('fb').textContent) && !field('fb').textContent.includes('file:///'),'native clipboard file paste');
 const c=field('fb');c.textContent='甲乙\n丙丁';c.dispatchEvent(new Event('input',{bubbles:true}));caret(c);let sr=document.createRange();sr.selectNodeContents(c);getSelection().removeAllRanges();getSelection().addRange(sr);document.dispatchEvent(new Event('selectionchange'));await wait(60);assert($('stats').textContent==='2 行 · 4 字','selected statistics');getSelection().collapseToEnd();document.dispatchEvent(new Event('selectionchange'));await wait(60);assert($('stats').textContent.includes('个条目'),'total statistics restored');
 c.textContent='一\n二\n';c.dispatchEvent(new Event('input',{bubbles:true}));caret(c);let tail=document.createRange();tail.selectNodeContents(c);getSelection().removeAllRanges();getSelection().addRange(tail);document.dispatchEvent(new Event('selectionchange'));await wait(60);assert($('stats').textContent==='3 行 · 2 字','selected trailing empty line');c.style.width='100px';c.textContent='自动折行'.repeat(30);c.dispatchEvent(new Event('input',{bubbles:true}));let wrap=document.createRange();wrap.selectNodeContents(c);getSelection().removeAllRanges();getSelection().addRange(wrap);document.dispatchEvent(new Event('selectionchange'));await wait(60);assert(parseInt($('stats').textContent)>1,'wrapped selection lines');c.style.width='';c.textContent='甲乙\n丙丁';c.dispatchEvent(new Event('input',{bubbles:true}));caret(c);
 const longText=Array.from({length:21},(_,i)=>'临时原文'+i).join('\n');const longPaste=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(longPaste,'clipboardData',{value:{files:[],getData:()=>longText}});caret(c);c.dispatchEvent(longPaste);await wait(600);assert(c.textContent.endsWith('粘贴内容')&&!c.textContent.includes('临时原文'),'temporary filename only');assert(document.querySelectorAll('.attachment-card').length===2,'temporary gallery card');const tmpId=document.querySelectorAll('.attachment-card')[1].dataset.attachmentId;assert(await(await fetch('/api/attachments/'+tmpId)).text()===longText,'complete temporary body');
 const width=$('paper').getBoundingClientRect().width;document.querySelector('.attachment-toggle').click();assert($('attachmentItems').hidden,'collapse attachment list');assert($('attachmentGallery').getBoundingClientRect().width===42,'compact collapsed rail');document.querySelector('.attachment-toggle').click();assert(!$('attachmentItems').hidden,'expand attachment list');
 await until(()=>!$('toast').classList.contains('show'),'previous copy feedback expired');
 document.querySelectorAll('.attachment-card')[1].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:900,clientY:400}));assert(document.querySelector('.attachment-menu button').textContent==='另存为','save as context');document.querySelector('.attachment-menu button').click();await wait(1000);assert(!document.querySelector('.attachment-menu'),'save menu dismissed');assert(!$('toast').classList.contains('show'),'save as error: '+$('toast').textContent);
 $('template').click();$('template').click();assert(document.body.dataset.page==='editor','tab toggles');$('settingsTab').click();assert(!$('copy').hidden,'copy visible in settings');$('otherTab').click();await wait(400);assert($('clearUserData')&&$('recognizeMarkdown').parentElement.title,'settings help');const jump=document.querySelector('[data-select-id=copyJumpTarget] .dropdown-trigger');await until(()=>jump.style.getPropertyValue('--jump-outline-light'),'jump dash geometry '+JSON.stringify({page:document.body.dataset.page,hidden:$('otherPanel').hidden,rect:jump.getBoundingClientRect().toJSON(),observer:typeof ResizeObserver,style:jump.getAttribute('style')}));const encoded=jump.style.getPropertyValue('--jump-outline-light').match(/data:image\/svg\+xml,([^"\)]+)/)[1],svg=new DOMParser().parseFromString(decodeURIComponent(encoded),'image/svg+xml').documentElement;assert(Math.abs(Number(svg.getAttribute('width'))-jump.getBoundingClientRect().width)<1,'jump outline uses actual width');assert(svg.querySelector('rect').getAttribute('stroke-dasharray')==='18 6','jump dashes are fixed pixels');$('updatesTab').click();await wait(100);assert($('updatesTab').classList.contains('has-update'),'opening updates keeps notification');$('editorTab').click();
 assert($('theme').nextElementSibling===$('minimizeWindow'),'theme placement');assert(document.querySelector('.brand img.brand-lockup'),'single outlined logo image');
 assert(document.querySelector('.header-tab-pointer').style.left,'active header pointer positioned');assert(getComputedStyle($('attachmentGallery')).flexDirection==='column','vertical gallery');
 assert($('attachmentGallery').getBoundingClientRect().right>innerWidth-20,'rightmost gallery');
 assert($('edgeNavigation').closest('footer'),'footer navigation');
 await wait(400);assert($('status').textContent==='','quiet autosave');document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await wait(300);assert($('status').textContent.includes('已保存'),'manual save receipt');await wait(5100);assert($('status').textContent==='','receipt expires');
 const mainElement=document.querySelector('main');mainElement.scrollTop=180;mainElement.dispatchEvent(new Event('scroll'));await wait(350);
 if($('edgeNavigation').dataset.layout==='both'){for(const element of $('edgeNavigation').querySelectorAll('button'))for(const animation of element.getAnimations?.()||[])animation.finish();const up=document.querySelector('[data-edge=up]').getBoundingClientRect(),down=document.querySelector('[data-edge=down]').getBoundingClientRect();assert(up.left<down.left,'top left bottom right');}
 mainElement.scrollTop=0;mainElement.dispatchEvent(new Event('scroll'));await wait(350);for(const element of $('edgeNavigation').querySelectorAll('button'))for(const animation of element.getAnimations?.()||[])animation.finish();const button=document.querySelector('[data-edge=down]'),footer=document.querySelector('footer').getBoundingClientRect(),b=button.getBoundingClientRect();if(button.dataset.visible==='true')assert(Math.abs(b.left+b.width/2-footer.left-footer.width/2)<2,'single footer button centered');
 const r=$('paper').getBoundingClientRect(),main=document.querySelector('main').getBoundingClientRect();assert(r.left>=main.left&&r.right<=main.right,'paper within viewport');
 const oldSet=(await (await fetch('/api/library')).json()).active;
 const restoreHtml=field('fb').innerHTML;field('fb').focus();field('fb').textContent='长文本保存验证'.repeat(16000);field('fb').dispatchEvent(new Event('input',{bubbles:true}));
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));
 await until(()=>$('status').textContent.includes('已保存'),'large manual save');
 const stored=await (await fetch('/api/state')).json();assert(stored.state.editorSession.views['editor:r1'].active==='fb','editor session saved with workspace');assert(stored.state.documents[0].nodes.find(n=>n.id==='fb').html.length>65536,'large content saved');
 field('fb').innerHTML=restoreHtml;field('fb').dispatchEvent(new Event('input',{bubbles:true}));
 $('libraryTab').click();await wait(350);$('createTemporarySet').click();
 await until(()=>$('recentSets').value!==oldSet&&$('recentSets').selectedOptions[0]?.textContent==='临时词集1','temporary set opened');
 const temporary=await (await fetch('/api/state')).json();assert(temporary.set.path.endsWith('/temporary/data/临时词集1.txt'),'isolated temporary path');
 $('recentSets').value=oldSet;$('recentSets').dispatchEvent(new Event('change',{bubbles:true}));await until(()=>!!field('fb'),'original set restored');
 window.__ui={ok:true,rows:document.querySelectorAll('.content').length,paper:[r.x,r.width],attachment:asset.name};
 }catch(error){window.__ui={ok:false,error:error.message+'\n'+error.stack}}})();'''
def init(self,*args):
 original(self,*args);self.preferences.orb_enabled=False;self.x.activate(self.window)
 def cancel_picker():
  if getattr(self.app,'file_picker_cancel',None):
   print('NATIVE_SAVE_DIALOG_OK',flush=True);self.app.file_picker_cancel.cancel()
  return True
 self.GLib.timeout_add(100,cancel_picker)
 tries=[0]
 def poll():
  tries[0]+=1
  if tries[0]>200:print('UI_TIMEOUT',flush=True);self.app.quit();return False
  def ready(view,result,_):
   if view.evaluate_javascript_finish(result).to_string()!='true':self.GLib.timeout_add(100,poll);return
   self.editor.evaluate_javascript(script,-1,None,None,None,None,None);self.GLib.timeout_add(100,results)
  self.editor.evaluate_javascript('!!window.prombeeReady',-1,None,None,None,ready,None);return False
 shots=[('light',''),('dark',"document.getElementById('theme').click()"),('preview',"document.getElementById('theme').click();document.getElementById('preview').click()"),('settings',"document.getElementById('settingsTab').click();document.getElementById('otherTab').click()"),('library',"document.getElementById('libraryTab').click()"),('history',"document.getElementById('compare').click()")]
 def snapshot(index=0):
  if index==len(shots):self.app.quit();return False
  name,action=shots[index]
  if action:self.editor.evaluate_javascript(action,-1,None,None,None,None,None)
  def capture():
   self.editor.evaluate_javascript("for(const e of document.querySelectorAll('.header-tab-pointer,#edgeNavigation button'))for(const a of e.getAnimations?.()||[])a.finish()",-1,None,None,None,None,None)
   def measured(view,result,_):print('VISUAL_STATE',name,view.evaluate_javascript_finish(result).to_string(),flush=True)
   self.editor.evaluate_javascript("JSON.stringify({dark:document.body.className,button:({bg:getComputedStyle(document.getElementById('template')).backgroundColor,face:getComputedStyle(document.getElementById('template')).getPropertyValue('--button-face'),text:getComputedStyle(document.getElementById('template')).color}),pointer:document.querySelector('.header-tab-pointer')?.outerHTML,pointerRect:document.querySelector('.header-tab-pointer')?.getBoundingClientRect().toJSON(),errors:window.prombeeErrors})",-1,None,None,None,measured,None)
   def saved(view,result,_):view.get_snapshot_finish(result).save_to_png(str(root/f'.cache/prombee/native-ui/{name}.png'));self.GLib.timeout_add(100,lambda:snapshot(index+1))
   self.editor.get_snapshot(self.WebKit.SnapshotRegion.VISIBLE,self.WebKit.SnapshotOptions.NONE,None,saved,None);return False
  self.GLib.timeout_add(700,capture);return False
 def results():
  def done(view,result,_):
   raw=view.evaluate_javascript_finish(result).to_string()
   if raw=='null':self.GLib.timeout_add(100,results);return
   value=json.loads(raw);print('NATIVE_UI',json.dumps(value),flush=True)
   if not value['ok']:self.app.quit();return
   success[0]=True;self.GLib.timeout_add(700,snapshot)
  self.editor.evaluate_javascript('JSON.stringify(window.__ui||null)',-1,None,None,None,done,None);return False
 self.GLib.timeout_add(300,poll)
GtkFloating.__init__=init
sys.argv=['backend/prombee/__main__.py','--data-dir',str(folder)]
desktop.main();raise SystemExit(0 if success[0] else 1)
