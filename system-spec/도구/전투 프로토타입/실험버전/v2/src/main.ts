import Phaser from 'phaser'
import './style.css'
import './mobile-card-detail.css'
import { characterExamples, relicExamples, seedContent, skillExamples } from './game/content'
import { BattleEngine, SHARD_PER_ATTACK, SHARD_PER_COMBO, SHARD_PER_TURN } from './game/engine'
import { parseCharacter, parseRelic, parseSkill } from './game/parser'
import { isPointInPattern } from './game/patterns'
import type { BoardSize, CharacterDefinition, RelicDefinition, RelicLoadouts, SavedContent, ShardGainEvent, SkillDefinition, TimeAdvanceEvent, TimeManipulation, TimePeriod, Unit } from './game/types'
import { BattleScene, type InputMode, type PlanViewMode } from './phaser/BattleScene'
import { CHARACTER_TEXTURES } from './phaser/characterAssets'

const MOBILE_DESIGN_WIDTH=1920
const MOBILE_DESIGN_HEIGHT=1080
type DisplayMode='pc'|'mobile'
let selectedDisplayMode:DisplayMode|undefined
function syncMobileVisualViewport(){
  const root=document.documentElement
  const viewport=window.visualViewport
  const width=viewport?.width??window.innerWidth,height=viewport?.height??window.innerHeight,top=viewport?.offsetTop??0
  root.style.setProperty('--mobile-viewport-width',`${Math.round(width)}px`)
  root.style.setProperty('--mobile-viewport-height',`${Math.round(height)}px`)
  root.style.setProperty('--mobile-game-width',`${Math.round(Math.min(width,height*16/9))}px`)
  root.style.setProperty('--mobile-game-height',`${Math.round(Math.min(height,width*9/16))}px`)
  root.style.setProperty('--mobile-viewport-center-y',`${Math.round(top+height/2)}px`)
}
function configureMobileViewport(){
  const mobileMode=selectedDisplayMode==='mobile'
  const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0
  document.documentElement.classList.toggle('touch-device',touchDevice)
  document.documentElement.classList.toggle('mobile-device',mobileMode)
  document.documentElement.classList.toggle('display-mobile',mobileMode)
  document.documentElement.classList.toggle('display-pc',selectedDisplayMode==='pc')
  const viewport=document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if(!viewport)return
  if(!mobileMode){viewport.content='width=device-width, initial-scale=1, viewport-fit=cover';window.setTimeout(syncMobileVisualViewport,0);return}
  const portrait=window.innerHeight>window.innerWidth
  if(portrait){viewport.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';window.setTimeout(syncMobileVisualViewport,0);return}
  const screenAspect=Math.max(window.innerWidth,window.innerHeight)/Math.max(1,Math.min(window.innerWidth,window.innerHeight))
  const logicalWidth=Math.ceil(Math.max(MOBILE_DESIGN_WIDTH,MOBILE_DESIGN_HEIGHT*screenAspect))
  viewport.content=`width=${logicalWidth}, maximum-scale=1, user-scalable=no, viewport-fit=cover`
  window.setTimeout(syncMobileVisualViewport,0)
}
configureMobileViewport()
syncMobileVisualViewport()
window.addEventListener('resize',syncMobileVisualViewport)
window.visualViewport?.addEventListener('resize',syncMobileVisualViewport)
window.visualViewport?.addEventListener('scroll',syncMobileVisualViewport)
window.addEventListener('orientationchange',()=>window.setTimeout(()=>{configureMobileViewport();syncMobileVisualViewport()},120))

const SAVE_KEY='waredo-battle-content-v2'
const SPEED_KEY='waredo-presentation-delay-v1'
const RELIC_LOADOUT_KEY='waredo-relic-loadouts-v2'
const LEGACY_EQUIPPED_RELIC_KEY='waredo-equipped-relics-v1'
const ENEMY_BALANCE_KEY='waredo-enemy-balance-v1'
const DAMAGE_BALANCE_KEY='waredo-damage-balance-v1'
const BOARD_SIZE_KEY='waredo-board-size-v1'
const HIGHLAND_BACKGROUND_URL='/assets/environment/highland-web.png'
const MAIN_BACKGROUND_URL='/assets/ui/main.png'
const MAIN_LOGO_URL='/assets/ui/logo.png'
const RESULT_PREVIEW_QUERY=new URLSearchParams(location.search).get('previewResult')
const ENEMY_BALANCE_VERSION='allies-total-140hp-45atk-9move'
const DAMAGE_BALANCE_VERSION='default-offense-half-20260824'
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
function loadContent():SavedContent{try{
  const raw=localStorage.getItem(SAVE_KEY);if(!raw)return structuredClone(seedContent)
  const parsed=JSON.parse(raw) as SavedContent;if(!Array.isArray(parsed.characters)||!Array.isArray(parsed.skills))throw new Error()
  const removedLegacyCharacters=new Set(['raon','mir','gor','sera'])
  const characters=parsed.characters.filter(character=>!removedLegacyCharacters.has(character.id)).map(character=>{const pattern=character.normalAttack.rangePatternId??`${character.normalAttack.targeting==='방향'?'직선':'마름모'}_${character.normalAttack.range}`,aiBehavior=character.aiBehavior??'공통형';let source=/^공격범위패턴:/m.test(character.source)?character.source:character.source.replace(/^(공격사거리:.*)$/m,`$1\n공격범위패턴: ${pattern}`);if(!/^AI유형:/m.test(source))source=source.replace(/^(타입:.*)$/m,`$1\nAI유형: ${aiBehavior}`);return{...character,aiBehavior,normalAttack:{...character.normalAttack,rangePatternId:pattern},source}})
  const skills=parsed.skills.map(skill=>{try{return parseSkill(skill.source)}catch{const legacy=skill as SkillDefinition&{targetTeam?:'적군'|'아군'|'모두'};return{...legacy,rangePatternId:legacy.rangePatternId??`${legacy.targeting==='방향'?'직선':'마름모'}_${legacy.range}`,affectedCellPatternId:legacy.affectedCellPatternId??(legacy.targeting==='방향'?`직선_${legacy.range}`:undefined),effects:legacy.effects.map(effect=>({...effect,scope:effect.scope??(legacy.targeting==='대상'?'선택대상':'영향셀'),targetTeam:effect.targetTeam??legacy.targetTeam??'적군'}))}}})
  const legacyRelics=new Set(['beating_heart_core','old_war_gear','windfeather_boots','temporal_lens'])
  const relics=Array.isArray(parsed.relics)?parsed.relics.filter(relic=>!legacyRelics.has(relic.id)).map(relic=>parseRelic(relic.source.replaceAll('모든 아군의','장착자의').replaceAll('모든 아군이','장착자가').replaceAll('모든 아군','장착자'))):structuredClone(seedContent.relics)
  for(const seed of seedContent.characters)if(!characters.some(item=>item.id===seed.id))characters.push(structuredClone(seed))
  for(const seed of seedContent.skills)if(!skills.some(item=>item.id===seed.id))skills.push(structuredClone(seed))
  for(const seed of seedContent.relics)if(!relics.some(item=>item.id===seed.id))relics.push(structuredClone(seed))
  if(localStorage.getItem(ENEMY_BALANCE_KEY)!==ENEMY_BALANCE_VERSION){const balancedEnemyIds=new Set(['holy_lancer','holy_shield','tower_guard']);for(let index=0;index<characters.length;index++){if(!balancedEnemyIds.has(characters[index].id))continue;const balanced=seedContent.characters.find(seed=>seed.id===characters[index].id);if(balanced)characters[index]=structuredClone(balanced)}localStorage.setItem(ENEMY_BALANCE_KEY,ENEMY_BALANCE_VERSION);localStorage.setItem(SAVE_KEY,JSON.stringify({characters,skills,relics}))}
  if(localStorage.getItem(DAMAGE_BALANCE_KEY)!==DAMAGE_BALANCE_VERSION){for(const seed of seedContent.characters){const index=characters.findIndex(item=>item.id===seed.id);if(index>=0)characters[index]=structuredClone(seed)}for(const seed of seedContent.skills){const index=skills.findIndex(item=>item.id===seed.id);if(index>=0)skills[index]=structuredClone(seed)}localStorage.setItem(DAMAGE_BALANCE_KEY,DAMAGE_BALANCE_VERSION);localStorage.setItem(SAVE_KEY,JSON.stringify({characters,skills,relics}))}
  return{characters,skills,relics}
}catch{return structuredClone(seedContent)}}

type TutorialTopic='skill'|'parameter'|'time'|'combat'
type FrontScreen='main'|'size'|'coin'|'result'|'none'
type MainInfo='characters'|'game'|undefined
const loadBoardSize=():BoardSize=>localStorage.getItem(BOARD_SIZE_KEY)==='6'?6:9
let content=loadContent(),mode:InputMode='이동',editorKind:'character'|'skill'|'relic'='character',selectedEditorId=content.characters[0]?.id??'',tutorialTopic:TutorialTopic|undefined,reorderMode=false,reorderSlot: number|undefined,showSkillDetail=false,previousPhase:string='배치',settingsOpen=false,pendingBoardSize:BoardSize=loadBoardSize(),resultPreviewOutcome:'victory'|'defeat'|undefined=RESULT_PREVIEW_QUERY?.includes('defeat')?'defeat':RESULT_PREVIEW_QUERY?'victory':undefined,frontScreen:FrontScreen=resultPreviewOutcome?'result':'main',mainInfo:MainInfo,coinRevealed=false,coinFirstTeam:'아군'|'적군'='아군',secretPauseClicks=0
let coinRevealTimer:number|undefined,coinFinishTimer:number|undefined
let selectedTimeManipulation:TimeManipulation|undefined,timeControlConfirming=false
const confirmedActions=new Set<string>()
let actionDraft:{unitId:string}|undefined
function loadRelicLoadouts():RelicLoadouts{localStorage.removeItem(RELIC_LOADOUT_KEY);localStorage.removeItem(LEGACY_EQUIPPED_RELIC_KEY);return{}}
let relicLoadouts=loadRelicLoadouts()
const engine=new BattleEngine(content,relicLoadouts,pendingBoardSize),scene=new BattleScene(engine,()=>render(),repeat=>{if(repeat)confirmSelectedAction();else render()})
engine.setPresentationDelay(Number(localStorage.getItem(SPEED_KEY)??360))

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<main class="game-shell" data-time="현재">
  <img class="battle-background" src="${HIGHLAND_BACKGROUND_URL}" alt="" aria-hidden="true">
  <header class="game-header">
    <div class="title"><h1>쿼리도 슈팅</h1><p id="board-size-subtitle">9×9 시간 전술 전투</p></div>
    <div class="header-actions"><div class="phase-badge" id="phase-badge"></div><div class="system-buttons"><button id="open-settings" aria-label="설정">⚙</button><button id="secret-pause" aria-label="일시정지">Ⅱ</button></div></div>
  </header>
  <section class="timeline-wrap" id="timeline-wrap"><button id="toggle-reorder" class="reorder-toggle">행동 순서 변경</button><div class="timeline" id="timeline"></div></section>
  <section class="battle-layout">
    <aside class="left-rail" id="left-rail"></aside>
    <div class="board-column">
      <div class="board-tools"><div class="visual-legend" aria-label="전투판 표시 범례"><span class="legend ally">아군 이동</span><span class="legend enemy-move">적 이동</span><span class="legend enemy">적 스킬</span><span class="legend broken">범위 밖</span><span class="legend push">밀치기</span><span class="legend pull">당기기</span></div><div class="view-switch"><button data-plan-view="summary">턴 결과</button><button data-plan-view="all">모든 계획</button></div></div>
      <div class="board-stage"><div id="game" aria-label="쿼리도 슈팅 전투판"></div></div>
      <div class="battle-message" id="battle-message"></div>
      <section class="mobile-time-dock" id="mobile-time-dock"></section>
      <section class="mobile-unit-dock" id="mobile-unit-dock"></section>
      <section class="mobile-action-dock" id="mobile-action-dock"></section>
      <section class="mobile-execute-dock" id="mobile-execute-dock"></section>
      <section class="deployment-dock" id="deployment-dock"></section>
      <div class="reorder-dim" id="reorder-dim"></div>
      <div class="time-announcement" id="time-announcement" aria-live="polite"></div>
    </div>
    <aside class="right-rail" id="right-rail"></aside>
  </section>
  <div class="editor-modal hidden" id="editor-modal">
    <div class="editor-card">
      <header><div><small>AUTHORING WORKBENCH</small><h2>콘텐츠 공방</h2></div><button id="close-editor">닫기 ×</button></header>
      <div class="editor-body"><nav><div class="editor-tabs"><button data-editor-tab="character" class="active">캐릭터</button><button data-editor-tab="skill">스킬</button><button data-editor-tab="relic">유물</button></div><div id="editor-list"></div></nav>
      <section><div class="syntax-title"><b id="syntax-name">캐릭터 문법</b><button class="text-button" id="load-example">예시 불러오기</button></div><div class="choice-editor" id="choice-editor"></div><details class="raw-syntax"><summary>문법 원문 직접 편집</summary><textarea id="editor" spellcheck="false"></textarea></details><div class="editor-actions"><button id="new-content">+ 새로 작성</button><button class="accent" id="save-content">저장</button><button class="danger" id="delete-content">삭제</button></div><div class="editor-message" id="editor-message">선택 항목은 위에서 고르면 문법 원문에 자동 반영됩니다.</div><div class="syntax-help" id="syntax-help"></div></section></div>
      <footer><span>저장 내용은 이 브라우저에 남습니다.</span><div class="editor-preview-actions"><button data-preview-result="victory">승리 화면</button><button data-preview-result="defeat">패배 화면</button><button class="accent" id="apply-roster">현재 콘텐츠로 전투 다시 만들기</button></div></footer>
    </div>
  </div>
  <div class="settings-modal hidden" id="settings-modal">
    <section class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><div><small>PAUSE MENU</small><h2 id="settings-title">환경설정</h2></div><button id="close-settings" aria-label="설정 닫기">×</button></header>
      <div class="settings-body pause-menu"><p>화면 표시를 전환하거나 현재 전투를 다시 시작할 수 있습니다.</p><button id="settings-fullscreen"><strong>전체화면 시작</strong><span>브라우저 UI를 숨기고 게임 화면에 맞춰 표시</span></button><button id="restart-battle"><strong>다시 시작</strong><span>현재 말판 크기로 선공 결정부터 다시 진행</span></button><button id="settings-main"><strong>메인 화면으로</strong><span>현재 전투를 종료하고 메인 화면으로 이동</span></button></div>
    </section>
  </div>
  <div class="time-control-modal hidden" id="time-control-modal">
    <section class="time-control-card" role="dialog" aria-modal="true" aria-labelledby="time-control-title">
      <header><div><small>TIME MANIPULATION</small><h2 id="time-control-title">시간 조작</h2></div><button id="close-time-control" aria-label="시간 조작 닫기">×</button></header>
      <div id="time-control-content"></div>
    </section>
  </div>
  <div class="front-flow" id="front-flow"></div>
  <div class="device-mode-modal" id="device-mode-modal">
    <section class="device-mode-card" role="dialog" aria-modal="true" aria-labelledby="device-mode-title">
      <small>DISPLAY MODE</small><h2 id="device-mode-title">플레이 환경을 선택하세요</h2><p>선택한 화면에 맞춰 글자, 캐릭터 이미지와 전투 HUD 크기를 조정합니다.</p>
      <div><button data-display-mode="mobile"><b>모바일</b><span>가로 화면 · 터치 조작 · 확대 HUD</span></button><button data-display-mode="pc"><b>PC</b><span>기존 화면 · 마우스 조작 · 기본 HUD</span></button></div>
    </section>
  </div>
</main><div class="rotate-device" role="status"><div><span>↻</span><b>기기를 가로로 돌려주세요</b><small>전투 UI는 가로 화면에서 동일한 비율로 표시됩니다.</small></div></div>`

const editorModal=document.querySelector<HTMLDivElement>('#editor-modal')!
const settingsModal=document.querySelector<HTMLDivElement>('#settings-modal')!
const timeControlModal=document.querySelector<HTMLDivElement>('#time-control-modal')!
for(const eventName of ['pointerdown','pointerup','pointermove','wheel']){
  editorModal.addEventListener(eventName,event=>event.stopPropagation())
  settingsModal.addEventListener(eventName,event=>event.stopPropagation())
  timeControlModal.querySelector('.time-control-card')!.addEventListener(eventName,event=>event.stopPropagation())
}

new Phaser.Game({type:Phaser.AUTO,width:1920,height:893,parent:'game',transparent:true,scene,render:{antialias:true,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}})

function render(){
  const state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  if((state.phase==='승리'||state.phase==='패배')&&frontScreen==='none'){frontScreen='result';scene.input.enabled=false}
  if(state.phase==='계획'&&!unit&&scene.getThreatFocus()===undefined)showSkillDetail=false
  if(state.phase==='계획'&&previousPhase!=='계획'){confirmedActions.clear();actionDraft=undefined;reorderMode=false;reorderSlot=undefined;mode='이동';scene.setInputMode(mode)}
  if(state.phase!=='계획'){actionDraft=undefined;reorderMode=false;reorderSlot=undefined}
  previousPhase=state.phase
  const shell=document.querySelector<HTMLElement>('.game-shell')!,pathEnd=slot?.plan.path.at(-1),displayTime=state.currentTime;shell.dataset.time=displayTime;shell.dataset.phase=state.phase;shell.dataset.boardSize=String(state.boardSize);shell.dataset.pathLength=String(slot?.plan.path.length??0);shell.dataset.pathEnd=pathEnd?`${pathEnd.x},${pathEnd.y}`:'';shell.classList.toggle('reorder-mode',reorderMode)
  document.querySelector<HTMLElement>('#board-size-subtitle')!.textContent=`${state.boardSize}×${state.boardSize} 시간 전술 전투`;document.querySelector<HTMLElement>('#game')!.setAttribute('aria-label',`쿼리도 슈팅 ${state.boardSize}×${state.boardSize} 전투판`)
  document.querySelector<HTMLDivElement>('#phase-badge')!.innerHTML=`<b>${state.phase}</b><span>${state.phase==='배치'?`${state.boardSize}×${state.boardSize} · 출전 위치 결정`:`${state.round}턴 · ${state.firstTeam} 선공`}</span>`
  renderTimeline();renderLeftRail();renderRightRail();renderBoardTools();renderMobileHud();renderDeploymentDock();renderSettings();renderFrontFlow();renderTimeControl()
  const error=state.phase==='계획'?engine.validatePlans():''
  const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId)
  const threatFocus=scene.getThreatFocus(),focusedThreat=engine.getEnemyThreatPredictions().find(threat=>threat.slotIndex===threatFocus),view=scene.getPlanView()
  document.querySelector<HTMLDivElement>('#battle-message')!.innerHTML=state.phase==='배치'?'<b>초기 배치</b> 캐릭터를 선택하고 각 진영의 빛나는 영역에 배치하세요.':state.phase==='계획'?focusedThreat?`<b>#${focusedThreat.slotNumber} 적 행동</b> ${esc(focusedThreat.actorName)} · ${esc(focusedThreat.actionName)} · ${esc(focusedThreat.state)}`:view==='summary'?'<b>턴 종료 예상</b> 적 이동 발자국과 스킬 공격을 보며 아군의 예상 HP·상태를 확인하세요.':view==='all'?'<b>모든 계획</b> 전체 연결을 비교하는 검증 보기입니다.':`<b>${slot?.number??'-'}번 계획</b> ${unit?esc(unit.name):''} · ${error?`<span class="warn">${esc(error)}</span>`:'모든 계획이 실행 가능합니다.'}`:state.phase==='실행'?`<b>${liveSlot?.number??'-'}번 실행</b> ${liveUnit?esc(liveUnit.name):'행동 준비'} · ${esc(liveSlot?.plan.action.kind??'대기')}`:`<b>${state.phase}</b> 전투가 종료되었습니다.`
  if(state.phase==='계획'&&unit&&skill)void 0
}

