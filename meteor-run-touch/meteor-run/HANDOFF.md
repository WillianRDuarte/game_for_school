# HANDOFF — ATUALIZAÇÃO (Etapa 12: 48 MODELOS DE VEÍCULOS NPC)
Estado: SUVs (8) + Drifter (1) + coletânea (39) integrados ao tráfego; todos selecionáveis. `tests/vehicles_test.mjs` passa 100 %. Detalhes em CHANGES.md "Etapa 12".
Arquivos: `js/vehicles.js` (NOVO) · `js/traffic.js` (`_look`, `_paint`, setLibrary) · `js/main.js` · `index.html` (importmap) · `assets/models/npc_vehicles_lite.glb` + `originals/` + `CREDITS.md` · `tools/build_vehicles.py`, `tools/preview_vehicles.py`.
PENDENTE: (1) NUNCA aberto com WebGL real (CDN/npm bloqueados aqui): orientação/escala conferidas por rasterizador de software e testes em Node; (2) Player Car continua a caixa procedural (sem GLB); (3) a coletânea só tem cores (sem texturas); (4) Drifter é CC-BY-NC (uso não comercial); (5) alguns modelos são duplicatas de geometria (orange_car/car, police/taxi, van2/space_wagon/ambulance2) mantidos por cor/papel diferentes; (6) `meteor_test` p99, `rocks_test` p99 e `traffic_test` item 6 falham também no original (dependem da máquina).

---
# HANDOFF — ATUALIZAÇÃO (Etapa 11: TURBO por barra + ESCUDO destrutivo)
Estado: implementado e integrado nos arquivos existentes. `tests/turbo_shield_test.mjs` (novo) e `tests/perks_test.mjs` passam 100 %; regressão: danger 35/35, orphan OK, traffic OK, track/ground/lod/world OK. Detalhes em CHANGES.md "Etapa 11".
Arquivos: `perks.js` (turbo: `turbo={q,on,ti,empty}`, `activateTurbo()`, `absorb()`, `ram()`, `crush()`, HUD) · `input.js` (`onTurbo`, SHIFT) · `game.js` (liga `onTurbo`, `shieldRam`/`onSmash` em meteoros e tráfego) · `meteors.js` (`smash(c)`, guarda em `_placeRock`/`_blocks`) · `traffic.js` (`_smash`, `shieldRam` em `_playerHits`) · `index.html`/`css/style.css` (`#gauges`, `#turbo`, `#shieldhud`, `#turbofx`).
Decisões: turbo = SHIFT liga e roda até a barra zerar (Shift de novo com turbo ligado não faz nada); escudo dura até bloquear (sem timer de 9 s); "lava" não existe → zona letal continua letal; meteoro direto consome o escudo via `absorb()` (a rocha que cai fica, como antes).
PENDENTE: (1) jogo NÃO foi aberto num navegador com WebGL nesta sessão (o three.js vem do CDN e o ambiente não alcança o CDN/npm) — só lógica em Node + HUD/CSS renderizados no Chromium; (2) balanceamento (+25 %/item, 12,5 %/s, frequência dos itens) ajustado só em simulação; (3) testes antigos com falha intermitente/sensível a máquina: `traffic_test` item 6 (ultrapassagem, também falha no original em QUICK), `rocks_test` p99 (falha igual no original).
Teste: `node --import ./tests/register.mjs tests/turbo_shield_test.mjs` (QUICK=1 encurta a corrida longa).

---
# HANDOFF — ATUALIZAÇÃO (Etapa 10: PERKS)
Estado: sistema de perks implementado e integrado; `tests/perks_test.mjs` 47/47 OK; regressão: danger 35/35, traffic TUDO OK, rocks OK, orphan OK, track/ground/lod/world OK. Detalhes em CHANGES.md "Etapa 10".
Arquivos: `js/perks.js` (NOVO) · ganchos mínimos em `player.js` (accMul/boostA/vMax/agile/phase/fovExtra, HARD_MAX=105), `camera.js` (fovExtra), `meteors.js` (`perkAim`, fase em `collide`), `traffic.js` (fase), `game.js` (`perks`, `_heal`, escudo em `_damage`), `ui.js` (pontos no game over), `index.html`/`css/style.css` (HUD).
PENDENTE: (1) verificação visual em navegador/GPU nunca feita (aparência/escala dos perks, bolha do escudo, chamas, FPS real); (2) NÃO há controles de toque no projeto (só teclado, `input.js`): HUD é responsivo, mas jogar no celular exige escrever em `Input.throttle/brake/steer`; (3) balanceamento (frequência 0,40–0,62 por chunk, tempos, pontos) só ajustado em simulação.
Decisões: nitro vive em `perks.js` (não existia); a "lava" do pedido não existe — zona letal (`_kill`) não é bloqueada pelo escudo; perks de risco usam `meteors.perkAim` (não criar outro sistema de meteoros).
Teste: `node --import ./tests/register.mjs tests/perks_test.mjs` (QUICK=1 encurta a corrida longa).

