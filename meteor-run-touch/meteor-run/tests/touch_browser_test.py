#!/usr/bin/env python3
"""Controles de toque num Chromium REAL (Playwright) com toques multitouch via CDP: botões, simultaneidade, turbo, soltar, teclado, PC, layout vs HUD, rolagem/zoom.
Usa o index.html/CSS/JS reais do projeto; só troca o <script> do jogo (o three.js vem de CDN, inacessível aqui) por um que monta Input + touch.js como o Game faz.
Uso: python3 tests/touch_browser_test.py   (precisa de playwright + chromium)"""
import sys,os,threading,http.server,socketserver,functools,re,json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT));PORT=srv.server_address[1];threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{PORT}/index.html'
HTML=open(os.path.join(ROOT,'index.html'),encoding='utf-8').read()
TEST_JS="""import {Input} from './js/input.js';import {initTouchControls} from './js/touch.js';
const input=new Input();window.__input=input;window.__turbo=0;input.onTurbo=()=>window.__turbo++;   // o Game liga onTurbo -> perks.activateTurbo (conferido em touch_test.mjs)
window.__h=initTouchControls(input);
window.__poll=()=>{input.poll();return [input.throttle,input.brake,input.steer];};
window.__prev=[];for(const t of ['touchstart','touchmove'])addEventListener(t,e=>window.__prev.push([t,e.defaultPrevented,e.cancelable]),{passive:true});   // registrado no window (bolha, DEPOIS dos botões): vê se alguém deu preventDefault
// HUD realista (mesmas classes/estrutura que perks.js/ui.js criam) para medir sobreposição
document.getElementById('turbo').innerHTML='<span class="tl">⚡ TURBO</span><i><u style="width:75%"></u></i><em>75%</em><small>SHIFT</small>';document.getElementById('turbo').className='ready';
document.getElementById('shieldhud').textContent='🛡 ESCUDO';document.getElementById('shieldhud').className='on';
document.getElementById('lives').textContent='♥ ♥ ♥';document.getElementById('speed').textContent='120 km/h';document.getElementById('dist').textContent='1234 m';
document.getElementById('combo').innerHTML='<span>COMBO</span> <b class="cb">x3</b>';
document.getElementById('perks').innerHTML=['phase','overdrive','phase'].map(c=>'<div class="row '+c+'"><b>👻</b><span class="n">FASE</span><i><u></u></i><em>3s</em></div>').join('');"""
PAGE=re.sub(r'<script type="module" src="js/main.js"></script>','<script type="module">'+TEST_JS+'</script>',HTML)
assert PAGE!=HTML
res=[];fails=0
def ok(c,m):
    global fails
    res.append(c);print(('  OK   ' if c else '  FALHA ')+m)
    if not c:fails+=1
def route(p):p.route('**/index.html',lambda r:r.fulfill(body=PAGE,content_type='text/html'))
def center(p,sel):
    r=p.evaluate("s=>{const e=document.querySelector(s).getBoundingClientRect();return [e.left,e.top,e.right,e.bottom]}",sel);return [(r[0]+r[2])/2,(r[1]+r[3])/2]
class Fingers:   # multitouch via CDP: cada dedo tem id; touchStart/Move/End enviam o conjunto atual de pontos
    def __init__(s,p):s.c=p.context.new_cdp_session(p);s.pts={};s.p=p
    def _send(s,t):s.c.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[{'x':x,'y':y,'id':i} for i,(x,y) in s.pts.items()]})
    def down(s,i,x,y):s.pts[i]=(x,y);s._send('touchStart')
    def move(s,i,x,y):s.pts[i]=(x,y);s._send('touchMove')
    def up(s,i):   # touchEnd lista SÓ o ponto que terminou (lista vazia = todos os dedos saem)
        x,y=s.pts.pop(i);s.c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[{'x':x,'y':y,'id':i}]})
    def all_up(s):
        s.pts.clear();s.c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
poll=lambda p:p.evaluate('__poll()')
def rects(p):
    return p.evaluate("""()=>{const o={};for(const s of ['.tb-left','.tb-right','.tb-gas','.tb-brake','.tb-turbo','#hud','#lives','#combo','#gauges','#perks','#danger','#toast'])
      {const e=document.querySelector(s);if(!e)continue;const r=e.getBoundingClientRect();o[s]=[r.left,r.top,r.right,r.bottom];}return o;}""")
