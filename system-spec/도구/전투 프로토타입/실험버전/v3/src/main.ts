import { pause, timeTravelDuration, motionReduced, playCue, toggleSound, soundMuted } from './presentation'
import Phaser from 'phaser'
import './style.css'
import './mobile-card-detail.css'
import './stable-v3-ui.css'
import './presentation.css'
import { characterExamples, relicExamples, seedContent, skillExamples } from './game/content'
import { BattleEngine, SHARD_PER_ENEMY_CRITICAL_ATTACK, SHARD_PER_ENEMY_NORMAL_ATTACK, SHARD_PER_KILL, SHARD_PER_TURN } from './game/engine'
import { parseCharacter, parseRelic, parseSkill } from './game/parser'
import { isPointInPattern } from './game/patterns'
import type { BoardSize, CharacterDefinition, RelicDefinition, RelicLoadouts, SavedContent, ShardGainEvent, SkillDefinition, TimeAdvanceEvent, TimeManipulation, TimePeriod, Unit } from './game/types'
import { BattleScene, type InputMode, type PlanViewMode } from './phaser/BattleScene'
import { CHARACTER_TEXTURES } from './phaser/characterAssets'

const MOBILE_DESIGN_WIDTH=1920
const MOBILE_DESIGN_HEIGHT=1080
type DisplayMode='pc'|'mobile'
let selectedDisplayMode:DisplayMode='pc'
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

const SAVE_KEY='waredo-battle-content-v3-counter'
const SPEED_KEY='waredo-presentation-delay-v1'
const RELIC_LOADOUT_KEY='waredo-time-relic-bag-v3'
const LEGACY_EQUIPPED_RELIC_KEY='waredo-equipped-relics-v1'
const BOARD_SIZE_KEY='waredo-board-size-v1'
const HIGHLAND_BACKGROUND_URL='/assets/environment/highland-final-web.png'
const MAIN_BACKGROUND_URL='/assets/ui/main.png'
const MAIN_LOGO_URL='/assets/ui/logo.png'
const RELIC_ICON_URLS:Record<string,string>={chantier_contract:'/assets/relics/chantier-contract.png',northern_worn_bible:'/assets/relics/northern-bible.png',red_hood:'/assets/relics/red-hood.png',maid_ceremonial_gloves:'/assets/relics/maid-gloves.png',broken_metal_fragment:'/assets/relics/broken-metal.png',blue_daenggi:'/assets/relics/blue-daenggi.png'}
const RESULT_PREVIEW_QUERY=new URLSearchParams(location.search).get('previewResult')
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const relicIconMarkup=(id:string)=>RELIC_ICON_URLS[id]?`<img class="relic-icon" src="${RELIC_ICON_URLS[id]}" alt="">`:'<i></i>'
function loadContent():SavedContent{try{
  const raw=localStorage.getItem(SAVE_KEY);if(!raw)return structuredClone(seedContent)
  const parsed=JSON.parse(raw) as SavedContent;if(!Array.isArray(parsed.characters)||!Array.isArray(parsed.skills))throw new Error()
  const characters=parsed.characters.map(character=>parseCharacter(character.source))
  const skills=parsed.skills.map(skill=>parseSkill(skill.source))
  const relics=structuredClone(seedContent.relics)
  for(const seed of seedContent.characters){const index=characters.findIndex(item=>item.id===seed.id);if(index>=0)characters[index]=structuredClone(seed);else characters.push(structuredClone(seed))}
  for(const seed of seedContent.skills){const index=skills.findIndex(item=>item.id===seed.id);if(index>=0)skills[index]=structuredClone(seed);else skills.push(structuredClone(seed))}
  for(const seed of seedContent.relics)if(!relics.some(item=>item.id===seed.id))relics.push(structuredClone(seed))
  return{characters,skills,relics}
}catch{return structuredClone(seedContent)}}

type TutorialTopic='skill'|'parameter'|'time'|'combat'
type FrontScreen='main'|'size'|'coin'|'result'|'none'
type MainInfo='characters'|'game'|undefined
const loadBoardSize=():BoardSize=>6
let content=loadContent(),mode:InputMode='이동',editorKind:'character'|'skill'|'relic'='character',selectedEditorId=content.characters[0]?.id??'',tutorialTopic:TutorialTopic|undefined,reorderMode=false,reorderSlot: number|undefined,showSkillDetail=false,previousPhase:string='배치',settingsOpen=false,pendingBoardSize:BoardSize=loadBoardSize(),resultPreviewOutcome:'victory'|'defeat'|undefined=RESULT_PREVIEW_QUERY?.includes('defeat')?'defeat':RESULT_PREVIEW_QUERY?'victory':undefined,frontScreen:FrontScreen=resultPreviewOutcome?'result':'main',mainInfo:MainInfo,coinRevealed=false,secretPauseClicks=0,relicSetupComplete=false,selectedRelicId:string|undefined
let coinRevealTimer:number|undefined,coinFinishTimer:number|undefined
const confirmedActions=new Set<string>()
const revealedEnemySlots=new Set<number>()
let timePresentationBusy=false
let timePresentationTask:Promise<void>=Promise.resolve()
let skipEnemyPreview=false
let previewSpeed=1
let resultPending=false
const battleStats={damage:0,critical:0,counter:0,ultimate:0,kills:0}
let enemyPlanRevealComplete=false
let actionDraft:{unitId:string}|undefined
let reorderHoldTimer:number|undefined,reorderDragging=false,suppressNextSlotClick=false
function loadRelicLoadouts():RelicLoadouts{try{localStorage.removeItem(LEGACY_EQUIPPED_RELIC_KEY);const parsed=JSON.parse(localStorage.getItem(RELIC_LOADOUT_KEY)??'{}') as RelicLoadouts,valid=new Set(content.relics.map(relic=>relic.id)),used=new Set<string>(),clean=(items:unknown)=>Array.isArray(items)?items.slice(0,4).map(id=>typeof id==='string'&&valid.has(id)&&!used.has(id)?(used.add(id),id):''):[];return{과거:clean(parsed.과거),현재:clean(parsed.현재),미래:clean(parsed.미래)}}catch{return{과거:[],현재:[],미래:[]}}}
let relicLoadouts=loadRelicLoadouts()
const engine=new BattleEngine(content,relicLoadouts,pendingBoardSize),scene=new BattleScene(engine,()=>render(),repeat=>{if(repeat)confirmSelectedAction();else render()},unitId=>confirmedActions.has(unitId))
engine.setPresentationDelay(Number(localStorage.getItem(SPEED_KEY)??360))

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<main class="game-shell" data-time="현재">
  <img class="battle-background" src="${HIGHLAND_BACKGROUND_URL}" alt="" aria-hidden="true">
  <header class="game-header">
    <div class="title"><h1>쿼리도 슈팅</h1><p id="board-size-subtitle">6×6 시간 전술 전투</p></div>
    <div class="header-actions"><div class="phase-badge" id="phase-badge"></div><div class="system-buttons"><button id="open-settings" aria-label="설정">⚙</button><button id="secret-pause" aria-label="일시정지">Ⅱ</button></div></div>
  </header>
  <section class="timeline-wrap" id="timeline-wrap"><button id="toggle-reorder" class="reorder-toggle">행동 순서 변경</button><div class="timeline" id="timeline"></div></section>
  <section class="battle-layout">
    <aside class="left-rail" id="left-rail"></aside>
    <div class="board-column">
      <div class="board-tools"><div class="visual-legend" aria-label="전투판 표시 범례"><span class="legend ally">선택 아군 계획</span><span class="legend enemy-move">고정 적 이동</span><span class="legend enemy">고정 적 공격</span><span class="legend broken">곡사 착탄</span><span class="legend push">밀치기</span><span class="legend pull">반격</span></div><div class="view-switch"><span>적 예고는 결과를 미리 계산하지 않습니다.</span></div></div>
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
      <div class="settings-body pause-menu"><p>화면과 소리를 설정하거나 전투를 다시 시작할 수 있습니다.</p><button id="toggle-sound">${soundMuted()?'소리 꺼짐':'소리 켜짐'}</button><button id="settings-fullscreen"><strong>전체화면 시작</strong><span>브라우저 UI를 숨기고 게임 화면에 맞춰 표시</span></button><button id="restart-battle"><strong>다시 시작</strong><span>현재 말판 크기로 아군 선공 배치부터 다시 진행</span></button><button id="settings-main"><strong>메인 화면으로</strong><span>현재 전투를 종료하고 메인 화면으로 이동</span></button></div>
    </section>
  </div>
  <div class="time-control-modal hidden" id="time-control-modal">
    <section class="time-control-card" role="dialog" aria-modal="true" aria-labelledby="time-control-title">
      <header><div><small>TIME MANIPULATION</small><h2 id="time-control-title">시간 조작</h2></div><button id="close-time-control" aria-label="시간 조작 닫기">×</button></header>
      <div id="time-control-content"></div>
    </section>
  </div>
  <div class="front-flow" id="front-flow"></div>
</main><div class="rotate-device" role="status"><div><span>↻</span><b>기기를 가로로 돌려주세요</b><small>전투 UI는 가로 화면에서 동일한 비율로 표시됩니다.</small></div></div>`

const editorModal=document.querySelector<HTMLDivElement>('#editor-modal')!
const settingsModal=document.querySelector<HTMLDivElement>('#settings-modal')!
const timeControlModal=document.querySelector<HTMLDivElement>('#time-control-modal')!
for(const eventName of ['pointerdown','pointerup','pointermove','wheel']){
  editorModal.addEventListener(eventName,event=>event.stopPropagation())
  settingsModal.addEventListener(eventName,event=>event.stopPropagation())
  timeControlModal.querySelector('.time-control-card')!.addEventListener(eventName,event=>event.stopPropagation())
}

new Phaser.Game({type:Phaser.AUTO,width:1920,height:1080,parent:'game',transparent:true,scene,render:{antialias:true,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}})

function render(){
  const state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  const enteredPlanning=state.phase==='계획'&&previousPhase!=='계획'
  if((state.phase==='승리'||state.phase==='패배')&&frontScreen==='none'&&!resultPending){
    resultPending=true;scene.input.enabled=false
    window.setTimeout(()=>{resultPending=false;if(engine.state.phase==='승리'||engine.state.phase==='패배'){frontScreen='result';playCue(engine.state.phase==='승리'?'win':'lose');render()}},750)
  }
  if(state.phase==='계획'&&!unit&&scene.getThreatFocus()===undefined)showSkillDetail=false
  if(enteredPlanning){confirmedActions.clear();revealedEnemySlots.clear();enemyPlanRevealComplete=false;actionDraft=undefined;reorderMode=false;reorderSlot=undefined;mode='이동';scene.setInputMode(mode)}
  if(state.phase!=='계획'){actionDraft=undefined;reorderMode=false;reorderSlot=undefined}
  previousPhase=state.phase
  const shell=document.querySelector<HTMLElement>('.game-shell')!,pathEnd=slot?.plan.path.at(-1),displayTime=timePresentationBusy?(document.querySelector<HTMLElement>('.game-shell')?.dataset.time??state.currentTime):state.currentTime,relicSelecting=state.phase==='배치'&&frontScreen==='none'&&!relicSetupComplete;shell.dataset.time=displayTime;shell.dataset.phase=state.phase;shell.dataset.boardSize=String(state.boardSize);shell.dataset.pathLength=String(slot?.plan.path.length??0);shell.dataset.pathEnd=pathEnd?`${pathEnd.x},${pathEnd.y}`:'';shell.classList.toggle('reorder-mode',reorderMode);shell.classList.toggle('shards-full',state.shards>=state.maxShards);shell.classList.toggle('targeting-focus',state.phase==='계획'&&mode!=='이동'&&unit?.team==='아군'&&scene.getThreatFocus()===undefined);shell.classList.toggle('relic-selecting',relicSelecting)
  if(state.phase==='배치'&&frontScreen==='none'&&scene.input)scene.input.enabled=!relicSelecting
  document.querySelector<HTMLElement>('#board-size-subtitle')!.textContent=`${state.boardSize}×${state.boardSize} 시간 전술 전투`;document.querySelector<HTMLElement>('#game')!.setAttribute('aria-label',`쿼리도 슈팅 ${state.boardSize}×${state.boardSize} 전투판`)
  document.querySelector<HTMLDivElement>('#phase-badge')!.innerHTML=`<b>${state.phase}</b><span>${state.phase==='배치'?`${state.boardSize}×${state.boardSize} · 출전 위치 결정`:`${state.round}턴 · ${state.firstTeam} 선공`}</span>`
  renderTimeline();renderLeftRail();renderRightRail();renderBoardTools();renderMobileHud();renderDeploymentDock();renderSettings();renderFrontFlow();renderTimeControl()
  const error=state.phase==='계획'?planValidationError():''
  const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId)
  const threatFocus=scene.getThreatFocus(),focusedThreat=engine.getEnemyThreatPredictions().find(threat=>threat.slotIndex===threatFocus),view=scene.getPlanView()
  document.querySelector<HTMLDivElement>('#battle-message')!.innerHTML=state.phase==='배치'?'<b>초기 배치</b> 캐릭터를 선택하고 각 진영의 빛나는 영역에 배치하세요.':state.phase==='계획'?focusedThreat?`<b>#${focusedThreat.slotNumber} 적 예고</b> ${esc(focusedThreat.actorName)} · ${esc(focusedThreat.actionName)}`:view==='summary'?'<b>고정 적 행동 예고</b> 적의 이동·공격 의도만 표시하며 결과는 계산하지 않습니다.':`<b>${slot?.number??'-'}번 계획</b> ${unit?esc(unit.name):''} · ${error?`<span class="warn">${esc(error)}</span>`:'모든 계획이 실행 가능합니다.'}`:state.phase==='실행'?`<b>${liveSlot?.number??'-'}번 실행</b> ${liveUnit?esc(liveUnit.name):'행동 준비'} · ${esc(liveSlot?.plan.action.kind??'대기')}`:`<b>${state.phase}</b> 전투가 종료되었습니다.`
  if(state.phase==='계획'&&unit&&skill)void 0
  if(timePresentationBusy)scene.input.enabled=false
  if(enteredPlanning)void revealEnemyPlans()
}

