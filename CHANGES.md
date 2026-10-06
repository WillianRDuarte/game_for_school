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
