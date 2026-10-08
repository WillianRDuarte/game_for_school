# Etapa 21: SEED NOVA A CADA PARTIDA (mapa diferente em cada corrida)
Problema: `Track(7)` fixo, ruído do terreno com grade fixa e seeds fixas de cenário (7), tráfego e perks (sorteadas só uma vez no construtor) → toda partida repetia o mesmo mapa.
- `js/seeds.js` (NOVO): `randomSeed(avoid)` (30 bits, crypto, nunca igual à anterior), `deriveSeeds(master)` (sub-seeds independentes: track/terrain/scenery/traffic/perks/meteors), `urlSeed()` (`?seed=N` só para reproduzir a PRIMEIRA partida; reinícios sempre sorteiam outra).
- `js/game.js`: seed mestra no construtor e em `restart()`; `restart()` chama `setTerrainSeed`, `reseed()` de meteoros/tráfego/perks/cenário e cria `Track` novo. `game.seed` / `game.seeds` ficam acessíveis (depuração).
- `js/utils.js`: `setTerrainSeed(s)` desloca a grade do ruído de gradiente (terreno, relevo, zonas). Seed 0 = mundo original.
- `js/road.js`: `Track(seed,{varyStart,safe})`. `varyStart`: região inicial sorteada (planície/colinas/vale) e reta inicial de 300–500 m. `safe=220`: nos primeiros ~880 m só manobras com raio ≥ 190 m (sem TIGHT/HAIRPIN/CHICANE/EASE_IN/EASE_OUT) e greide ≤ 7 %. Sem opções = comportamento original (testes antigos).
- `scenery.js`/`traffic.js`/`perks.js`/`meteors.js`: método `reseed(seed)` (+ `Math.imul` na ZoneMap, idêntico para seeds pequenas).
- Geração continua por chunks (pista sob demanda, tiles, cenário/tráfego/perks por chunk); nada é gerado inteiro.
- Teste: `node --import ./tests/register.mjs tests/seed_test.mjs` (GAMES=n).

## Etapa 20 — NPCs mais realistas (só `js/traffic.js`)
Somente o comportamento dos motoristas NPC mudou; mapa, terreno, estrada, jogador, lava, HUD, meteoros e colisões/destruição seguem iguais.
- **Personalidade por motorista** (`_persona`): distância de seguimento (`gapT`), antecipação (`ant`), tempo para perceber obstáculo parado (`obsR`), ritmo (`paceA/paceW`), oscilação de direção (`wobA/wobW`), agilidade lateral (`latA`) e vontade de trocar de faixa (`rstl`). ~9 % são "desatentos" (`late`): reação ×1,7 a meteoros, percebem rocha/destroço só no último instante e acabam batendo; ~30 % são "cruzeiro" (estáveis).
- **Velocidade**: além das velocidades por tipo, cada um acelera e alivia lentamente (soma de 2 senoides, ±0–20 %, períodos de 7–24 s) — `_think`.
- **Movimento suave** (`_drive`): aceleração proporcional ao erro com variação limitada (jerk 14 m/s³; freada de emergência 70); aceleração lateral 4–7,5 m/s² (só o desvio de emergência segue 16); direção (`yaw`) filtrada; leve inclinação/"sentada" (roll/pitch ≤ 0,03/0,04 rad). Antes: aceleração lateral p99 16 m/s², agora ~6.
- **Micro-correções**: oscilação lateral lenta (0,05–0,8 m) proporcional à velocidade, sem efeito durante desvio de emergência.
- **Distância**: folga lateral (`_nudge`, empurra até 1,1 m para longe de quem está colado ao lado) e distância de seguimento individual.
- **Trocas de faixa espontâneas** (`_wander`): motoristas inquietos mudam de faixa sem trânsito à frente, só se a lateral está livre.
- **Destroços deslizando** agora atualizam `s/o` e entram na percepção dos outros motoristas (antes só os parados).
- Custo: ~0,1 ms/frame (mesmo patamar), nenhuma alocação nova por frame.
- Testes: `traffic_test` TUDO OK (QUICK); turbo_shield, perks, orphan, danger, rocks OK. `vehicles_test` falha só "objetos estabilizam" (já falhava no projeto original). Rodado também em Chromium real (lógica, sem WebGL).

## Etapa 19c — RÉ real no joystick + manche centralizado
- **Ré** (`js/player.js`, `js/input.js`): joystick ↓ agora engata RÉ de verdade. Andando para frente, ↓ primeiro FREIA (igual ao botão FREIO) e, ao ficar parado (≤ 0,5 m/s), engata a ré (até 13 m/s, `REV_MAX`/`REV_A`). Só o joystick usa isso (`input.reverse`); tecla S e botão FREIO continuam só freando. Soltar → volta ao movimento constante para frente. Em ré a direção inverte como num carro real. Estado explícito `player.revOn`; `player.speed` continua ≥ 0 para o resto do jogo (a ré está em `vx/vz`). Sem ré a trajetória é bit-idêntica à anterior (verificada contra o projeto original).
- **Posição**: o manche tinha 2 px de borda fora do centro (faltava `box-sizing:border-box`); agora fica exatamente no centro. Base: margem esquerda/inferior iguais às dos botões (testado em 8 tamanhos de tela).
- Testes: `touch_test.mjs` seção 2d (ré), `touch_browser_test.py` 126/126.