async function revealEnemyPlans(){
  await timePresentationTask
  if(engine.state.phase!=='계획')return
  scene.input.enabled=false;skipEnemyPreview=false
  const controls=document.createElement('div');controls.className='enemy-preview-controls'
  controls.innerHTML='<span>적 행동 예고</span><button data-preview-speed>빠르게 보기</button><button data-preview-skip>건너뛰기</button>'
  document.querySelector('.game-shell')?.append(controls)
  try{
    for(const [index,slot] of engine.state.slots.entries()){
      if(slot.team!=='적군'||engine.state.phase!=='계획')continue
      revealedEnemySlots.add(index)
      if(skipEnemyPreview)continue
      scene.focusThreat(index);render();scene.setPreviewSpeed(previewSpeed)
      await scene.previewEnemyAction(index)
      if(!skipEnemyPreview)await pause(100/previewSpeed)
    }
  }finally{
    controls.remove()
    if(engine.state.phase==='계획'){enemyPlanRevealComplete=true;scene.clearThreatFocus();scene.setPlanView('all');scene.input.enabled=!timePresentationBusy;render()}
  }
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
  isaac:{role:'자기 중심 제어형',play:'높은 체력으로 앞선을 잡고, 지진으로 자기 중심 3×3의 적에게 피해 5와 띄워짐을 적용합니다.',caution:'지진은 아군에게 피해를 주지 않으며 치명타가 발생하지 않습니다.'},
  angelica:{role:'후열 단일 화력형',play:'긴 사거리의 기본 공격과 치명타가 가능한 저격으로 위험한 적 하나를 멀리서 제거합니다.',caution:'체력이 가장 낮습니다. 적 이동 발자국과 공격 예고선을 읽고 안전한 최종 위치를 먼저 확보하세요.'},
  mercan:{role:'반격 전열형',play:'복수로 반격 상태에 진입한 뒤 자기 중심 3×3에서 행동하거나 진입하는 적을 일반공격 피해로 한 번씩 공격합니다.',caution:'기절·띄워짐 상태에서는 반격하지 않으며 대상별로 한 턴에 한 번만 발동합니다.'}
}
const mainEffectText=(skill:SkillDefinition)=>skill.effects.map(effect=>{const value=effect.type==='피해'?` ${effect.value}`:['밀치기','당기기'].includes(effect.type)?` ${effect.value}칸`:'';const target=effect.targetTeam==='모두'?'아군·적군':effect.targetTeam;return `${effect.type}${value} (${target})`}).join(' · ')
function mainCharacterGuide(){
  return content.characters.filter(character=>character.team==='아군').map(character=>{const skill=content.skills.find(item=>item.id===character.skillId),guide=MAIN_CHARACTER_GUIDE[character.id]??{role:'전술 캐릭터',play:'이동과 공격을 조합해 적의 예정 행동에 대응합니다.',caution:'적 예고와 시전 범위를 함께 확인하세요.'};return `<article class="main-character-card">${unitPortraitMarkup({...character,hp:character.maxHp,position:{x:0,y:0},statuses:[],cooldownRemaining:0})}<div class="character-copy"><header><span><b>${esc(character.name)}</b><small>${character.timeTag?`${esc(character.timeTag)} 태그`:'태그 없음'} · ${esc(guide.role)}</small></span><em>HP ${character.maxHp} · 공격 ${character.attackPower} · 이동 ${character.moveRange} · 치명타 피해 ${character.criticalRate}%</em></header><section><strong>기본 공격 · ${esc(character.normalAttack.name)}</strong><p>${targetingLabel(character.normalAttack.targeting)} · 사거리 ${character.normalAttack.range} · 범위 ${esc(character.normalAttack.rangePatternId)} · 피해 ${character.attackPower}</p></section>${skill?`<section class="skill"><strong>스킬 · ${esc(skill.name)}</strong><p>${esc(skill.description)}</p><p>${targetingLabel(skill.targeting)} · 사거리 ${skill.range} · 범위 ${esc(skill.rangePatternId)} · 쿨타임 ${skill.cooldown}턴 · 치명타 ${skill.canCritical?'가능':'불가'}</p><p>${esc(mainEffectText(skill))}</p></section>`:''}<p class="character-play"><b>운용</b> ${esc(guide.play)}</p><p class="character-caution"><b>주의</b> ${esc(guide.caution)}</p></div></article>`}).join('')
}

function mainGameGuide(){return `<section class="guide-intro"><b>시간 전술 전투</b><p>적의 예고를 읽고 아군의 순서와 위치를 설계하세요.</p></section><div class="guide-sections system-guide">
<article><div><b>준비와 배치</b><p>유물을 시간대별 가방에 배치한 뒤 6×6 전장에 아군을 배치합니다. 첫 선공은 아군이며 이후 라운드마다 선공을 교대합니다.</p></div></article>
<article><div><b>계획과 확정</b><p>캐릭터 선택 → 이동 경로 지정 → 공격 또는 스킬 선택 → 범위 지정 → 확정. 취소 버튼이나 Esc로 범위 선택을 종료할 수 있습니다. 상단 아군 카드를 1초 누르고 다른 아군 카드에 놓으면 순서를 교환합니다.</p></div></article>
<article><div><b>적의 예고</b><p>턴 시작에 적 행동을 순서대로 보여줍니다. 빠르게 보기·건너뛰기를 사용할 수 있고, 적을 클릭하면 해당 적의 계획을 확인합니다.</p></div></article>
<article><div><b>상태와 연계</b><p>띄워진 적을 공격하면 치명타가 발생합니다. 이동 중 충돌하거나 반격으로 기절하면 후속 행동이 취소될 수 있습니다.</p></div></article>
<article><div><b>시간 파편과 시간 이동</b><p>현재에서만 적 일반 공격(+10), 적 치명타 공격(+30), 사살(+30), 턴 종료(+10)로 파편을 얻습니다. 100이 되면 계획 단계에서 과거 또는 미래 버튼을 누르는 즉시 이동하며 100을 소모합니다. 과거는 아군 이동 +1, 미래는 아군 일반 공격 +3입니다. 해당 시간대 태그 캐릭터의 스킬은 궁극기로 바뀌고 2턴 뒤 현재로 돌아옵니다.</p></div></article>
<article><div><b>태그와 궁극기</b><p>아이작·안젤리카는 과거, 메르칸은 미래 태그입니다. 해당 시간대에서는 스킬이 궁극기로 바뀝니다. 아이작은 5×5 띄우기, 안젤리카는 관통·기절, 메르칸은 반격 즉시 기절을 사용합니다. 유물은 넣은 시간대에서만 모든 아군에게 적용됩니다.</p></div></article></div>`}

function focusedMainGameGuide(){return mainGameGuide().replace(/<section class="guide-intro">[\s\S]*?<\/section>/,`<section class="guide-intro"><div class="guide-intro-title"><small>MISSION GUIDE</small><b>이 전투에서 해보세요</b><p>적의 예고를 읽고 아군의 순서·위치·시간대를 조합해 유리한 한 턴을 만들어 보세요.</p></div><div class="guide-challenges"><article><i>01</i><div><b>상태 연계 만들기</b><p>아이작으로 적을 띄운 뒤 안젤리카가 공격하도록 순서를 맞춰 보세요.</p></div></article><article><i>02</i><div><b>시간 파편 100 모으기</b><p>적 공격·사살·턴 종료로 파편을 채우고, 계획 단계에서 과거나 미래로 즉시 이동해 보세요.</p></div></article><article><i>03</i><div><b>시간대 궁극기 사용하기</b><p>현재 시간대와 일치하는 과거·미래 태그 캐릭터의 스킬이 궁극기로 바뀝니다.</p></div></article></div></section><div class="guide-detail-heading"><small>SYSTEM MANUAL</small><b>시스템별 세부 설명</b><p>필요한 규칙은 제목별로 확인하세요.</p></div>`) }

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
    flow.innerHTML=`<img class="front-background" src="${MAIN_BACKGROUND_URL}" alt=""><section class="front-result-card ${victory?'victory':'defeat'}"><small>BATTLE COMPLETE</small><h2>게임 종료</h2><div class="battle-result-stats"><span>피해 ${battleStats.damage}</span><span>치명타 ${battleStats.critical}</span><span>반격 ${battleStats.counter}</span><span>궁극기 ${battleStats.ultimate}</span></div><strong>${victory?'승리':'패배'}</strong><p>${victory?'모든 적을 전투 불능으로 만들었습니다.':'모든 아군이 전투 불능이 되었습니다.'}</p><div><button id="result-restart" class="primary"><b>다시 시작</b><span>${engine.boardSize}×${engine.boardSize} 전장으로 다시 도전</span></button><button id="result-main"><b>메인 메뉴</b><span>게임 시작 화면으로 돌아가기</span></button></div></section>`;return
  }
  if(frontScreen==='size'){beginCoinFlow(6);return}
  flow.innerHTML=`<section class="front-dialog coin-toss ${coinRevealed?'revealed':''} ally"><small>FIRST MOVE</small><h2>${coinRevealed?'아군 선공':'전투 순서를 준비합니다'}</h2><div class="coin"><i>Q</i><i>W</i></div><p>${coinRevealed?'<b class="ally">플레이어 선공</b><span>배치 화면으로 이동합니다.</span>':'첫 행동은 항상 플레이어가 시작하고 이후 행동은 순서대로 진행됩니다.'}</p></section>`
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

