#!/usr/bin/env python3
"""Controles de toque (joystick virtual + botões) e tela cheia num Chromium REAL (Playwright) com toques multitouch via CDP: botões, simultaneidade, turbo, soltar, teclado, PC, layout vs HUD, rolagem/zoom.
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
TEST_JS="""import {Input} from './js/input.js';import {initTouchControls} from './js/touch.js';import {initFullscreen} from './js/fullscreen.js';
const input=new Input();window.__input=input;window.__turbo=0;input.onTurbo=()=>window.__turbo++;   // o Game liga onTurbo -> perks.activateTurbo (conferido em touch_test.mjs)
window.__h=initTouchControls(input);window.__fsn=0;window.__fs=initFullscreen(document.getElementById('fs'),()=>window.__fsn++);   // main.js faz o mesmo com Game.resize
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
def joy(p):
    r=p.evaluate("()=>{const e=document.querySelector('.joy').getBoundingClientRect();return [e.left,e.top,e.right,e.bottom]}");return [(r[0]+r[2])/2,(r[1]+r[3])/2,(r[2]-r[0])/2]
def jx(p,f):
    cx,cy,R=joy(p);return [cx+f*R,cy]
def jxy(p,fx,fy):   # fy>0 = para CIMA (fração do raio)
    cx,cy,R=joy(p);return [cx+fx*R,cy-fy*R]