## Etapa 19b — JOYSTICK de 2 eixos (↑ acelera 50 % · ↓ freio/ré · ←→ vira)
- `js/input.js`: novo `input.stickY` (+ = para cima) e constantes `STICK_GAS=.5`, `STICK_FULL=.6`. `poll()`: `throttle=max(teclado/botão, .5·min(1,↑/.6))` e `brake=max(teclado/botão, min(1,↓/.6))` — usa MAX, não soma: o botão ACELERAR continua com força 1 (mesmo com o joystick ↑).
- `js/touch.js`: o joystick agora lê X e Y (zona morta por eixo, analógico, manche limitado ao círculo); escreve `input.stick` e `input.stickY`; zera ao soltar/cancelar/perder foco.
- CSS: setas ▲ ▼ ◀ ▶ desenhadas na base. Nenhuma mudança em `player.js` (o `throttle` já era multiplicador analógico da aceleração).
- NOTA: o jogo não tem marcha à ré (o Player limita a velocidade a ≥ 0; o botão "FREIO/RÉ" só freia). ↓ no joystick = o mesmo comando do botão FREIO.
- Testes: `touch_browser_test.py` 118/118; `touch_test.mjs` (seção 2c: 50 %, proporcional, botão inalterado, física).

## Etapa 19 — JOYSTICK VIRTUAL + TELA CHEIA (mobile)
Só controles/HUD; mapa, terreno, estrada, carros, NPCs, meteoros, lava e gameplay NÃO foram tocados.
- **Joystick** (`js/touch.js`, `js/input.js`, CSS): as setas ◀ ▶ foram substituídas por um joystick no canto inferior esquerdo. Direção analógica no eixo X (zona morta 12 %, curso total a 80 % do raio) escrita em `input.stick` (-1..1), somada ao teclado em `Input.poll()` e limitada a ±1; o Player continua lendo só `steer`. Volta ao centro ao soltar / touchcancel / perder foco. Um `pointerId` próprio (com `setPointerCapture`): multitouch com ACELERAR/FREIO/TURBO, que seguem iguais. `input.touch` não mudou.
- **Tela cheia** (`js/fullscreen.js`, `index.html`, `main.js`, CSS): botão pequeno ao lado da distância (`#fs`), Fullscreen API (com prefixo webkit), alterna entrar/sair, acompanha Esc/“voltar” do sistema via `fullscreenchange`, chama `Game.resize()` ao mudar (e de novo após 250 ms por causa do Android). Em tela cheia o HUD respeita `safe-area-inset`. Sem suporte (ex.: iPhone) o botão fica escondido.
- Testes: `tests/touch_browser_test.py` (Chromium real, 107/107: joystick analógico, multitouch, tela cheia em celular e PC), `tests/touch_test.mjs` (stick ≡ botão antigo; soma com teclado).

# Etapa 18 — METEOR DIRECTOR (ritmo da chuva de meteoros)
Só o sistema de meteoros. Preservados: trajetórias, indicadores, explosões, crateras/rochas, dano e 3 vidas, meteoro de punição, NPCs, lava, mapa, terreno, estrada, chunks, HUD, perks.
- NOVO `js/director.js`: fases CALMO → PERIGO → TEMPESTADE → RECUPERAÇÃO (ordem sorteada; tempestade 6–11 s sempre seguida de recuperação de 7–10 s; sem tempestade antes de 450 m). Perfis por fase (cadência, simultâneos, cota de meteoros que AMEAÇAM o jogador, intervalo entre ameaças, espaçamento, pesos das categorias, tamanhos, pontaria, tentativas de mirar em NPCs).
- Regras: cota de ameaças simultâneas (calmo 1 · perigo 3–4 · tempestade 5–6); nenhuma ameaça na 1ª parte da recuperação nem pousando após o fim de perigo/tempestade; impactos não colados (espaço e tempo); carência de 3 s sem ameaças após dano (1,5 s após bater em rocha); no máx. 1 ameaça grande por vez.
- Dificuldade pela distância: frequência/duração de perigo e tempestade, tamanho, pontaria, parcela no caminho, mira em NPCs — taxa de impactos k=1/k=0 ≈ ×2 (antes ≈ ×4).
- `js/meteors.js`: ganchos mínimos (`director`, `spawn` avalia candidatas com `D.evaluate`, `_pickImpact/_size` aceitam o plano da fase, `_impact`/`collide` avisam o Director). `director.enabled=false` restaura o agendador original.
- `js/ui.js`: a linha de debug mostra a fase atual.
- Testes: `tests/director_test.mjs` (novo; QUICK=1 encurta); `meteor_test` roda com o Director desligado (mede o agendador antigo); `orphan_test` conta as crateras existentes antes dos 20 s finais.
- Ajuste fino: `_profile()` e tabela `W` em `director.js`.

# Etapa 17 — ATMOSFERA VULCÂNICA / APOCALÍPTICA (somente visual)
Sem mudanças de gameplay, física, mapa, estrada, chunks, carros, NPCs, meteoros, lava (lógica), controles ou HUD.
- NOVO `js/atmosphere.js`: céu em shader (preto-avermelhado → brasa no horizonte, vulcões distantes, brilho na direção da lava); **nuvens de fumaça 3D** (puffs billboard em 1 draw call instanciado, 3 camadas: horizonte/meio/perto, posição real no mundo → paralaxe, passam por cima da pista; ordenadas de trás p/ frente; iluminadas por baixo pela lava); **brasas e cinzas** (2 Points com movimento 100 % no vertex shader); névoa quente; luzes (hemisfério arroxeado + direcional laranja baixa vinda da lava); `gradeMaterial()` (color grading por material); 3 níveis de qualidade com queda automática de FPS.
- `js/game.js`: usa `Atmosphere` no lugar do céu/névoa/luzes azuis; celular: resolução ≤ 1,5×, sem MSAA, nível 1; `pr` único para os `setView`.
- `js/world.js` (materiais de terreno e asfalto), `js/scenery_models.js` / `js/scenery.js` (prédios e árvores): só `gradeMaterial` (dessatura/escurece/esquenta).
- `js/lava.js`: só a cor da névoa passa a ser convertida para sRGB (para casar com a cena).
- `index.html` + `css/style.css`: `#grade` (vinheta + gradiente quente, sem blend-mode).
- `tests/atmosphere_test.mjs` (novo) e `tests/three-stub.mjs` (stubs extras).
- Bloom real (pós-processamento) NÃO foi usado de propósito (custo em celular): o brilho vem de halos aditivos (brasas, aura da lava, nuvens iluminadas por baixo, céu).
- Ajuste fino: constante `LOOK` no topo de `atmosphere.js`.