function relicSummary(period:TimePeriod){
  const groups=new Map<string,Map<string,number>>()
  const labels:Record<string,string>={항상:'상시',시간대상시:'상시',시간대진입:'시간대 진입',턴시작:'턴 시작',유효공격:'공격 적중 시'}
  for(const id of relicLoadouts[period]??[]){
    const relic=content.relics.find(item=>item.id===id)
    for(const effect of relic?.effects??[]){
      const label=labels[effect.trigger]??effect.trigger
      if(!groups.has(label))groups.set(label,new Map())
      const totals=groups.get(label)!
      totals.set(effect.kind,(totals.get(effect.kind)??0)+effect.value)
    }
  }
  return ['상시','시간대 진입','턴 시작','공격 적중 시'].filter(label=>groups.has(label)).map(label=>
    `<span class="relic-effect-group"><b>${esc(label)}</b>${[...groups.get(label)!].map(([kind,value])=>`<span>${esc(kind)} ${value>0?'+':''}${value}${kind==='치명타피해율'?'%p':''}</span>`).join('')}</span>`
  ).join('')||'장착 효과 없음'
}
function renderDeploymentDock(){
  const dock=document.querySelector<HTMLElement>('#deployment-dock')!,state=engine.state
  if(state.phase!=='배치'||frontScreen!=='none'){dock.classList.add('hidden');dock.innerHTML='';return}
  if(!relicSetupComplete){
    const periods:TimePeriod[]=['과거','현재','미래'],used=new Set(Object.values(relicLoadouts).flat())
    dock.classList.remove('hidden');dock.classList.add('relic-setup')
    const selectedRelic=content.relics.find(relic=>relic.id===selectedRelicId)
    const equippedPeriod=periods.find(period=>(relicLoadouts[period]??[]).includes(selectedRelicId??'__none__'))
    dock.innerHTML=`<div class="relic-setup-heading"><b>시간의 유물 가방</b><span>유물을 끌어 원하는 시간대에 배치하세요.</span></div>
      <aside class="relic-inspector" aria-live="polite"><small>유물 정보</small>${selectedRelic?`<div class="relic-inspector-icon">${relicIconMarkup(selectedRelic.id)}</div><h3>${esc(selectedRelic.name)}</h3><p>${esc(selectedRelic.description)}</p><div class="relic-location">${equippedPeriod?`${equippedPeriod}에 장착됨`:'보유 중'}</div><small>장착한 시간대에서 모든 아군에게 효과가 적용됩니다.</small>${equippedPeriod?'<button id="unequip-selected-relic">보유 유물로 되돌리기</button>':''}`:'<div class="relic-inspector-empty">유물을 클릭하면<br>이곳에 정보가 표시됩니다.</div>'}</aside>
      <div class="time-relic-bag">${periods.map(period=>`<section class="time-bag-column period-${period}"><header><b>${period}</b><small>${(relicLoadouts[period]??[]).filter(Boolean).length}/4</small></header><div>${Array.from({length:4},(_,index)=>{const id=(relicLoadouts[period]??[])[index],relic=content.relics.find(item=>item.id===id);return `<button data-relic-period="${period}" data-relic-slot="${index}" ${relic?`data-relic-id="${esc(relic.id)}" draggable="true"`:''} class="time-relic-slot ${relic?'filled':'empty'} ${relic&&selectedRelicId===id?'selected':''}" aria-label="${period} ${index+1}번 칸 · ${relic?esc(relic.name):'빈칸'}" title="${relic?esc(relic.name):'유물을 여기에 놓으세요'}">${relic?relicIconMarkup(relic.id):''}</button>`}).join('')}</div><p class="time-relic-summary">${relicSummary(period)}</p></section>`).join('')}</div>
      <div class="relic-pool-wrap" data-relic-return><header><b>보유 유물</b><small>클릭: 정보 확인 · 드래그: 장착 / 이동 · 이곳에 놓기: 해제</small></header><div class="relic-pool">${content.relics.map(relic=>used.has(relic.id)?'<span class="relic-pool-empty" aria-hidden="true"></span>':`<button data-select-relic="${esc(relic.id)}" data-relic-id="${esc(relic.id)}" draggable="true" class="relic-orb-card ${selectedRelicId===relic.id?'selected':''}" title="${esc(relic.name)}" aria-label="${esc(relic.name)}">${relicIconMarkup(relic.id)}</button>`).join('')}</div></div>
      <footer class="relic-setup-footer"><small>과거 · 현재 · 미래 각 4칸</small><button id="confirm-relic-setup" class="confirm-relic-setup">유물 배치 완료</button></footer>`
    return
  }
  dock.classList.remove('relic-setup')
  const allies=state.units.filter(unit=>unit.team==='아군'),selected=allies.find(unit=>unit.id===state.selectedDeployUnitId)??allies[0],placedCount=allies.filter(unit=>state.deployedAllyIds.includes(unit.id)).length,canConfirm=engine.canConfirmDeployment()
  dock.classList.remove('hidden');dock.innerHTML=`<div class="deployment-heading"><small>ALLY DEPLOYMENT · ${state.boardSize}×${state.boardSize}</small><b>파란 구역에 아군을 배치하세요</b><span><button id="back-relic-setup">← 유물 가방</button> 아군 카드를 고르고 파란 셀을 누르세요.</span></div><div class="deployment-roster">${allies.map(unit=>{const placed=state.deployedAllyIds.includes(unit.id);return `<button data-deploy-unit="${esc(unit.id)}" class="${unit.id===selected?.id?'active ':''}${placed?'placed':'unplaced'}">${unitPortraitMarkup(unit)}<span><b>${esc(unit.name)}</b><small>${placed?'배치 완료':'배치 대기'} · ${unit.timeTag?`${unit.timeTag} 태그`:'태그 없음'} · HP ${unit.maxHp}</small></span></button>`}).join('')}</div><div class="deployment-confirm"><span><b>${state.firstTeam} 선공 · ${placedCount}/${allies.length} 배치</b><small>${canConfirm?'전원이 배치되었습니다.':'아군 전원을 배치하세요.'}</small></span><button id="start-battle" ${canConfirm?'':'disabled'}>배치 확정</button></div>`
}

function renderTimeline(){
  const wrap=document.querySelector<HTMLDivElement>('#timeline-wrap')!,timeline=document.querySelector<HTMLDivElement>('#timeline')!
  wrap.classList.toggle('hidden',engine.state.phase==='배치')
  const reorderButton=wrap.querySelector<HTMLButtonElement>('#toggle-reorder');if(reorderButton){reorderButton.classList.toggle('active',reorderMode);reorderButton.textContent=reorderMode?'순서 변경 중':'캐릭터 행동 순서 변경';reorderButton.disabled=engine.state.phase!=='계획'}
  timeline.innerHTML=engine.state.slots.map((slot,index)=>{const unit=engine.state.units.find(u=>u.id===slot.unitId),actionName=slot.plan.action.kind==='없음'?'대기':slot.plan.action.kind,resolved=engine.state.phase==='실행'&&slot.result&&slot.result!=='대기'?slot.result:actionName,asset=unit?CHARACTER_TEXTURES[unit.id]:undefined,statuses=unit?.statuses??[],statusIcon=statuses[0]?.type==='기절'?'✦':statuses[0]?.type==='띄워짐'?'↑':statuses[0]?.type==='반격'?'↯':'',selected=reorderMode&&reorderSlot===index,swappable=reorderMode&&slot.team==='아군'&&!selected,locked=reorderMode&&slot.team==='적군',dead=Boolean(unit&&unit.hp<=0),executing=engine.state.executingSlot===index,planned=slot.team==='적군'?revealedEnemySlots.has(index):confirmedActions.has(slot.unitId);return `<button data-slot="${index}" class="slot ${slot.team==='아군'?'ally':'enemy'} ${planned?'planned':''} ${selected?'order-selected':''} ${swappable?'swappable':''} ${locked?'order-locked':''} ${dead?'dead':''} ${executing?'executing':''}" aria-label="${esc(unit?.name??'')} ${slot.number}번째 행동"><i>${slot.number}</i><span class="slot-sd" ${slot.team==='적군'?`data-enemy-preview="${index}" title="행동 가상 재생"`:''}>${asset?`<img src="${asset.url}" alt="">`:esc(unit?.name.slice(-1)??'?')}</span><strong>${esc(unit?.name??'?')}</strong><small>${esc(resolved)}</small>${statuses.length?`<em>${statusIcon}${statuses.length>1?` +${statuses.length-1}`:''}</em>`:''}</button>`}).join('')
}

function inspectedUnit(){
  const threatSlot=scene.getThreatFocus(),threatUnit=threatSlot===undefined?undefined:engine.state.units.find(unit=>unit.id===engine.state.slots[threatSlot]?.unitId)
  return threatUnit??engine.selectedUnit
}

function unitPortraitMarkup(unit:Unit,className=''){
  const asset=CHARACTER_TEXTURES[unit.id]
  return asset?`<img class="${className}" src="${asset.url}" alt="${esc(unit.name)}">`:`<span class="portrait ${className}" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span>`
}

const timeHandAngle=(_period:TimePeriod)=>0
const remainingTimeTurns=(period:TimePeriod,progress:number)=>period==='현재'?'':String(Math.max(1,3-progress))
const remainingTimeLabel=(period:TimePeriod,progress:number)=>period==='현재'?'현재 시간대':`${period}에서 ${remainingTimeTurns(period,progress)}턴 남음`

function renderTimeControl(){
  const state=engine.state,host=document.querySelector<HTMLElement>('#time-control-content')!,canUse=engine.canManipulateTime()
  host.innerHTML=`<div class="time-control-stage"><div class="grand-watch period-${state.currentTime} ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg;--actual-angle:0deg"><span class="grand-watch-crown"></span><span class="time-charge-ring ${state.shards>0?'charged':''}" aria-hidden="true"></span><i class="grand-hand actual"></i><span class="magic-aura" aria-hidden="true"></span></div><div class="time-control-status"><strong>시간 파편 ${state.shards}/${state.maxShards}</strong><span>${state.currentTime==='현재'?'변경 버튼을 누르면 즉시 시간대 전환':remainingTimeLabel(state.currentTime,state.timeCycleProgress)}</span></div></div><div class="time-control-actions time-period-actions"><button data-time-manipulation="과거" ${canUse?'':'disabled'}><b>과거로 이동</b><span>2턴 · 아군 이동력 +1 · 과거 태그 궁극기</span></button><button data-time-manipulation="미래" ${canUse?'':'disabled'}><b>미래로 이동</b><span>2턴 · 아군 일반 공격력 +3 · 미래 태그 궁극기</span></button></div><footer><span>${state.currentTime!=='현재'?'현재 시간대로 복귀한 뒤 다시 변경할 수 있습니다.':canUse?'버튼을 누르는 순간 파편 100을 소모하고 적용됩니다.':'시간 파편 100이 필요합니다.'}</span><button id="close-time-control">닫기</button></footer>`
}

const effectiveDamageMarkup=(value:number,base:number,forced=false)=>`<b class="effective-damage ${forced||value!==base?'boosted':''}">${value}</b>`
const skillDamageMarkup=(unit:Unit,skill:SkillDefinition)=>{const effects=skill.effects.filter(effect=>effect.type==='피해'),favored=engine.getTimeStatBonuses(unit).stacks>0;return effects.length?effects.map(effect=>effectiveDamageMarkup(engine.getActionDamagePreview(unit,'스킬',effect.value),effect.value,favored)).join(' / '):'직접 피해 없음'}