function renderBoardTools(){
  const view=scene.getPlanView(),threatSlot=scene.getThreatFocus()
  document.querySelector<HTMLElement>('.view-switch')!.classList.toggle('hidden',engine.state.phase==='배치'||engine.state.phase==='실행')
  document.querySelectorAll<HTMLButtonElement>('[data-plan-view]').forEach(button=>button.classList.toggle('active',threatSlot===undefined&&button.dataset.planView===view))
}

function renderSettings(){
  settingsModal.classList.toggle('hidden',!settingsOpen)
  const fullscreenButton=document.querySelector<HTMLButtonElement>('#settings-fullscreen')
  if(fullscreenButton){
    fullscreenButton.disabled=!document.fullscreenEnabled&&!document.fullscreenElement
    fullscreenButton.innerHTML=document.fullscreenElement?'<strong>전체화면 종료</strong><span>브라우저 기본 화면으로 돌아가기</span>':'<strong>전체화면 시작</strong><span>브라우저 UI를 숨기고 게임 화면에 맞춰 표시</span>'
  }
}

const MAIN_CHARACTER_GUIDE:Record<string,{role:string,play:string,caution:string}>={
  isaac:{role:'전열 제어형',play:'높은 체력으로 앞선을 잡고, 이동 후 어퍼컷으로 직선상의 적을 띄워 다음 행동을 방해합니다.',caution:'기본 공격과 스킬이 모두 방향형이라 이동 도착지에서 바라볼 방향을 정확히 정해야 합니다.'},
  angelica:{role:'후열 단일 화력형',play:'긴 사거리의 기본 공격과 치명타가 가능한 저격으로 위험한 적 하나를 멀리서 제거합니다.',caution:'체력이 가장 낮습니다. 적 이동 발자국과 공격 예고선을 읽고 안전한 최종 위치를 먼저 확보하세요.'},
  mercan:{role:'근거리 범위·위치 제어형',play:'자기 주변 3×3 범위를 압박하고, 빅샷건으로 직선 3칸의 대상을 2칸 밀어 전열을 재배치합니다.',caution:'빅샷건의 밀치기는 아군과 적군 모두에게 적용됩니다. 아군은 피해를 받지 않지만 예정 위치가 바뀔 수 있습니다.'}
}
const mainEffectText=(skill:SkillDefinition)=>skill.effects.map(effect=>{const value=effect.type==='피해'?` ${effect.value}`:['밀치기','당기기'].includes(effect.type)?` ${effect.value}칸`:'';const target=effect.targetTeam==='모두'?'아군·적군':effect.targetTeam;return `${effect.type}${value} (${target})`}).join(' · ')
function mainCharacterGuide(){
  return content.characters.filter(character=>character.team==='아군').map(character=>{const skill=content.skills.find(item=>item.id===character.skillId),guide=MAIN_CHARACTER_GUIDE[character.id]??{role:'전술 캐릭터',play:'이동과 공격을 조합해 적의 예정 행동에 대응합니다.',caution:'적 예고와 시전 범위를 함께 확인하세요.'};return `<article class="main-character-card">${unitPortraitMarkup({...character,hp:character.maxHp,position:{x:0,y:0},statuses:[],cooldownRemaining:0})}<div class="character-copy"><header><span><b>${esc(character.name)}</b><small>${esc(character.type)} · ${esc(guide.role)}</small></span><em>HP ${character.maxHp} · 공격 ${character.attackPower} · 이동 ${character.moveRange} · 치명타 피해 ${character.criticalRate}%</em></header><section><strong>기본 공격 · ${esc(character.normalAttack.name)}</strong><p>${targetingLabel(character.normalAttack.targeting)} · 사거리 ${character.normalAttack.range} · 범위 ${esc(character.normalAttack.rangePatternId)} · 피해 ${character.attackPower}</p></section>${skill?`<section class="skill"><strong>스킬 · ${esc(skill.name)}</strong><p>${esc(skill.description)}</p><p>${targetingLabel(skill.targeting)} · 사거리 ${skill.range} · 범위 ${esc(skill.rangePatternId)} · 쿨타임 ${skill.cooldown}턴 · 치명타 ${skill.canCritical?'가능':'불가'}</p><p>${esc(mainEffectText(skill))}</p></section>`:''}<p class="character-play"><b>운용</b> ${esc(guide.play)}</p><p class="character-caution"><b>주의</b> ${esc(guide.caution)}</p></div></article>`}).join('')
}

function mainGameGuide(){return `<section class="guide-intro"><b>전투 목표</b><p>적의 공개된 계획을 먼저 읽고 아군의 이동·행동 순서·공격 방식을 조합해 모든 적을 전투 불능으로 만드세요. 아군 전원이 쓰러지면 패배합니다.</p></section><div class="guide-sections system-guide"><article><i>01</i><div><b>시작·배치 시스템</b><p><strong>1.</strong> 6×6은 빠른 교전, 9×9는 긴 이동과 우회에 적합합니다. 전장을 고르면 동전으로 선공을 결정하고 적이 먼저 배치됩니다.</p><p><strong>2.</strong> 아군 카드에서 캐릭터를 고른 뒤 파란 배치 구역의 빈 칸을 누르세요. 아군 3명을 모두 놓고 <em>배치 확정</em>을 누르면 전투 UI와 적의 첫 계획이 공개됩니다.</p></div></article><article><i>02</i><div><b>전투 계획·행동 순서 시스템</b><p><strong>1.</strong> 상단 카드는 이번 턴의 실제 행동 순서입니다. 평소 카드를 누르면 해당 캐릭터를 선택합니다.</p><p><strong>2.</strong> 순서를 바꾸려면 카드 왼쪽의 <em>행동 순서 변경</em>을 먼저 누른 뒤 교환할 아군 카드 두 장을 차례로 누르세요. 적의 순서는 바꿀 수 없습니다.</p><p><strong>3.</strong> 설정하지 않은 아군은 대기합니다. 모든 캐릭터에게 행동을 넣지 않아도 계획을 실행할 수 있습니다.</p></div></article><article><i>03</i><div><b>이동·적 예고 시스템</b><p><strong>1.</strong> 발자국은 이동 경로, 반투명 SD는 도착 예정 위치입니다. 파란색은 아군, 붉은색은 적이며 둘 이상이 같은 칸을 목표로 하면 잔상이 겹쳐 보입니다.</p><p><strong>2.</strong> 캐릭터를 선택하고 상하좌우 칸을 이어 눌러 경로를 그리세요. 중간 경로를 누르면 그 지점부터 다시 그리고, 같은 캐릭터를 다시 누르면 경로가 초기화됩니다.</p><p><strong>3.</strong> 적을 누르면 그 적의 이동·공격만 강조됩니다. 빈 말판을 누르면 선택을 풀고 전체 적 계획으로 돌아갑니다.</p></div></article><article><i>04</i><div><b>타겟팅·방향 설정 시스템</b><p><strong>타겟형</strong>은 캐릭터나 도착지 홀로그램을 지정합니다. 계획할 때는 거리 밖 대상도 고를 수 있지만 실제 시전 순간 사거리 안에 있어야 성공합니다.</p><p><strong>방향형</strong>은 이동 도착지를 기준으로 상하좌우 방향을 정합니다. 표시된 셀이 실제 공격 범위이며 밀치기·당기기가 있으면 각 셀에 강제이동 방향도 표시됩니다.</p><p><strong>셀 지정형</strong>은 칸을 예약하고 실행 순간 사거리를 판정합니다. <strong>설치형</strong>은 지정한 칸에 설치물을 만듭니다. <em>확정</em>은 행동을 저장하고 <em>취소</em>는 설정 중인 공격·스킬을 제거합니다.</p><p>파란 실선은 시전 가능, 주황 점선은 실행 시 범위 밖으로 실패한다는 뜻입니다. 이동 경로를 바꾸면 연결선도 예정 위치를 따라 바뀝니다.</p></div></article><article><i>05</i><div><b>연계·콤보·상태 시스템</b><p><strong>1.</strong> 먼저 적에게 <em>띄워짐</em> 또는 <em>기절</em>을 적용하고 상태가 남아 있을 때 다음 아군이 피해를 주면 콤보가 됩니다.</p><p><strong>2.</strong> 아이작이 먼저 어퍼컷으로 적을 띄우고 안젤리카가 뒤이어 저격하면 저격의 치명타 조건과 상태 콤보를 함께 노릴 수 있습니다. 행동 순서와 두 캐릭터의 도착 위치를 같이 맞추세요.</p><p><strong>3.</strong> 기절한 캐릭터는 자신의 행동을 건너뜁니다. 밀치기·당기기는 아군과 적 모두 움직이지만 같은 팀은 피해를 받지 않습니다. 강제이동을 당해도 예약 경로는 새 좌표에서 남은 방향대로 이어집니다.</p></div></article><article><i>06</i><div><b>시간 시스템·시간 파편·시계 과열</b><p><strong>시간 순환</strong>은 현재 → 미래 → 과거 순서이며 각 시간대가 2턴씩 이어집니다. 현재는 치명타 피해율 +20%p와 각성자 피해 강화, 미래는 이동력 +1과 기술자 피해 강화, 과거는 일반공격 피해 +5와 계승자 피해 강화가 적용됩니다. 모두 아군과 적이 함께 받습니다.</p><p><strong>연속 강화</strong>는 같은 시간대가 이어질 때 해당 타입의 일반공격과 스킬 피해를 매턴 20%씩 복리로 높입니다. 2중첩은 +40%가 아니라 +44%이며 시간대가 바뀌면 새 시간대의 1중첩으로 초기화됩니다.</p><p><strong>파편 획득</strong>은 적에게 유효 피해를 주면 +${SHARD_PER_ATTACK}, 띄워짐·기절 상태의 적에게 피해를 주는 콤보면 추가 +${SHARD_PER_COMBO}, 턴이 끝나면 +${SHARD_PER_TURN}입니다. 시간 파편은 최대 80까지 저장됩니다.</p><p><strong>시간 조작</strong>은 시계를 누른 뒤 가속·정지·역행 중 하나를 선택합니다. 가상 시침으로 결과를 확인하고 확정을 누르면 즉시 실제 시간이 변경됩니다.</p><p><strong>시계 과열</strong>은 시간 조작을 확정할 때마다 다음 조작 비용을 5씩 높입니다. 첫 조작 비용은 50입니다.</p></div></article><article><i>07</i><div><b>계획 실행·실패 판정 시스템</b><p><strong>1.</strong> 실행 전 예상 HP, 상태, 강제이동 결과와 연결선 색을 확인하세요. 계획 초기화는 이번 턴의 아군 계획 전체를 지웁니다.</p><p><strong>2.</strong> <em>계획 실행</em>을 누르면 상단 순서대로 이동 후 공격·스킬이 재생됩니다. 실행 중에는 현재 행동자와 관련된 범위·공격선·피격 정보만 선명하게 남습니다.</p><p><strong>3.</strong> 대상이나 지정 셀이 시전 순간 사거리 밖이면 행동은 실패합니다. 결과는 실패 연출과 전투 로그에 남고 턴 종료 후 새 적 계획이 공개됩니다.</p></div></article></div><footer class="guide-legend"><span><b>파란 실선</b> 시전 가능</span><span><b>주황 점선</b> 범위 밖·실패</span><span><b>파란 SD</b> 아군 도착 예정</span><span><b>붉은 SD</b> 적 도착 예정</span><span><b>+${SHARD_PER_ATTACK}</b> 유효 공격</span><span><b>+${SHARD_PER_COMBO}</b> 상태 콤보 추가</span><span><b>+${SHARD_PER_TURN}</b> 턴 종료</span></footer>`}