# Meteor Run — novo sistema de estrada e terreno

## Arquivos modificados
- `js/road.js` — traçado: 3 planejadores independentes (curvatura, greide, largura) + regiões temáticas; pista 65–95 m de largura, 6 faixas.
- `js/terrain.js` — `ground(x,z)` reescrita (relevo + corredor da estrada); tiles com normais/cores/skirts.
- `js/world.js` — estrada em chunks de 192 m; terreno em quadtree de tiles com LOD (128 m → 4096 m), alcance 6 km, streaming em fatias de tempo, pool.
- `js/game.js` — céu (cúpula gradiente), neblina atmosférica, near/far, preload + streaming.
- `js/player.js` — sem limite de mundo; encostas íngremes freiam; escorregamento lateral fora da pista.
- `js/ui.js`, `js/utils.js` — HUD (região, tiles), ruído de gradiente/ridged.
Inalterados: `camera.js`, `input.js`, `main.js`, `index.html`, `css/`.

## Testes (Node, sem GPU): `tests/`
    node tests/track_test.mjs                                    # continuidade/estatística do traçado
    node tests/ground_test.mjs                                   # continuidade do terreno, inclinações, custo
    node tests/lod_test.mjs                                      # pista nunca enterrada em nenhum LOD; bordas dos tiles
    node --import ./tests/register.mjs tests/world_test.mjs      # simula o jogo: streaming, sem buracos, sair/voltar à pista
    node --import ./tests/register.mjs tests/render.mjs /tmp/out # rasterizador de software → PNGs (requer `sharp`)

## Etapa 2 — somente terreno
Alterado apenas `js/terrain.js` (função `ground()` e cor por vértice). Estrada, carro, câmera, chunks/LOD e `world.js` intactos.
Novo relevo: campos de "caráter" de baixa frequência (planície↔cordilheira, suave↔acidentado, colinas pequenas↔grandes,
áreas planas, bacias/depressões, viés de altitude da estrada → colinas se a pista é alta, vale se é baixa), 3 escalas
combinadas (formações ~1,9 km, ondulações ~750/230 m, irregularidades ~30/11 m) e domínio deformado.
Teste novo: `node tests/variety_test.mjs`.

## Etapa 3 — Meteoros
Novo/integrado: `js/meteors.js` (spawn no céu, rastro, marcador de impacto no chão, explosão, crateras por célula de 256 m, pools).
`js/game.js`: vidas (3), invulnerabilidade (2,2 s, carro pisca), game over, reinício (Enter / Espaço / R / botão), recorde (localStorage).
`js/ui.js` + `index.html` + `css/style.css`: ❤️ ❤️ 🖤, flash vermelho ao levar dano, tela GAME OVER com distância/recorde,
indicadores na borda da tela para impactos que a câmera não mostra (atrás/laterais).
`js/world.js`: apenas o método `dispose()` (usado no reinício). Estrada, terreno, carro, câmera e controles: sem alteração.
Testes: `node --import ./tests/register.mjs tests/meteor_test.mjs` (56 verificações) e `tests/meteor_render.mjs` (imagens).

## Etapa 4 — Meteoros que ficam no chão (obstáculos)
`js/meteors.js`: mais meteoros (spawn médio 1,1 s → 0,24 s; simultâneos 8 → 24, teto 30); impacto deixa cratera + rocha (3 formas × 3 tamanhos, `InstancedMesh`
com geometria/material compartilhados) apoiada na superfície real; colisor circular (`collide()`, carro = 3 círculos) que empurra o carro e dispara `onRockHit`;
brilho/fumaça/fogo persistentes só nos 18 meteoros mais recentes (9 s); novas categorias de impacto (ao redor, campo aberto, "no caminho", sobre o asfalto);
`_blocks()` garante corredor livre ≥4 m na pista; rochas guardadas por célula de 256 m (visuais liberados a >900 m, dados descartados a >3 km, teto 800);
partículas escalam com distância/carga; marcador de aviso menor (`blastR`).
`js/game.js`: `_damage()` único (explosão e batida em rocha = 1 vida + invulnerabilidade), `meteors.collide()` no loop.
`js/ui.js` / `css/style.css`: ícone de borda 34 → 16 px, até 14 indicadores, HUD mostra rochas no chão.
Testes: `tests/meteor_test.mjs` (limites novos), `tests/rocks_test.mjs` (novo), `tests/three-stub.mjs` (InstancedMesh).
Não há subestradas neste projeto (apenas estrada principal + terreno).