function selectedActionPreviewReady(){
  const unit=engine.selectedUnit,action=engine.selectedPlan?.action
  if(!unit||unit.team!=='아군'||!action||action.kind==='없음')return false
  const definition=action.kind==='일반공격'?unit.normalAttack:engine.getSkill(unit)
  if(!definition)return false
  if(definition.targeting==='자기 기준형'||definition.targeting==='자가 버프형')return Boolean(action.selfTargetCell)
  return definition.trajectory==='곡사'?Boolean(action.relativeTarget):Boolean(action.direction)
}

function planValidationError(){
  const structural=engine.validatePlans();if(structural)return structural
  const pending=engine.state.slots.find(slot=>slot.team==='아군'&&slot.plan.action.kind!=='없음'&&!confirmedActions.has(slot.unitId))
  if(!pending)return''
  const unit=engine.state.units.find(candidate=>candidate.id===pending.unitId)
  return `${pending.number}번 ${unit?.name??'아군'} 행동을 확정하세요.`
}

function renderMobileHud(){
  const state=engine.state,unit=inspectedUnit(),threatFocused=scene.getThreatFocus()!==undefined,selected=threatFocused?undefined:engine.selectedUnit,slot=threatFocused?undefined:engine.selectedActionSlot,skill=selected?engine.getSkill(selected):undefined,planning=state.phase==='계획',allyPlanning=planning&&selected?.team==='아군'&&slot?.team==='아군'
  const timeChoiceReady=planning&&enemyPlanRevealComplete&&engine.canManipulateTime()
  const timeDock=document.querySelector<HTMLElement>('#mobile-time-dock')!
  timeDock.innerHTML=`<div class="pocket-watch-wrap"><div class="mobile-watch period-${state.currentTime} ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg;--hand-angle:${timeHandAngle(state.currentTime)}deg"><span class="watch-crown"></span><span class="watch-chain"></span><span class="time-charge-ring ${state.shards>0?'charged':''}" aria-hidden="true"></span><i class="watch-hand"></i><span class="watch-time-callout" aria-live="polite"></span></div></div>${timeChoiceReady?'<div class="time-choice-drawer" role="group" aria-label="시간 이동 선택"><button class="past" data-quick-time="과거"><b>과거로 회귀</b></button><button class="future" data-quick-time="미래"><b>미래로 도약</b></button></div>':''}<small class="time-shard-count">시간 파편 ${state.shards}/${state.maxShards}</small><small class="time-period-remaining">${remainingTimeLabel(state.currentTime,state.timeCycleProgress)}</small>`
  const unitDock=document.querySelector<HTMLElement>('#mobile-unit-dock')!
  if(unit){
    const shownSkill=engine.getSkill(unit),normal=unit.normalAttack,status=unit.hp<=0?'전투 불능':unit.statuses.length?unit.statuses.map(item=>item.type).join(' · '):'정상',teamClass=unit.team==='아군'?'ally':'enemy',base=content.characters.find(character=>character.id===unit.id)??unit,bonus=engine.getTimeStatBonuses(unit),attackDamage=engine.getActionDamagePreview(unit,'일반공격',engine.getAttackPower(unit)),buffText=`공격 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)} · 이동 ${base.moveRange}${bonus.move?` +${bonus.move}`:''} · 치명 ${base.criticalRate}%${bonus.critical?` +${bonus.critical}%p`:''}`
    unitDock.dataset.unitDetail=unit.id;unitDock.dataset.timeTag=unit.timeTag??'없음';unitDock.setAttribute('role','button');unitDock.tabIndex=0;unitDock.setAttribute('aria-label',`${unit.name} 전투 설명 ${showSkillDetail?'닫기':'열기'}`)
    unitDock.innerHTML=`<span class="mobile-unit-portrait ${teamClass}">${unitPortraitMarkup(unit)}</span><div class="mobile-unit-main"><small>${unit.team} · ${unit.timeTag?`${unit.timeTag} 태그`:'태그 없음'}</small><b>${esc(unit.name)}</b><div class="mobile-hp"><span style="width:${Math.max(0,unit.hp/unit.maxHp*100)}%"></span></div><p>HP ${unit.hp}/${unit.maxHp} · ${buffText}</p>${bonus.stacks?`<small class="mobile-time-buff">${engine.state.currentTime} 공명 · 궁극기 각성</small>`:''}<em>${esc(status)}</em><small class="mobile-card-prompt">카드를 눌러 공격 정보를 확인</small></div>${showSkillDetail?`<div class="mobile-skill-detail"><header><b>${esc(unit.name)} 전투 정보</b><small>카드를 다시 누르면 닫힙니다.</small></header><div class="mobile-detail-action"><strong>기본 공격 · ${esc(normal.name)}</strong><span>${targetingLabel(normal.targeting)} · 사거리 ${normal.range} · ${esc(normal.rangePatternId)}</span><small>기본 공격 피해 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)}</small></div>${shownSkill?`<div class="mobile-detail-action skill"><strong>${bonus.stacks?'궁극기':'스킬'} · ${esc(shownSkill.name)}</strong><span>${targetingLabel(shownSkill.targeting)} · 사거리 ${shownSkill.range} · ${esc(shownSkill.rangePatternId)}</span><small>피해 ${skillDamageMarkup(unit,shownSkill)} · ${esc(shownSkill.description)} · 치명타 ${shownSkill.canCritical?'가능':'불가'} · 쿨타임 ${shownSkill.cooldown}턴</small></div>`:'<div class="mobile-detail-action skill"><strong>스킬 없음</strong></div>'}</div>`:''}`
  }
  else{delete unitDock.dataset.unitDetail;delete unitDock.dataset.timeTag;unitDock.removeAttribute('role');unitDock.removeAttribute('tabindex');unitDock.removeAttribute('aria-label');unitDock.innerHTML='<p class="mobile-empty">보드의 캐릭터를 탭하세요.</p>'}
  const previewReady=Boolean(allyPlanning&&selectedActionPreviewReady()),confirmed=Boolean(selected&&confirmedActions.has(selected.id)),cancelReady=Boolean(allyPlanning&&mode!=='이동'&&actionDraft?.unitId===selected?.id),skillReady=Boolean(allyPlanning&&skill&&selected&&selected.cooldownRemaining===0),executeReady=planning&&!planValidationError()
  const actionDock=document.querySelector<HTMLElement>('#mobile-action-dock')!,actionHint=threatFocused?'선택한 적의 이동과 공격 예고만 표시합니다.':mode==='이동'?'캐릭터를 누른 채 경로를 그리세요.':previewReady?'같은 대상이나 방향을 다시 탭하면 빠르게 확정됩니다.':'범위에서 대상 또는 방향을 선택하세요.'
  actionDock.innerHTML=`<div class="mobile-action-top"><p class="mobile-action-hint">${actionHint}</p><div class="mobile-action-commit"><button id="cancel-action" class="cancel-action" ${cancelReady?'':'disabled'}>취소</button><button id="confirm-action" class="confirm-action ${previewReady&&!confirmed?'ready':''}" ${previewReady&&!confirmed?'':'disabled'}>${confirmed?'설정 완료':'확정'}</button></div></div><div class="mobile-action-buttons"><button data-mobile-mode="일반공격" class="combat-button attack ${mode==='일반공격'?'active':''}" ${allyPlanning?'':'disabled'}><i>⚔</i><span>공격</span><small>${selected?targetingLabel(selected.normalAttack.targeting):''}</small></button>${selected&&engine.getTimeStatBonuses(selected).stacks?'<span class="ultimate-button-flame" aria-hidden="true"></span>':''}<button data-mobile-mode="스킬" class="combat-button skill ${selected&&engine.getTimeStatBonuses(selected).stacks?'time-awakened':''} ${skillReady?'':'disabled'} ${mode==='스킬'?'active':''}" ${skillReady?'':'disabled'}><i>✦</i><span>${selected&&engine.getTimeStatBonuses(selected).stacks?'궁극기':'스킬'}</span><small>${skill?esc(skill.name):'없음'}</small></button></div>`
  document.querySelector<HTMLElement>('#mobile-execute-dock')!.innerHTML=`<button id="mobile-execute" class="mobile-execute ${executeReady?'ready':''}" ${executeReady?'':'disabled'}><span>${executeReady?'작전 개시!':'행동 설계 중'}</span></button><button id="mobile-reset-plans" class="mobile-reset-plans" ${planning?'':'disabled'}>계획 초기화</button>`
}