function focusedMainGameGuide(){return mainGameGuide().replace(/<section class="guide-intro">[\s\S]*?<\/section>/,`<section class="guide-intro"><div class="guide-intro-title"><small>MISSION GUIDE</small><b>이 전투에서 해보세요</b><p>적의 예고를 읽고 아군의 순서·위치·시간대를 조합해 유리한 한 턴을 만들어 보세요.</p></div><div class="guide-challenges"><article><i>01</i><div><b>어퍼컷에서 저격으로 연결하기</b><p>아이작을 적과 일직선이 되는 위치로 이동시켜 먼저 어퍼컷을 사용하세요. 안젤리카가 같은 적을 이어서 저격하도록 순서를 맞추면 띄워짐, 치명타, 콤보를 한 흐름으로 연결할 수 있습니다.</p></div></article><article><i>02</i><div><b>콤보로 시간 파편 채우기</b><p>띄워짐 또는 기절 상태의 적에게 피해를 주면 유효 공격 +${SHARD_PER_ATTACK}에 콤보 +${SHARD_PER_COMBO}이 추가됩니다. 상태를 먼저 만들고 후속 공격을 이어 한 번에 최대 +${SHARD_PER_ATTACK+SHARD_PER_COMBO}을 모아보세요.</p></div></article><article><i>03</i><div><b>적의 예정 위치를 역이용하기</b><p>붉은 홀로그램과 발자국으로 적의 도착 위치를 먼저 확인하세요. 현재 위치가 아니라 적이 이동을 마친 위치에 공격 범위가 닿도록 아군의 경로와 시전 방향을 정하는 것이 핵심입니다.</p></div></article><article><i>04</i><div><b>시간 조작 사용하기</b><p>파편을 모은 뒤 시계를 열어 가속·정지·역행을 선택하세요. 가상 시침으로 도착 시간을 확인하고 확정해 유리한 시간대를 현재 턴에 적용할 수 있습니다.</p></div></article></div></section><div class="guide-detail-heading"><small>SYSTEM MANUAL</small><b>시스템별 세부 설명</b><p>처음 플레이한다면 01부터 순서대로 읽고 필요한 규칙은 제목별로 다시 확인하세요.</p></div>`).replaceAll('시간 포인트','시간 파편').replaceAll(' TP',' 시간 파편')}

function renderFrontFlow(){
  const flow=document.querySelector<HTMLElement>('#front-flow')!
  flow.className=`front-flow ${frontScreen==='none'?'hidden':frontScreen}`
  if(frontScreen==='none'){flow.innerHTML='';return}
  if(frontScreen==='main'){
    const info=mainInfo==='characters'?`<section class="main-info-panel characters"><header><small>ALLY ROSTER</small><b>캐릭터 상세</b><button id="close-main-info">×</button></header><div class="main-character-list">${mainCharacterGuide()}</div></section>`:mainInfo==='game'?`<section class="main-info-panel game-info"><header><small>HOW TO PLAY</small><b>게임 설명</b><button id="close-main-info">×</button></header>${focusedMainGameGuide()}</section>`:''
    flow.innerHTML=`<img class="front-background" src="${MAIN_BACKGROUND_URL}" alt=""><section class="main-copy"><small>TACTICAL TIME BATTLE</small><img class="main-logo" src="${MAIN_LOGO_URL}" alt="WAREDO"><p>적의 행동을 읽고 이동 경로와 공격 순서를 설계하는 동시 계획형 전술 전투입니다.</p></section><nav class="main-menu"><button id="front-start" class="front-start"><span>GAME START</span><b>게임 시작</b></button><button data-main-info="characters">캐릭터</button><button data-main-info="game">게임 설명</button><button id="front-fullscreen" class="front-fullscreen"><b>${document.fullscreenElement?'전체화면 종료':'전체화면'}</b><small>${document.fullscreenEnabled?'주소창을 숨기고 화면에 맞춰 실행':'현재 브라우저에서는 지원되지 않음'}</small></button></nav>${info}`;return
  }
  if(frontScreen==='result'){
    const victory=engine.state.phase==='승리'||resultPreviewOutcome==='victory'
    flow.innerHTML=`<img class="front-background" src="${MAIN_BACKGROUND_URL}" alt=""><section class="front-result-card ${victory?'victory':'defeat'}"><small>BATTLE COMPLETE</small><h2>게임 종료</h2><strong>${victory?'승리':'패배'}</strong><p>${victory?'모든 적을 전투 불능으로 만들었습니다.':'모든 아군이 전투 불능이 되었습니다.'}</p><div><button id="result-restart" class="primary"><b>다시 시작</b><span>${engine.boardSize}×${engine.boardSize} 전장으로 다시 도전</span></button><button id="result-main"><b>메인 메뉴</b><span>게임 시작 화면으로 돌아가기</span></button></div></section>`;return
  }
  if(frontScreen==='size'){
    flow.innerHTML=`<section class="front-dialog size-select"><small>BATTLEFIELD SELECT</small><h2>전투 말판을 선택하세요</h2><p>선택한 크기로 전투를 초기화한 뒤 선공을 결정합니다.</p><div><button data-front-board-size="6"><b>6×6</b><span>짧은 거리 · 빠른 교전</span><em>압축 전장</em></button><button data-front-board-size="9"><b>9×9</b><span>넓은 동선 · 긴 계획</span><em>기본 전장</em></button></div><button id="front-back" class="front-back">← 메인 화면</button></section>`;return
  }
  flow.innerHTML=`<section class="front-dialog coin-toss ${coinRevealed?'revealed':''} ${coinFirstTeam==='아군'?'ally':'enemy'}"><small>FIRST MOVE</small><h2>${coinRevealed?'선공 결정':'동전을 던집니다'}</h2><div class="coin"><i>Q</i><i>W</i></div><p>${coinRevealed?`<b class="${coinFirstTeam==='아군'?'ally':'enemy'}">${coinFirstTeam} 선공</b><span>배치 화면으로 이동합니다.</span>`:'앞면과 뒷면이 전투의 첫 행동을 결정합니다.'}</p></section>`
}

async function toggleFullscreen(){
  try{
    if(document.fullscreenElement)await document.exitFullscreen()
    else{
      await document.documentElement.requestFullscreen({navigationUI:'hide'})
    }
  }catch(error){
    window.alert(`이 브라우저에서는 전체화면을 시작할 수 없습니다.\n${error instanceof Error?error.message:'브라우저 설정을 확인해 주세요.'}`)
  }finally{
    window.setTimeout(()=>{syncMobileVisualViewport();if(frontScreen==='main')renderFrontFlow()},80)
  }
}

document.addEventListener('fullscreenchange',()=>{
  window.setTimeout(syncMobileVisualViewport,40)
  if(frontScreen==='main')renderFrontFlow()
  renderSettings()
})

function renderDeploymentDock(){
  const dock=document.querySelector<HTMLElement>('#deployment-dock')!,state=engine.state
  if(state.phase!=='배치'||frontScreen!=='none'){dock.classList.add('hidden');dock.innerHTML='';return}
  const allies=state.units.filter(unit=>unit.team==='아군'),selected=allies.find(unit=>unit.id===state.selectedDeployUnitId)??allies[0],placedCount=allies.filter(unit=>state.deployedAllyIds.includes(unit.id)).length,canConfirm=engine.canConfirmDeployment()
  dock.classList.remove('hidden');dock.innerHTML=`<div class="deployment-heading"><small>ALLY DEPLOYMENT · ${state.boardSize}×${state.boardSize}</small><b>파란 구역에 아군을 배치하세요</b><span>아군 카드를 고르고 파란 셀을 누르세요.</span></div><div class="deployment-roster">${allies.map(unit=>{const placed=state.deployedAllyIds.includes(unit.id);return `<button data-deploy-unit="${esc(unit.id)}" class="${unit.id===selected?.id?'active ':''}${placed?'placed':'unplaced'}">${unitPortraitMarkup(unit)}<span><b>${esc(unit.name)}</b><small>${placed?'배치 완료':'배치 대기'} · ${unit.type} · HP ${unit.maxHp}</small></span></button>`}).join('')}</div><div class="deployment-confirm"><span><b>${state.firstTeam} 선공 · ${placedCount}/${allies.length} 배치</b><small>${canConfirm?'전원이 배치되었습니다.':'아군 전원을 배치하세요.'}</small></span><button id="start-battle" ${canConfirm?'':'disabled'}>배치 확정</button></div>`
}

function renderTimeline(){
  const wrap=document.querySelector<HTMLDivElement>('#timeline-wrap')!,timeline=document.querySelector<HTMLDivElement>('#timeline')!
  wrap.classList.toggle('hidden',engine.state.phase==='배치')
  const reorderButton=wrap.querySelector<HTMLButtonElement>('#toggle-reorder');if(reorderButton){reorderButton.classList.toggle('active',reorderMode);reorderButton.textContent=reorderMode?'순서 변경 종료':'행동 순서 변경';reorderButton.disabled=engine.state.phase!=='계획'}
  timeline.innerHTML=engine.state.slots.map((slot,index)=>{const unit=engine.state.units.find(u=>u.id===slot.unitId),planned=slot.plan.action.kind==='없음'?'대기':slot.plan.action.kind,resolved=engine.state.phase==='실행'&&slot.result&&slot.result!=='대기'?slot.result:planned,asset=unit?CHARACTER_TEXTURES[unit.id]:undefined,statuses=unit?.statuses??[],statusIcon=statuses[0]?.type==='기절'?'✦':statuses[0]?.type==='띄워짐'?'↑':'',selected=reorderMode&&reorderSlot===index,swappable=reorderMode&&slot.team==='아군'&&!selected,locked=reorderMode&&slot.team==='적군',dead=Boolean(unit&&unit.hp<=0),executing=engine.state.executingSlot===index;return `<button data-slot="${index}" class="slot ${slot.team==='아군'?'ally':'enemy'} ${selected?'order-selected':''} ${swappable?'swappable':''} ${locked?'order-locked':''} ${dead?'dead':''} ${executing?'executing':''}" aria-label="${esc(unit?.name??'')} ${slot.number}번째 행동"><i>${slot.number}</i><span class="slot-sd">${asset?`<img src="${asset.url}" alt="">`:esc(unit?.name.slice(-1)??'?')}</span><strong>${esc(unit?.name??'?')}</strong><small>${esc(resolved)}</small>${statuses.length?`<em>${statusIcon}${statuses.length>1?` +${statuses.length-1}`:''}</em>`:''}</button>`}).join('')
}