## Etapa 5 — Quantidade de meteoros ×2,5
Só `js/meteors.js` (parâmetros): intervalo de spawn 1,1→0,24 s passou a 0,44→0,096 s; simultâneos 8→24 passou a 20→60; teto `MAX_METEORS` 30→75;
retry de spawn 0,12→0,05 s. Limites proporcionais: crateras/rochas visíveis 96→180, `ROCK_CAP` 128→256, registros 800→2000, brilho persistente 18→40,
buffers de partículas ×2. Mecânica, trajetória, colisão, chunks e UI inalteradas. Medição: `node --import ./tests/register.mjs tests/rate_test.mjs`.

## Etapa 6 — Mais meteoros, queda mais rápida e ZONA LETAL (>200 m da pista)
**Intensidade** (`js/meteors.js`, só parâmetros/pools): intervalo de spawn 0,44→0,096 s passou a 0,17→0,036 s; simultâneos 20→60 passou a 36→110 (`MAX_METEORS` 75→140);
tempo de queda 4,6→3,0 s passou a 2,6→1,7 s (×0,57 → ~1,8× mais rápido; altura de nascimento, trajetória e tamanhos inalterados); rastro cresce com a velocidade; surgimento (scale-in) 0,7→0,4 s.
Capacidades proporcionais: decals 180→300, `ROCK_CAP` 256→480, registros 2000→4000, brilho persistente 40→64, partículas fogo 1400→2400 / fumaça 2800→4800 (menos partículas por impacto com >30/>60 meteoros no ar).
Medido (`tests/rate_test.mjs`, impactos/min em dificuldade 0 / 0,5 / 1): 125→320 / 208→518 / 549→1260; pico simultâneo 13→20 / 18→24 / 34→45.
Performance: contador de meteoros ativos (sem `filter` por frame), `_place` sem `hypot`, `_blocks` sem `nearest()` por rocha (posição relativa à pista guardada na criação), meteoro cujo impacto ficou a >1,6 km é desativado.
**Correção (bug antigo agravado pela densidade):** `_blocks()` só olhava rochas a 48 m em linha reta, ignorando o lado oposto de uma pista de 64–96 m → o corredor livre podia fechar. Agora a janela é ±48 m AO LONGO da pista, em toda a largura (`road.js`: `nearest()` também devolve `h`).
**Zona letal:** `Track.edgeDist(x,z)` (`js/road.js`) = distância à BORDA do asfalto mais próximo (min de distância à linha central − meia-largura) em TODAS as amostras do índice espacial (5×5 células de 170 m, exata até ~340 m).
`MeteorSystem._zoneUpdate` usa antes o `roadD−roadW` que o `Player` já calcula todo frame (é um limite superior da distância real): perto da pista não há busca nenhuma; só a >130 m roda a busca exata, no máx. 10×/s.
>200 m por 0,25 s → `_spawnLethal()`: meteoro grande vindo do céu à frente do carro (visível), 1,45 s de queda, mira acompanha o carro e pousa nele; ignora limite de simultâneos. Se o jogador volta a <190 m antes do impacto, vira meteoro comum; a checagem final é exata.
`js/game.js`: `_kill()` = morte instantânea (ignora vidas e invulnerabilidade) → GAME OVER; impactos comuns seguem tirando 1 vida. `js/ui.js`/`index.html`/`css/style.css`: aviso `#danger` ("volte à pista" a partir de 130 m; "ZONA LETAL" quando disparado) e causa da morte na tela de GAME OVER.
Não há subestradas neste projeto (só a estrada principal); `edgeDist` varre todas as amostras do índice, então qualquer ramo futuro inserido nele já conta.
Testes: `node --import ./tests/register.mjs tests/danger_test.mjs` (novo, 9 grupos); limites antigos atualizados em `meteor_test.mjs` / `rocks_test.mjs`.

## Etapa 7 — Indicador de impacto menor (somente visual)
`js/meteors.js`: novo `markR(R)=.9+R*.1` (raio visual do indicador, ≈1,3–3,7 m; antes ≈6–28 m). Indicador = disco vermelho cheio com borda suave (antes: anel laranja de centro vazio que "fechava");
coluna de luz desligada (`col.visible=false`); sem pulso de escala. `blastR` (raio de dano), tamanho/modelo/quantidade/velocidade/trajetória dos meteoros, impactos, crateras e vidas: inalterados (verificado com mesma semente: dados dos meteoros idênticos).
`js/ui.js` / `css/style.css`: pontos de aviso na borda da tela sem o "!", círculos vermelhos lisos de 10 px (antes 16 px).
`tests/rocks_test.mjs`: verificações do indicador atualizadas (ícone ≥20% de 34 px; indicador no chão ≥65% menor).

## Etapa 8 — Correção: indicador de impacto não entrava na cena
Causa: na Etapa 7 o comentário que acrescentei em `_marker()` (`js/meteors.js`) ficou na mesma linha de `group.visible=false;this.scene.add(group);` e comentou esse trecho → os marcadores de impacto nunca eram adicionados à cena (0 de 32).
Correção: restaurado `group.visible=false;this.scene.add(group);` (comentário movido para o fim da linha). Nenhum outro comportamento mudou (dados dos meteoros idênticos, mesma semente).
Auditoria de órfãos (marcadores, rochas em queda, brilhos, flashes, partículas): nenhum fica para trás; `_release()` já devolve marcador e meteoro ao pool no impacto. Novo `tests/orphan_test.mjs` (falha na versão com o erro, passa na corrigida).