function beginActionMode(nextMode:'일반공격'|'스킬'){
  const unit=engine.selectedUnit
  if(engine.state.phase!=='계획'||unit?.team!=='아군')return
  if(mode===nextMode){cancelActionMode();return}
  if(!actionDraft||actionDraft.unitId!==unit.id)actionDraft={unitId:unit.id}
  confirmedActions.delete(unit.id);mode=nextMode;engine.planNone();scene.clearThreatFocus();scene.setPlanView('current');scene.setInputMode(mode)
  render()
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
  if(engine.state.phase!=='계획'||unit?.team!=='아군'||!action||action.kind==='없음'||!selectedActionPreviewReady())return
  const definition=action.kind==='일반공격'?unit.normalAttack:engine.getSkill(unit)
  if(definition?.targeting!=='방향 선택형'&&!action.selfConfirmed&&action.selfTargetCell)engineConfirmSelf(action.kind,action.selfTargetCell)
  confirmedActions.add(unit.id);actionDraft=undefined;mode='이동';scene.setInputMode(mode);render()
  playCue('equip');document.querySelector<HTMLElement>(`[data-slot="${engine.state.selectedSlot}"]`)?.animate([{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:240})
}

function operationLaunchFeedback(){playCue('equip');const shell=document.querySelector<HTMLElement>('.game-shell');shell?.classList.remove('operation-launch');void shell?.offsetWidth;shell?.classList.add('operation-launch');window.setTimeout(()=>shell?.classList.remove('operation-launch'),280)}

function engineConfirmSelf(kind:'일반공격'|'스킬',target: {x:number;y:number}){engine.planSelf(kind,target,true)}

function renderLeftRail(){
  const rail=document.querySelector<HTMLDivElement>('#left-rail')!,state=engine.state
  if(state.phase==='배치'){
    rail.innerHTML='';return
  }
  rail.innerHTML=`<section class="time-resource"><div class="watch"><div class="watch-face period-${state.currentTime} ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg;--hand-angle:${timeHandAngle(state.currentTime)}deg" aria-label="시간 조작 열기, 시간 파편 ${state.shards} / ${state.maxShards}"><span class="watch-crown"></span><span class="time-charge-ring ${state.shards>0?'charged':''}" aria-hidden="true"></span><div class="hand ${state.currentTime}"></div><span class="watch-time-callout" aria-live="polite"></span><button class="watch-guide-trigger" data-open-time-control aria-label="시간 조작 열기"></button></div></div><div><small class="time-shard-count">시간 파편 ${state.shards}/${state.maxShards}</small><small class="time-period-remaining">${remainingTimeLabel(state.currentTime,state.timeCycleProgress)}</small></div></section><section class="targeting-guide" aria-label="공격 지정 방식 설명"><header><small>ACTION TYPE</small><b>공격 지정 방식</b></header><dl><div><dt>방향 선택형</dt><dd>근접·직사는 방향, 곡사는 상대 타일 지정</dd></div><div><dt>자기 기준형</dt><dd>이동 완료 위치 중심의 패턴 전체 적용</dd></div><div><dt>자가 버프형</dt><dd>자기 캐릭터를 다시 눌러 확정</dd></div></dl></section><div class="shard-rules"><span><b>+${SHARD_PER_ENEMY_NORMAL_ATTACK}</b> 적 일반 공격</span><span><b>+${SHARD_PER_ENEMY_CRITICAL_ATTACK}</b> 적 치명타</span><span><b>+${SHARD_PER_KILL}</b> 사살</span><span><b>+${SHARD_PER_TURN}</b> 턴 종료</span></div><div class="ai-panel"><div><b>적군 AI · 고정 예고</b><span>행동 결과는 미리 계산하지 않음</span></div><button id="replan-enemy" ${state.phase!=='계획'?'disabled':''}>AI 다시 계획</button></div>`
}

function renderRightRail(){
  const rail=document.querySelector<HTMLDivElement>('#right-rail')!,state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  if(state.phase==='배치'){
    rail.innerHTML='';return
  }
  if(state.phase==='승리'||state.phase==='패배'){rail.innerHTML=`<div class="result ${state.phase}"><small>BATTLE RESULT</small><h2>${state.phase}</h2><p>${state.phase==='승리'?'모든 적이 전투 불능입니다.':'모든 아군이 전투 불능입니다.'}</p><button class="execute" id="return-main">메인 화면으로</button></div>${rightTools()}`;return}
  if(state.phase==='실행'){
    const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId),liveAction=liveSlot?.plan.action
    rail.innerHTML=`<div class="panel-title"><small>NOW RESOLVING</small><h2>계획 실행</h2></div>${liveUnit?unitSummary(liveUnit):'<p class="empty-state">다음 행동을 준비하고 있습니다.</p>'}${liveSlot&&liveAction?`<div class="execution-card"><span>${liveSlot.number}번 행동 · ${liveSlot.team}</span><b>${esc(liveAction.kind)}${liveAction.direction?` · ${liveAction.direction}`:''}${liveAction.selfConfirmed?' · 자기 기준':''}</b><small>${liveSlot.result==='대기'?'이동과 공격을 판정하는 중입니다.':`결과 · ${liveSlot.result}`}</small></div>`:''}<div class="execution-note"><i></i><span>반격이 발동하면 반격자 돌진과 피격 강조 뒤 피해를 처리하고 실행을 계속합니다.</span></div>${rightTools()}`;return
  }
  const threatFocus=scene.getThreatFocus()
  if(threatFocus!==undefined){rail.innerHTML=focusedThreatInspector(threatFocus)+rightTools();return}
  if(scene.getPlanView()==='summary'||scene.getPlanView()==='all'){rail.innerHTML=turnForecastPanel(scene.getPlanView())+rightTools();return}
  if(!unit||!slot){rail.innerHTML=`<p>행동 슬롯이 없습니다.</p>${rightTools()}`;return}
  const action=slot.plan.action,definition=mode==='일반공격'?unit.normalAttack:skill
  const plannedDefinition=action.kind==='일반공격'?unit.normalAttack:action.kind==='스킬'?skill:undefined
  const origin=slot.plan.path.at(-1),targetPoint=origin&&action.relativeTarget?{x:origin.x+action.relativeTarget.x,y:origin.y+action.relativeTarget.y}:undefined,castReady=Boolean(targetPoint&&origin&&plannedDefinition&&isPointInPattern(origin,targetPoint,plannedDefinition.rangePatternId,plannedDefinition.range))
  const rangeRow=targetPoint?`<div class="cast-state ${castReady?'ready':'broken'}"><span>상대 착탄 위치</span><b>${castReady?`${targetPoint.x+1}, ${targetPoint.y+1} · 실행 가능`:'범위 밖 · 실행 시 취소'}</b></div>`:''
  const directionPad=definition?.targeting==='방향 선택형'&&definition.trajectory!=='곡사'&&mode!=='이동'?`<div class="direction-pad"><button data-direction="상">↑</button><button data-direction="좌">←</button><span>방향</span><button data-direction="우">→</button><button data-direction="하">↓</button></div>`:''
  const previewReady=selectedActionPreviewReady(),confirmed=confirmedActions.has(unit.id),contextHint=mode==='이동'?'선택한 아군의 경로만 편집합니다. 적 행동 예고는 고정되어 변하지 않습니다.':definition?.targeting==='자기 기준형'?'표시된 범위를 다시 누르거나 확정 버튼을 누르세요.':definition?.targeting==='자가 버프형'?'하이라이트된 캐릭터를 다시 누르거나 확정 버튼을 누르세요.':definition?.trajectory==='곡사'?'사거리 안 타일을 고른 뒤 다시 누르거나 확정 버튼을 누르세요.':'상하좌우 방향을 고른 뒤 같은 범위를 다시 누르거나 확정 버튼을 누르세요.'
  rail.innerHTML=`<div class="slot-head"><span>${slot.number}번 행동 · ${unit.team}</span><div><button data-shift="-1">←</button><button data-shift="1">→</button></div></div>${unitSummary(unit)}<div class="plan-block"><div><span>이동 경로</span><b>${slot.plan.path.length-1} / ${unit.moveRange}칸</b></div><div><span>후속 행동</span><b>${esc(action.kind)}${action.direction?` · ${action.direction}`:''}${action.selfConfirmed?' · 자기 기준':''}</b></div>${rangeRow}</div><div class="command-grid"><button data-mode="이동" class="${mode==='이동'?'active':''}">01 경로</button><button data-mode="일반공격" class="${mode==='일반공격'?'active':''}">02 ${esc(unit.normalAttack.name)}</button><button data-mode="스킬" class="${mode==='스킬'?'active':''}" ${!skill||unit.cooldownRemaining>0?'disabled':''}>03 ${esc(skill?.name??'스킬 없음')}${unit.cooldownRemaining?` (${unit.cooldownRemaining})`:''}</button><button id="plan-none">행동 없음</button></div>${directionPad}<p class="context-hint">${contextHint}</p><div class="selection-actions"><button id="cancel-action" ${mode==='이동'?'disabled':''}>취소</button><button class="confirm-selection ${previewReady&&!confirmed?'ready':''}" id="confirm-action" ${previewReady&&!confirmed?'':'disabled'}>${confirmed?'설정 완료':'행동 확정'}</button></div><div class="plan-actions"><button id="clear-plan">계획 초기화</button><button class="execute" id="execute-turn" ${state.phase!=='계획'||planValidationError()?'disabled':''}>시간대 잠금 · 계획 실행</button></div>${rightTools()}`
}

const targetingLabel=(targeting:string)=>targeting
function unitSummary(unit:Unit){
  const skill=engine.getSkill(unit),normal=unit.normalAttack,time=engine.state.currentTime,base=content.characters.find(character=>character.id===unit.id)??unit,bonus=engine.getTimeStatBonuses(unit,time),signed=(value:number,suffix='')=>value?` <em>+${value}${suffix}</em>`:'',attackDamage=engine.getActionDamagePreview(unit,'일반공격',engine.getAttackPower(unit))
  return `<div class="selected-unit"><span class="portrait large" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span><div><h3>${esc(unit.name)}</h3><p>${unit.timeTag?`${unit.timeTag} 태그`:'태그 없음'} · HP ${unit.hp}/${unit.maxHp}</p><div class="stats"><span>공격 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)}</span><span>이동 ${base.moveRange}${signed(bonus.move)}</span><span>치명 ${base.criticalRate}%${signed(bonus.critical,'%p')}</span></div>${bonus.stacks?`<small class="time-buff-note">${time} 공명 · 궁극기 각성</small>`:''}</div></div><div class="unit-combat-info"><div><span>기본공격 · ${targetingLabel(normal.targeting)}</span><b>${esc(normal.name)}</b><small>피해 ${effectiveDamageMarkup(attackDamage,base.attackPower,bonus.stacks>0)} · 사거리 ${normal.range} · ${esc(normal.rangePatternId)}</small></div>${skill?`<div><span>${bonus.stacks?'궁극기':'스킬'} · ${targetingLabel(skill.targeting)}</span><b>${esc(skill.name)}</b><small>피해 ${skillDamageMarkup(unit,skill)} · 사거리 ${skill.range} · ${esc(skill.rangePatternId)} · 쿨타임 ${skill.cooldown}턴</small></div>`:`<div><span>스킬</span><b>연결된 스킬 없음</b></div>`}</div>`
}

function turnForecastPanel(_view:PlanViewMode){
  return `<div class="forecast-heading"><div><small>ENEMY INTENT</small><h2>고정 행동 예고</h2></div><span>결과 예측 없음</span></div><p class="forecast-guide">적이 정한 이동·공격 예고만 표시합니다. 아군 순서나 계획을 바꿔도 예고 정보는 다시 계산되지 않습니다. 상단 적 초상화를 누르면 현재 예고를 가상 재생합니다.</p><div class="forecast-actions"><button class="execute" id="execute-turn" ${planValidationError()?'disabled':''}>시간대 잠금 · 계획 실행</button></div>${enemyThreatPanel()}`
}

function focusedThreatInspector(slotIndex:number){
  const threat=engine.getEnemyThreatPredictions().find(item=>item.slotIndex===slotIndex),actor=threat&&engine.state.units.find(unit=>unit.id===threat.actorId)
  if(!threat||!actor)return `<button data-plan-view="summary">← 턴 결과</button><p class="empty-state">선택한 적 행동을 찾을 수 없습니다.</p>`
  const action=engine.state.slots[slotIndex]?.plan.action,definition=action?.kind==='일반공격'?actor.normalAttack:action?.kind==='스킬'?engine.getSkill(actor):undefined
  return `<button class="back-result" data-plan-view="summary">← 고정 예고</button><div class="threat-inspector-head"><i>#${threat.slotNumber}</i><div><small>ENEMY INTENT</small><h2>${esc(threat.actionName)}</h2><p>${esc(threat.actorName)}${threat.direction?` · ${esc(threat.direction)} 방향`:''}</p></div><em class="hit">${esc(threat.state)}</em></div>${unitSummary(actor)}${definition?`<p class="range-guide"><i></i>${esc(definition.targeting)} · ${esc(definition.trajectory)}${definition.penetrates?' · 관통':''}</p>`:''}<div class="inspector-flow"><span>시전자</span><b>${esc(threat.actorName)}</b><i>→</i><span>예고 행동</span><b>${esc(threat.actionName)}</b></div><div class="inspector-outcome"><span>고정 정보</span><b>${esc(threat.intendedTargetName??'방향·범위 예고')}</b><strong>${esc(threat.reason)}</strong></div><p class="forecast-guide">실제 결과는 실행 중 이동·충돌·반격에 따라 달라질 수 있으며 미리 계산하지 않습니다.</p>`
}

function enemyThreatPanel(){
  const threats=engine.getEnemyThreatPredictions(),focused=scene.getThreatFocus()
  return `<section class="threat-panel"><header><div><small>ENEMY INTENT</small><b>적 행동 예고</b></div><span>결과는 계산하지 않음</span></header><div class="threat-list">${threats.map(threat=>`<button data-threat-slot="${threat.slotIndex}" class="threat-card ${focused===threat.slotIndex?'active':''} hit"><i>${threat.slotNumber}</i><div class="threat-main"><span><b>${esc(threat.actorName)}</b> · ${esc(threat.actionName)}${threat.direction?` ${esc(threat.direction)}`:''}</span><div class="threat-outcome"><strong>${esc(threat.intendedTargetName??'방향·범위')}</strong><span>${esc(threat.reason)}</span></div></div><em>${esc(threat.state)}</em></button>`).join('')}</div></section>`
}