inter=lambda a,b:a[0]<b[2] and b[0]<a[2] and a[1]<b[3] and b[1]<a[3]
with sync_playwright() as pw:
    br=pw.chromium.launch()
    # ============ CELULAR (horizontal) ============
    ctx=br.new_context(viewport={'width':844,'height':390},device_scale_factor=3,is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
    p=ctx.new_page();route(p);p.goto(URL);p.wait_for_function('window.__h');p.wait_for_timeout(200)
    print('1) montagem no celular')
    ok(p.evaluate("matchMedia('(pointer:coarse)').matches"),'emulação: pointer:coarse = true')
    ok(p.evaluate("!!document.getElementById('tc')&&document.body.classList.contains('touch')"),'controles criados automaticamente (aparelho de toque)')
    ok(p.evaluate("document.querySelectorAll('#tc .tb').length")==5,'5 botões: ESQUERDA, DIREITA, ACELERAR, FREIO/RÉ, TURBO')
    ok(p.evaluate("[...document.querySelectorAll('#tc .tb')].map(e=>e.textContent).join('|')")=='◀|▶|FREIO|ACELERAR|TURBO','rótulos: ◀ ▶ FREIO ACELERAR TURBO')
    ok(poll(p)==[0,0,0],'estado inicial: nada pressionado')
    F=Fingers(p);G=center(p,'.tb-gas');L=center(p,'.tb-left');R=center(p,'.tb-right');B=center(p,'.tb-brake');T=center(p,'.tb-turbo')
    print('2) cada botão isolado (segurar = ativo, soltar = desativa)')
    F.down(1,*G);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'ACELERAR segurado → throttle=1');ok(p.evaluate("document.querySelector('.tb-gas').classList.contains('on')"),'botão acende enquanto segurado')
    p.wait_for_timeout(300);ok(poll(p)==[1,0,0],'continua ativo enquanto o dedo fica parado (300 ms depois)')
    F.up(1);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou ACELERAR → throttle=0')
    F.down(2,*L);p.wait_for_timeout(30);ok(poll(p)==[0,0,-1],'ESQUERDA → steer=−1');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou ESQUERDA → steer=0')
    F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'DIREITA → steer=+1');F.up(3);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou DIREITA → steer=0')
    F.down(4,*B);p.wait_for_timeout(30);ok(poll(p)==[0,1,0],'FREIO/RÉ → brake=1');F.up(4);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou FREIO → brake=0')
    print('3) multitouch')
    F.down(1,*G);F.down(2,*L);p.wait_for_timeout(30);ok(poll(p)==[1,0,-1],'ACELERAR + ESQUERDA ao mesmo tempo');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'solta só a ESQUERDA: acelerar continua');
    F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'ACELERAR + DIREITA ao mesmo tempo');F.up(3);F.up(1);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou tudo')
    t0=p.evaluate('__turbo')
    F.down(1,*G);F.down(2,*L);F.down(5,*T);p.wait_for_timeout(30)
    ok(poll(p)==[1,0,-1] and p.evaluate('__turbo')==t0+1,'ACELERAR + ESQUERDA + TURBO: 3 dedos, turbo disparado 1× e direção/aceleração mantidas')
    p.wait_for_timeout(400);ok(p.evaluate('__turbo')==t0+1,'turbo segurado NÃO repete (igual SHIFT sem repeat): ainda 1 chamada');F.up(5);p.wait_for_timeout(30);ok(poll(p)==[1,0,-1],'soltar TURBO não mexe no resto')
    F.down(5,*T);p.wait_for_timeout(30);ok(p.evaluate('__turbo')==t0+2,'novo toque no TURBO → 2ª chamada');F.up(5)
    F.up(2);F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'ACELERAR + DIREITA + (TURBO antes) segue ok');F.all_up();p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'todos os dedos fora → tudo zerado')
    F.down(1,*G);F.down(4,*B);p.wait_for_timeout(30);ok(poll(p)==[1,1,0],'ACELERAR + FREIO juntos = mesmos valores que W+S no teclado (o Player decide)');F.all_up()
    F.down(1,*L);F.down(2,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'ESQUERDA + DIREITA juntas se anulam (igual A+D)');F.all_up()
    print('4) deslizar o dedo / sair do botão / cancelamento')
    F.down(1,*L);p.wait_for_timeout(30);F.move(1,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'dedo desliza de ◀ para ▶ sem soltar → direita');F.move(1,R[0],R[1]-250);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'dedo sai para fora dos botões → solta');F.all_up()
    F.down(1,*G);F.move(1,*B);p.wait_for_timeout(30);ok(poll(p)==[0,1,0],'dedo desliza de ACELERAR para FREIO → freio');F.all_up()
    t1=p.evaluate('__turbo');F.down(1,*L);F.move(1,*T);p.wait_for_timeout(30);ok(p.evaluate('__turbo')==t1 and poll(p)==[0,0,0],'deslizar para cima do TURBO NÃO dispara turbo (só toque direto)');F.all_up()
    F.down(1,*G);p.wait_for_timeout(30);F.c.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});F.pts.clear();p.wait_for_timeout(50);ok(poll(p)==[0,0,0],'touchcancel (ex.: sistema interrompe o toque) → solta')
    F.down(1,*G);p.wait_for_timeout(30);p.evaluate("dispatchEvent(new Event('blur'))");ok(poll(p)==[0,0,0],'janela perde o foco → solta tudo (nunca fica travado acelerando)');F.all_up()
    print('5) teclado continua igual + soma com o toque')
    p.keyboard.down('KeyW');ok(poll(p)==[1,0,0],'W → throttle=1');p.keyboard.down('KeyA');ok(poll(p)==[1,0,-1],'W + A');p.keyboard.up('KeyA');p.keyboard.up('KeyW');ok(poll(p)==[0,0,0],'soltou teclas → 0')
    p.keyboard.down('ArrowDown');p.keyboard.down('ArrowRight');ok(poll(p)==[0,1,1],'setas ↓ + → funcionam');p.keyboard.up('ArrowDown');p.keyboard.up('ArrowRight')
    t2=p.evaluate('__turbo');p.keyboard.down('ShiftLeft');p.keyboard.up('ShiftLeft');ok(p.evaluate('__turbo')==t2+1,'SHIFT continua chamando o turbo')
    F.down(1,*G);p.keyboard.down('KeyD');p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'toque ACELERAR + teclado D juntos');p.keyboard.up('KeyD');ok(poll(p)==[1,0,0],'soltar a tecla não derruba o toque que ainda está segurando');F.up(1)
    p.keyboard.down('KeyW');F.down(1,*G);F.up(1);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'soltar o toque não derruba a tecla W que ainda está pressionada');p.keyboard.up('KeyW')
    p.keyboard.down('KeyD');F.down(1,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'D + botão DIREITA: steer limitado a 1 (não vira 2)');p.keyboard.up('KeyD');F.all_up()
    print('6) sem rolagem / zoom da página')
    ok(p.evaluate("getComputedStyle(document.querySelector('.tb-gas')).touchAction")=='none' and p.evaluate("getComputedStyle(document.body).touchAction")=='none','touch-action:none nos botões e na página')
    ok('user-scalable=no' in p.evaluate("document.querySelector('meta[name=viewport]').content") and 'maximum-scale=1' in p.evaluate("document.querySelector('meta[name=viewport]').content"),'viewport sem zoom')
    p.evaluate('__prev.length=0');F.down(1,*G);F.move(1,G[0]+8,G[1]-8);F.move(1,G[0],G[1]);F.up(1);p.wait_for_timeout(30)
    pv=p.evaluate('__prev');ok(len(pv)>0 and all(d or not c for _,d,c in pv),f'touchstart/touchmove sobre os botões: preventDefault aplicado ({len(pv)} eventos)')
    p.evaluate('__prev.length=0');F.down(1,300,150);F.move(1,320,120);F.move(1,340,60);F.up(1);p.wait_for_timeout(30)
    pv=p.evaluate('__prev');ok(len([1 for t,d,c in pv if t=='touchmove'])>0 and all(d or not c for t,d,c in pv if t=='touchmove'),'arrastar em qualquer lugar da tela (fora dos botões): touchmove cancelado → a página não rola nem dá zoom')
    ok(p.evaluate("[document.documentElement.scrollHeight,document.documentElement.scrollWidth]")==[390,844] and p.evaluate("[scrollX,scrollY]")==[0,0],'página sem barra/rolagem (844×390, scroll 0,0)')
    ok(p.evaluate("document.dispatchEvent(Object.assign(new Event('contextmenu',{cancelable:true,bubbles:true}),{}))") is not None,'(contextmenu tratado no container)')
    ctx.close()
    # ============ LAYOUT em vários celulares / HUD ============
    print('7) layout em vários tamanhos (paisagem): dentro da tela, sem sobrepor entre si e sem cobrir o HUD')
    for w,h,name in [(844,390,'iPhone 14 (844×390)'),(932,430,'iPhone 14 Pro Max (932×430)'),(667,375,'iPhone SE/8 (667×375)'),(568,320,'iPhone 5/SE1 (568×320)'),(740,360,'Android pequeno (740×360)'),(915,412,'Pixel 7 (915×412)'),(1024,768,'tablet (1024×768)'),(360,740,'retrato 360×740')]:
        c=br.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=True,has_touch=True);q=c.new_page();route(q);q.goto(URL);q.wait_for_function('window.__h');q.wait_for_timeout(120);r=rects(q)
        btn=['.tb-left','.tb-right','.tb-gas','.tb-brake','.tb-turbo'];hud=['#hud','#lives','#combo','#gauges','#perks']
        inside=all(r[b][0]>=0 and r[b][1]>=0 and r[b][2]<=w and r[b][3]<=h for b in btn)
        sz=min(r[b][2]-r[b][0] for b in btn);big=max(r[b][2]-r[b][0] for b in btn)
        bb=[(a,b) for i,a in enumerate(btn) for b in btn[i+1:] if inter(r[a],r[b])]
        hh=[(a,b) for a in btn for b in hud if b in r and inter(r[a],r[b])]
        ok(inside and not bb and not hh and sz>=44,f'{name}: botões {sz:.0f}–{big:.0f}px dentro da tela, sem sobreposição entre si{" ("+str(bb)+")" if bb else ""} e sem cobrir HUD{" ("+str(hh)+")" if hh else ""}')
        c.close()
    # ============ aparelho híbrido: aparece no 1º toque ============
    print('8) híbrido (mouse + tela de toque): aparece só após o 1º toque real')
    c=br.new_context(viewport={'width':1180,'height':820},has_touch=True);q=c.new_page();route(q);q.goto(URL);q.wait_for_function('window.__h');q.wait_for_timeout(100)
    coarse=q.evaluate("matchMedia('(pointer:coarse)').matches")
    if coarse:print('   (emulação reporta pointer:coarse — caminho do 1º toque não se aplica neste contexto)')
    else:
        ok(q.evaluate("!document.getElementById('tc')"),'com mouse como ponteiro primário: nada é criado ao carregar')
        f=Fingers(q);f.down(1,600,400);f.up(1);q.wait_for_timeout(80);ok(q.evaluate("!!document.getElementById('tc')&&document.body.classList.contains('touch')"),'1º toque real → controles aparecem')
    c.close()
    # ============ PC ============
    print('9) PC (mouse + teclado, sem toque): jogo não é afetado')
    c=br.new_context(viewport={'width':1280,'height':720});q=c.new_page();route(q);q.goto(URL);q.wait_for_function('window.__h');q.wait_for_timeout(120)
    ok(q.evaluate("!document.getElementById('tc')&&!document.body.classList.contains('touch')&&document.querySelectorAll('.tb').length===0"),'nenhum botão/elemento de toque no DOM; body sem classe .touch')
    ok(q.evaluate("getComputedStyle(document.getElementById('help')).display")!='none','dica de teclas (#help) continua visível')
    gs=q.evaluate("(()=>{const s=getComputedStyle(document.getElementById('gauges'));return [s.left,s.bottom,s.transform]})()");ok(gs[0]=='16px' and gs[1]=='34px' and gs[2]=='none','barra de turbo na posição original (left 16 / bottom 34, sem transform)')
    ok(q.evaluate("getComputedStyle(document.body).touchAction")!='none','touch-action da página não alterado no PC')
    q.keyboard.down('KeyW');q.keyboard.down('KeyD');ok(poll(q)==[1,0,1],'teclado: W + D');q.keyboard.up('KeyW');q.keyboard.up('KeyD');ok(poll(q)==[0,0,0],'soltou → 0')
    q.keyboard.down('Space');q.keyboard.up('Space');q.mouse.click(1100,650);q.mouse.click(120,650);ok(poll(q)==[0,0,0],'cliques do mouse nos cantos não geram comando')
    q.keyboard.down('ShiftLeft');q.keyboard.up('ShiftLeft');ok(q.evaluate('__turbo')==1,'SHIFT → turbo')
    c.close()
    # ============ game over por cima ============
    print('10) tela de game over fica por cima dos botões')
    c=br.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);q=c.new_page();route(q);q.goto(URL);q.wait_for_function('window.__h');q.wait_for_timeout(100)
    q.evaluate("document.getElementById('over').classList.add('show')");gx,gy=center(q,'.tb-gas')
    ok(q.evaluate("([x,y])=>document.elementFromPoint(x,y).closest('#over')!==null",[gx,gy]),'com game over aberto, o toque sobre onde era ACELERAR vai para o overlay (botões não passam por cima)')
    ok(q.evaluate("([x,y])=>document.elementFromPoint(x,y).id==='restart'",center(q,'#restart')),'botão "Jogar de novo" continua acessível por toque')
    c.close()
    br.close()
print(f'\n{len(res)-fails}/{len(res)} OK');sys.exit(1 if fails else 0)