## Etapa 9 — Carros NPC / tráfego (sobreviventes fugindo dos meteoros)
**Novo `js/traffic.js`** (módulo independente, `TrafficSystem`). **Ganchos mínimos:** `js/meteors.js` (exporta `CAR_R/CAR_OFFS`; `npcAim` opcional em `spawn()`; `rockNear()`), `js/game.js` (instancia, `update`, `_onImpact→onMeteorImpact`, `_onTrafficHit→_damage(causa)`, reinício). Estrada, terreno, chunks, câmera, controles, UI, vidas e o resto dos meteoros: inalterados.
- **Modelo:** motoristas em coordenadas de estrada (s ao longo da pista, o lateral): seguem curvas/greide sem consultar o terreno. Pool fixo de 26 carros (mesmo modelo do jogador, 8 cores, 2 escalas, geometria/materiais compartilhados). Motoristas simultâneos 8 → 16 (dificuldade 0 → 1), destroços ≤ 10.
- **Chunks:** cada chunk de estrada (192 m) que entra na faixa à frente (até +5) é semeado (0,9 → 2,0 carros/chunk, semente por chunk). Por trás, carros rápidos nascem a 235–300 m (só se puderem alcançar o jogador). Removidos além de +1250 m / −380 m (destroços: −170 m ou 80 s e >150 m).
- **Tráfego:** tipos lento/normal/rápido/danificado, faixas preferidas (rápido à esquerda), freio em curvas, seguir líder, ultrapassar, voltar à faixa de origem, desviar de rochas e destroços, distração ocasional. Pistas são mão única (todos fogem na mesma direção). **Não há subestradas no projeto** (CHANGES etapa 4): o modelo é por faixas.
- **Meteoros:** lê `meteors.warnings` (indicadores de impacto) numa grade hash refeita a 10 Hz; cada NPC consulta só as células ao longo da sua trajetória, ~6×/s. Reação, agilidade lateral e erro de decisão por motorista → alguns desviam, alguns falham, alguns decidem errado. `onImpact` do sistema existente → `onMeteorImpact` (dentro de `blastR(R)+1` = destruído; onda de choque empurra/danifica). Meteoro mirado em NPC: chance 0,4–1% por spawn.
- **Destroços:** desfechos stop/flip/burn/push; deslizam, giram, capotam, param (pose pelo terreno), fumaça/fogo reutilizando `meteors.smoke/fire`; sólidos para jogador e NPCs.
- **Dano ao jogador:** círculos (mesma geometria da colisão com rochas); batida forte (aprox. ≥ 7,5 m/s NPC, ≥ 5,5 m/s destroço) → 1× `Game._damage('Batida com outro carro')` (invulnerabilidade de 2,2 s existente + trava de 2,5 s por carro). Raspões: só física. Sem morte instantânea.
- **Testes:** `node --import ./tests/register.mjs tests/traffic_test.mjs` (novo). `tests/orphan_test.mjs`: tráfego desligado nele (a fumaça de carros danificados usa o mesmo pool de partículas).

## Etapa 10 — Perks / power-ups + combo
Novo `js/perks.js` (`PerkSystem`): ⚡ NITRO · 🛡️ ESCUDO · ❤️ REPARO · 👻 FASE · 🔥 OVERDRIVE como objetos 3D no mundo (pool por tipo, geometria/material compartilhados, máx. 10 ativos / 19 objetos).
**Antes não existiam** nitro, pontuação, lava nem controles de toque neste projeto: o nitro foi criado dentro do módulo de perks (único sistema); a "lava" do pedido não existe — a ameaça equivalente é a ZONA LETAL (`_kill`), que o escudo NÃO bloqueia.
- **Spawn por chunk:** cada chunk de estrada (`CHUNK_LEN`) que entra a 4 chunks à frente sorteia (semente por chunk) se nasce um perk; posição: asfalto / acostamento / terreno (com checagem de encosta e de rocha). Frequência 0,40→0,62 por chunk com a dificuldade; portões por distância (escudo 300 m, reparo 700 m, fase 900 m, overdrive 2,5 km) e cooldown por distância entre perks do mesmo tipo; REPARO só nasce se faltar vida; eventos combinados (2 perks) em distância alta. Perks atrás do carro (>120 m) voltam ao pool.
- **Risco/recompensa:** parte dos perks é "de risco": `meteors.perkAim` (mesmo caminho do `npcAim`, com `_blocks`) pede 1–3 impactos a 9–14 m do perk quando o jogador se aproxima (o marcador de impacto já avisa). REPARO de risco fica em terreno difícil.
- **Efeitos** (ganchos neutros no `Player`: `accMul, boostA, vMax, agile, phase, fovExtra`; `HARD_MAX=105 m/s`): nitro 4 s (soma carga até 8 s, teto 90 m/s) · overdrive 5 s (teto 105, mais empuxo/agilidade, nitro gasta metade) · escudo ~9 s, absorve 1 dano em `Game._damage` (0,9 s de graça) · fase 3 s (+graça enquanto sobreposto, máx. 4 s): atravessa NPCs/destroços (`traffic._playerHits`) e rochas pequenas/médias (`meteors.collide`); rochas grandes e o terreno continuam sólidos · reparo: `Game._heal()` no sistema de vidas existente (nunca >3; vida cheia mostra "VIDA CHEIA"). Ao acabar o boost a velocidade decai suave (14 m/s²) em vez de cortar.
- **Combo/pontos:** meteoro que cai perto sem acertar, passar raspando em NPC/destroço, pegar perk (mais se arriscado), velocidade com nitro, sobreviver 25 s. x1…x5; expira em 6 s; dano real zera (dano absorvido pelo escudo não zera). Pontos aparecem no HUD e no game over.
- **HUD** (`#combo`, `#perks`, `#toast`, `#pflash`; CSS responsivo `max-width:700px`) e FOV dinâmico (`camera.js`). Visual no carro: chamas (nitro/overdrive), bolha (escudo), carro translúcido violeta (fase).
- **Testes:** `tests/perks_test.mjs` (47 verificações). `traffic_test`/`rocks_test`: 1 linha `g.perks.update=()=>{}` (testes auditam só tráfego/meteoros; um Nitro pego mudaria o cenário "jogador lento"). `three-stub.mjs`: Octahedron/Torus e `Color.getHex/setHex`.