const targetingHelp=(targeting:string)=>({'방향 선택형':'직사·근접은 상하좌우 방향을, 곡사는 범위 안 상대 타일을 선택합니다.','자기 기준형':'이동 완료 위치를 중심으로 정해진 패턴 전체에 효과를 적용합니다.','자가 버프형':'자기 캐릭터를 다시 눌러 자신에게 버프를 적용합니다.'} as Record<string,string>)[targeting]??''
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
  if(tutorialTopic==='parameter')body=`<h4>기본 파라미터 읽기</h4><dl><div><dt>HP</dt><dd>0이 되면 즉시 전투 불능이며 칸 점유가 해제됩니다.</dd></div><div><dt>공격</dt><dd>기본공격의 피해량입니다. 미래에서는 아군 일반 공격력이 3 증가합니다.</dd></div><div><dt>이동</dt><dd>한 턴에 그릴 수 있는 상하좌우 경로의 최대 칸 수입니다. 과거에서는 아군 이동력이 1 증가합니다.</dd></div><div><dt>치명</dt><dd>띄워진 적을 공격할 때 적용되는 치명타 피해율입니다.</dd></div><div><dt>시간대 태그</dt><dd>캐릭터의 과거·미래 태그가 현재 시간대와 일치하면 스킬이 궁극기로 바뀝니다.</dd></div></dl>`
  if(tutorialTopic==='time')body='<h4>시간 이동</h4><p>게임은 현재에서 시작하며 현재에서만 파편을 모읍니다. 적 일반 공격 +10, 적 치명타 공격 +30, 사살 +30, 턴 종료 +10을 얻고 최대 100까지 저장합니다.</p><p>100이 되면 계획 단계에서 과거·미래 버튼을 누르는 즉시 100을 소모하고 이동합니다. 과거는 아군 이동 +1, 미래는 아군 일반 공격 +3이며, 해당 태그 캐릭터의 스킬이 궁극기로 바뀝니다. 2턴 뒤 현재로 돌아옵니다. 유물도 같은 시간대 태그 체계를 사용합니다.</p>'
  if(tutorialTopic==='combat')body=`<h4>기본 전투법</h4><ol><li><b>적 계획 읽기</b> · 빨간 이동 경로, 공격 범위, 타겟 연결선과 턴 종료 예상 HP를 확인합니다.</li><li><b>행동 순서 선택</b> · 위 슬롯에서 아군을 고르고 필요하면 좌우 화살표로 순서를 바꿉니다.</li><li><b>경로 그리기</b> · 상하좌우 칸을 차례로 눌러 이동합니다. 도착 SD 홀로그램으로 최종 위치를 확인합니다.</li><li><b>공격 계획</b> · 이동 후 위치를 기준으로 기본공격 또는 스킬의 타겟·방향·셀을 정합니다.</li><li><b>결과 검증</b> · 실선은 실행 가능, 주황 점선은 범위 밖 취소입니다. 모든 계획을 확인한 뒤 실행합니다.</li></ol>`
  return `<section class="tutorial-panel"><header><div><small>FIELD GUIDE</small><b>전투 도움말</b></div>${tutorialTopic?'<button id="close-tutorial" aria-label="도움말 닫기">×</button>':''}</header><div class="tutorial-tabs">${topics.map(topic=>`<button data-tutorial-topic="${topic.id}" class="${tutorialTopic===topic.id?'active':''}">${topic.label}</button>`).join('')}</div>${tutorialTopic?`<div class="tutorial-content">${body}</div>`:''}</section>`
}

function rightTools(){return `<section class="right-tools">${tutorialPanel()}<details class="timing-panel"><summary><span>연출 속도</span><b>${engine.presentationDelayMs} ms</b></summary><div class="timing-control"><label for="execution-delay"><span>행동 사이 간격</span><span id="delay-value">${engine.presentationDelayMs} ms</span></label><input id="execution-delay" type="range" min="0" max="1500" step="10" value="${engine.presentationDelayMs}" ${engine.state.phase==='실행'?'disabled':''}><div class="timing-presets"><button data-delay="100">빠름</button><button data-delay="360">보통</button><button data-delay="800">느림</button></div></div></details><div class="right-log"><header><div><b>전투 로그</b><small>최신 기록부터 표시</small></div><em>${engine.state.log.length}</em></header><div id="log">${engine.state.log.map((line,index)=>`<div class="${index===0?'latest':''}"><i>${String(engine.state.log.length-index).padStart(2,'0')}</i><span>${esc(line)}</span></div>`).join('')}</div></div></section>`}

document.addEventListener('pointerdown',event=>{
  const target=event.target as HTMLElement,slotButton=target.closest<HTMLButtonElement>('.slot[data-slot]')
  if(engine.state.phase==='계획'&&!reorderMode&&slotButton){const index=Number(slotButton.dataset.slot),slot=engine.state.slots[index];if(slot?.team==='아군')reorderHoldTimer=window.setTimeout(()=>{reorderMode=true;reorderSlot=index;reorderDragging=true;suppressNextSlotClick=true;scene.clearThreatFocus();render()},1000)}
  if(reorderMode&&reorderSlot!==undefined&&!target.closest('#timeline-wrap')){reorderSlot=undefined;reorderDragging=false;render()}
})
document.addEventListener('pointermove',event=>{
  if(!reorderDragging||reorderSlot===undefined)return
  document.querySelectorAll('.slot.swap-target').forEach(element=>element.classList.remove('swap-target'))
  const button=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>('.slot[data-slot]'),index=Number(button?.dataset.slot)
  if(button&&index!==reorderSlot&&engine.state.slots[index]?.team==='아군')button.classList.add('swap-target')
})
document.addEventListener('pointerup',event=>{
  window.clearTimeout(reorderHoldTimer);reorderHoldTimer=undefined
  if(!reorderDragging||reorderSlot===undefined)return
  const button=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>('.slot[data-slot]'),targetIndex=Number(button?.dataset.slot)
  if(button&&targetIndex!==reorderSlot&&engine.state.slots[targetIndex]?.team==='아군')engine.swapAllySlots(reorderSlot,targetIndex)
  reorderDragging=false;reorderMode=false;reorderSlot=undefined;suppressNextSlotClick=true;render()
})
document.addEventListener('pointercancel',()=>{window.clearTimeout(reorderHoldTimer);reorderHoldTimer=undefined;reorderDragging=false})

settingsModal.addEventListener('pointerdown',event=>{
  if(event.target!==settingsModal)return
  event.preventDefault();event.stopPropagation();settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()
})
function closeTimeControl(){timeControlModal.classList.add('hidden');scene.input.enabled=true;renderTimeControl()}
timeControlModal.addEventListener('pointerdown',event=>{if(event.target===timeControlModal)closeTimeControl()})

function beginCoinFlow(size:BoardSize){
  window.clearTimeout(coinRevealTimer);window.clearTimeout(coinFinishTimer);pendingBoardSize=size;localStorage.setItem(BOARD_SIZE_KEY,String(size));resultPreviewOutcome=undefined;frontScreen='coin';coinRevealed=false;scene.input.enabled=false
  if(size!==engine.boardSize)engine.setBoardSize(size);else engine.reset(content)
  engine.tossFirstTeam();render()
  coinRevealTimer=window.setTimeout(()=>{coinRevealed=true;renderFrontFlow()},950)
  coinFinishTimer=window.setTimeout(()=>{frontScreen='none';coinRevealed=false;scene.input.enabled=true;render()},2550)
}

function returnToMain(){window.clearTimeout(coinRevealTimer);window.clearTimeout(coinFinishTimer);resultPreviewOutcome=undefined;frontScreen='main';mainInfo=undefined;coinRevealed=false;settingsOpen=false;relicSetupComplete=false;selectedRelicId=undefined;confirmedActions.clear();actionDraft=undefined;reorderMode=false;reorderSlot=undefined;mode='이동';scene.clearThreatFocus();scene.setPlanView('summary');scene.setInputMode(mode);engine.reset(content);scene.input.enabled=true;render()}

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||timePresentationBusy)return
  if(mode!=='이동'&&engine.state.phase==='계획'){cancelActionMode();return}
  if(!timeControlModal.classList.contains('hidden'))closeTimeControl()
  else if(settingsOpen){settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()}
  else if(reorderMode){reorderMode=false;reorderSlot=undefined;render()}
})