function inspectedUnit(){
  const threatSlot=scene.getThreatFocus(),threatUnit=threatSlot===undefined?undefined:engine.state.units.find(unit=>unit.id===engine.state.slots[threatSlot]?.unitId)
  return threatUnit??engine.selectedUnit
}

function unitPortraitMarkup(unit:Unit,className=''){
  const asset=CHARACTER_TEXTURES[unit.id]
  return asset?`<img class="${className}" src="${asset.url}" alt="${esc(unit.name)}">`:`<span class="portrait ${className}" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span>`
}

const TIME_EFFECTS:Record<TimePeriod,{type:string;global:string;notice:string}>={
  현재:{type:'각성자 일반공격·스킬 피해가 턴마다 20%씩 복리 증가',global:'모든 캐릭터 치명타 피해율 +20%p',notice:'각성자 피해 복리 누적 · 모두 치명타 피해율 +20%p'},
  미래:{type:'기술자 일반공격·스킬 피해가 턴마다 20%씩 복리 증가',global:'모든 캐릭터 이동력 +1',notice:'기술자 피해 복리 누적 · 모두 이동력 +1'},
  과거:{type:'계승자 일반공격·스킬 피해가 턴마다 20%씩 복리 증가',global:'모든 캐릭터 일반공격 피해 +5',notice:'계승자 피해 복리 누적 · 모두 일반공격 피해 +5'}
}
const watchDialMarkup=(activeIndex:number)=>Array.from({length:12},(_,index)=>{const period:TimePeriod=index%6<2?'현재':index%6<4?'미래':'과거';return `<span class="watch-hour dial-${period} ${index===activeIndex?'active':''}" style="--tick-angle:${index*30}deg" aria-label="${index+1}번째 눈금 · ${period}"></span>`}).join('')

function renderTimeControl(){
  const state=engine.state,host=document.querySelector<HTMLElement>('#time-control-content')!,preview=selectedTimeManipulation?engine.getTimeManipulationPreview(selectedTimeManipulation):undefined,canUse=engine.canManipulateTime(),previewPeriod=preview?.period??state.currentTime,actualAngle=state.timeDialIndex*30,previewAngle=actualAngle+(selectedTimeManipulation==='가속'?30:selectedTimeManipulation==='역행'?-30:0)
  host.innerHTML=`<div class="time-control-stage"><div class="grand-watch ${timeControlConfirming?'confirming':''}" style="--actual-angle:${actualAngle}deg;--preview-angle:${previewAngle}deg"><span class="grand-watch-crown"></span>${watchDialMarkup(state.timeDialIndex)}<i class="grand-hand actual"></i>${selectedTimeManipulation?'<i class="grand-hand virtual"></i>':''}<span class="magic-aura" aria-hidden="true"></span><b>${previewPeriod}</b></div><div class="time-control-status"><strong>시간 파편 ${state.shards}/${state.maxShards}</strong><span>조작 비용 ${state.timeManipulationCost}</span></div></div><div class="time-control-actions"><button data-time-manipulation="가속" class="${selectedTimeManipulation==='가속'?'active':''}" ${canUse?'':'disabled'}><b>시간 가속</b><span>시침을 한 칸 앞으로</span></button><button data-time-manipulation="정지" class="${selectedTimeManipulation==='정지'?'active':''}" ${canUse?'':'disabled'}><b>시간 정지</b><span>이번 턴의 시간을 유지</span></button><button data-time-manipulation="역행" class="${selectedTimeManipulation==='역행'?'active':''}" ${canUse?'':'disabled'}><b>시간 역행</b><span>시침을 한 칸 뒤로</span></button></div><footer><span>${state.timeManipulationUsed?'이번 턴에는 이미 시간을 조작했습니다.':canUse?'조작을 고른 뒤 확정하세요.':'시간 파편이 부족합니다.'}</span><button id="confirm-time-control" ${selectedTimeManipulation&&canUse?'':'disabled'}>확정</button></footer>`
}

const effectiveDamageMarkup=(value:number,base:number,forced=false)=>`<b class="effective-damage ${forced||value!==base?'boosted':''}">${value}</b>`
const skillDamageMarkup=(unit:Unit,skill:SkillDefinition)=>{const effects=skill.effects.filter(effect=>effect.type==='피해'),favored=engine.getTimeStatBonuses(unit).stacks>0;return effects.length?effects.map(effect=>effectiveDamageMarkup(engine.getActionDamagePreview(unit,'스킬',effect.value),effect.value,favored)).join(' / '):'직접 피해 없음'}

function renderMobileHud(){
  const state=engine.state,unit=inspectedUnit(),threatFocused=scene.getThreatFocus()!==undefined,selected=threatFocused?undefined:engine.selectedUnit,slot=threatFocused?undefined:engine.selectedActionSlot,skill=selected?engine.getSkill(selected):undefined,planning=state.phase==='계획',allyPlanning=planning&&selected?.team==='아군'&&slot?.team==='아군'
  const timeDock=document.querySelector<HTMLElement>('#mobile-time-dock')!
  timeDock.innerHTML=`<div class="pocket-watch-wrap"><div class="mobile-watch period-${state.currentTime} ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg;--hand-angle:${state.timeDialIndex*30}deg"><span class="watch-crown"></span><span class="watch-chain"></span>${watchDialMarkup(state.timeDialIndex)}<i class="watch-hand"></i><button class="watch-guide-trigger" data-open-time-control aria-label="시간 조작 열기"></button></div></div><div class="mini-time-gauge"><span style="width:${state.shards/state.maxShards*100}%"></span></div><small class="time-shard-count">시간 파편 ${state.shards}/${state.maxShards}</small>`
  const unitDock=document.querySelector<HTMLElement>('#mobile-unit-dock')!
  if(unit){
    const shownSkill=engine.getSkill(unit),normal=unit.normalAttack,status=unit.hp<=0?'전투 불능':unit.statuses.length?unit.statuses.map(item=>item.type).join(' · '):'정상',teamClass=unit.team==='아군'?'ally':'enemy',base=content.characters.find(character=>character.id===unit.id)??unit,bonus=engine.getTimeStatBonuses(unit),attackDamage=engine.getActionDamagePreview(unit,'일반공격',engine.getAttackPower(unit)),buffText=`공격 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)} · 이동 ${base.moveRange}${bonus.move?` +${bonus.move}`:''} · 치명 ${base.criticalRate}%${bonus.critical?` +${bonus.critical}%p`:''}`
    unitDock.dataset.unitDetail=unit.id;unitDock.setAttribute('role','button');unitDock.tabIndex=0;unitDock.setAttribute('aria-label',`${unit.name} 전투 설명 ${showSkillDetail?'닫기':'열기'}`)
    unitDock.innerHTML=`<span class="mobile-unit-portrait ${teamClass}">${unitPortraitMarkup(unit)}</span><div class="mobile-unit-main"><small>${unit.team} · ${unit.type}</small><b>${esc(unit.name)}</b><div class="mobile-hp"><span style="width:${Math.max(0,unit.hp/unit.maxHp*100)}%"></span></div><p>HP ${unit.hp}/${unit.maxHp} · ${buffText}</p>${bonus.stacks?`<small class="mobile-time-buff">${engine.state.currentTime} 피해 +${bonus.classDamage}% · ${bonus.stacks}중첩 · 일반공격·스킬</small>`:''}<em>${esc(status)}</em><small class="mobile-card-prompt">카드를 눌러 공격 정보를 확인</small></div>${showSkillDetail?`<div class="mobile-skill-detail"><header><b>${esc(unit.name)} 전투 정보</b><small>카드를 다시 누르면 닫힙니다.</small></header><div class="mobile-detail-action"><strong>기본 공격 · ${esc(normal.name)}</strong><span>${targetingLabel(normal.targeting)} · 사거리 ${normal.range} · ${esc(normal.rangePatternId)}</span><small>기본 공격 피해 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)}</small></div>${shownSkill?`<div class="mobile-detail-action skill"><strong>스킬 · ${esc(shownSkill.name)}</strong><span>${targetingLabel(shownSkill.targeting)} · 사거리 ${shownSkill.range} · ${esc(shownSkill.rangePatternId)}</span><small>피해 ${skillDamageMarkup(unit,shownSkill)} · ${esc(shownSkill.description)} · 치명타 ${shownSkill.canCritical?'가능':'불가'} · 쿨타임 ${shownSkill.cooldown}턴</small></div>`:'<div class="mobile-detail-action skill"><strong>스킬 없음</strong></div>'}</div>`:''}`
  }
  else{delete unitDock.dataset.unitDetail;unitDock.removeAttribute('role');unitDock.removeAttribute('tabindex');unitDock.removeAttribute('aria-label');unitDock.innerHTML='<p class="mobile-empty">보드의 캐릭터를 탭하세요.</p>'}
  const action=slot?.plan.action,previewReady=Boolean(allyPlanning&&action&&action.kind!=='없음'),confirmed=Boolean(selected&&confirmedActions.has(selected.id)),cancelReady=Boolean(allyPlanning&&mode!=='이동'&&actionDraft?.unitId===selected?.id),skillReady=Boolean(allyPlanning&&skill&&selected&&selected.cooldownRemaining===0),executeReady=planning&&!engine.validatePlans()
  const actionDock=document.querySelector<HTMLElement>('#mobile-action-dock')!,actionHint=threatFocused?'선택한 적의 이동과 공격 예고만 표시합니다.':mode==='이동'?'캐릭터를 누른 채 경로를 그리세요.':previewReady?'같은 대상이나 방향을 다시 탭하면 빠르게 확정됩니다.':'범위에서 대상 또는 방향을 선택하세요.'
  actionDock.innerHTML=`<div class="mobile-action-top"><p class="mobile-action-hint">${actionHint}</p><div class="mobile-action-commit"><button id="cancel-action" class="cancel-action" ${cancelReady?'':'disabled'}>취소</button><button id="confirm-action" class="confirm-action ${previewReady&&!confirmed?'ready':''}" ${previewReady&&!confirmed?'':'disabled'}>${confirmed?'설정 완료':'확정'}</button></div></div><div class="mobile-action-buttons"><button data-mobile-mode="일반공격" class="combat-button attack ${mode==='일반공격'?'active':''}" ${allyPlanning?'':'disabled'}><i>⚔</i><span>공격</span><small>${selected?targetingLabel(selected.normalAttack.targeting):''}</small></button><button data-mobile-mode="스킬" class="combat-button skill ${skillReady?'':'disabled'} ${mode==='스킬'?'active':''}" ${skillReady?'':'disabled'}><i>✦</i><span>스킬</span><small>${skill?esc(skill.name):'없음'}</small></button></div>`
  document.querySelector<HTMLElement>('#mobile-execute-dock')!.innerHTML=`<button id="mobile-execute" class="mobile-execute ${executeReady?'ready':''}" ${executeReady?'':'disabled'}><span>계획 실행</span></button><button id="mobile-reset-plans" class="mobile-reset-plans" ${planning?'':'disabled'}>계획 초기화</button>`
}

function beginActionMode(nextMode:'일반공격'|'스킬'){
  const unit=engine.selectedUnit
  if(engine.state.phase!=='계획'||unit?.team!=='아군')return
  if(mode===nextMode){cancelActionMode();return}
  if(!actionDraft||actionDraft.unitId!==unit.id)actionDraft={unitId:unit.id}
  confirmedActions.delete(unit.id);mode=nextMode;engine.planNone();scene.clearThreatFocus();scene.setPlanView('current');scene.setInputMode(mode);render()
}

function cancelActionMode(){
  const unit=engine.selectedUnit
  if(engine.state.phase!=='계획'||unit?.team!=='아군'||mode==='이동')return
  engine.planNone()
  confirmedActions.delete(unit.id)
  actionDraft=undefined;mode='이동';scene.setInputMode(mode);render()
}

function confirmSelectedAction(){
  const unit=engine.selectedUnit,action=engine.selectedPlan?.action
  if(engine.state.phase!=='계획'||unit?.team!=='아군'||!action||action.kind==='없음')return
  confirmedActions.add(unit.id);actionDraft=undefined;mode='이동';scene.setInputMode(mode);render()
}

function renderLeftRail(){
  const rail=document.querySelector<HTMLDivElement>('#left-rail')!,state=engine.state
  if(state.phase==='배치'){
    rail.innerHTML='';return
  }
  rail.innerHTML=`<section class="time-resource"><div class="watch"><div class="watch-face period-${state.currentTime} ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg;--hand-angle:${state.timeDialIndex*30}deg" aria-label="시간 조작 열기, 시간 파편 ${state.shards} / ${state.maxShards}"><span class="watch-crown"></span>${watchDialMarkup(state.timeDialIndex)}<div class="hand ${state.currentTime}"></div><button class="watch-guide-trigger" data-open-time-control aria-label="시간 조작 열기"></button></div></div><div><div class="mini-time-gauge"><span style="width:${state.shards/state.maxShards*100}%"></span></div><small class="time-shard-count">시간 파편 ${state.shards}/${state.maxShards}</small></div></section><section class="targeting-guide" aria-label="공격 지정 방식 설명"><header><small>ACTION TYPE</small><b>공격 지정 방식</b></header><dl><div><dt>타겟형</dt><dd>캐릭터 지정 · 시전 순간 사거리 판정</dd></div><div><dt>방향형</dt><dd>이동 후 위치에서 선택 방향으로 시전</dd></div><div><dt>셀형</dt><dd>칸 지정 · 시전 순간 사거리 판정</dd></div><div><dt>설치형</dt><dd>지정한 칸에 설치물을 생성</dd></div></dl></section><div class="ai-panel"><div><b>적군 AI · 계획 공개</b><span>현재 전투판만 읽고 자동 계획</span></div><button id="replan-enemy" ${state.phase!=='계획'?'disabled':''}>AI 다시 계획</button></div>`
}