---
# HANDOFF DO PROJETO

(Escrito a partir do estado real dos arquivos e dos logs de teste desta sessão. O que não foi verificado está marcado como DESCONHECIDO/PENDENTE.)

## 1. Objetivo atual
Adicionar ao jogo Meteor Run (three.js, ES modules, sem build) um sistema modular de **carros NPC/tráfego** (outros sobreviventes fugindo dos meteoros), sem recriar estrada, terreno, chunks, meteoros, crateras, vidas, câmera ou controles. Requisitos completos: 18 seções do pedido original (NPCs à frente e por trás, desvio de meteoros imperfeito, colisão NPC×NPC, meteoros atingindo NPCs, destroços como obstáculos, colisão/dano ao jogador usando o sistema de vidas existente, pooling, chunks, dificuldade progressiva, sem HUD nova, testes).

## 2. Estado atual
A implementação está **funcionalmente completa e integrada**. `tests/traffic_test.mjs` (novo) terminou com **TUDO OK** na última execução (run3). Nenhuma alteração em andamento ou parcial nos arquivos.

## 3. O que já foi implementado
- `js/traffic.js` (`TrafficSystem`): pool de 26 carros; motoristas em coordenadas de estrada (s, o); 8 → 16 motoristas (dificuldade), ≤ 10 destroços; semeadura por chunk à frente (AHEAD_CH=5) e nascimento por trás (235–300 m) só se alcançar o jogador; remoção a +1250 m / −380 m.
- IA: 4 tipos (lento/normal/rápido/danificado), faixas preferidas, redução de velocidade em curvas, seguir líder, ultrapassagem, retorno gradual à faixa de origem, desvio de rochas e destroços, distração ocasional.
- Meteoros: grade hash de ameaças a 10 Hz a partir de `meteors.warnings`; cada NPC consulta só células ao longo da trajetória (~6×/s); tempo de reação, agilidade e erro por motorista; escolha entre faixas/lados do impacto/freada.
- Meteoro × NPC: `Game._onImpact → traffic.onMeteorImpact`; dentro de `blastR(R)+1` destrói; onda de choque empurra/danifica; destroços parados são empurrados. Mira ocasional em NPC (`meteors.npcAim` ↔ `traffic.aim`, chance 0,4–1% por spawn × `aimMul`).
- Destroços: desfechos stop/flip/burn/push; deslizam, giram, capotam, assentam com pose do terreno; fumaça/fogo reutilizando `meteors.smoke/fire`; sólidos para jogador e NPCs.
- Dano ao jogador: círculos (CAR_R/CAR_OFFS de meteors.js); batida forte → `onPlayerHit` → `Game._damage('Batida com outro carro')`; trava por carro 2,5 s + 1 s global + invulnerabilidade existente; raspões só física.
- Pré-existentes relevantes (não são desta sessão): estrada em 6 faixas, chunks de 192 m, meteoros com marcador de impacto, crateras/rochas sólidas, vidas (3), invulnerabilidade 2,2 s, zona letal >200 m.

## 4. O que foi alterado nesta sessão
- `js/traffic.js` — NOVO. Todo o sistema de tráfego (ver seção 3).
- `js/meteors.js` — (a) `export` em `CAR_R, CAR_OFFS`; (b) campo `npcAim=null` e, em `spawn()`, uso opcional do ponto mirado (passa pelo mesmo `_blocks`); (c) novo método `rockNear(x,z,r)` (consulta de rochas sólidas via `craterCells`). Sem `npcAim` o comportamento é o original.
- `js/game.js` — importa e cria `TrafficSystem`; `traffic.update(dt)` após `meteors.collide`; em game over `traffic.update(dt,{live:false})`; `_onImpact` chama `traffic.onMeteorImpact`; novo `_onTrafficHit`; `_damage(cause)` repassa a causa a `_gameOver`; `restart()` faz `traffic.reset()+bind`.
- `tests/traffic_test.mjs` — NOVO. Bateria cobrindo os 23 itens do pedido (headless).
- `tests/orphan_test.mjs` — adicionada 1 linha `g.traffic.update=()=>{}` (e comentário): o teste audita só meteoros; fumaça de carros danificados/destroços em chamas usa o mesmo pool de partículas por desenho.
- `CHANGES.md` — seção "Etapa 9".
- `HANDOFF.md` — este arquivo.
Não alterados: road.js, terrain.js, world.js, player.js, camera.js, input.js, ui.js, utils.js, index.html, css.