document.addEventListener('click',async event=>{
  const clicked=(event.target as HTMLElement).closest<HTMLElement>('button')
  if(clicked?.hasAttribute('data-preview-skip')){skipEnemyPreview=true;scene.cancelEnemyPreview();return}
  if(clicked?.hasAttribute('data-preview-speed')){previewSpeed=previewSpeed===1?2.5:1;scene.setPreviewSpeed(previewSpeed);clicked.textContent=previewSpeed===1?'빠르게 보기':'보통 속도';return}
  if(clicked?.id==='toggle-sound'){toggleSound();clicked.textContent=soundMuted()?'소리 꺼짐':'소리 켜짐';return}
  if(timePresentationBusy||(engine.state.phase==='계획'&&!enemyPlanRevealComplete))return
  if(clicked&&!clicked.hasAttribute('disabled'))playCue('select')
  const enemyPreview=(event.target as HTMLElement).closest<HTMLElement>('[data-enemy-preview]');if(enemyPreview?.dataset.enemyPreview!==undefined){event.preventDefault();event.stopPropagation();const slotIndex=Number(enemyPreview.dataset.enemyPreview);scene.focusThreat(slotIndex);render();await scene.previewEnemyAction(slotIndex);return}
  const button=(event.target as HTMLElement).closest<HTMLElement>('button,[data-unit-detail]');if(!button)return
  if(button.dataset.displayMode){
    selectedDisplayMode=button.dataset.displayMode as DisplayMode
    document.querySelector('#device-mode-modal')?.classList.add('hidden')
    configureMobileViewport()
    window.setTimeout(()=>{syncMobileVisualViewport();render()},100)
    return
  }
  if(button.id==='front-start'){Object.assign(battleStats,{damage:0,critical:0,counter:0,ultimate:0,kills:0});mainInfo=undefined;relicSetupComplete=false;selectedRelicId=undefined;beginCoinFlow(6);return}
  if(button.id==='front-fullscreen'){await toggleFullscreen();return}
  if(button.id==='front-back'){mainInfo=undefined;frontScreen='main';renderFrontFlow();return}
  if(button.id==='result-restart'){Object.assign(battleStats,{damage:0,critical:0,counter:0,ultimate:0,kills:0});relicSetupComplete=false;selectedRelicId=undefined;beginCoinFlow(engine.boardSize);return}
  if(button.id==='result-main'){returnToMain();return}
  if(button.dataset.mainInfo){mainInfo=mainInfo===button.dataset.mainInfo?undefined:button.dataset.mainInfo as MainInfo;renderFrontFlow();return}
  if(button.id==='close-main-info'){mainInfo=undefined;renderFrontFlow();return}
  if(button.dataset.frontBoardSize){beginCoinFlow(Number(button.dataset.frontBoardSize) as BoardSize);return}
  if(button.hasAttribute('data-open-time-control')){
    if(engine.state.phase!=='계획'||!enemyPlanRevealComplete)return
    timeControlModal.classList.remove('hidden');scene.input.enabled=false;renderTimeControl();return
  }
  if(button.dataset.quickTime){
    if(!enemyPlanRevealComplete||!engine.canManipulateTime())return
    engine.commitTimeManipulation(button.dataset.quickTime as TimeManipulation);return
  }
  if(button.id==='close-time-control'){closeTimeControl();return}
  if(button.dataset.timeManipulation){
    if(engine.commitTimeManipulation(button.dataset.timeManipulation as TimeManipulation)){closeTimeControl()}
    return
  }
  if(button.id==='open-settings'){pendingBoardSize=engine.boardSize;settingsOpen=true;scene.input.enabled=false;render()}
  if(button.id==='settings-fullscreen'){await toggleFullscreen();renderSettings();return}
  if(button.dataset.boardSize){pendingBoardSize=Number(button.dataset.boardSize) as BoardSize;render()}
  if(button.id==='close-settings'||button.id==='cancel-settings'){settingsOpen=false;pendingBoardSize=engine.boardSize;scene.input.enabled=true;render()}
  if(button.id==='restart-battle'){Object.assign(battleStats,{damage:0,critical:0,counter:0,ultimate:0,kills:0});settingsOpen=false;relicSetupComplete=false;selectedRelicId=undefined;beginCoinFlow(engine.boardSize);return}
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
  if(button.dataset.selectRelic){selectedRelicId=button.dataset.selectRelic;render();return}
  if(button.id==='unequip-selected-relic'&&selectedRelicId){moveRelic(selectedRelicId);return}
  if(button.dataset.relicPeriod){
    const period=button.dataset.relicPeriod as TimePeriod,index=Number(button.dataset.relicSlot),id=relicLoadouts[period]?.[index]
    if(id){selectedRelicId=id;render()}
    else if(selectedRelicId)moveRelic(selectedRelicId,period,index)
    return
  }
  if(button.id==='confirm-relic-setup'){relicSetupComplete=true;selectedRelicId=undefined;render();return}
  if(button.id==='back-relic-setup'){relicSetupComplete=false;render();return}
  if(button.id==='start-battle'&&relicSetupComplete){confirmedActions.clear();mode='이동';scene.setInputMode(mode);scene.setPlanView('summary');engine.startBattle()}
  if(button.id==='replan-enemy')engine.planEnemyAi()
  if(button.dataset.planView){scene.setPlanView(button.dataset.planView as PlanViewMode);render()}
  if(button.dataset.editSlot!==undefined){scene.clearThreatFocus();scene.setPlanView('current');engine.selectSlot(Number(button.dataset.editSlot));mode='이동';scene.setInputMode(mode)}
  if(button.id==='toggle-reorder'){reorderMode=!reorderMode;reorderSlot=undefined;scene.clearThreatFocus();render()}
  if(button.dataset.slot!==undefined){if(suppressNextSlotClick){suppressNextSlotClick=false;return}const slotIndex=Number(button.dataset.slot),slot=engine.state.slots[slotIndex];if(engine.state.phase==='계획'&&reorderMode){if(slot?.team!=='아군')return;if(reorderSlot===undefined)reorderSlot=slotIndex;else if(slotIndex===reorderSlot)reorderSlot=undefined;else{engine.swapAllySlots(reorderSlot,slotIndex);reorderSlot=undefined}render()}else if(engine.state.phase==='계획'&&slot?.team==='아군'){scene.clearThreatFocus();scene.setPlanView('current');engine.selectSlot(slotIndex);mode='이동';scene.setInputMode(mode);render()}else{mode='이동';scene.setInputMode(mode);if(slot?.team==='적군')scene.setThreatFocus(slotIndex);render()}}
  if(button.dataset.threatSlot!==undefined){scene.setThreatFocus(Number(button.dataset.threatSlot));render()}
  if(button.dataset.shift)engine.shiftSelectedSlot(Number(button.dataset.shift) as -1|1)
  if(button.dataset.mode){const nextMode=button.dataset.mode as InputMode;if(nextMode==='이동'){mode='이동';scene.setPlanView('current');scene.setInputMode(mode);render()}else beginActionMode(nextMode)}
  if(button.dataset.mobileMode)beginActionMode(button.dataset.mobileMode as '일반공격'|'스킬')
  if(button.dataset.direction&&mode!=='이동'){const definition=mode==='일반공격'?engine.selectedUnit?.normalAttack:engine.selectedUnit?engine.getSkill(engine.selectedUnit):undefined;if(definition?.targeting==='방향 선택형'&&definition.trajectory!=='곡사')engine.planDirection(mode,button.dataset.direction as '상'|'하'|'좌'|'우')}
  if(button.id==='plan-none'){const unit=engine.selectedUnit;if(unit)confirmedActions.delete(unit.id);engine.planNone()}
  if(button.id==='clear-plan'){const unit=engine.selectedUnit;if(unit)confirmedActions.delete(unit.id);engine.clearPlan();mode='이동';scene.setInputMode(mode)}
  if(button.dataset.unitDetail){showSkillDetail=!showSkillDetail;render()}
  if(button.id==='cancel-action')cancelActionMode()
  if(button.id==='confirm-action')confirmSelectedAction()
  if(button.id==='mobile-reset-plans'){confirmedActions.clear();actionDraft=undefined;mode='이동';scene.clearThreatFocus();scene.setPlanView('all');scene.setInputMode(mode);engine.resetAllyPlans()}
  if(button.id==='mobile-execute'&&!planValidationError()){operationLaunchFeedback();await engine.executeTurn()}
  if(button.dataset.tutorialTopic){tutorialTopic=tutorialTopic===button.dataset.tutorialTopic?undefined:button.dataset.tutorialTopic as TutorialTopic;render()}
  if(button.id==='close-tutorial'){tutorialTopic=undefined;render()}
  if(button.dataset.delay){engine.setPresentationDelay(Number(button.dataset.delay));localStorage.setItem(SPEED_KEY,String(engine.presentationDelayMs))}
  if(button.id==='execute-turn'&&!planValidationError()){operationLaunchFeedback();await engine.executeTurn()}
  if(button.id==='return-main')returnToMain()
  handleEditorButton(button)
})

function persist(){localStorage.setItem(SAVE_KEY,JSON.stringify(content))}
// 빈 슬롯도 보존해서 놓은 칸이 저장 후 바뀌지 않도록 한다.
function moveRelic(id:string,period?:TimePeriod,index=0){
  if(relicSetupComplete||engine.state.phase!=='배치'||!content.relics.some(relic=>relic.id===id))return
  const periods:TimePeriod[]=['과거','현재','미래']
  if(period&&(!periods.includes(period)||!Number.isInteger(index)||index<0||index>=4))return
  const source=periods.find(time=>(relicLoadouts[time]??[]).includes(id))
  const sourceIndex=source?(relicLoadouts[source]??[]).indexOf(id):-1
  const next:RelicLoadouts=Object.fromEntries(periods.map(time=>[time,Array.from({length:4},(_,slot)=>relicLoadouts[time]?.[slot]??'')]))
  if(source)next[source]![sourceIndex]=''
  if(period){
    const displaced=next[period]![index]
    next[period]![index]=id
    if(displaced&&source)next[source]![sourceIndex]=displaced
  }
  playCue('equip');relicLoadouts=next;selectedRelicId=id;persistRelicLoadouts();engine.setRelicLoadouts(relicLoadouts);render()
}
let draggedRelicId:string|undefined
function clearRelicDropTargets(){document.querySelectorAll('.relic-drop-target').forEach(element=>element.classList.remove('relic-drop-target'))}
document.addEventListener('dragstart',event=>{
  const item=(event.target as HTMLElement).closest<HTMLElement>('[data-relic-id]')
  if(!item||relicSetupComplete||engine.state.phase!=='배치')return
  draggedRelicId=item.dataset.relicId
  if(event.dataTransfer&&draggedRelicId){event.dataTransfer.setData('text/plain',draggedRelicId);event.dataTransfer.effectAllowed='move'}
  item.classList.add('relic-dragging')
})
document.addEventListener('dragover',event=>{
  if(!draggedRelicId)return
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-relic-period],[data-relic-return]')
  clearRelicDropTargets()
  if(!target)return
  event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';target.classList.add('relic-drop-target')
})
document.addEventListener('drop',event=>{
  if(!draggedRelicId)return
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-relic-period],[data-relic-return]')
  const id=draggedRelicId;draggedRelicId=undefined;clearRelicDropTargets()
  if(!target)return
  event.preventDefault();event.stopPropagation()
  moveRelic(id,target.dataset.relicPeriod as TimePeriod|undefined,Number(target.dataset.relicSlot??0))
})
document.addEventListener('dragend',()=>{
  draggedRelicId=undefined;clearRelicDropTargets()
  document.querySelectorAll('.relic-dragging').forEach(element=>element.classList.remove('relic-dragging'))
})
function persistRelicLoadouts(){localStorage.setItem(RELIC_LOADOUT_KEY,JSON.stringify(relicLoadouts))}
function currentCollection(){return editorKind==='character'?content.characters:editorKind==='skill'?content.skills:content.relics}
function renderEditor(){
  const collection=currentCollection(),item=collection.find(v=>v.id===selectedEditorId)??collection[0]
  if(item&&(!selectedEditorId||!collection.some(v=>v.id===selectedEditorId)))selectedEditorId=item.id
  document.querySelectorAll<HTMLButtonElement>('[data-editor-tab]').forEach(b=>b.classList.toggle('active',b.dataset.editorTab===editorKind))
  document.querySelector('#editor-list')!.innerHTML=collection.map(v=>`<button data-editor-id="${esc(v.id)}" class="${v.id===selectedEditorId?'active':''}"><b>${esc(v.name)}</b><small>${esc(editorKind==='character'?(v as CharacterDefinition).team:editorKind==='skill'?(v as SkillDefinition).targeting:(v as RelicDefinition).rarity)}</small></button>`).join('')||'<p>항목 없음</p>'
  document.querySelector('#syntax-name')!.textContent=editorKind==='character'?'캐릭터 문법':editorKind==='skill'?'스킬 문법':'유물 문법'
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!;if(item&&editor.dataset.loadedId!==item.id){editor.value=item.source;editor.dataset.loadedId=item.id}
  document.querySelector('#syntax-help')!.innerHTML=editorKind==='character'?'<b>캐릭터 필수 항목</b><p>ID · 진영 · 시간대태그 · AI유형 · 체력 · 공격력 · 이동력 · 치명타피해율 · 일반공격 · 공격방식 · 공격궤적 · 공격관통 · 공격사거리 · 공격범위패턴 · 스킬 · 궁극기 · 색상 · 상태면역</p>':editorKind==='skill'?'<b>스킬 필수 항목</b><p>ID · 방식(방향 선택형/자기 기준형/자가 버프형) · 궤적(없음/직사/곡사) · 관통 · 사거리 · 범위패턴 · 영향셀패턴 · 쿨타임 · 치명타 · 효과</p>':'<b>유물 효과 문법</b><p>종류 · 발동 · 시간대 · 정수 수치를 선택합니다.</p>'
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
  if(button.id==='delete-content'&&selectedEditorId){if(editorKind==='character')content.characters=content.characters.filter(v=>v.id!==selectedEditorId);else if(editorKind==='skill')content.skills=content.skills.filter(v=>v.id!==selectedEditorId);else{content.relics=content.relics.filter(v=>v.id!==selectedEditorId);for(const period of ['과거','현재','미래'] as TimePeriod[])relicLoadouts[period]=(relicLoadouts[period]??[]).filter(id=>id!==selectedEditorId);persistRelicLoadouts();engine.setRelicLoadouts(relicLoadouts)}selectedEditorId=currentCollection()[0]?.id??'';persist();editor.dataset.loadedId='';message.textContent='삭제했습니다.';renderEditor()}
  if(button.id==='apply-roster'){engine.reset(content);engine.setRelicLoadouts(relicLoadouts);scene.input.enabled=true;document.querySelector('#editor-modal')!.classList.add('hidden');mode='이동';scene.setInputMode(mode)}
}