function renderRightRail(){
  const rail=document.querySelector<HTMLDivElement>('#right-rail')!,state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  if(state.phase==='배치'){
    rail.innerHTML='';return
  }
  if(state.phase==='승리'||state.phase==='패배'){rail.innerHTML=`<div class="result ${state.phase}"><small>BATTLE RESULT</small><h2>${state.phase}</h2><p>${state.phase==='승리'?'모든 적이 전투 불능입니다.':'모든 아군이 전투 불능입니다.'}</p><button class="execute" id="return-main">메인 화면으로</button></div>${rightTools()}`;return}
  if(state.phase==='실행'){
    const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId),liveAction=liveSlot?.plan.action
    const targetName=liveAction?.targetUnitId?state.units.find(candidate=>candidate.id===liveAction.targetUnitId)?.name:undefined
    rail.innerHTML=`<div class="panel-title"><small>NOW RESOLVING</small><h2>계획 실행</h2></div>${liveUnit?unitSummary(liveUnit):'<p class="empty-state">다음 행동을 준비하고 있습니다.</p>'}${liveSlot&&liveAction?`<div class="execution-card"><span>${liveSlot.number}번 행동 · ${liveSlot.team}</span><b>${esc(liveAction.kind)}${liveAction.direction?` · ${liveAction.direction}`:''}${targetName?` · ${esc(targetName)}`:''}${liveAction.targetCell?` · ${liveAction.targetCell.x+1},${liveAction.targetCell.y+1}`:''}</b><small>${liveSlot.result==='대기'?'이동과 사거리를 판정하는 중입니다.':`결과 · ${liveSlot.result}`}</small></div>`:''}<div class="execution-note"><i></i><span>선명한 연결선은 현재 행동, 흐린 선은 아직 실행되지 않은 계획입니다.</span></div>${rightTools()}`;return
  }
  const threatFocus=scene.getThreatFocus()
  if(threatFocus!==undefined){rail.innerHTML=focusedThreatInspector(threatFocus)+rightTools();return}
  if(scene.getPlanView()==='summary'||scene.getPlanView()==='all'){rail.innerHTML=turnForecastPanel(scene.getPlanView())+rightTools();return}
  if(!unit||!slot){rail.innerHTML=`<p>행동 슬롯이 없습니다.</p>${rightTools()}`;return}
  const action=slot.plan.action,definition=mode==='일반공격'?unit.normalAttack:skill
  const plannedDefinition=action.kind==='일반공격'?unit.normalAttack:action.kind==='스킬'?skill:undefined
  const targetPoint=action.targetUnitId?engine.state.units.find(v=>v.id===action.targetUnitId&&v.hp>0)?.position:action.targetCell
  const origin=slot.plan.path.at(-1),hasFreeTargeting=plannedDefinition&&['대상','셀','설치'].includes(plannedDefinition.targeting),castReady=Boolean(hasFreeTargeting&&targetPoint&&origin&&isPointInPattern(origin,targetPoint,plannedDefinition!.rangePatternId,plannedDefinition!.range))
  const rangeRow=hasFreeTargeting&&targetPoint?`<div class="cast-state ${castReady?'ready':'broken'}"><span>시전 판정</span><b>${castReady?'범위 안 · 실행 가능':'범위 밖 · 실행 시 취소'}</b></div>`:''
  rail.innerHTML=`<div class="slot-head"><span>${slot.number}번 행동 · ${unit.team}</span><div><button data-plan-view="summary" title="턴 종료 예상으로 돌아가기">결과 보기</button><button data-shift="-1">←</button><button data-shift="1">→</button></div></div>${unitSummary(unit)}<div class="plan-block"><div><span>이동 경로</span><b>${slot.plan.path.length-1} / ${unit.moveRange}칸</b></div><div><span>후속 행동</span><b>${esc(action.kind)}${action.direction?` · ${action.direction}`:''}${action.targetUnitId?` · ${esc(engine.state.units.find(u=>u.id===action.targetUnitId)?.name??'')}`:''}${action.targetCell?` · ${action.targetCell.x+1},${action.targetCell.y+1}`:''}</b></div>${rangeRow}</div><div class="command-grid"><button data-mode="이동" class="${mode==='이동'?'active':''}">01 경로</button><button data-mode="일반공격" class="${mode==='일반공격'?'active':''}">02 ${esc(unit.normalAttack.name)}</button><button data-mode="스킬" class="${mode==='스킬'?'active':''}" ${!skill||unit.cooldownRemaining>0?'disabled':''}>03 ${esc(skill?.name??'스킬 없음')}${unit.cooldownRemaining?` (${unit.cooldownRemaining})`:''}</button><button id="plan-none">행동 없음</button></div>${definition?.targeting==='방향'&&mode!=='이동'?`<div class="direction-pad"><button data-direction="상">↑</button><button data-direction="좌">←</button><span>방향</span><button data-direction="우">→</button><button data-direction="하">↓</button></div>`:''}<p class="context-hint">${mode==='이동'?'경로를 바꾸면 목표 연결선과 실행 가능 여부가 즉시 바뀝니다.':definition?.targeting==='대상'?'거리와 관계없이 캐릭터를 지정합니다. 파란 실선이면 실행 가능, 주황 점선이면 실행 시 취소됩니다.':definition?.targeting==='셀'||definition?.targeting==='설치'?'거리와 관계없이 셀을 지정합니다. 실제 시전은 이동 완료 위치에서 사거리를 판정합니다.':'방향을 고른 뒤 공격선과 강제이동 잔상을 확인하세요. 노란 실선은 밀치기, 보라 꺾쇠는 당기기입니다.'}</p><div class="plan-actions"><button id="clear-plan">계획 초기화</button><button class="execute" id="execute-turn" ${state.phase!=='계획'||engine.validatePlans()?'disabled':''}>시간대 잠금 · 계획 실행</button></div>${rightTools()}`
}

const targetingLabel=(targeting:string)=>({대상:'타겟형',방향:'방향형',셀:'셀 지정형',설치:'설치형'} as Record<string,string>)[targeting]??targeting
function unitSummary(unit:Unit){
  const skill=engine.getSkill(unit),normal=unit.normalAttack,time=engine.state.currentTime,base=content.characters.find(character=>character.id===unit.id)??unit,bonus=engine.getTimeStatBonuses(unit,time),signed=(value:number,suffix='')=>value?` <em>+${value}${suffix}</em>`:'',attackDamage=engine.getActionDamagePreview(unit,'일반공격',engine.getAttackPower(unit))
  return `<div class="selected-unit"><span class="portrait large" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span><div><h3>${esc(unit.name)}</h3><p>${unit.type} · HP ${unit.hp}/${unit.maxHp}</p><div class="stats"><span>공격 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)}</span><span>이동 ${base.moveRange}${signed(bonus.move)}</span><span>치명 ${base.criticalRate}%${signed(bonus.critical,'%p')}</span></div>${bonus.stacks?`<small class="time-buff-note">${time} ${bonus.stacks}중첩 · 일반공격·스킬 피해 +${bonus.classDamage}% (복리)</small>`:''}</div></div><div class="unit-combat-info"><div><span>기본공격 · ${targetingLabel(normal.targeting)}</span><b>${esc(normal.name)}</b><small>피해 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)} · 사거리 ${normal.range} · ${esc(normal.rangePatternId)}</small></div>${skill?`<div><span>스킬 · ${targetingLabel(skill.targeting)}</span><b>${esc(skill.name)}</b><small>피해 ${skillDamageMarkup(unit,skill)} · 사거리 ${skill.range} · ${esc(skill.rangePatternId)} · 쿨타임 ${skill.cooldown}턴</small></div>`:`<div><span>스킬</span><b>연결된 스킬 없음</b></div>`}</div>`
}

function allyForecasts(){
  const threats=engine.getEnemyThreatPredictions()
  return engine.livingUnits.filter(unit=>unit.team==='아군').map(unit=>{
    const contributors=threats.flatMap(threat=>threat.outcomes.filter(outcome=>outcome.unitId===unit.id).map(outcome=>({threat,outcome}))),damage=contributors.reduce((sum,item)=>sum+item.outcome.damage,0)
    const statuses=[...new Set(contributors.flatMap(item=>item.outcome.statuses).filter(status=>!status.includes('면역')))],forces=contributors.flatMap(item=>item.outcome.forceMoves),attackers=[...new Set(contributors.map(item=>item.threat.slotNumber))]
    const before=unit.hp,after=Math.max(0,before-damage)
    return{unit,before,after,damage,statuses,forces,attackers,slotIndex:engine.state.slots.findIndex(slot=>slot.unitId===unit.id)}
  })
}