## Etapa 11 — Turbo por barra de carga (SHIFT) + Escudo que destrói obstáculos
Nada foi recriado: o Turbo já existia como o perk ⚡ NITRO em `perks.js` (efeito por tempo) e o Escudo como 🛡️ (bolha de 9 s); ambos foram **alterados no lugar**.
- **Turbo** (`perks.js`): coletar o item só **enche** a barra (+25 %, teto 100 %, cheio = sem erro). **SHIFT** (`input.js` → `Input.onTurbo`, ligado em `game.js`; controles de toque podem chamar o mesmo gancho) liga o turbo se houver carga ≥ 5 %; sem carga o HUD pisca "SEM CARGA". Consumo contínuo 12,5 %/s (100 % ≈ 8 s; metade com 🔥 Overdrive); em 0 desliga. Intensidade `turbo.ti` sobe em ~0,4 s e desce em ~1,2 s (sem freada seca) e alimenta os ganchos que já existiam no `Player`: `accMul` +25 %, `boostA` 12, `vMax` 75→90, `agile` +6 %, `fovExtra` +7° (FOV dinâmico da câmera). Teto absoluto `HARD_MAX`=105 inalterado. Overdrive segue como perk temporizado separado.
- **Escudo** (`perks.js`, `meteors.js`, `traffic.js`, `game.js`): fica ativo **até bloquear um impacto** (sem relógio; pegar outro não empilha). `perks.ram()`: contato com obstáculo destrutível → o obstáculo é **destruído**, sem dano nem empurrão, escudo consumido (janela de 0,35 s destrói também contatos simultâneos do mesmo choque). Rocha de meteoro: `MeteorSystem.smash()` (remove colisor + instância 3D; a **cratera/registro continuam** e a rocha não volta ao recarregar a célula; `_blocks` ignora rochas destruídas). Carro NPC/destroço: `TrafficSystem._smash()` (estouro de fogo/fumaça e volta ao pool). Meteoro que cai em cima do carro: `Game._damage → perks.absorb()` bloqueia o dano, consome o escudo e o impacto/cratera/rocha acontecem como antes. **Fase** continua passando por rochas pequenas sem gastar o escudo. **Zona letal (`_kill`, o equivalente da "lava") NÃO é bloqueada.** Elementos estruturais (estrada, terreno, chunks) não participam: só rochas caídas, NPCs e destroços.
- **HUD** (`index.html`, `css/style.css`): barra `⚡ TURBO ▮▮▮▮▮▮▮▮▯▯ 80 % [SHIFT/ATIVO/SEM CARGA]`, chip `🛡️ ESCUDO ATIVO / OFF`, linhas de velocidade em CSS (um único elemento) enquanto o turbo roda. Linhas de Nitro/Escudo foram removidas do painel `#perks` (não duplicar). Aura azul do escudo, chamas/partículas do turbo e flash de impacto reaproveitam o que já existia.
- **Testes:** `tests/turbo_shield_test.mjs` (NOVO, 50 verificações: Turbo 1–10 e Escudo 1–10 do pedido + Fase×Escudo + corrida longa com tudo ligado); `perks_test.mjs` adaptado (turbo por carga/Shift; escudo sem expiração).


## Etapa 12 — Veículos NPC: SUVs + Drifter + coletânea de 39 carros (48 modelos, todos usados)
- Fontes (originais intactos em `assets/models/originals/`, md5 conferido): `low_poly_suvs.glb` (8 SUVs), `low-poly_truck_car_drifter.glb` (1 caminhão), `39_low_poly_vehicle_free.glb` (39 veículos, um por nó de topo, só cores — sem texturas).
- `tools/build_vehicles.py` gera `assets/models/npc_vehicles_lite.glb` (3,3 MB; decimação dos pneus/rodas, materiais preservados, sem normais -> flat shading). `tools/preview_vehicles.py` gera as folhas de prévia (frente à esquerda, traseira à direita).
- `js/vehicles.js` (NOVO): lista `VEHICLES` com os 48 modelos (classe, giro de frente por modelo: SUV/coletânea π, Drifter π/2), classes (car/sport/suv/van/truck/big/limo/dmg) com tamanho-alvo, massa, velocidade e agilidade; escala automática por classe (.85–1,35); GLB carregado UMA vez; instâncias compartilham geometria/material; cache de no máx. 1 instância livre por modelo; sorteio balanceado por uso (a coletânea inteira circula, sem filas de iguais); material carbonizado compartilhado para destroços.
- `js/traffic.js`: o carro do pool troca o visual (`_look`); colisor (L/W/H/hl/hw/massa) segue o modelo; IA igual, só modificadores pequenos (vMul/agil); destroço usa o mesmo modelo; se o GLB falhar, volta às caixas. `js/main.js` carrega a biblioteca com timeout de 10 s; `index.html`: importmap `three/addons/`.
- Player Car: NÃO alterado (continua a caixa procedural vermelha; não há GLB do jogador no projeto).
- Testes: `tests/vehicles_test.mjs` (arquivo, escala dos 48, orientação, rodas no chão, cobertura dos 48, cada modelo individualmente, classes, destroços, colisão/escudo/meteoro, corrida longa, console). Regressão: turbo_shield, perks, orphan, danger, traffic, rocks, track, ground, lod, world, variety sem falhas novas; `meteor_test` p99 < 4 ms falha igual no projeto original (meteors.js inalterado).