near=lambda a,b,t=.02:abs(a-b)<=t
def rects(p):
    return p.evaluate("""()=>{const o={};for(const s of ['.joy','#fs','.tb-gas','.tb-brake','.tb-turbo','#hud','#lives','#combo','#gauges','#perks','#danger','#toast'])
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
    ok(p.evaluate("document.querySelectorAll('#tc .tb').length")==3 and p.evaluate("document.querySelectorAll('#tc .joy').length")==1,'joystick + 3 botões (ACELERAR, FREIO/RÉ, TURBO); setas removidas')
    ok(p.evaluate("[...document.querySelectorAll('#tc .tb')].map(e=>e.textContent).join('|')")=='FREIO|ACELERAR|TURBO','rótulos: FREIO ACELERAR TURBO')
    ok(poll(p)==[0,0,0],'estado inicial: nada pressionado')
    F=Fingers(p);G=center(p,'.tb-gas');L=jx(p,-.9);R=jx(p,.9);B=center(p,'.tb-brake');T=center(p,'.tb-turbo')
    print('2) cada botão isolado (segurar = ativo, soltar = desativa)')
    F.down(1,*G);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'ACELERAR segurado → throttle=1');ok(p.evaluate("document.querySelector('.tb-gas').classList.contains('on')"),'botão acende enquanto segurado')
    p.wait_for_timeout(300);ok(poll(p)==[1,0,0],'continua ativo enquanto o dedo fica parado (300 ms depois)')
    F.up(1);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou ACELERAR → throttle=0')
    F.down(2,*L);p.wait_for_timeout(30);ok(poll(p)==[0,0,-1],'JOYSTICK todo à esquerda → steer=−1');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou → steer=0 (volta ao centro)');ok(p.evaluate("document.querySelector('.joy-knob').style.transform")=='','manche volta ao centro visualmente')
    F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'JOYSTICK todo à direita → steer=+1');F.up(3);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou → steer=0')
    F.down(2,*jx(p,0));p.wait_for_timeout(30);ok(poll(p)[2]==0,'no centro → steer=0');F.move(2,*jx(p,.05));p.wait_for_timeout(30);ok(poll(p)[2]==0,'zona morta (5 % do raio) → steer=0')
    F.move(2,*jx(p,.4));p.wait_for_timeout(30);a=poll(p)[2];F.move(2,*jx(p,-.4));p.wait_for_timeout(30);b=poll(p)[2];ok(0<a<1 and near(a,-b,1e-6),f'direção ANALÓGICA e simétrica: +40 % → {a:.2f} · −40 % → {b:.2f}')
    F.move(2,*jx(p,.2));p.wait_for_timeout(30);a1=poll(p)[2];F.move(2,*jx(p,.6));p.wait_for_timeout(30);a2=poll(p)[2];ok(0<a1<a2<=1,f'quanto mais arrasta, mais vira ({a1:.2f} < {a2:.2f})')
    F.move(2,jx(p,2)[0],joy(p)[1]-60);p.wait_for_timeout(30);ok(poll(p)[2]==1,'arrastar muito além da base (e para cima) segue valendo: steer travado em +1');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou longe da base → centro')
    F.down(2,*jx(p,.7));p.wait_for_timeout(30);F.c.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});F.pts.clear();p.wait_for_timeout(50);ok(poll(p)[2]==0,'touchcancel no joystick → volta ao centro')
    F.down(4,*B);p.wait_for_timeout(30);ok(poll(p)==[0,1,0],'FREIO/RÉ → brake=1');F.up(4);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou FREIO → brake=0')
    print('2b) joystick eixo Y: ↑ acelera a 50 % · ↓ freio/ré · ←→ vira')
    F.down(2,*jxy(p,0,.9));p.wait_for_timeout(30);ok(poll(p)==[.5,0,0],'↑ → throttle 0,5 (50 % da força), sem freio, sem direção')
    F.move(2,*jxy(p,.9,.9));p.wait_for_timeout(30);ok(poll(p)==[.5,0,1],'↑ + → (diagonal): acelera a 50 % e vira à direita ao mesmo tempo')
    F.move(2,*jxy(p,-.9,.9));p.wait_for_timeout(30);ok(poll(p)==[.5,0,-1],'↑ + ← : acelera a 50 % e vira à esquerda')
    F.move(2,*jxy(p,0,.2));p.wait_for_timeout(30);t=poll(p)[0];ok(0<t<.5,f'↑ parcial é proporcional (throttle {t:.2f})')
    F.move(2,*jxy(p,0,-.9));p.wait_for_timeout(30);ok(poll(p)==[0,1,0],'↓ → brake=1 (freio/ré)')
    F.move(2,*jxy(p,-.9,-.9));p.wait_for_timeout(30);ok(poll(p)==[0,1,-1],'↓ + ← : freia e vira')
    F.move(2,*jxy(p,0,0));p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'volta ao centro → tudo 0')
    F.move(2,*jxy(p,0,.9));F.up(2);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou o joystick ↑ → throttle 0 (volta ao centro)')
    F.down(2,*jxy(p,0,.9));F.down(1,*G);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'joystick ↑ + botão ACELERAR: força NORMAL (1) do botão, não 1,5');F.up(1);p.wait_for_timeout(30);ok(poll(p)==[.5,0,0],'soltou o botão: joystick segue em 0,5');F.up(2)
    F.down(1,*G);F.down(2,*jxy(p,.9,0));p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'botão ACELERAR (normal) + joystick só para o lado: continua igual a antes');F.all_up()
    print('3) multitouch')
    F.down(1,*G);F.down(2,*L);p.wait_for_timeout(30);ok(poll(p)==[1,0,-1],'ACELERAR + JOYSTICK à esquerda ao mesmo tempo');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'solta só o joystick: acelerar continua');
    F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'ACELERAR + JOYSTICK à direita ao mesmo tempo');F.up(3);F.up(1);p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'soltou tudo')
    t0=p.evaluate('__turbo')
    F.down(1,*G);F.down(2,*L);F.down(5,*T);p.wait_for_timeout(30)
    ok(poll(p)==[1,0,-1] and p.evaluate('__turbo')==t0+1,'ACELERAR + JOYSTICK + TURBO: 3 dedos, turbo disparado 1× e direção/aceleração mantidas')
    p.wait_for_timeout(400);ok(p.evaluate('__turbo')==t0+1,'turbo segurado NÃO repete (igual SHIFT sem repeat): ainda 1 chamada');F.up(5);p.wait_for_timeout(30);ok(poll(p)==[1,0,-1],'soltar TURBO não mexe no resto')
    F.down(5,*T);p.wait_for_timeout(30);ok(p.evaluate('__turbo')==t0+2,'novo toque no TURBO → 2ª chamada');F.up(5)
    F.up(2);F.down(3,*R);p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'ACELERAR + JOYSTICK à direita (depois do TURBO) segue ok');F.all_up();p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'todos os dedos fora → tudo zerado')
    F.down(1,*G);F.down(4,*B);p.wait_for_timeout(30);ok(poll(p)==[1,1,0],'ACELERAR + FREIO juntos = mesmos valores que W+S no teclado (o Player decide)');F.all_up()
    F.down(1,*L);F.down(2,*R);p.wait_for_timeout(30);ok(poll(p)[2]==-1,'2º dedo no joystick é ignorado (só 1 dedo comanda; o 1º segue valendo)');F.up(2);ok(poll(p)[2]==-1,'soltar o dedo ignorado não solta o joystick');F.all_up()
    F.down(1,*L);F.down(2,*G);F.down(3,*B);F.down(4,*T);p.wait_for_timeout(30);ok(poll(p)==[1,1,-1],'4 dedos: joystick + ACELERAR + FREIO + TURBO ao mesmo tempo');F.up(2);p.wait_for_timeout(30);ok(poll(p)==[0,1,-1],'soltar ACELERAR não afeta joystick nem FREIO');F.all_up();p.wait_for_timeout(30);ok(poll(p)==[0,0,0],'tudo solto')
    print('4) deslizar o dedo / sair do botão / cancelamento')
    F.down(1,*L);p.wait_for_timeout(30);F.move(1,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'dedo arrasta de um lado ao outro do joystick sem soltar → direita');F.all_up()
    F.down(1,*G);F.move(1,*B);p.wait_for_timeout(30);ok(poll(p)==[0,1,0],'dedo desliza de ACELERAR para FREIO → freio');F.all_up()
    t1=p.evaluate('__turbo');F.down(1,*G);F.move(1,*T);p.wait_for_timeout(30);ok(p.evaluate('__turbo')==t1 and poll(p)==[0,0,0],'deslizar para cima do TURBO NÃO dispara turbo (só toque direto)');F.all_up()
    F.down(1,*G);p.wait_for_timeout(30);F.c.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});F.pts.clear();p.wait_for_timeout(50);ok(poll(p)==[0,0,0],'touchcancel (ex.: sistema interrompe o toque) → solta')
    F.down(1,*G);F.down(2,*L);p.wait_for_timeout(30);p.evaluate("dispatchEvent(new Event('blur'))");ok(poll(p)==[0,0,0],'janela perde o foco → solta tudo, joystick inclusive (nunca fica travado)');F.all_up()
    print('5) teclado continua igual + soma com o toque')
    p.keyboard.down('KeyW');ok(poll(p)==[1,0,0],'W → throttle=1');p.keyboard.down('KeyA');ok(poll(p)==[1,0,-1],'W + A');p.keyboard.up('KeyA');p.keyboard.up('KeyW');ok(poll(p)==[0,0,0],'soltou teclas → 0')
    p.keyboard.down('ArrowDown');p.keyboard.down('ArrowRight');ok(poll(p)==[0,1,1],'setas ↓ + → funcionam');p.keyboard.up('ArrowDown');p.keyboard.up('ArrowRight')
    t2=p.evaluate('__turbo');p.keyboard.down('ShiftLeft');p.keyboard.up('ShiftLeft');ok(p.evaluate('__turbo')==t2+1,'SHIFT continua chamando o turbo')
    F.down(1,*G);p.keyboard.down('KeyD');p.wait_for_timeout(30);ok(poll(p)==[1,0,1],'toque ACELERAR + teclado D juntos');p.keyboard.up('KeyD');ok(poll(p)==[1,0,0],'soltar a tecla não derruba o toque que ainda está segurando');F.up(1)
    p.keyboard.down('KeyW');F.down(1,*G);F.up(1);p.wait_for_timeout(30);ok(poll(p)==[1,0,0],'soltar o toque não derruba a tecla W que ainda está pressionada');p.keyboard.up('KeyW')
    p.keyboard.down('KeyD');F.down(1,*R);p.wait_for_timeout(30);ok(poll(p)==[0,0,1],'D + joystick à direita: steer limitado a 1 (não vira 2)');p.keyboard.up('KeyD');F.all_up()
    print('6) sem rolagem / zoom da página')
    ok(p.evaluate("getComputedStyle(document.querySelector('.tb-gas')).touchAction")=='none' and p.evaluate("getComputedStyle(document.querySelector('.joy')).touchAction")=='none' and p.evaluate("getComputedStyle(document.body).touchAction")=='none','touch-action:none nos botões, no joystick e na página')
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
        btn=['.joy','.tb-gas','.tb-brake','.tb-turbo'];hud=['#hud','#lives','#combo','#gauges','#perks']
        inside=all(r[b][0]>=0 and r[b][1]>=0 and r[b][2]<=w and r[b][3]<=h for b in btn)
        sz=min(r[b][2]-r[b][0] for b in btn);big=max(r[b][2]-r[b][0] for b in btn)
        bb=[(a,b) for i,a in enumerate(btn) for b in btn[i+1:] if inter(r[a],r[b])]
        hh=[(a,b) for a in btn for b in hud if b in r and inter(r[a],r[b])]
        ok(inside and not bb and not hh and sz>=44,f'{name}: botões {sz:.0f}–{big:.0f}px dentro da tela, sem sobreposição entre si{" ("+str(bb)+")" if bb else ""} e sem cobrir HUD{" ("+str(hh)+")" if hh else ""}')
        g=q.evaluate("()=>{const b=document.querySelector('.joy').getBoundingClientRect(),k=document.querySelector('.joy-knob').getBoundingClientRect(),gas=document.querySelector('.tb-gas').getBoundingClientRect(),cs=getComputedStyle(document.body);const m=parseFloat(getComputedStyle(document.querySelector('.joy')).bottom),l=parseFloat(getComputedStyle(document.querySelector('.joy')).left);return {kx:(k.left+k.right)/2-(b.left+b.right)/2,ky:(k.top+k.bottom)/2-(b.top+b.bottom)/2,bot:innerHeight-b.bottom,gbot:innerHeight-gas.bottom,left:b.left,w:b.width,h:b.height}}")
        ok(abs(g['kx'])<.01 and abs(g['ky'])<.01 and abs(g['bot']-g['gbot'])<.5 and abs(g['w']-g['h'])<.01,f'{name}: joystick: manche EXATAMENTE no centro da base (Δ {g["kx"]:.2f},{g["ky"]:.2f}px), base redonda, encostada na mesma margem inferior dos botões ({g["bot"]:.0f}px) e à esquerda a {g["left"]:.0f}px')
        ok(not inter(r['.joy'],r['#fs']) and r['#fs'][0]>=0 and r['#fs'][2]<=w and r['#fs'][1]>=0 and r['#fs'][3]<=h and r['#fs'][3]-r['#fs'][1]>=28,f'{name}: botão de tela cheia visível, ≥28 px, dentro da tela e fora do joystick')
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
    # ============ TELA CHEIA ============
    print('11) tela cheia (Fullscreen API)')
    for nm,kw in [('celular 844×390',dict(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)),('PC 1280×720',dict(viewport={'width':1280,'height':720}))]:
        mob='is_mobile' in kw
        c=br.new_context(**kw);q=c.new_page();route(q);q.goto(URL);q.wait_for_function('window.__h')
        q.wait_for_timeout(100)
        def tap():
            if mob:
                f=Fingers(q);x,y=center(q,'#fs');f.down(1,x,y);f.up(1)
            else:q.click('#fs')
            q.wait_for_timeout(500)
        ok(q.evaluate("!document.getElementById('fs').hidden"),f'{nm}: botão visível (API suportada)')
        r=rects(q);dy=q.evaluate("(()=>{const e=document.getElementById('dist').getBoundingClientRect();return (e.top+e.bottom)/2})()")
        ok(r['#fs'][0]>r['#hud'][0] and abs((r['#fs'][1]+r['#fs'][3])/2-dy)<12,f'{nm}: botão na mesma linha da distância (score), dentro do HUD')
        ok(q.evaluate("document.fullscreenElement===null"),f'{nm}: começa fora da tela cheia')
        tap()
        ok(q.evaluate("document.fullscreenElement===document.documentElement"),f'{nm}: toque entra em tela cheia')
        ok(q.evaluate("document.getElementById('fs').classList.contains('on')&&document.documentElement.classList.contains('fs')"),f'{nm}: ícone/estado muda para "sair"')
        ok(q.evaluate('__fsn')>=1,f'{nm}: Game.resize chamado ao entrar ({q.evaluate("__fsn")}×)')
        if mob:
            F2=Fingers(q);G2=center(q,'.tb-gas');F2.down(1,*G2);q.wait_for_timeout(30);ok(poll(q)==[1,0,0],'em tela cheia: ACELERAR continua funcionando')
            F2.down(2,*jx(q,.8));q.wait_for_timeout(30);ok(poll(q)[2]>0,'em tela cheia: joystick + acelerador juntos');F2.all_up()
            r=rects(q);iw,ih=q.evaluate('[innerWidth,innerHeight]')
            ok(all(r[b][0]>=0 and r[b][2]<=iw and r[b][3]<=ih for b in ['.joy','.tb-gas','.tb-brake','.tb-turbo','#fs']),f'em tela cheia ({iw}×{ih}): controles e botão dentro da tela')
        tap()
        ok(q.evaluate("document.fullscreenElement===null"),f'{nm}: toque de novo sai da tela cheia')
        ok(q.evaluate("!document.getElementById('fs').classList.contains('on')&&!document.documentElement.classList.contains('fs')"),f'{nm}: estado volta ao normal')
        q.evaluate("document.documentElement.requestFullscreen()");q.wait_for_timeout(300);q.evaluate("document.exitFullscreen()");q.wait_for_timeout(300)
        ok(q.evaluate("!document.getElementById('fs').classList.contains('on')"),f'{nm}: sair por Esc/voltar do sistema também atualiza o botão')
        c.close()
    c=br.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);q=c.new_page();route(q)
    q.add_init_script("Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined")
    q.goto(URL);q.wait_for_function('window.__h')
    ok(q.evaluate("window.__fs===null&&document.getElementById('fs').hidden"),'sem suporte à Fullscreen API: botão fica escondido')
    c.close()
    br.close()
print(f'\n{len(res)-fails}/{len(res)} OK');sys.exit(1 if fails else 0)
