// CONTROLES DE TOQUE (celular) — joystick virtual (direção) + botões na tela que só ESCREVEM no estado que o Input já tem; não existe segunda lógica de direção/física.
//  · JOYSTICK (esquerda, 2 eixos) → input.stick (X: esquerda/direita) e input.stickY (Y: ↑ acelera a 50 % · ↓ freio/ré); analógico; volta ao centro ao soltar; 1 dedo próprio por pointerId, independente dos botões · ACELERAR → input.touch.throttle · FREIO/RÉ → input.touch.brake   (Input.poll() os soma ao teclado: mesmos campos throttle/brake/steer que o Player lê)
//  · TURBO → input.onTurbo() uma vez por toque (exatamente o que a tecla SHIFT faz; o Game liga isso a perks.activateTurbo())
//  · Segurar = ativo; soltar/cancelar = desativa. Multitouch: cada dedo (pointerId) é independente; deslizar o dedo entre FREIO/ACEL troca o botão sem soltar.
//  · Só aparece em aparelhos de toque (pointer:coarse) ou depois do 1º toque real; no PC com mouse/teclado nada é criado (o jogo fica idêntico).
//  · Sem rolagem/zoom: touch-action:none nos botões, preventDefault nos toques sobre eles e em touchmove da página, viewport sem zoom (index.html).
//  · Estilo/posições: css/style.css, seção "CONTROLES DE TOQUE" (classe body.touch).
export const BUTTONS=[
  {id:'brake',g:'drive',label:'FREIO',field:'brake'},{id:'gas',g:'drive',label:'ACELERAR',field:'throttle'},
  {id:'turbo',g:'turbo',label:'TURBO',field:null},
];
const SLOP=10;   // px de tolerância ao deslizar entre botões vizinhos
function build(input,doc){
  const root=doc.createElement('div');root.id='tc';root.setAttribute('aria-hidden','true');
  const els={};
  for(const b of BUTTONS){const e=doc.createElement('div');e.className='tb tb-'+b.id;e.dataset.b=b.id;e.textContent=b.label;root.appendChild(e);els[b.id]=e;}
  // JOYSTICK: base + manche. X = direção, Y = acelerar (↑, 50 %) / freio-ré (↓); analógico, zona morta por eixo. Um pointerId próprio; o dedo fica capturado, então arrastar para fora da base continua valendo.
  const jb=doc.createElement('div');jb.className='joy';const jk=doc.createElement('div');jk.className='joy-knob';jb.appendChild(jk);root.appendChild(jb);
  const J={pid:null,x:0,y:0,DZ:.12};
  const ax=d=>{const a=Math.abs(d);return a<J.DZ?0:Math.sign(d)*(a-J.DZ)/(1-J.DZ);};   // zona morta + reescala
  const jset=(clientX,clientY)=>{const r=jb.getBoundingClientRect(),R=r.width/2,cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;   // 80 % do raio = curso total em cada eixo
    const dx=Math.max(-1,Math.min(1,(clientX-cx)/(R*.8))),dy=Math.max(-1,Math.min(1,(clientY-cy)/(R*.8)));
    J.x=ax(dx);J.y=-ax(dy);input.stick=J.x;input.stickY=J.y;   // tela: Y para baixo é positivo → inverte (↑ = +)
    const l=Math.hypot(dx,dy),k=l>1?1/l:1;jk.style.transform=`translate(${dx*k*R*.8}px,${dy*k*R*.8}px)`;};   // manche visual limitado ao círculo
  const jend=()=>{if(J.pid===null)return;J.pid=null;J.x=0;J.y=0;input.stick=0;input.stickY=0;jk.style.transform='';jb.classList.remove('on');};
  jb.addEventListener('pointerdown',e=>{if(J.pid!==null)return;e.preventDefault();J.pid=e.pointerId;try{jb.setPointerCapture(e.pointerId);}catch(_){}jb.classList.add('on');jset(e.clientX,e.clientY);},{passive:false});
  jb.addEventListener('pointermove',e=>{if(e.pointerId!==J.pid)return;e.preventDefault();jset(e.clientX,e.clientY);},{passive:false});
  const jup=e=>{if(e.pointerId===J.pid)jend();};
  jb.addEventListener('pointerup',jup);jb.addEventListener('pointercancel',jup);jb.addEventListener('lostpointercapture',jup);
  const pids=new Map(),held={};for(const b of BUTTONS)held[b.id]=new Set();   // pointerId → botão · botão → conjunto de dedos
  const def=Object.fromEntries(BUTTONS.map(b=>[b.id,b]));
  const apply=id=>{const b=def[id],on=held[id].size>0;if(b.field)input.touch[b.field]=on?1:0;els[id].classList.toggle('on',on);};
  const press=(pid,id)=>{pids.set(pid,id);held[id].add(pid);apply(id);if(id==='turbo'&&input.onTurbo)input.onTurbo();};   // turbo = 1 chamada por toque (como SHIFT sem repeat)
  const release=pid=>{const id=pids.get(pid);if(id===undefined)return;pids.delete(pid);held[id].delete(pid);apply(id);};
  const hit=(x,y,g)=>{let best=null,bd=1e9;for(const b of BUTTONS){if(b.g!==g)continue;const r=els[b.id].getBoundingClientRect();
    if(x>=r.left-SLOP&&x<=r.right+SLOP&&y>=r.top-SLOP&&y<=r.bottom+SLOP){const d=Math.hypot(x-(r.left+r.right)/2,y-(r.top+r.bottom)/2);if(d<bd){bd=d;best=b.id;}}}return best;};
  const btnOf=e=>{const t=e.target&&e.target.closest?e.target.closest('.tb'):null;return t?t.dataset.b:null;};
  root.addEventListener('pointerdown',e=>{const id=btnOf(e);if(!id)return;e.preventDefault();release(e.pointerId);press(e.pointerId,id);},{passive:false});
  root.addEventListener('pointermove',e=>{const cur=pids.get(e.pointerId);if(cur===undefined)return;const g=def[cur].g;if(g==='turbo')return;
    const nid=hit(e.clientX,e.clientY,g);if(nid===cur)return;release(e.pointerId);if(nid)press(e.pointerId,nid);e.preventDefault();},{passive:false});
  const up=e=>release(e.pointerId);
  root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);root.addEventListener('lostpointercapture',up);
  root.addEventListener('contextmenu',e=>e.preventDefault());
  root.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});   // sem rolagem, zoom por duplo toque, seleção ou menu de pressão longa sobre os botões
  const releaseAll=()=>{for(const pid of [...pids.keys()])release(pid);jend();};
  const hidden=()=>{if(doc.hidden)releaseAll();};
  const noMove=e=>e.preventDefault(),noGesture=e=>e.preventDefault();
  doc.addEventListener('touchmove',noMove,{passive:false});doc.addEventListener('gesturestart',noGesture);doc.addEventListener('gesturechange',noGesture);   // sem rolagem nem pinça na página (iOS inclusive)
  globalThis.addEventListener('blur',releaseAll);doc.addEventListener('visibilitychange',hidden);globalThis.addEventListener('pagehide',releaseAll);
  doc.body.classList.add('touch');doc.body.insertBefore(root,doc.getElementById('hud')||doc.body.firstChild);   // antes do HUD/game over no DOM: eles ficam por cima
  return{root,els,held,pids,press,release,releaseAll,joy:{base:jb,knob:jk,state:J,end:jend},
    destroy(){releaseAll();input.stick=0;input.stickY=0;root.remove();doc.body.classList.remove('touch');doc.removeEventListener('touchmove',noMove);doc.removeEventListener('gesturestart',noGesture);doc.removeEventListener('gesturechange',noGesture);globalThis.removeEventListener('blur',releaseAll);doc.removeEventListener('visibilitychange',hidden);globalThis.removeEventListener('pagehide',releaseAll);}};
}
// Cria os controles se o aparelho for de toque; em dispositivos híbridos (mouse + tela) aparece no 1º toque real. Devolve {mount, api}.
export function initTouchControls(input,{force=false,doc=globalThis.document}={}){
  if(!doc||!input)return null;
  const h={api:null,mount(){return h.api||(h.api=build(input,doc));}};
  const coarse=typeof globalThis.matchMedia==='function'&&globalThis.matchMedia('(pointer:coarse)').matches;
  if(force||coarse)h.mount();
  else{const first=e=>{if(e.pointerType==='touch'){globalThis.removeEventListener('pointerdown',first,true);h.mount();}};globalThis.addEventListener('pointerdown',first,true);}
  return h;
}