function turnForecastPanel(view:PlanViewMode){
  const forecasts=allyForecasts(),dangerCount=forecasts.filter(item=>item.damage||item.statuses.length||item.forces.length).length
  return `<div class="forecast-heading"><div><small>TURN FORECAST</small><h2>${view==='all'?'전체 계획 검증':'턴 종료 예상'}</h2></div><span>${dangerCount?`${dangerCount}명 영향 예상`:'현재 직접 피해 없음'}</span></div><p class="forecast-guide">아군의 최종 결과를 먼저 보고, 카드를 눌러 계획을 수정하세요.</p><div class="ally-forecast-list">${forecasts.map(item=>{const danger=item.damage||item.statuses.length||item.forces.length,force=item.forces.at(-1),details=[...item.statuses,force?`${force.type} ${force.moved}/${force.requested}`:''].filter(Boolean);return `<button class="ally-forecast ${item.after<=0?'lethal':danger?'danger':'safe'}" data-edit-slot="${item.slotIndex}"><span class="portrait" style="--unit:${esc(item.unit.color)}">${esc(item.unit.name.slice(-1))}</span><div><b>${esc(item.unit.name)}</b><strong>HP ${item.before} → ${item.after}</strong><small>${details.length?esc(details.join(' · ')):'직접 위협 없음'}</small></div><em>${item.attackers.length?`공격자 ${item.attackers.map(number=>`#${number}`).join(' ')}`:'안전'}</em></button>`}).join('')}</div><div class="forecast-actions"><button data-plan-view="${view==='all'?'summary':'all'}">${view==='all'?'턴 결과만 보기':'모든 계획 펼치기'}</button><button class="execute" id="execute-turn" ${engine.validatePlans()?'disabled':''}>시간대 잠금 · 계획 실행</button></div>${enemyThreatPanel()}`
}

function focusedThreatInspector(slotIndex:number){
  const threat=engine.getEnemyThreatPredictions().find(item=>item.slotIndex===slotIndex),actor=threat&&engine.state.units.find(unit=>unit.id===threat.actorId)
  if(!threat||!actor)return `<button data-plan-view="summary">← 턴 결과</button><p class="empty-state">선택한 적 행동을 찾을 수 없습니다.</p>`
  const outcomes=threat.outcomes.map(outcome=>{const details:string[]=[];if(outcome.damage)details.push(`${outcome.critical?'치명타 · ':''}피해 ${outcome.damage}`);details.push(...outcome.statuses);for(const force of outcome.forceMoves)details.push(`${force.type} ${force.moved}/${force.requested}칸 · ${force.to.x+1},${force.to.y+1}`);if(outcome.ko)details.push('전투불능');return `<div class="inspector-outcome"><span>대상</span><b>${esc(outcome.unitName)}</b><strong>${esc(details.join(' · ')||'영향 없음')}</strong></div>`}).join('')
  const action=engine.state.slots[slotIndex]?.plan.action,definition=action?.kind==='일반공격'?actor.normalAttack:action?.kind==='스킬'?engine.getSkill(actor):undefined
  return `<button class="back-result" data-plan-view="summary">← 턴 종료 예상</button><div class="threat-inspector-head"><i>#${threat.slotNumber}</i><div><small>ENEMY ACTION</small><h2>${esc(threat.actionName)}</h2><p>${esc(threat.actorName)}${threat.direction?` · ${esc(threat.direction)} 방향`:''}</p></div><em class="${threat.state==='적중 예상'?'hit':'cancel'}">${esc(threat.state)}</em></div>${unitSummary(actor)}${definition?.targeting==='대상'?`<p class="range-guide"><i></i>전투판의 붉은 셀이 예상 시전 위치 기준 사거리입니다.</p>`:''}<div class="inspector-flow"><span>시전자</span><b>${esc(threat.actorName)}</b><i>→</i><span>행동</span><b>${esc(threat.actionName)}</b><i>→</i><span>결과</span></div>${outcomes||`<div class="inspector-outcome cancel"><span>실행 결과</span><b>${esc(threat.intendedTargetName??'대상 없음')}</b><strong>${esc(threat.reason)}</strong></div>`}<p class="forecast-guide">${threat.state==='취소 예상'?'취소 이유':'예측 근거'} · ${esc(threat.reason)}</p>`
}

function enemyThreatPanel(){
  const threats=engine.getEnemyThreatPredictions(),focused=scene.getThreatFocus()
  return `<section class="threat-panel"><header><div><small>ENEMY INTENT</small><b>적 위협</b></div><span>카드를 누르면 해당 계획만 강조</span></header><div class="threat-list">${threats.map(threat=>{const outcomeText=threat.outcomes.map(outcome=>{const parts:string[]=[];if(outcome.damage)parts.push(`${outcome.critical?'치명타 ':''}피해 ${outcome.damage}`);parts.push(...outcome.statuses);for(const force of outcome.forceMoves)parts.push(`${force.type} ${force.moved}/${force.requested} → ${force.to.x+1},${force.to.y+1}`);if(outcome.ko)parts.push('전투불능');return `<div class="threat-outcome"><strong>${esc(outcome.unitName)}</strong><span>${esc(parts.join(' · ')||'영향 없음')}</span></div>`}).join('');return `<button data-threat-slot="${threat.slotIndex}" class="threat-card ${focused===threat.slotIndex?'active':''} ${threat.state==='적중 예상'?'hit':threat.state==='취소 예상'?'cancel':'empty'}"><i>${threat.slotNumber}</i><div class="threat-main"><span><b>${esc(threat.actorName)}</b> · ${esc(threat.actionName)}${threat.direction?` ${esc(threat.direction)}`:''}</span>${outcomeText||`<div class="threat-outcome"><strong>${esc(threat.intendedTargetName??'대상 없음')}</strong><span>${esc(threat.reason)}</span></div>`}</div><em>${esc(threat.state)}</em></button>`}).join('')}</div></section>`
}

const targetingHelp=(targeting:string)=>({대상:'캐릭터 하나를 먼저 지정하고, 시전 순간 이동 완료 위치에서 사거리를 다시 판정합니다.',방향:'상·하·좌·우 한 방향을 정해 직선상의 영향 셀에 효과를 적용합니다.',셀:'전투판의 셀 하나를 지정하고, 시전 순간 해당 셀이 사거리 안인지 판정합니다.',설치:'셀을 지정해 그 위치에 환경 요소를 생성합니다.'} as Record<string,string>)[targeting]??''
const patternHelp=(pattern:string)=>pattern.startsWith('마름모_')?'상하좌우 이동거리의 합이 표시 숫자 이하인 범위입니다.':pattern.startsWith('직선_')?'선택한 방향으로 표시 숫자만큼 이어진 직선 범위입니다.':pattern.startsWith('사각형_')?'시전자를 중심으로 표시 숫자만큼 확장된 정사각형 범위입니다.':'스킬이 사용하는 범위 모양입니다.'
const scopeHelp=(scope:string)=>({선택대상:'직접 지정한 캐릭터 한 명에게 적용',선택셀:'직접 지정한 셀에 있는 대상에게 적용',영향셀:'표시된 모든 영향 셀의 대상에게 적용',자신:'스킬을 사용한 캐릭터 자신에게 적용'} as Record<string,string>)[scope]??scope
const targetTeamHelp=(team:string)=>team==='적군'?'시전자 기준 상대 진영만 대상':team==='아군'?'시전자와 같은 진영만 대상':'진영 구분 없이 대상'
const effectValueLabel=(type:string,value:number)=>type==='피해'?`${value} 피해`:type==='밀치기'||type==='당기기'?`${value}칸`:'수치 없음'
const isForceMoveEffect=(type:string)=>type==='밀치기'||type==='당기기'
const effectTeamLabel=(type:string,team:string)=>isForceMoveEffect(type)?'모두':team
const effectTargetHelp=(type:string,team:string)=>isForceMoveEffect(type)?'진영과 무관하게 강제이동하며, 같은 진영은 이 스킬의 피해를 받지 않음':targetTeamHelp(team)

function tutorialPanel(){
  const unit=engine.selectedUnit,skill=unit?engine.getSkill(unit):undefined,topics:{id:TutorialTopic;label:string}[]=[{id:'skill',label:'스킬 정보'},{id:'parameter',label:'기본 파라미터'},{id:'time',label:'시간 활용'},{id:'combat',label:'기본 전투법'}]
  let body=''
  if(tutorialTopic==='skill')body=unit&&skill?`<h4>${esc(unit.name)} · ${esc(skill.name)}</h4><p>${esc(skill.description)}</p><div class="tag-reader"><div><b>방식 · ${targetingLabel(skill.targeting)}</b><span>${esc(targetingHelp(skill.targeting))}</span></div><div><b>사거리 · ${skill.range}칸</b><span>계획한 이동 경로의 마지막 셀에서 이 거리 안에 있어야 실행됩니다.</span></div><div><b>범위패턴 · ${esc(skill.rangePatternId)}</b><span>${esc(patternHelp(skill.rangePatternId))}</span></div><div><b>쿨타임 · ${skill.cooldown}턴</b><span>스킬을 실행한 뒤 ${skill.cooldown}턴 동안 다시 사용할 수 없습니다.</span></div><div><b>치명타 · ${skill.canCritical?'가능':'불가'}</b><span>${skill.canCritical?'띄워짐 상태의 대상을 공격하면 캐릭터의 치명타 피해율을 적용합니다.':'대상이 띄워짐 상태여도 이 스킬은 치명타가 발생하지 않습니다.'}</span></div></div><h5>효과 태그 읽기</h5><div class="effect-reader">${skill.effects.map((effect,index)=>`<div><i>${index+1}</i><div><b>${esc(effect.type)} · ${effectValueLabel(effect.type,effect.value)}</b><small>적용: ${esc(effect.scope)} · 대상: ${esc(effectTeamLabel(effect.type,effect.targetTeam))}</small><span>${esc(scopeHelp(effect.scope))}. ${esc(effectTargetHelp(effect.type,effect.targetTeam))}.</span></div></div>`).join('')}</div>`:'<h4>스킬 정보</h4><p>전투판이나 행동 슬롯에서 캐릭터를 먼저 선택하세요.</p>'
  if(tutorialTopic==='parameter')body=`<h4>기본 파라미터 읽기</h4><dl><div><dt>HP</dt><dd>0이 되면 즉시 전투 불능이며 칸 점유가 해제됩니다.</dd></div><div><dt>공격</dt><dd>기본공격의 피해량입니다. 기본공격에는 밀치기·상태이상 같은 부가 효과가 없습니다.</dd></div><div><dt>이동</dt><dd>한 턴에 그릴 수 있는 상하좌우 경로의 최대 칸 수입니다.</dd></div><div><dt>치명</dt><dd>띄워진 적을 공격할 때 적용되는 치명타 피해율입니다.</dd></div><div><dt>타입</dt><dd>계승자·각성자·기술자는 과거·현재·미래 시간대 강화와 연결됩니다.</dd></div></dl>`
  if(tutorialTopic==='time')body=`<h4>시간 활용법</h4><ol><li>시간은 <b>현재 → 미래 → 과거</b> 순서로 각 2턴씩 자동 순환합니다.</li><li>유효 공격 +${SHARD_PER_ATTACK}, 상태 콤보 +${SHARD_PER_COMBO}, 턴 종료 +${SHARD_PER_TURN}만큼 시간 파편을 얻습니다.</li><li>시계를 누르면 시간 파편을 사용해 시간을 가속하거나 정지하거나 역행할 수 있습니다.</li><li>조작 버튼을 누르면 가상 시침으로 결과를 먼저 확인하고, 확정을 누르는 즉시 시간이 변경됩니다.</li><li>연속 체류 시 해당 타입의 일반공격과 스킬 피해는 <b>기본 피해 × 1.2^중첩 수</b>로 증가합니다.</li><li><b>과거</b>: 일반공격 +5 · <b>현재</b>: 치명타 피해율 +20%p · <b>미래</b>: 이동력 +1. 모두 아군과 적군에게 적용됩니다.</li></ol>`
  if(tutorialTopic==='combat')body=`<h4>기본 전투법</h4><ol><li><b>적 계획 읽기</b> · 빨간 이동 경로, 공격 범위, 타겟 연결선과 턴 종료 예상 HP를 확인합니다.</li><li><b>행동 순서 선택</b> · 위 슬롯에서 아군을 고르고 필요하면 좌우 화살표로 순서를 바꿉니다.</li><li><b>경로 그리기</b> · 상하좌우 칸을 차례로 눌러 이동합니다. 도착 SD 홀로그램으로 최종 위치를 확인합니다.</li><li><b>공격 계획</b> · 이동 후 위치를 기준으로 기본공격 또는 스킬의 타겟·방향·셀을 정합니다.</li><li><b>결과 검증</b> · 실선은 실행 가능, 주황 점선은 범위 밖 취소입니다. 모든 계획을 확인한 뒤 실행합니다.</li></ol>`
  return `<section class="tutorial-panel"><header><div><small>FIELD GUIDE</small><b>전투 도움말</b></div>${tutorialTopic?'<button id="close-tutorial" aria-label="도움말 닫기">×</button>':''}</header><div class="tutorial-tabs">${topics.map(topic=>`<button data-tutorial-topic="${topic.id}" class="${tutorialTopic===topic.id?'active':''}">${topic.label}</button>`).join('')}</div>${tutorialTopic?`<div class="tutorial-content">${body}</div>`:''}</section>`
}

function rightTools(){return `<section class="right-tools">${tutorialPanel()}<details class="timing-panel"><summary><span>연출 속도</span><b>${engine.presentationDelayMs} ms</b></summary><div class="timing-control"><label for="execution-delay"><span>행동 사이 간격</span><span id="delay-value">${engine.presentationDelayMs} ms</span></label><input id="execution-delay" type="range" min="0" max="1500" step="10" value="${engine.presentationDelayMs}" ${engine.state.phase==='실행'?'disabled':''}><div class="timing-presets"><button data-delay="100">빠름</button><button data-delay="360">보통</button><button data-delay="800">느림</button></div></div></details><div class="right-log"><header><div><b>전투 로그</b><small>최신 기록부터 표시</small></div><em>${engine.state.log.length}</em></header><div id="log">${engine.state.log.map((line,index)=>`<div class="${index===0?'latest':''}"><i>${String(engine.state.log.length-index).padStart(2,'0')}</i><span>${esc(line)}</span></div>`).join('')}</div></div></section>`}

document.addEventListener('pointerdown',event=>{const target=event.target as HTMLElement;if(reorderMode&&reorderSlot!==undefined&&!target.closest('#timeline-wrap')){reorderSlot=undefined;render()}})

settingsModal.addEventListener('pointerdown',event=>{
  if(event.target!==settingsModal)return
  event.preventDefault();event.stopPropagation();settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()
})
function closeTimeControl(){timeControlModal.classList.add('hidden');selectedTimeManipulation=undefined;timeControlConfirming=false;scene.input.enabled=true;renderTimeControl()}
timeControlModal.addEventListener('pointerdown',event=>{if(event.target===timeControlModal&&!timeControlConfirming)closeTimeControl()})

function beginCoinFlow(size:BoardSize){
  window.clearTimeout(coinRevealTimer);window.clearTimeout(coinFinishTimer);pendingBoardSize=size;localStorage.setItem(BOARD_SIZE_KEY,String(size));resultPreviewOutcome=undefined;frontScreen='coin';coinRevealed=false;scene.input.enabled=false
  if(size!==engine.boardSize)engine.setBoardSize(size);else engine.reset(content)
  coinFirstTeam=engine.tossFirstTeam();render()
  coinRevealTimer=window.setTimeout(()=>{coinRevealed=true;renderFrontFlow()},950)
  coinFinishTimer=window.setTimeout(()=>{frontScreen='none';coinRevealed=false;scene.input.enabled=true;render()},2550)
}

function returnToMain(){window.clearTimeout(coinRevealTimer);window.clearTimeout(coinFinishTimer);resultPreviewOutcome=undefined;frontScreen='main';mainInfo=undefined;coinRevealed=false;settingsOpen=false;confirmedActions.clear();actionDraft=undefined;reorderMode=false;reorderSlot=undefined;mode='이동';scene.clearThreatFocus();scene.setPlanView('summary');scene.setInputMode(mode);engine.reset(content);scene.input.enabled=true;render()}

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return
  if(!timeControlModal.classList.contains('hidden')&&!timeControlConfirming)closeTimeControl()
  else if(settingsOpen){settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()}
  else if(reorderMode){reorderMode=false;reorderSlot=undefined;render()}
})