const choiceOptions=(values:string[],selected:string)=>values.map(value=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(value)}</option>`).join('')
function sourceValue(source:string,key:string){const match=source.match(new RegExp(`^${key}:\\s*(.*)$`,'m'));return match?.[1]?.trim()??''}
function replaceSourceLine(key:string,value:string){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,pattern=new RegExp(`^${key}:.*$`,'m');editor.value=pattern.test(editor.value)?editor.value.replace(pattern,`${key}: ${value}`):`${editor.value.trim()}\n${key}: ${value}`}
function readEffectSource(effect:string){const parts=effect.split('|').map(part=>part.trim()),[type,legacyValue='0']=parts[0].split(/\s+/),fields=new Map(parts.slice(1).map(part=>{const i=part.indexOf(':');return[part.slice(0,i).trim(),part.slice(i+1).trim()]}));return{type,scope:fields.get('적용')??'선택대상',team:fields.get('대상')??'적군',value:fields.get(type==='밀치기'||type==='당기기'?'거리':'수치')??legacyValue,environment:fields.get('환경')??'환경_ID'}}
function effectValues(){return [...document.querySelectorAll<HTMLElement>('.effect-row')].map(row=>{const type=row.querySelector<HTMLSelectElement>('[data-effect-type]')!.value,scope=row.querySelector<HTMLSelectElement>('[data-effect-scope]')!.value,selectedTeam=row.querySelector<HTMLSelectElement>('[data-effect-team]')!.value,team=type==='밀치기'||type==='당기기'?'모두':selectedTeam,value=Number(row.querySelector<HTMLInputElement>('[data-effect-value]')!.value)||0,target=` | 적용: ${scope} | 대상: ${team}`;if(type==='피해')return `피해${target} | 수치: ${value}`;if(type==='밀치기'||type==='당기기')return `${type}${target} | 거리: ${value}`;return `${type}${target}`})}
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
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>선택하면 아래 문법 원문에 자동 반영됩니다.</small></div><div class="choice-grid">${select('진영','진영',['아군','적군'])}${select('시간대 태그','시간대태그',['없음','과거','미래'])}${select('AI 유형','AI유형',['공통형','돌격형','방벽형','저격형'])}${select('일반공격 방식','공격방식',['방향 선택형','자기 기준형','자가 버프형'])}${select('공격 궤적','공격궤적',['없음','직사','곡사'])}${select('공격 관통','공격관통',['불가','가능'])}${select('공격 범위 패턴','공격범위패턴',patterns)}<label><span>연결 스킬</span><select data-source-key="스킬">${content.skills.map(skill=>`<option value="${esc(skill.id)}" ${skill.id===sourceValue(source,'스킬')?'selected':''}>${esc(skill.name)} · ${esc(skill.id)}</option>`).join('')}</select></label><label><span>궁극기</span><select data-source-key="궁극기"><option value="없음">없음</option>${content.skills.map(skill=>`<option value="${esc(skill.id)}" ${skill.id===sourceValue(source,'궁극기')?'selected':''}>${esc(skill.name)} · ${esc(skill.id)}</option>`).join('')}</select></label></div><fieldset class="immunity-choice"><legend>상태 면역</legend><label><input type="checkbox" data-immunity="밀치기" ${immunity.includes('밀치기')?'checked':''}>밀치기</label><label><input type="checkbox" data-immunity="당기기" ${immunity.includes('당기기')?'checked':''}>당기기</label><label><input type="checkbox" data-immunity="띄우기" ${immunity.includes('띄우기')?'checked':''}>띄우기</label><label><input type="checkbox" data-immunity="기절" ${immunity.includes('기절')?'checked':''}>기절</label></fieldset>`
  }else if(editorKind==='skill'){
    const effects=source.split(/\r?\n/).filter(line=>/^효과:\s*/.test(line.trim())).map(line=>line.replace(/^효과:\s*/,''));
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>효과는 순서대로 처리됩니다.</small></div><div class="choice-grid">${select('사용 방식','방식',['방향 선택형','자기 기준형','자가 버프형'])}${select('궤적','궤적',['없음','직사','곡사'])}${select('관통','관통',['불가','가능'])}${select('치명타','치명타',['가능','불가'])}${select('범위 패턴','범위패턴',patterns)}${select('영향 셀 패턴','영향셀패턴',['없음',...patterns])}</div><div class="effect-builder"><div class="effect-title"><b>효과 순서</b><button id="add-effect">+ 효과 추가</button></div>${effects.map((effect,index)=>{const item=readEffectSource(effect),noValue=['띄우기','기절','반격'].includes(item.type),forceMove=item.type==='밀치기'||item.type==='당기기',team=forceMove?'모두':item.team;return `<div class="effect-row"><i>${index+1}</i><select data-effect-type aria-label="효과 종류">${choiceOptions(['피해','밀치기','당기기','띄우기','기절','반격'],item.type)}</select><select data-effect-scope aria-label="적용 범위">${choiceOptions(['영향셀','자신'],item.scope)}</select><select data-effect-team aria-label="대상 진영" ${forceMove?'disabled':''}>${choiceOptions(['적군','아군','모두'],team)}</select><input data-effect-value aria-label="수치 또는 거리" type="number" min="0" value="${esc(item.value)}" ${noValue?'disabled':''}><button data-remove-effect="${index}" aria-label="효과 삭제">×</button></div>`}).join('')}</div>`
  }else{
    const effects=source.split(/\r?\n/).filter(line=>/^효과:\s*/.test(line.trim())).map(line=>line.replace(/^효과:\s*/,''))
    host.innerHTML=`<div class="choice-heading"><b>유물 설정</b><small>시간대와 발동 조건별 효과는 유물을 장착한 캐릭터 자신에게만 적용됩니다. 시간대 조건은 공통 timeTag 체계를 사용합니다.</small></div><div class="choice-grid">${select('유물 등급','등급',['일반','희귀','전설'])}</div><div class="effect-builder relic-effect-builder"><div class="effect-title"><b>유물 효과</b><button id="add-relic-effect">+ 효과 추가</button></div>${effects.map((effect,index)=>{const item=readRelicEffectSource(effect);return `<div class="relic-effect-row"><i>${index+1}</i><select data-relic-kind aria-label="유물 효과 종류">${choiceOptions(['최대체력','공격력','이동력','치명타피해율','체력회복','쿨타임감소','최종피해','받는피해','일반공격피해','스킬피해','첫이동력'],item.kind)}</select><select data-relic-trigger aria-label="발동 조건">${choiceOptions(['항상','시간대상시','시간대진입','유효공격'],item.trigger)}</select><select data-relic-time aria-label="시간대">${choiceOptions(['전체','과거','현재','미래','과거, 현재','과거, 미래','현재, 미래'],item.time)}</select><input data-relic-value aria-label="유물 수치" type="number" step="1" value="${item.value}"><input data-relic-threshold aria-label="체력 이하 퍼센트" type="number" min="0" max="100" placeholder="HP%" value="${item.threshold}"><button data-remove-relic-effect="${index}" aria-label="유물 효과 삭제">×</button></div>`}).join('')}</div>`
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
engine.addEventListener('attack-presentation',event=>{
  if((event as CustomEvent).detail.ultimate)battleStats.ultimate++
})
engine.addEventListener('impact-presentation',event=>{
  const hit=(event as CustomEvent).detail
  const actor=engine.state.units.find(unit=>unit.id===hit.actorId)
  if(actor?.team!=='아군')return
  battleStats.damage+=hit.damage
  if(hit.critical)battleStats.critical++
  if(hit.actionKind==='반격')battleStats.counter++
  if(hit.defeated){
    battleStats.kills++
    const slot=engine.state.slots.findIndex(slot=>slot.unitId===hit.actorId)
    document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)?.animate([{filter:'brightness(2)'},{filter:'brightness(1)'}],{duration:400})
  }
})
engine.addEventListener('time-advance',event=>{
  const detail=(event as CustomEvent<TimeAdvanceEvent>).detail
  if(detail.suppressed||detail.from===detail.to)return
  timePresentationBusy=true;scene.input.enabled=false
  timePresentationTask=showTimeAdvance(detail)
})
async function showTimeAdvance(event:TimeAdvanceEvent){
  const blocker=document.createElement('div');blocker.className='time-sequence-blocker';blocker.setAttribute('aria-label','시간 이동 연출 중')
  document.querySelector('.game-shell')?.append(blocker)
  try{
    await pause(80)
    const watch=document.querySelector<HTMLElement>('.mobile-watch'),hand=watch?.querySelector<HTMLElement>('.watch-hand')
    playCue('clock')
    const duration=timeTravelDuration(Boolean(event.manipulation)),direction=event.to==='과거'?-1:1
    if(hand){
      hand.getAnimations().forEach(animation=>animation.cancel())
      await hand.animate([{transform:'translateX(-50%) rotate(0deg)'},{transform:`translateX(-50%) rotate(${direction*(event.manipulation?10:1)*360}deg)`}],{duration,easing:'cubic-bezier(.12,.76,.18,1)'}).finished.catch(()=>{})
    }else await pause(duration)
    const shell=document.querySelector<HTMLElement>('.game-shell');if(shell)shell.dataset.time=event.to
    const callout=watch?.querySelector<HTMLElement>('.watch-time-callout')
    if(callout){callout.textContent=event.to==='과거'?'과거로 회귀':event.to==='미래'?'미래로 도약':'현재로 복귀';callout.classList.add('show')}
    await pause(motionReduced()?160:400)
    await scene.presentTimeArrival(event)
    callout?.classList.remove('show')
  }finally{
    blocker.remove();timePresentationBusy=false
    scene.input.enabled=engine.state.phase==='계획'&&enemyPlanRevealComplete&&!settingsOpen
    render()
  }
}

function showShardCollection(event:ShardGainEvent){
  const board=document.querySelector<HTMLElement>('#game canvas')?.getBoundingClientRect(),watch=document.querySelector<HTMLElement>('.mobile-watch,.watch-face')?.getBoundingClientRect()
  if(!board||!watch)return
  const source=event.source?scene.projectedClientPoint(event.source):undefined
  const startX=source?.x??board.left+board.width*.5
  const startY=source?.y??board.top+board.height*.12
  const endX=watch.left+watch.width*.5,endY=watch.top+watch.height*.5,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
  const count=reduced?1:Math.min(8,Math.max(4,Math.ceil(event.amount/5)))
  if(event.reachedMax){const shell=document.querySelector<HTMLElement>('.game-shell');shell?.classList.remove('shard-full-impact');void shell?.offsetWidth;shell?.classList.add('shard-full-impact');window.setTimeout(()=>shell?.classList.remove('shard-full-impact'),650)}
  const label=document.createElement('div');label.className=`shard-gain-label ${event.reason}`;label.textContent=`+${event.amount} ${event.reason}`;label.style.left=`${startX}px`;label.style.top=`${startY}px`;document.body.append(label)
  label.animate([{opacity:0,transform:'translate(-50%, 6px) scale(.8)'},{opacity:1,transform:'translate(-50%, -14px) scale(1)'},{opacity:0,transform:'translate(-50%, -34px) scale(.9)'}],{duration:reduced?420:900,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.finally(()=>label.remove())
  for(let index=0;index<count;index++){
    const shard=document.createElement('i');shard.className='time-shard-particle';shard.style.left=`${startX}px`;shard.style.top=`${startY}px`;document.body.append(shard)
    const spread=(index-(count-1)/2)*9,fall=22+(index%3)*7,delay=reduced?0:index*34
    shard.animate([{transform:`translate(${spread*.25}px,-8px) rotate(0deg) scale(.4)`,opacity:0},{transform:`translate(${spread}px,${fall}px) rotate(${80+index*29}deg) scale(1)`,opacity:1,offset:.34},{transform:`translate(${(endX-startX)*.58+spread*.35}px,${(endY-startY)*.42+fall}px) rotate(${180+index*35}deg) scale(.8)`,opacity:1,offset:.62},{transform:`translate(${endX-startX}px,${endY-startY}px) rotate(${300+index*42}deg) scale(.08)`,opacity:.15}],{duration:reduced?360:760,delay,easing:'cubic-bezier(.35,.05,.18,1)',fill:'forwards'}).finished.finally(()=>{
      shard.remove();const currentWatch=document.querySelector<HTMLElement>('.mobile-watch,.watch-face');currentWatch?.classList.remove('collecting');void currentWatch?.offsetWidth;currentWatch?.classList.add('collecting');window.setTimeout(()=>currentWatch?.classList.remove('collecting'),420)
    })
  }
}
render()
