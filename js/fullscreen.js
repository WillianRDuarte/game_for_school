// TELA CHEIA — botão no HUD (ao lado da distância). Só usa a Fullscreen API; não toca em nenhum sistema do jogo.
//  · toque/clique entra em tela cheia; de novo, sai (Esc/gesto "voltar" do Android também; o botão acompanha o estado real via 'fullscreenchange')
//  · ao mudar, chama onResize() (Game.resize: renderer + câmera) — logo, e de novo após ~250 ms, porque o Android ajusta innerWidth/innerHeight depois do evento
//  · sem suporte (ex.: iPhone Safari) o botão fica escondido (atributo hidden) e nada muda
export function fsApi(doc=globalThis.document){
  const el=doc.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen,exit=doc.exitFullscreen||doc.webkitExitFullscreen;
  const enabled=doc.fullscreenEnabled!==undefined?doc.fullscreenEnabled:doc.webkitFullscreenEnabled;
  return{supported:!!(req&&exit)&&enabled!==false,
    active:()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement),
    enter:()=>{const r=req.call(el,{navigationUI:'hide'});return r&&r.catch?r.catch(()=>{}):r;},
    leave:()=>{const r=exit.call(doc);return r&&r.catch?r.catch(()=>{}):r;}};
}
export function initFullscreen(btn,onResize,{doc=globalThis.document}={}){
  if(!btn||!doc)return null;
  const api=fsApi(doc);if(!api.supported){btn.hidden=true;return null;}
  const ICON_IN='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
        ICON_OUT='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const sync=()=>{const on=api.active();btn.innerHTML=on?ICON_OUT:ICON_IN;btn.classList.toggle('on',on);btn.setAttribute('aria-label',on?'Sair da tela cheia':'Tela cheia');btn.title=btn.getAttribute('aria-label');
    doc.documentElement.classList.toggle('fs',on);
    if(onResize){onResize();setTimeout(onResize,250);}};
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();api.active()?api.leave():api.enter();});
  btn.addEventListener('pointerdown',e=>e.stopPropagation());   // o toque no botão não vira "primeiro toque" de nenhum outro controle
  doc.addEventListener('fullscreenchange',sync);doc.addEventListener('webkitfullscreenchange',sync);
  btn.hidden=false;sync();return{btn,api,sync};
}