document.addEventListener('click',async event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('button,[data-unit-detail]');if(!button)return
  if(button.dataset.displayMode){
    selectedDisplayMode=button.dataset.displayMode as DisplayMode
    document.querySelector('#device-mode-modal')?.classList.add('hidden')
    configureMobileViewport()
    window.setTimeout(()=>{syncMobileVisualViewport();render()},100)
    return
  }
  if(button.id==='front-start'){mainInfo=undefined;frontScreen='size';renderFrontFlow();return}
  if(button.id==='front-fullscreen'){await toggleFullscreen();return}
  if(button.id==='front-back'){mainInfo=undefined;frontScreen='main';renderFrontFlow();return}
  if(button.id==='result-restart'){beginCoinFlow(engine.boardSize);return}
  if(button.id==='result-main'){returnToMain();return}
  if(button.dataset.mainInfo){mainInfo=mainInfo===button.dataset.mainInfo?undefined:button.dataset.mainInfo as MainInfo;renderFrontFlow();return}
  if(button.id==='close-main-info'){mainInfo=undefined;renderFrontFlow();return}
  if(button.dataset.frontBoardSize){beginCoinFlow(Number(button.dataset.frontBoardSize) as BoardSize);return}
  if(button.dataset.openTimeControl!==undefined&&engine.state.phase==='계획'){selectedTimeManipulation=undefined;timeControlConfirming=false;timeControlModal.classList.remove('hidden');scene.input.enabled=false;renderTimeControl();return}
  if(button.id==='close-time-control'&&!timeControlConfirming){closeTimeControl();return}
  if(button.dataset.timeManipulation){
    selectedTimeManipulation=button.dataset.timeManipulation as TimeManipulation;renderTimeControl()
    const watch=timeControlModal.querySelector<HTMLElement>('.grand-watch');watch?.classList.remove('choice-shake');void watch?.offsetWidth;watch?.classList.add('choice-shake');return
  }
  if(button.id==='confirm-time-control'&&selectedTimeManipulation){
    const manipulation=selectedTimeManipulation
    if(engine.commitTimeManipulation(manipulation)){timeControlConfirming=true;renderTimeControl();window.setTimeout(closeTimeControl,900)}
    return
  }
  if(button.id==='open-settings'){pendingBoardSize=engine.boardSize;settingsOpen=true;scene.input.enabled=false;render()}
  if(button.id==='settings-fullscreen'){await toggleFullscreen();renderSettings();return}
  if(button.dataset.boardSize){pendingBoardSize=Number(button.dataset.boardSize) as BoardSize;render()}
  if(button.id==='close-settings'||button.id==='cancel-settings'){settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()}
  if(button.id==='restart-battle'){settingsOpen=false;beginCoinFlow(engine.boardSize);return}
  if(button.id==='settings-main'){returnToMain();return}
  if(button.id==='apply-board-size'){
    const changed=pendingBoardSize!==engine.boardSize
    localStorage.setItem(BOARD_SIZE_KEY,String(pendingBoardSize));settingsOpen=false;scene.input.enabled=true
    confirmedActions.clear();actionDraft=undefined;reorderMode=false;reorderSlot=undefined;mode='이동'
    scene.clearThreatFocus();scene.setPlanView('summary');scene.setInputMode(mode)
    if(changed)engine.setBoardSize(pendingBoardSize);else render()
  }
  if(button.id==='secret-pause'){secretPauseClicks++;if(secretPauseClicks>=20){secretPauseClicks=0;scene.input.enabled=false;document.querySelector('#editor-modal')!.classList.remove('hidden');renderEditor()}}
  if(button.id==='open-editor'){scene.input.enabled=false;document.querySelector('#editor-modal')!.classList.remove('hidden');renderEditor()}
  if(button.id==='close-editor'){scene.input.enabled=true;document.querySelector('#editor-modal')!.classList.add('hidden')}
  if(button.dataset.previewResult){resultPreviewOutcome=button.dataset.previewResult as 'victory'|'defeat';frontScreen='result';document.querySelector('#editor-modal')!.classList.add('hidden');scene.input.enabled=false;render();return}
  if(button.dataset.deployUnit)engine.selectDeployUnit(button.dataset.deployUnit)
  if(button.dataset.equipRelic){
    const relic=content.relics.find(item=>item.id===button.dataset.equipRelic),owner=engine.selectedUnit,current=owner?relicLoadouts[owner.id]??[]:[]
    if(relic&&owner?.team==='아군'&&current.length<3&&!Object.values(relicLoadouts).flat().includes(relic.id)){relicLoadouts={...relicLoadouts,[owner.id]:[...current,relic.id]};persistRelicLoadouts();engine.setRelicLoadouts(relicLoadouts)}
    else if(current.length>=3)render()
  }
  if(button.dataset.unequipRelic){const owner=engine.selectedUnit;if(owner?.team==='아군'){relicLoadouts={...relicLoadouts,[owner.id]:(relicLoadouts[owner.id]??[]).filter(id=>id!==button.dataset.unequipRelic)};persistRelicLoadouts();engine.setRelicLoadouts(relicLoadouts)}}
  if(button.id==='start-battle'){confirmedActions.clear();mode='이동';scene.setInputMode(mode);scene.setPlanView('summary');engine.startBattle()}
  if(button.id==='replan-enemy')engine.planEnemyAi()
  if(button.dataset.planView){scene.setPlanView(button.dataset.planView as PlanViewMode);render()}
  if(button.dataset.editSlot!==undefined){scene.clearThreatFocus();scene.setPlanView('current');engine.selectSlot(Number(button.dataset.editSlot));mode='이동';scene.setInputMode(mode)}
  if(button.id==='toggle-reorder'){reorderMode=!reorderMode;reorderSlot=undefined;scene.clearThreatFocus();render()}
  if(button.dataset.slot!==undefined){const slotIndex=Number(button.dataset.slot),slot=engine.state.slots[slotIndex];if(engine.state.phase==='계획'&&reorderMode){if(slot?.team!=='아군')return;if(reorderSlot===undefined)reorderSlot=slotIndex;else if(slotIndex===reorderSlot)reorderSlot=undefined;else{engine.swapAllySlots(reorderSlot,slotIndex);reorderSlot=undefined}render()}else if(engine.state.phase==='계획'&&slot?.team==='아군'){scene.clearThreatFocus();scene.setPlanView('current');engine.selectSlot(slotIndex);mode='이동';scene.setInputMode(mode);render()}else{mode='이동';scene.setInputMode(mode);if(slot?.team==='적군')scene.setThreatFocus(slotIndex);render()}}
  if(button.dataset.threatSlot!==undefined){scene.setThreatFocus(Number(button.dataset.threatSlot));render()}
  if(button.dataset.shift)engine.shiftSelectedSlot(Number(button.dataset.shift) as -1|1)
  if(button.dataset.mode){const nextMode=button.dataset.mode as InputMode;if(nextMode==='이동'){mode='이동';scene.setPlanView('current');scene.setInputMode(mode);render()}else beginActionMode(nextMode)}
  if(button.dataset.mobileMode)beginActionMode(button.dataset.mobileMode as '일반공격'|'스킬')
  if(button.dataset.direction&&mode!=='이동')engine.planDirection(mode,button.dataset.direction as '상'|'하'|'좌'|'우')
  if(button.id==='plan-none')engine.planNone()
  if(button.id==='clear-plan'){engine.clearPlan();mode='이동';scene.setInputMode(mode)}
  if(button.dataset.unitDetail){showSkillDetail=!showSkillDetail;render()}
  if(button.id==='cancel-action')cancelActionMode()
  if(button.id==='confirm-action')confirmSelectedAction()
  if(button.id==='mobile-reset-plans'){confirmedActions.clear();actionDraft=undefined;mode='이동';scene.clearThreatFocus();scene.setPlanView('all');scene.setInputMode(mode);engine.resetAllyPlans()}
  if(button.id==='mobile-execute')await engine.executeTurn()
  if(button.dataset.tutorialTopic){tutorialTopic=tutorialTopic===button.dataset.tutorialTopic?undefined:button.dataset.tutorialTopic as TutorialTopic;render()}
  if(button.id==='close-tutorial'){tutorialTopic=undefined;render()}
  if(button.dataset.delay){engine.setPresentationDelay(Number(button.dataset.delay));localStorage.setItem(SPEED_KEY,String(engine.presentationDelayMs))}
  if(button.id==='execute-turn')await engine.executeTurn()
  if(button.id==='return-main')returnToMain()
  handleEditorButton(button)
})

function persist(){localStorage.setItem(SAVE_KEY,JSON.stringify(content))}
function persistRelicLoadouts(){localStorage.setItem(RELIC_LOADOUT_KEY,JSON.stringify(relicLoadouts))}
function currentCollection(){return editorKind==='character'?content.characters:editorKind==='skill'?content.skills:content.relics}
function renderEditor(){
  const collection=currentCollection(),item=collection.find(v=>v.id===selectedEditorId)??collection[0]
  if(item&&(!selectedEditorId||!collection.some(v=>v.id===selectedEditorId)))selectedEditorId=item.id
  document.querySelectorAll<HTMLButtonElement>('[data-editor-tab]').forEach(b=>b.classList.toggle('active',b.dataset.editorTab===editorKind))
  document.querySelector('#editor-list')!.innerHTML=collection.map(v=>`<button data-editor-id="${esc(v.id)}" class="${v.id===selectedEditorId?'active':''}"><b>${esc(v.name)}</b><small>${esc(editorKind==='character'?(v as CharacterDefinition).team:editorKind==='skill'?(v as SkillDefinition).targeting:(v as RelicDefinition).rarity)}</small></button>`).join('')||'<p>항목 없음</p>'
  document.querySelector('#syntax-name')!.textContent=editorKind==='character'?'캐릭터 문법':editorKind==='skill'?'스킬 문법':'유물 문법'
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!;if(item&&editor.dataset.loadedId!==item.id){editor.value=item.source;editor.dataset.loadedId=item.id}
  document.querySelector('#syntax-help')!.innerHTML=editorKind==='character'?'<b>캐릭터 필수 항목</b><p>ID · 진영 · 타입 · AI유형(공통형/돌격형/방벽형/저격형) · 체력 · 공격력 · 이동력 · 치명타피해율 · 일반공격 · 공격방식 · 공격사거리 · 공격범위패턴 · 스킬 ID · 색상 · 상태면역</p>':editorKind==='skill'?'<b>스킬 필수 항목</b><p>ID · 방식(대상/셀/설치/방향) · 사거리 · 범위패턴 · 영향셀패턴 · 쿨타임 · 치명타 · 효과. 각 효과에는 적용 범위와 대상 진영을 지정하며 설치 효과에는 환경 요소 ID를 작성합니다.</p>':'<b>유물 효과 문법</b><p>종류 · 발동(항상/시간대상시/시간대진입/유효공격) · 시간대 · 정수 수치를 선택합니다. 치명타피해율과 피해 계열은 %p, 체력·공격력·이동력·시간포인트는 고정값이며 최종 결과는 반올림합니다.</p>'
  renderEditorChoices()
}

function handleEditorButton(button:HTMLElement){
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,message=document.querySelector<HTMLDivElement>('#editor-message')!
  if(button.dataset.editorTab){editorKind=button.dataset.editorTab as 'character'|'skill'|'relic';selectedEditorId=currentCollection()[0]?.id??'';editor.dataset.loadedId='';renderEditor()}
  if(button.dataset.editorId){selectedEditorId=button.dataset.editorId;editor.dataset.loadedId='';renderEditor()}
  if(button.id==='load-example'){editor.value=editorKind==='character'?characterExamples.ally:editorKind==='skill'?skillExamples.push:relicExamples.rewoundBandage;editor.dataset.loadedId='';renderEditorChoices()}
  if(button.id==='new-content'){selectedEditorId='';editor.dataset.loadedId='new';editor.value=editorKind==='character'?characterExamples.ally.replaceAll('raon','new_character').replace('여명검 라온','새 캐릭터'):editorKind==='skill'?skillExamples.push.replaceAll('shield_crash','new_skill').replace('방패 충각','새 스킬'):relicExamples.rewoundBandage.replaceAll('rewound_bandage','new_relic').replace('되감긴 붕대','새 유물');renderEditorChoices()}
  if(button.id==='add-effect'){editor.value=`${editor.value.trim()}\n효과: 피해 | 적용: 선택대상 | 대상: 적군 | 수치: 1`;renderEditorChoices()}
  if(button.dataset.removeEffect!==undefined){removeEffectLine(Number(button.dataset.removeEffect));renderEditorChoices()}
  if(button.id==='add-relic-effect'){editor.value=`${editor.value.trim()}\n효과: 공격력 | 발동: 시간대상시 | 시간대: 현재 | 수치: 1`;renderEditorChoices()}
  if(button.dataset.removeRelicEffect!==undefined){removeRelicEffectLine(Number(button.dataset.removeRelicEffect));renderEditorChoices()}
  if(button.id==='save-content')try{const parsed=editorKind==='character'?parseCharacter(editor.value):editorKind==='skill'?parseSkill(editor.value):parseRelic(editor.value);if(editorKind==='character'){const item=parsed as CharacterDefinition,index=content.characters.findIndex(v=>v.id===selectedEditorId||v.id===item.id);if(index>=0)content.characters[index]=item;else content.characters.push(item)}else if(editorKind==='skill'){const item=parsed as SkillDefinition,index=content.skills.findIndex(v=>v.id===selectedEditorId||v.id===item.id);if(index>=0)content.skills[index]=item;else content.skills.push(item)}else{const item=parsed as RelicDefinition,index=content.relics.findIndex(v=>v.id===selectedEditorId||v.id===item.id);if(index>=0)content.relics[index]=item;else content.relics.push(item)}selectedEditorId=parsed.id;persist();editor.dataset.loadedId='';message.textContent='저장했습니다. 편성 반영 버튼으로 새 전투에 적용하세요.';message.classList.remove('error');renderEditor()}catch(error){message.textContent=error instanceof Error?error.message:'문법 오류';message.classList.add('error')}
  if(button.id==='delete-content'&&selectedEditorId){if(editorKind==='character'){content.characters=content.characters.filter(v=>v.id!==selectedEditorId);delete relicLoadouts[selectedEditorId];persistRelicLoadouts()}else if(editorKind==='skill')content.skills=content.skills.filter(v=>v.id!==selectedEditorId);else{content.relics=content.relics.filter(v=>v.id!==selectedEditorId);for(const unitId of Object.keys(relicLoadouts))relicLoadouts[unitId]=relicLoadouts[unitId].filter(id=>id!==selectedEditorId);persistRelicLoadouts();engine.setRelicLoadouts(relicLoadouts)}selectedEditorId=currentCollection()[0]?.id??'';persist();editor.dataset.loadedId='';message.textContent='삭제했습니다.';renderEditor()}
  if(button.id==='apply-roster'){engine.reset(content);engine.setRelicLoadouts(relicLoadouts);scene.input.enabled=true;document.querySelector('#editor-modal')!.classList.add('hidden');mode='이동';scene.setInputMode(mode)}
}

