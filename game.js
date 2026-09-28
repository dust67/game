/* 引擎区：剧情、人物与地图的日常编辑请使用 story.js。 */
(() => {
  'use strict';
  const S = window.STORY, KEY = 'foglight-town-save-v1', TILE = 32;
  const $ = id => document.getElementById(id), canvas = $('map'), ctx = canvas.getContext('2d');
  const fresh = () => ({ version: 1, stage: 0, x: S.start.x, y: S.start.y });
  let state = fresh(), active = null, page = 0, lastMove = 0, toastTimer, confirmAction;
  const blocked = (x,y) => !S.map[y] || !S.map[y][x] || '#H~'.includes(S.map[y][x]) || S.npcs.some(n => n.x === x && n.y === y);
  const valid = d => d && d.version === 1 && Number.isInteger(d.stage) && d.stage >= 0 && d.stage < S.quests.length && Number.isInteger(d.x) && Number.isInteger(d.y) && !blocked(d.x,d.y);
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
  function save(quiet = false) {
    const data = { ...state, savedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(data)); $('saveMeta').textContent = '已保存 · ' + new Date(data.savedAt).toLocaleTimeString('zh-CN'); if (!quiet) toast('旅途已保存。'); }
    catch { $('saveMeta').textContent = '浏览器无法保存，请使用“导出存档”备份进度。'; if (!quiet) toast('本地保存不可用，请导出存档。'); }
  }
  function restore(d) { if (!valid(d)) throw new Error('invalid'); state = { version:1, stage:d.stage, x:d.x, y:d.y }; update(); draw(performance.now()); }
  function requestConfirm(title, message, action) { $('confirmTitle').textContent=title; $('confirmText').textContent=message; confirmAction=action; $('confirm').showModal(); }
  $('cancelConfirm').onclick = () => $('confirm').close();
  $('acceptConfirm').onclick = () => { $('confirm').close(); confirmAction(); canvas.focus(); };
  $('save').onclick = () => save();
  $('load').onclick = () => {
    let data; try { const raw = localStorage.getItem(KEY); if (!raw) return toast('还没有存档，先开始一段旅程吧。'); data = JSON.parse(raw); if (!valid(data)) throw new Error('invalid'); }
    catch { return toast('存档无法读取。可以导入之前导出的备份。'); }
    requestConfirm('读取上次的记忆？','当前未保存的进度将被替换。',() => { restore(data); toast('已回到上次保存的位置。'); });
  };
  $('restart').onclick = () => requestConfirm('重新开始旅程？','这会用新旅程替换本地存档。想保留旧进度，可以先取消并导出存档。',() => { state=fresh(); update(); save(true); toast('新的旅程开始了。'); });
  $('export').onclick = () => { const blob = new Blob([JSON.stringify({...state,savedAt:new Date().toISOString()},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='雾灯小镇-存档.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('存档已导出，请保留下载的 JSON 文件。'); };
  $('import').onclick = () => $('file').click();
  $('file').onchange = async e => { const file=e.target.files[0]; e.target.value=''; if (!file) return; let data; try { if (file.size>100000) throw new Error('large'); data=JSON.parse(await file.text()); if(!valid(data)) throw new Error('invalid'); } catch { return toast('这不是有效的雾灯小镇存档。'); } requestConfirm('导入这份记忆？','当前进度与本地存档将被替换。',()=>{restore(data);save(true);toast('存档导入成功。');}); };
  function nearby() { return S.npcs.find(n=>Math.abs(n.x-state.x)+Math.abs(n.y-state.y)===1) || (state.stage===2 && Math.abs(S.item.x-state.x)+Math.abs(S.item.y-state.y)<=1 ? S.item : null); }
  function update() {
    $('quest').textContent = S.quests[state.stage]; $('questTitle').textContent = state.stage===5 ? '为归来的人留一盏灯' : '等待亮起的雾灯';
    $('dots').replaceChildren(...S.scenes.map((s,i)=>{const el=document.createElement('span');el.className='dot'+(i<state.stage?' done':'');return el;}));
    $('bag').textContent = state.stage===3?'褪色的信':state.stage===4?'旧信与回信':state.stage===5?'一盏灯的温暖':'暂无';
    $('ending').hidden=state.stage!==5; $('timeLabel').textContent=state.stage===5?'灯火 18:06':'暮色 17:42';
    const n=nearby(); $('hint').textContent=n ? `按 E / 空格 · ${n.id==='letter'?'调查': '交谈：'}${n.name}` : '方向键 / WASD 移动，靠近人物按 E 对话';
  }
  function move(dx,dy) { if ($('dialog').open || $('confirm').open) return; const x=state.x+dx,y=state.y+dy; if(!blocked(x,y)){state.x=x;state.y=y;update();} }
  function interact() {
    if($('confirm').open) return;
    if(active) return advance();
    const target=nearby(); if(!target) return toast('走到人物旁边，或靠近闪光的物品，再按 E。');
    const scene=S.scenes.find(s=>s.stage===state.stage && (s.npc===target.id || s.item===target.id));
    active=scene || {title:'小镇闲谈',lines:[S.idle[target.id]]}; page=0; renderDialogue(); $('dialog').showModal(); $('next').focus();
  }
  function closeDialogue() { active=null; $('dialog').close(); canvas.focus(); }
  function advance() { if(!active) return; if(page<active.lines.length-1){page++;renderDialogue();return;} const finished=active; closeDialogue(); if(Number.isInteger(finished.nextStage)){state.stage=finished.nextStage;update();save(true);toast(state.stage===5?'第一章完成 · 雾灯为你亮起。':'任务已更新 · 进度已尝试自动保存');} }
  function renderDialogue() {
    $('sceneTitle').textContent=active.title; $('speaker').textContent=active.lines[page][0]; $('line').textContent=active.lines[page][1]; $('pageNo').textContent=`${page+1} / ${active.lines.length} · E / 空格继续`; $('next').textContent=page===active.lines.length-1?'收好这段记忆 ✓':'继续 →';
    const el=$('illustration'), art=S.illustrations[active.illustration]; el.hidden=!art; el.replaceChildren(); if(!art) return;
    const c=document.createElement('canvas'); c.width=330;c.height=92; el.append(c); drawArt(c,active.illustration);
    if(art.src){const img=document.createElement('img');img.alt=art.title;img.src=art.src;img.onerror=()=>img.remove();el.append(img);}
    const caption=document.createElement('span');caption.className='artCaption';caption.textContent=art.src?art.title:art.note;el.append(caption);
  }
  $('next').onclick=advance; $('interact').onclick=interact; $('closeDialog').onclick=closeDialogue;
  $('dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialogue();});
  const dirs={ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0],ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1]};
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey || $('confirm').open || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const key=e.key.length===1?e.key.toLowerCase():e.key;
    if(dirs[key]){e.preventDefault();const t=performance.now();if(!e.repeat || t-lastMove>115){move(...dirs[key]);lastMove=t;}}
    else if(key==='e' || key===' '){if(key===' ' && e.target.tagName==='BUTTON' && !$('dialog').open) return; e.preventDefault();if(!e.repeat)interact();}
  });
  document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{move(...dirs[{left:'a',up:'w',down:'s',right:'d'}[b.dataset.move]]);canvas.focus();});
  $('people').replaceChildren(...S.npcs.map(n=>{const el=document.createElement('div');el.className='person';const avatar=document.createElement('span');avatar.className='avatar';avatar.style.background=n.color;const text=document.createElement('div'),name=document.createElement('strong'),role=document.createElement('small');name.textContent=n.name;role.textContent=n.role;text.append(name,role);el.append(avatar,text);return el;}));
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  function person(x,y,color,player=false){const px=x*TILE+8,py=y*TILE+4;rect(px-2,py+24,22,5,'#152e3266');rect(px+3,py,12,5,'#263435');rect(px+2,py+4,14,9,'#edc89d');rect(px+12,py+7,2,2,'#334444');rect(px,py+13,18,11,color);rect(px-3,py+14,3,8,color);rect(px+18,py+14,3,8,color);rect(px+2,py+24,5,5,'#253b40');rect(px+11,py+24,5,5,'#253b40');if(player){rect(px,py-2,18,4,'#e3d2a0');rect(px+3,py-6,12,5,'#d7c28f');rect(px+2,py+14,4,8,'#e0c895');}}
  function draw(t){
    ctx.imageSmoothingEnabled=false;
    for(let y=0;y<S.height;y++)for(let x=0;x<S.width;x++){
      const tile=S.map[y][x], px=x*TILE,py=y*TILE;rect(px,py,32,32,(x+y)%2?'#526b4b':'#506849');
      if(tile==='.'||tile==='#'){rect(px+((x*17+y*7)%24),py+10,3,3,'#79926466');rect(px+14,py+24,2,4,'#344f41');if((x*3+y)%13===0)rect(px+9,py+19,3,3,'#c4b678');}
      if(tile==='='){rect(px,py,32,32,'#a89c77');rect(px+4,py+6,7,2,'#bdb089');rect(px+20,py+24,5,2,'#8e8967');}
      if(tile==='~'||tile==='B'){rect(px,py,32,32,'#3c6971');rect(px+((Math.floor(t/450)+x*5)%18),py+8,10,2,'#6f959366');rect(px+7,py+23,12,2,'#82aaa655');}
      if(tile==='B'){rect(px,py+1,32,30,'#675948');for(let k=0;k<4;k++)rect(px+k*8,py+3,6,26,'#b59a70');rect(px,py,32,3,'#dec297');rect(px,py+29,32,3,'#574d40');}
      if(tile==='#'){rect(px+13,py+19,7,13,'#665c43');rect(px+4,py+9,26,18,'#2d5043');rect(px+7,py+2,20,19,'#3b5c45');rect(px+11,py,12,9,'#58754f');}
    }
    // 邮局：覆盖 H 碰撞区的整栋像素建筑。
    rect(94,82,133,83,'#253e3d66');rect(100,89,120,69,'#d2bc8c');rect(97,83,126,11,'#503f3d');rect(104,64,112,12,'#985e50');rect(97,76,126,12,'#ad7260');rect(113,101,24,22,'#405c5b');rect(181,101,24,22,'#405c5b');rect(116,104,8,15,'#d9bd7b');rect(184,104,8,15,'#d9bd7b');rect(148,119,25,40,'#66533f');rect(165,137,3,3,'#e4c087');rect(143,100,36,12,'#675948');ctx.font='9px sans-serif';ctx.fillStyle='#f3dfb0';ctx.textAlign='center';ctx.fillText('邮 局',161,109);
    // 广场与石井。
    rect(235,281,52,12,'#728073');rect(232,289,58,25,'#a2a28b');rect(239,292,44,12,'#405959');rect(232,311,58,6,'#64736a');
    for(const [x,y] of [[11,9],[7,13],[21,6]]) {const px=x*32+16,py=y*32;rect(px-2,py+9,4,27,'#554f3e');rect(px-7,py+3,14,13,state.stage===5?'#ffe3a1':'#a2a57c');rect(px-9,py,18,4,'#384b40');if(state.stage===5){ctx.fillStyle='#ffda8d18';ctx.beginPath();ctx.arc(px,py+9,26,0,Math.PI*2);ctx.fill();}}
    if(state.stage===2){const x=S.item.x*32+16,y=S.item.y*32+15;rect(x-7,y-4,14,10,'#f0deb1');rect(x-3,y-2,6,2,'#ab7e58');rect(x-1,y-13,2,5,'#f9dd90');rect(x-11,y-9,3,3,'#f9dd90');}
    const targetScene=S.scenes.find(s=>s.stage===state.stage);
    [...S.npcs.map(n=>({...n,player:false})),{x:state.x,y:state.y,color:'#86b9ad',player:true}].sort((a,b)=>a.y-b.y).forEach(n=>{person(n.x,n.y,n.color,n.player);if(!n.player){ctx.textAlign='center';ctx.font='11px sans-serif';ctx.fillStyle='#122e33bb';ctx.fillRect(n.x*32-4,n.y*32+34,40,16);ctx.fillStyle='#f0e5ca';ctx.fillText(n.short,n.x*32+16,n.y*32+46);if(targetScene?.npc===n.id){rect(n.x*32+12,n.y*32-17,9,12,'#eac889');ctx.fillStyle='#374b43';ctx.fillText('!',n.x*32+16,n.y*32-7);}}});
    const near=nearby();if(near){ctx.strokeStyle='#f4d492';ctx.lineWidth=2;ctx.strokeRect(near.x*32+1,near.y*32+1,30,30);}
  }
  function drawArt(canvas,key){const c=canvas.getContext('2d'),r=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};r(0,0,330,92,'#304b59');r(0,49,330,43,'#5f7565');r(0,75,330,17,'#3d626b');if(key==='town'){r(253,12,16,16,'#d3cba0');for(let i=0;i<6;i++){const x=24+i*49,y=38+(i%2)*9;r(x,y,33,34,'#899177');r(x-3,y-6,39,8,'#ad7963');r(x+5,y+8,8,10,'#e6c98a');r(x+20,y+8,7,10,'#e6c98a');}r(0,70,330,5,'#baa67c');for(let x=12;x<330;x+=65){r(x,55,2,20,'#3a4645');r(x-3,51,8,6,'#efd190');r(x-1,80,5,2,'#c3b380');}}else{r(109,16,114,61,'#1d363f66');r(105,12,114,61,'#e6d6af');r(113,20,98,45,'#f3e5c4');for(let i=0;i<4;i++)r(128,28+i*8,65-i*7,2,'#b8a582');r(187,49,13,13,'#a66355');r(184,52,19,7,'#a66355');} }
  try { const raw=localStorage.getItem(KEY); if(raw){const d=JSON.parse(raw);if(valid(d)){restore(d);$('saveMeta').textContent='已自动恢复上次旅途 · 可继续探索';}else{$('saveMeta').textContent='旧存档无效，已开启新旅程。';}} }catch{$('saveMeta').textContent='本地存档不可用或已损坏，可使用导入 / 导出。';}
  update(); function frame(t){draw(t);requestAnimationFrame(frame);} requestAnimationFrame(frame);
})();