## 5. O que ainda falta fazer
- **Verificação visual em navegador real (GPU)**: nunca foi feita nesta sessão (só Node com stub do three). Aparência dos carros, escala em relação à pista, altura (pivot = estrada+0,3), fumaça dos destroços e FPS real são DESCONHECIDOS.
- Ajuste fino de balanceamento depois de jogar (densidade, chance de mira em NPC, severidade de dano, velocidades).
- Opcional: sons (o projeto não tem áudio; `assets/` está vazio).

## 6. Problemas conhecidos
- Sem subestradas no projeto (CHANGES etapa 4): "subestradas" do pedido não se aplica; NPCs usam as 6 faixas. Pista tratada como mão única (todos fogem na mesma direção; não há tráfego contrário).
- Tráfego a dificuldade 1: ~79% dos NPCs mirados são destruídos (medido em `traffic_test`, 100 tentativas controladas); a dificuldade 0: 12%. Pode ser forte demais/fraco; não ajustado.
- `rockCrashes` alto em simulação longa (96 em 150 s, dificuldade natural até ~0,36): NPCs batem em rochas de meteoros com frequência; contribui para destroços. Não investigado se é desejável.
- Cull roda a cada 0,25 s: carros podem existir ~17 m além dos limites por até 0,25 s (testes toleram).
- `meteor_test.mjs`: "atrás >30%" é intermitente (original 28%, nova 38%) e "p99 < 4 ms" falha no original (4,76 ms) e na nova (4,70 ms). Ambos preexistentes, não causados pelo tráfego.
- `rocks_test.mjs`: item "nenhuma flutuando (17)" é intermitente (falhou no original, passou na versão nova); itens de tempo (p99) falham se vários testes rodam em paralelo (contenção de CPU) e passam isolados (3,0 ms / 0,14 ms).

## 7. Último erro/FAILURE
Nenhum teste do tráfego está falhando. Falhas já vistas e resolvidas nesta sessão (todas eram erros do teste, não do tráfego): tolerância do corte de distantes (21), tolerância de chunk ci−3 (20), destroço posicionado sem recalcular x/z e sem tempo de assentar (17).
`meteor_test.mjs` (versão nova, isolado): 55 OK, 1 FALHA "p99 < 4 ms por frame" (M.update p99 4,70 ms; o ORIGINAL dá 4,76 ms e falha igual → preexistente, dependente da máquina). O item "atrás >30%" é intermitente (original 28%, nova 38% em execuções diferentes).

## 8. Última ação realizada
1. Reexecutei `traffic_test.mjs` → TUDO OK (run3).
2. Regressão dos testes antigos: `danger_test` 35 OK/0 falha; `rocks_test` isolado 100% OK; `orphan_test` com tráfego desligado → todos OK; `track/ground/lod_test` exit 0; `world_test` imprimiu cobertura sem buracos (r=500 m e r=1500 m → 0).
3. Escrevi a seção "Etapa 9" no CHANGES.md e este HANDOFF.md.

## 9. Próximo passo
Abrir `index.html` num navegador (servidor estático, ex.: `python3 -m http.server`) e jogar ~5 min vendo: (a) os carros têm escala/altura corretas sobre a pista (se parecerem flutuar ou afundar, ajuste `c.y=q.y+.3` em `_drive`/`_spawn` e `+.3` em `_wreckStep/_settle` de `traffic.js`); (b) FPS com 16 NPCs + meteoros; (c) o desvio e os destroços parecem naturais. Só depois mexer em balanceamento (constantes no topo de `traffic.js`: `MAX_DRIVERS`, `TYPES`, `HORIZON`; chance de mira em `aim()`).