## Etapa 13 — CENÁRIO PROCEDURAL (prédios + árvores ao longo da estrada principal)
Novo/integrado, sem recriar nada (estrada, terreno, chunks, tráfego, meteoros, perks, controles, carro do jogador e NPCs intactos). **Sem subestradas.**
**Modelos (todos usados):** `tools/build_scenery.py` lê os 3 GLBs originais (copiados para `assets/models/originals/`, não alterados) e gera `assets/models/scenery_lite.glb` (785 KB; originais ≈ 10,9 MB):
17 prédios — 10 acomodações (2 hotéis, 3 prédios de apartamentos, 5 casas) + 7 comércios (restaurante, loja, pizzaria, hamburgueria, café, cinema, shopping) — e 6 árvores (2 redondas, 2 ciprestes, 2 carvalhos ramificados;
no original eram uma só malha soldada: separadas por componentes conexos). Colliders do pacote e placa de chão descartados; prédios 4–19 mil → 1,2–2,7 mil triângulos por clustering com quádricas (planos/quinas preservados, 1 cor de paleta por triângulo).
`js/scenery_models.js`: tabela com escala, frente (+x nas acomodações, +z nos comércios), classe e limites de variação de escala **por modelo** (hotel ≈ 36 m, nunca arranha-céu), biblioteca carregada UMA vez, 1 geometria + 3 materiais compartilhados, sorteio com memória, `fallbackSceneryLibrary` (caixas/cones) se o GLB falhar.
**Sistema:** `js/scenery.js` — regiões CAMPO/RURAL/SUBÚRBIO/URBANO (cadeia de Markov em segmentos de 400–1200 m, mistura suave de 150 m nas fronteiras, ruído independente por lado); geração por chunk do `world.js` (CHUNK_LEN 192 m): prédios até 9 chunks à frente, árvores até 6, 2 atrás,
em fatias de ~2,5 ms por frame; chunk que sai da janela é descartado das grades e das instâncias. Posicionamento com `ground()`: pegada amostrada (5–9 pontos) + anel, distância mínima ao BORDO do asfalto por classe (13–23 m, vale para qualquer trecho de pista, também grampos), relevo máximo por classe, sem sobreposição;
prédios sempre VERTICAIS sobre fundação instanciada (nunca flutuam); árvores acompanham 50 % da inclinação. Render: 1 `InstancedMesh` por modelo (+1 de fundações) → ≤ 24 draw calls; matrizes por chunk, só os visíveis (frustum + distância) são copiados a 10 Hz; árvores distantes afinadas.
Colisão: 1 caixa orientada por prédio (carro = 3 círculos como nas rochas); batida ≥ 6 m/s → `Game._damage('Batida com um prédio')`; árvores não colidem.
Futuro: registros com `state` (ST.INTACT/DAMAGED/BURNED/RUINED), `setState` + `model.variants`, `onMeteorImpact → onBuildingHit`, `buildingsNear` — sem efeito visual ainda.
Alterados: `game.js` (criação, update, collide, reset, hook de impacto, +1 parâmetro no ui.update), `main.js` (carga do GLB), `ui.js` (contagem no #dbg). Novos: `scenery.js`, `scenery_models.js`, `tools/build_scenery.py`, `tools/preview_scenery.py`, `tests/scenery_test.mjs`, `tests/scenery_map.mjs`, `tests/scenery_render.mjs`.
**Fato do terreno que molda o resultado:** ao lado da pista o terreno é um talude (mediana de ~10 m de desnível numa pegada de 15 m a 14 m do asfalto; 68 % das pegadas planas a ~70 m). O sistema busca chão plano afastando o lote aos poucos (5 tentativas) e recusa o resto: em desfiladeiros "urbanos" há poucos prédios; em planícies, muitos.
Testes: `node --import ./tests/register.mjs tests/scenery_test.mjs` (QUICK=1 encurta). Mapa aéreo: `tests/scenery_map.mjs out.png 0 5000`. Vista do jogador por rasterização: `tests/scenery_render.mjs dir 150 800 2450`. Regenerar GLB: `python3 tools/build_scenery.py`.

## Etapa 14 — INTEGRAÇÃO: TOUCH + MODELOS/TEXTURAS + CENÁRIO + carros 22 % maiores
- Base: ZIP TOUCH (48 NPCs GLB, Mustang do jogador `playercar.js`/`player_mustang.glb`, controles de toque `touch.js`). Trazido do ZIP CENÁRIO: `js/scenery.js`, `js/scenery_models.js`, `assets/models/scenery_lite.glb` (+3 originais), `tools/build_scenery.py`, `tools/preview_scenery.py`, `tests/scenery_*.mjs`. (O ZIP "MODELO/TEXTURA" avulso não chegou; seu conteúdo — Mustang e 48 veículos — já estava no TOUCH.)
- Conflitos resolvidos sem perda: `game.js` e `ui.js` (só diferiam pelos ganchos do cenário → versão do cenário, que contém tudo do touch), `main.js` (mesclado: veículos + Mustang + toque + cenário), `vehicles.js`/`traffic.js`/`npc_vehicles_lite.glb`/`tools/build_vehicles.py`/`glb_scene.mjs` (versão do TOUCH: 48 modelos; a do cenário tinha só 9), `index.html`/`css/style.css` (TOUCH: viewport + botões), `CREDITS.md` (mesclado).
- CARROS +22 %: `CAR_SIZE_MUL=1.22` em `js/utils.js`. Jogador: `mesh.scale` 1,3 → 1,3×1,22 (`player.js`); `REST` do Mustang ÷ 1,22 para os pneus continuarem tocando a pista (`playercar.js`). NPCs: escala do modelo e da caixa de reserva ×1,22 (`traffic.js`); colisor (L/W/H) deriva dela; `GROUND` ÷ 1,22 em `vehicles.js` (pneus na pista). Colisão do jogador: `CAR_R` e `CAR_OFFS` ×1,22 (`meteors.js`) para acompanhar o corpo maior (também usados por tráfego/perks/cenário). Velocidade, física, IA e câmera NÃO foram alteradas (conferido: corrida determinística idêntica antes/depois).
- Testes ajustados ao novo tamanho: `player_car_test.mjs` (escala 1,3×1,22; REST; usa o próprio asset se o upload original não existir), `vehicles_test.mjs` (base das rodas ×CAR_SIZE_MUL).

## Etapa 15 — Câmera mais próxima, meteoros ~16 % mais lentos e ~10 % menos frequentes
- `js/camera.js`: `ZOOM=.8` — a posição final da câmera e o alvo do olhar são escalados em torno do carro (≈20 % mais perto, mesmo ângulo/enquadramento; o estado suavizado do rig não muda).
- `js/meteors.js`: `SPEED_MUL=.84` (tempo de queda ÷ .84 → velocidade ≈ −16 %; mesma trajetória/ângulo; mira em NPC/perk e indicadores usam o novo T) e `RATE_MUL=.9` (intervalo entre spawns ÷ .9 → ≈ −10 % de meteoros/impactos por segundo). Meteoro de punição (zona letal, `LETHAL_T`) e limite simultâneo (`SIM`) não foram alterados.
- Medido (60 s simulados, mesma seed): velocidade média 211 → 177 m/s (−16 %); spawns 361 → 321 (−11 %); distância câmera–carro 14,1 → 11,4 m (−19 %); inclinação do olhar −4,6° → −4,5°.

## Etapa 16 — Câmera ainda mais próxima, meteoros mais 20 % mais lentos e 20 % menos frequentes
- `js/camera.js`: `ZOOM` .8 → .64. `js/meteors.js`: `SPEED_MUL` .84 → .672, `RATE_MUL` .9 → .72. Nada mais alterado.

## Etapa 15 — LAVA (única mudança)
Novo: `js/lava.js` (`LavaSystem`) · `tests/lava_test.mjs`. Ganchos mínimos: `game.js` (cria/atualiza/reinicia a lava, `_burn()`), `index.html` (`#lavaglow`, `#lavahud`), `css/style.css` (2 regras), `tests/three-stub.mjs` (classe `PointLight`).
- Frente de lava = distância na pista (mesma unidade de `player.s`). Começa 120 m atrás; velocidade 15 m/s crescendo até 26 m/s (8 km); elástico: acima de 260 m de intervalo acelera (teto 46 m/s); intervalo máx. 440 m. `player.s <= front` → Game over imediato ("Engolido pela lava"). Todos os números em `LAVA` (topo de lava.js).
- Visual: malha por chunk de 192 m (pool, ≤6 ativos, revelada por `discard`), parede de fogo + aura, 340 partículas em 2 `Points`, 1 `PointLight`, aviso de proximidade no HUD. ~10 objetos de cena.
- Verificado: lógica em Node (lava_test) e os 8 shaders compilados em WebGL2 real; aparência da textura conferida. NÃO aberto com three.js real (CDN indisponível aqui): FPS e a aparência final da parede/partículas precisam ser conferidos no navegador.

## Etapa 16 — LAVA: área muito maior (única mudança)
- `js/lava.js`: a superfície passou de ±150 m (15 colunas, "placa" de ~300 m) para **±720 m** (57 colunas; as 15 originais continuam idênticas, mais 21 por lado a cada ~27 m) e de 520 m para **1150 m atrás da frente**, inclusive antes do início da pista (`MIN_CHUNK=-5`, reta prolongada). É malha 3D real: cada vértice usa `surface()` (altura do terreno + folga que cresce até +0,8 m nas bordas), então acompanha subidas, descidas e curvas.
- Curvas: as colunas originais se comportam exatamente como antes; as novas se espalham só até o limite em que a malha não se dobra (0,8·raio da curva), então no lado interno da curva não cruzam.
- Parede da frente e aura cobrem a mesma largura nova. Partículas continuam só nas colunas originais (mesma densidade/aparência de antes).
- Desempenho: colunas novas da parede são atualizadas em rodízio (1 em cada 4 frames); LOD de shader para pixels > 450–800 m (4 amostras de ruído em vez de 9, com mistura suave). `bind()` ~5 → ~35 ms; `lava.update` médio ~0,25 ms.
- NÃO mudou: velocidade (BASE/GROW/VMAX/elástico), distância inicial (120 m), regra de morte, HUD/luz/cores, mundo, estrada, chunks do mundo, meteoros, NPCs, carros, controles.
- `tests/lava_test.mjs`: limite de chunks de lava ativos 6 → 10 (a janela é maior de propósito).
- Verificado em Chromium com WebGL real (three.js r160): sem erros de console; curva, vistas de cima/lateral/trás, morte, reinício e 12 saltos de 500 m sem vazamento de geometrias.