const choiceOptions=(values:string[],selected:string)=>values.map(value=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(value)}</option>`).join('')
function sourceValue(source:string,key:string){const match=source.match(new RegExp(`^${key}:\\s*(.*)$`,'m'));return match?.[1]?.trim()??''}
function replaceSourceLine(key:string,value:string){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,pattern=new RegExp(`^${key}:.*$`,'m');editor.value=pattern.test(editor.value)?editor.value.replace(pattern,`${key}: ${value}`):`${editor.value.trim()}\n${key}: ${value}`}
function readEffectSource(effect:string){const parts=effect.split('|').map(part=>part.trim()),[type,legacyValue='0']=parts[0].split(/\s+/),fields=new Map(parts.slice(1).map(part=>{const i=part.indexOf(':');return[part.slice(0,i).trim(),part.slice(i+1).trim()]}));return{type,scope:fields.get('적용')??'선택대상',team:fields.get('대상')??'적군',value:fields.get(type==='밀치기'||type==='당기기'?'거리':'수치')??legacyValue,environment:fields.get('환경')??'환경_ID'}}
function effectValues(){return [...document.querySelectorAll<HTMLElement>('.effect-row')].map(row=>{const type=row.querySelector<HTMLSelectElement>('[data-effect-type]')!.value,scope=row.querySelector<HTMLSelectElement>('[data-effect-scope]')!.value,selectedTeam=row.querySelector<HTMLSelectElement>('[data-effect-team]')!.value,team=type==='밀치기'||type==='당기기'?'모두':selectedTeam,value=Number(row.querySelector<HTMLInputElement>('[data-effect-value]')!.value)||0,environment=row.querySelector<HTMLInputElement>('[data-effect-environment]')!.value.trim()||'환경_ID';if(type==='설치')return `설치 | 적용: 선택셀 | 환경: ${environment}`;const target=` | 적용: ${scope} | 대상: ${team}`;if(type==='피해')return `피해${target} | 수치: ${value}`;if(type==='밀치기'||type==='당기기')return `${type}${target} | 거리: ${value}`;return `${type}${target}`})}
function replaceEffects(values:string[]){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,without=editor.value.split(/\r?\n/).filter(line=>!/^효과:\s*/.test(line.trim())).join('\n').trim();editor.value=`${without}${values.length?`\n${values.map(value=>`효과: ${value}`).join('\n')}`:''}`}
function removeEffectLine(index:number){const values=effectValues();values.splice(index,1);replaceEffects(values)}
function readRelicEffectSource(effect:string){const legacy=effect.match(/^(최대체력|공격력|이동력|치명타피해율)\s*([+-]?\d+)$/);if(legacy)return{kind:legacy[1],trigger:'항상',time:'전체',value:Number(legacy[2]),threshold:''};const parts=effect.split('|').map(part=>part.trim()),kind=parts[0],fields=new Map(parts.slice(1).map(part=>{const i=part.indexOf(':');return[part.slice(0,i).trim(),part.slice(i+1).trim()]}));return{kind,trigger:fields.get('발동')??'시간대상시',time:fields.get('시간대')??'현재',value:Number(fields.get('수치')??1),threshold:fields.get('체력이하')??''}}
function relicEffectValues(){return [...document.querySelectorAll<HTMLElement>('.relic-effect-row')].map(row=>{const kind=row.querySelector<HTMLSelectElement>('[data-relic-kind]')!.value,trigger=row.querySelector<HTMLSelectElement>('[data-relic-trigger]')!.value,time=row.querySelector<HTMLSelectElement>('[data-relic-time]')!.value,value=Math.round(Number(row.querySelector<HTMLInputElement>('[data-relic-value]')!.value)||0),threshold=Math.round(Number(row.querySelector<HTMLInputElement>('[data-relic-threshold]')!.value)||0);return`${kind} | 발동: ${trigger} | 시간대: ${time} | 수치: ${value}${threshold?` | 체력이하: ${threshold}`:''}`})}
function replaceRelicEffects(values:string[]){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,without=editor.value.split(/\r?\n/).filter(line=>!/^효과:\s*/.test(line.trim())).join('\n').trim();editor.value=`${without}${values.length?`\n${values.map(value=>`효과: ${value}`).join('\n')}`:''}`}
function removeRelicEffectLine(index:number){const values=relicEffectValues();values.splice(index,1);replaceRelicEffects(values)}

function renderEditorChoices(){
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,source=editor.value,host=document.querySelector<HTMLDivElement>('#choice-editor')!
  const select=(label:string,key:string,values:string[])=>`<label><span>${label}</span><select data-source-key="${key}">${choiceOptions(values,sourceValue(source,key))}</select></label>`
  const patterns=['마름모_1','마름모_2','마름모_3','마름모_4','사각형_1','사각형_2','사각형_3','사각형_4','직선_1','직선_2','직선_3','직선_4']
  if(editorKind==='character'){
    const immunity=(sourceValue(source,'상태면역')||'없음').split(',').map(v=>v.trim())
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>선택하면 아래 문법 원문에 자동 반영됩니다.</small></div><div class="choice-grid">${select('진영','진영',['아군','적군'])}${select('캐릭터 타입','타입',['계승자','각성자','기술자'])}${select('AI 유형','AI유형',['공통형','돌격형','방벽형','저격형'])}${select('일반공격 방식','공격방식',['대상','방향'])}${select('공격 범위 패턴','공격범위패턴',patterns)}<label><span>연결 스킬</span><select data-source-key="스킬">${content.skills.map(skill=>`<option value="${esc(skill.id)}" ${skill.id===sourceValue(source,'스킬')?'selected':''}>${esc(skill.name)} · ${esc(skill.id)}</option>`).join('')}</select></label></div><fieldset class="immunity-choice"><legend>상태 면역</legend><label><input type="checkbox" data-immunity="밀치기" ${immunity.includes('밀치기')?'checked':''}>밀치기</label><label><input type="checkbox" data-immunity="당기기" ${immunity.includes('당기기')?'checked':''}>당기기</label><label><input type="checkbox" data-immunity="띄우기" ${immunity.includes('띄우기')?'checked':''}>띄우기</label><label><input type="checkbox" data-immunity="기절" ${immunity.includes('기절')?'checked':''}>기절</label></fieldset>`
  }else if(editorKind==='skill'){
    const effects=source.split(/\r?\n/).filter(line=>/^효과:\s*/.test(line.trim())).map(line=>line.replace(/^효과:\s*/,''));
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>효과는 순서대로 처리됩니다. 밀치기·당기기는 진영 구분 없이 적용됩니다.</small></div><div class="choice-grid">${select('사용 방식','방식',['대상','셀','설치','방향'])}${select('치명타','치명타',['가능','불가'])}${select('범위 패턴','범위패턴',patterns)}${select('영향 셀 패턴','영향셀패턴',['없음',...patterns])}</div><div class="effect-builder"><div class="effect-title"><b>효과 순서</b><button id="add-effect">+ 효과 추가</button></div>${effects.map((effect,index)=>{const item=readEffectSource(effect),noValue=['띄우기','기절','설치'].includes(item.type),forceMove=item.type==='밀치기'||item.type==='당기기',team=forceMove?'모두':item.team;return `<div class="effect-row"><i>${index+1}</i><select data-effect-type aria-label="효과 종류">${choiceOptions(['피해','밀치기','당기기','띄우기','기절','설치'],item.type)}</select><select data-effect-scope aria-label="적용 범위" ${item.type==='설치'?'disabled':''}>${choiceOptions(['선택대상','선택셀','영향셀','자신'],item.type==='설치'?'선택셀':item.scope)}</select><select data-effect-team aria-label="대상 진영" ${item.type==='설치'||forceMove?'disabled':''}>${choiceOptions(['적군','아군','모두'],team)}</select><input data-effect-value aria-label="수치 또는 거리" type="number" min="0" value="${esc(item.value)}" ${noValue?'disabled':''}><input data-effect-environment aria-label="환경 요소 ID" type="text" value="${esc(item.environment)}" ${item.type==='설치'?'':'disabled'}><button data-remove-effect="${index}" aria-label="효과 삭제">×</button></div>`}).join('')}</div>`
  }else{
    const effects=source.split(/\r?\n/).filter(line=>/^효과:\s*/.test(line.trim())).map(line=>line.replace(/^효과:\s*/,''))
    host.innerHTML=`<div class="choice-heading"><b>유물 설정</b><small>시간대와 발동 조건별 효과는 유물을 장착한 캐릭터 자신에게만 적용됩니다.</small></div><div class="choice-grid">${select('유물 등급','등급',['일반','희귀','전설'])}</div><div class="effect-builder relic-effect-builder"><div class="effect-title"><b>유물 효과</b><button id="add-relic-effect">+ 효과 추가</button></div>${effects.map((effect,index)=>{const item=readRelicEffectSource(effect);return `<div class="relic-effect-row"><i>${index+1}</i><select data-relic-kind aria-label="유물 효과 종류">${choiceOptions(['최대체력','공격력','이동력','치명타피해율','체력회복','쿨타임감소','시간포인트','최종피해','받는피해','일반공격피해','스킬피해','첫이동력'],item.kind)}</select><select data-relic-trigger aria-label="발동 조건">${choiceOptions(['항상','시간대상시','시간대진입','유효공격'],item.trigger)}</select><select data-relic-time aria-label="시간대">${choiceOptions(['전체','과거','현재','미래','과거, 현재','과거, 미래','현재, 미래'],item.time)}</select><input data-relic-value aria-label="유물 수치" type="number" step="1" value="${item.value}"><input data-relic-threshold aria-label="체력 이하 퍼센트" type="number" min="0" max="100" placeholder="HP%" value="${item.threshold}"><button data-remove-relic-effect="${index}" aria-label="유물 효과 삭제">×</button></div>`}).join('')}</div>`
  }
}

document.addEventListener('change',event=>{
  const target=event.target as HTMLInputElement|HTMLSelectElement
  if(target.id==='execution-delay'){engine.setPresentationDelay(Number(target.value));localStorage.setItem(SPEED_KEY,String(engine.presentationDelayMs));return}
  if(target.dataset.sourceKey){replaceSourceLine(target.dataset.sourceKey,target.value);renderEditorChoices();return}
  if(target.dataset.immunity){const checked=[...document.querySelectorAll<HTMLInputElement>('[data-immunity]:checked')].map(input=>input.dataset.immunity!);replaceSourceLine('상태면역',checked.length?checked.join(', '):'없음');return}
  if(target.dataset.effectType!==undefined||target.dataset.effectScope!==undefined||target.dataset.effectTeam!==undefined||target.dataset.effectValue!==undefined||target.dataset.effectEnvironment!==undefined){replaceEffects(effectValues());renderEditorChoices()}
  if(target.dataset.relicKind!==undefined||target.dataset.relicTrigger!==undefined||target.dataset.relicTime!==undefined||target.dataset.relicValue!==undefined||target.dataset.relicThreshold!==undefined){replaceRelicEffects(relicEffectValues());renderEditorChoices()}
})

document.addEventListener('input',event=>{
  const target=event.target as HTMLInputElement|HTMLTextAreaElement
  if(target.id==='execution-delay'){document.querySelector('#delay-value')!.textContent=`${target.value} ms`;return}
  if(target.dataset.effectValue!==undefined||target.dataset.effectEnvironment!==undefined){replaceEffects(effectValues());return}
  if(target.dataset.relicValue!==undefined||target.dataset.relicThreshold!==undefined){replaceRelicEffects(relicEffectValues());return}
  if(target.id==='editor')renderEditorChoices()
})

engine.addEventListener('change',render)
engine.addEventListener('shard-gain',event=>showShardCollection((event as CustomEvent<ShardGainEvent>).detail))
engine.addEventListener('time-advance',event=>showTimeAdvance((event as CustomEvent<TimeAdvanceEvent>).detail))

function showTimeAdvance(event:TimeAdvanceEvent){
  if(event.suppressed)return
  window.setTimeout(()=>{
    document.querySelectorAll<HTMLElement>('.mobile-watch,.watch-face').forEach(watch=>{
      watch.classList.remove('time-tick','suppression-impact')
      const hand=watch.querySelector<HTMLElement>('.watch-hand,.hand'),end=event.dialIndex*30,start=((event.dialIndex+11)%12)*30,endSweep=end===0&&start===330?360:end,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
      watch.style.setProperty('--hand-from',`${start}deg`);watch.style.setProperty('--hand-to',`${endSweep}deg`);hand?.getAnimations().forEach(animation=>animation.cancel());hand?.animate([{transform:`translateX(-50%) rotate(${start}deg)`,offset:0},{transform:`translateX(-50%) rotate(${start}deg)`,offset:.1},{transform:`translateX(-50%) rotate(${endSweep+7}deg)`,offset:.54},{transform:`translateX(-50%) rotate(${endSweep-4}deg)`,offset:.69},{transform:`translateX(-50%) rotate(${endSweep+2}deg)`,offset:.82},{transform:`translateX(-50%) rotate(${endSweep}deg)`,offset:1}],{duration:reduced?380:1050,easing:'cubic-bezier(.16,.8,.28,1)'})
      void watch.offsetWidth;watch.classList.add('time-tick');window.setTimeout(()=>watch.classList.remove('time-tick'),1100)
    })
    if(event.from===event.to)return
    const shell=document.querySelector<HTMLElement>('.game-shell');shell?.classList.remove('time-screen-shift');void shell?.offsetWidth;shell?.classList.add('time-screen-shift');window.setTimeout(()=>shell?.classList.remove('time-screen-shift'),1600)
    const announcement=document.querySelector<HTMLElement>('#time-announcement')!,effect=TIME_EFFECTS[event.to]
    announcement.innerHTML=`<b>${event.to}</b><small>${effect.notice}</small>`;announcement.classList.remove('show');void announcement.offsetWidth;announcement.classList.add('show');window.setTimeout(()=>announcement.classList.remove('show'),2000)
  })
}

function showShardCollection(event:ShardGainEvent){
  const board=document.querySelector<HTMLElement>('#game canvas')?.getBoundingClientRect(),watch=document.querySelector<HTMLElement>('.mobile-watch,.watch-face')?.getBoundingClientRect()
  if(!board||!watch)return
  const startX=event.source?board.left+(event.source.x+.5)*board.width/engine.boardSize:board.left+board.width*.5
  const startY=event.source?board.top+(event.source.y+.5)*board.height/engine.boardSize:board.top+board.height*.12
  const endX=watch.left+watch.width*.5,endY=watch.top+watch.height*.5,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
  const count=reduced?1:Math.min(8,Math.max(4,Math.ceil(event.amount/5)))
  const label=document.createElement('div');label.className=`shard-gain-label ${event.reason}`;label.textContent=`+${event.amount} ${event.reason}`;label.style.left=`${startX}px`;label.style.top=`${startY}px`;document.body.append(label)
  label.animate([{opacity:0,transform:'translate(-50%, 6px) scale(.8)'},{opacity:1,transform:'translate(-50%, -14px) scale(1)'},{opacity:0,transform:'translate(-50%, -34px) scale(.9)'}],{duration:reduced?420:900,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.finally(()=>label.remove())
  for(let index=0;index<count;index++){
    const shard=document.createElement('i');shard.className='time-shard-particle';shard.style.left=`${startX}px`;shard.style.top=`${startY}px`;document.body.append(shard)
    const spread=(index-(count-1)/2)*9,fall=22+(index%3)*7,delay=reduced?0:index*34
    shard.animate([{transform:`translate(${spread*.25}px,-8px) rotate(0deg) scale(.4)`,opacity:0},{transform:`translate(${spread}px,${fall}px) rotate(${80+index*29}deg) scale(1)`,opacity:1,offset:.34},{transform:`translate(${(endX-startX)*.58+spread*.35}px,${(endY-startY)*.42+fall}px) rotate(${180+index*35}deg) scale(.8)`,opacity:1,offset:.62},{transform:`translate(${endX-startX}px,${endY-startY}px) rotate(${300+index*42}deg) scale(.08)`,opacity:.15}],{duration:reduced?360:760,delay,easing:'cubic-bezier(.35,.05,.18,1)',fill:'forwards'}).finished.finally(()=>{
      shard.remove();const currentWatch=document.querySelector<HTMLElement>('.watch-face');currentWatch?.classList.remove('collecting');void currentWatch?.offsetWidth;currentWatch?.classList.add('collecting');window.setTimeout(()=>currentWatch?.classList.remove('collecting'),420)
    })
  }
}
render()