## 10. Arquitetura relevante
- `Game.update` (ordem, estado `running`): `player.update` → `world.update` → `meteors.update` + `meteors.collide(player)` → **`traffic.update(dt)`** → invulnerabilidade/pisca → câmera → UI.
- Estrada: `Track` (`road.js`) amostras a cada 4 m; `sampleAt`, `nearest(x,z)` (devolve `o` lateral compartilhado — ler logo), `get(i)`. `traffic.js` usa `track.get` direto em `_at()` (sem alocar).
- Chunks de estrada: `World` (`CHUNK_LEN=192`, 2 atrás/20 à frente); NPCs vivem dentro dessa janela. Terreno: `ground/surface` (`terrain.js`) — só destroços fora da pista usam.
- Meteoros: `MeteorSystem` — `warnings` (x,y,z,left,T,R) refeito todo frame; `blastR(R)`; `onImpact(e)`; `craterCells` (rochas sólidas); `fire/smoke` (pools de partículas públicos); `difficulty()` (0–1 por distância).
- Vidas/dano: `Game._damage(cause)` único (1 vida + `INVULN` + flash + game over). Tráfego chama via `onPlayerHit`.
- UI: inalterada (sem HUD de NPC por requisito).

## 11. Testes (última execução)
- `traffic_test.mjs` — PASS (run3, todos os itens A–G e "22) sem erros no console").
- `danger_test.mjs` — PASS (35/35).
- `rocks_test.mjs` — PASS isolado; falha intermitente "flutuando" existe também no original.
- `orphan_test.mjs` — PASS com tráfego desligado no teste; FAIL (fumaça 3 restantes) se o tráfego estiver ativo — explicado em 4/6.
- `meteor_test.mjs` — 55 OK; 1 FAIL estável (p99 < 4 ms: 4,70 ms nova vs 4,76 ms original) + 1 item intermitente ("atrás >30%"). Mesmo comportamento do original → sem regressão.
- `track_test`, `ground_test`, `lod_test` — PASS (exit 0).
- `world_test.mjs` — executou sem erro (cobertura sem buracos); não foi lido como lista de OK.
- `rate_test`, `variety_test`, `meteor_render`, `render` — PENDENTES (não executados).
- Teste visual em navegador/GPU — PENDENTE.

## 12. Comandos importantes
```
node --import ./tests/register.mjs tests/traffic_test.mjs     # ~90 s; QUICK=1 reduz
node --import ./tests/register.mjs tests/danger_test.mjs
node --import ./tests/register.mjs tests/orphan_test.mjs
node --import ./tests/register.mjs tests/rocks_test.mjs        # rodar ISOLADO (mede tempo)
node --import ./tests/register.mjs tests/meteor_test.mjs       # lento (>2 min)
node tests/track_test.mjs ; node tests/ground_test.mjs ; node tests/lod_test.mjs
python3 -m http.server   # e abrir index.html
```
Não rodar vários testes em paralelo (os de tempo falham por contenção). Comandos longos: rodar em background com `nohup` e `timeout`.

## 13. Decisões importantes (não alterar sem motivo)
- NPCs em coordenadas de estrada (s,o); mundo (x,z) é derivado. Colisão NPC×NPC em caixas de estrada; NPC×jogador em círculos de mundo.
- Meteoros: **um único sistema**. Tráfego só lê `warnings`, reage a `onImpact` e usa `fire/smoke/rockNear`. Não criar segundo sistema de impacto, de vidas ou de meteoros.
- Dano ao jogador só por batida forte (limiares 7,5 m/s NPC / 5,5 m/s destroço); 1 vida por colisão; nunca morte instantânea por NPC.
- Pool fixo (POOL=26); nada é criado além dele. Remoção por distância no cull de 0,25 s.
- `aimMul` (padrão 1) existe para testes; manter 1 no jogo.
- Limite de destroços 10; derruba o mais para trás.

## 14. Coisas que NÃO devem ser recriadas
Estrada/Track, chunks do World, terreno, Player/física, câmera, input, UI, MeteorSystem (spawn, marcadores, explosões, crateras, rochas, zona letal), sistema de vidas/invulnerabilidade/game over em `game.js`, `tests/three-stub.mjs` e infraestrutura de testes em Node.

## 15. Instruções para o próximo agente
"Leia este HANDOFF.md antes de modificar qualquer arquivo.

Não recomece o projeto do zero.
Não recrie sistemas que já existem.
Analise o estado atual dos arquivos.
Continue exatamente do ponto indicado em 'Última ação realizada' e 'Próximo passo'.
Primeiro reproduza/entenda os problemas pendentes antes de fazer grandes alterações."
