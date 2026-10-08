import Phaser from 'phaser'
import './style.css'
import { characterExamples, seedContent, skillExamples } from './game/content'
import { BattleEngine, SHARD_PER_ATTACK, SHARD_PER_COMBO, SHARD_PER_TURN, TIME_SHIFT_COST } from './game/engine'
import { parseCharacter, parseSkill } from './game/parser'
import { isPointInPattern } from './game/patterns'
import type { CharacterDefinition, SavedContent, ShardGainEvent, SkillDefinition, TimePeriod, Unit } from './game/types'
import { BattleScene, type InputMode } from './phaser/BattleScene'

const SAVE_KEY='waredo-battle-content-v2'
const SPEED_KEY='waredo-presentation-delay-v1'
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
function loadContent():SavedContent{try{
  const raw=localStorage.getItem(SAVE_KEY);if(!raw)return structuredClone(seedContent)
  const parsed=JSON.parse(raw) as SavedContent;if(!Array.isArray(parsed.characters)||!Array.isArray(parsed.skills))throw new Error()
  const removedLegacyAllies=new Set(['raon','mir'])
  const characters=parsed.characters.filter(character=>!removedLegacyAllies.has(character.id)).map(character=>{const pattern=character.normalAttack.rangePatternId??`${character.normalAttack.targeting==='방향'?'직선':'마름모'}_${character.normalAttack.range}`;return{...character,normalAttack:{...character.normalAttack,rangePatternId:pattern},source:/^공격범위패턴:/m.test(character.source)?character.source:character.source.replace(/^(공격사거리:.*)$/m,`$1\n공격범위패턴: ${pattern}`)}})
  const skills=parsed.skills.map(skill=>{try{return parseSkill(skill.source)}catch{const legacy=skill as SkillDefinition&{targetTeam?:'적군'|'아군'|'모두'};return{...legacy,rangePatternId:legacy.rangePatternId??`${legacy.targeting==='방향'?'직선':'마름모'}_${legacy.range}`,affectedCellPatternId:legacy.affectedCellPatternId??(legacy.targeting==='방향'?`직선_${legacy.range}`:undefined),effects:legacy.effects.map(effect=>({...effect,scope:effect.scope??(legacy.targeting==='대상'?'선택대상':'영향셀'),targetTeam:effect.targetTeam??legacy.targetTeam??'적군'}))}}})
  for(const seed of seedContent.characters)if(!characters.some(item=>item.id===seed.id))characters.push(structuredClone(seed))
  for(const seed of seedContent.skills)if(!skills.some(item=>item.id===seed.id))skills.push(structuredClone(seed))
  return{characters,skills}
}catch{return structuredClone(seedContent)}}

let content=loadContent(),mode:InputMode='이동',editorKind:'character'|'skill'='character',selectedEditorId=content.characters[0]?.id??''
const engine=new BattleEngine(content),scene=new BattleScene(engine)
engine.setPresentationDelay(Number(localStorage.getItem(SPEED_KEY)??360))

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<main class="game-shell" data-time="현재">
  <header class="game-header">
    <div class="title"><h1>쿼리도 슈팅 전투 개편 시스템 프로토타입</h1><p>9×9 전투 규칙 검증 도구</p></div>
    <div class="phase-badge" id="phase-badge"></div>
    <button class="ghost" id="open-editor">콘텐츠 공방</button>
  </header>
  <section class="timeline-wrap" id="timeline-wrap"><div class="timeline-label">행동 순서</div><div class="timeline" id="timeline"></div></section>
  <section class="battle-layout">
    <aside class="left-rail" id="left-rail"></aside>
    <div class="board-column">
      <div class="board-tools"><div class="visual-legend" aria-label="전투판 표시 범례"><span class="legend ally">아군 계획</span><span class="legend enemy">적 계획</span><span class="legend broken">범위 밖</span><span class="legend push">밀치기</span><span class="legend pull">당기기</span></div><button class="line-filter" id="toggle-plan-lines">모든 계획 표시</button></div>
      <div class="board-stage"><div id="game" aria-label="쿼리도 슈팅 9x9 전투판"></div></div>
      <div class="battle-message" id="battle-message"></div>
    </div>
    <aside class="right-rail" id="right-rail"></aside>
  </section>
  <div class="editor-modal hidden" id="editor-modal">
    <div class="editor-card">
      <header><div><small>AUTHORING WORKBENCH</small><h2>콘텐츠 공방</h2></div><button id="close-editor">닫기 ×</button></header>
      <div class="editor-body"><nav><div class="editor-tabs"><button data-editor-tab="character" class="active">캐릭터</button><button data-editor-tab="skill">스킬</button></div><div id="editor-list"></div></nav>
      <section><div class="syntax-title"><b id="syntax-name">캐릭터 문법</b><button class="text-button" id="load-example">예시 불러오기</button></div><div class="choice-editor" id="choice-editor"></div><details class="raw-syntax"><summary>문법 원문 직접 편집</summary><textarea id="editor" spellcheck="false"></textarea></details><div class="editor-actions"><button id="new-content">+ 새로 작성</button><button class="accent" id="save-content">저장</button><button class="danger" id="delete-content">삭제</button></div><div class="editor-message" id="editor-message">선택 항목은 위에서 고르면 문법 원문에 자동 반영됩니다.</div><div class="syntax-help" id="syntax-help"></div></section></div>
      <footer><span>저장 내용은 이 브라우저에 남습니다.</span><button class="accent" id="apply-roster">현재 콘텐츠로 전투 다시 만들기</button></footer>
    </div>
  </div>
</main>`

const editorModal=document.querySelector<HTMLDivElement>('#editor-modal')!
for(const eventName of ['pointerdown','pointerup','pointermove','wheel']){
  editorModal.addEventListener(eventName,event=>event.stopPropagation())
}

new Phaser.Game({type:Phaser.AUTO,width:648,height:648,parent:'game',backgroundColor:'#080d10',scene,render:{antialias:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}})

function render(){
  const state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  const shell=document.querySelector<HTMLElement>('.game-shell')!;shell.dataset.time=state.currentTime
  document.querySelector<HTMLDivElement>('#phase-badge')!.innerHTML=`<b>${state.phase}</b><span>${state.phase==='배치'?'출전 위치 결정':`${state.round}턴 · ${state.firstTeam} 선공`}</span>`
  renderTimeline();renderLeftRail();renderRightRail();renderBoardTools()
  const error=state.phase==='계획'?engine.validatePlans():''
  const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId)
  document.querySelector<HTMLDivElement>('#battle-message')!.innerHTML=state.phase==='배치'?'<b>초기 배치</b> 캐릭터를 선택하고 각 진영의 빛나는 영역에 배치하세요.':state.phase==='계획'?`<b>${slot?.number??'-'}번 계획</b> ${unit?esc(unit.name):''} · ${error?`<span class="warn">${esc(error)}</span>`:'모든 계획이 실행 가능합니다.'}`:state.phase==='실행'?`<b>${liveSlot?.number??'-'}번 실행</b> ${liveUnit?esc(liveUnit.name):'행동 준비'} · ${esc(liveSlot?.plan.action.kind??'대기')}`:`<b>${state.phase}</b> 전투가 종료되었습니다.`
  if(state.phase==='계획'&&unit&&skill)void 0
}

function renderBoardTools(){
  const button=document.querySelector<HTMLButtonElement>('#toggle-plan-lines')!,focused=scene.getFocusOnly(),threatSlot=scene.getThreatFocus()
  button.textContent=threatSlot!==undefined?`보기 · 적 ${engine.state.slots[threatSlot]?.number??'-'}번`:focused?'보기 · 현재 행동':'보기 · 모든 계획';button.classList.toggle('active',focused||threatSlot!==undefined)
}

function renderTimeline(){
  const wrap=document.querySelector<HTMLDivElement>('#timeline-wrap')!,timeline=document.querySelector<HTMLDivElement>('#timeline')!
  wrap.classList.toggle('hidden',engine.state.phase==='배치')
  timeline.innerHTML=engine.state.slots.map((slot,index)=>{const unit=engine.state.units.find(u=>u.id===slot.unitId),planned=slot.plan.action.kind==='없음'?'대기':slot.plan.action.kind,resolved=engine.state.phase==='실행'&&slot.result&&slot.result!=='대기'?slot.result:planned,ai=engine.enemyAiEnabled&&slot.team==='적군',done=['완료','기절'].includes(slot.result??''),failed=['충돌','취소'].includes(slot.result??''),selected=engine.state.phase==='계획'&&index===engine.state.selectedSlot;return `<button data-slot="${index}" class="slot ${slot.team==='아군'?'ally':'enemy'} ${ai?'ai-locked':''} ${done?'done':''} ${failed?'failed':''} ${selected?'active':''} ${engine.state.executingSlot===index?'executing':''}" ${ai?'aria-disabled="true" title="적군 AI가 계획한 행동"':''}><i>${slot.number}</i><strong>${esc(unit?.name.slice(-2)??'?')}</strong><small>${ai?'AI · ':''}${esc(resolved)}</small></button>`}).join('')
}

function renderLeftRail(){
  const rail=document.querySelector<HTMLDivElement>('#left-rail')!,state=engine.state
  if(state.phase==='배치'){
    rail.innerHTML=`<div class="panel-title"><small>DEPLOYMENT</small><h2>출전 명단</h2></div><div class="deploy-roster">${state.units.map(unit=>`<button data-deploy-unit="${esc(unit.id)}" class="unit-card ${state.selectedDeployUnitId===unit.id?'active':''} ${unit.team==='아군'?'ally':'enemy'}"><span class="portrait" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span><span><b>${esc(unit.name)}</b><small>${unit.team} · ${unit.type}</small></span></button>`).join('')}</div><div class="rule-note">적군은 위쪽 빨간 6행, 아군은 아래쪽 파란 3행에 배치합니다.</div>`
    return
  }
  const periods:{name:TimePeriod;type:string;effect:string}[]=[{name:'과거',type:'계승자 +30%',effect:'모든 피해 ×2'},{name:'현재',type:'각성자 +30%',effect:'치명타 +30%p'},{name:'미래',type:'기술자 +30%',effect:'실행 전 체력 7% 회복'}]
  rail.innerHTML=`<section class="time-resource"><div class="watch"><div class="watch-face ${state.shards>=state.maxShards?'full':''}" style="--charge:${state.shards/state.maxShards*360}deg" aria-label="시간 파편 ${state.shards} / ${state.maxShards}"><div class="hand ${state.selectedTime}"></div><b>${state.shards}</b><small>/ ${state.maxShards} 파편</small></div></div><div><small class="section-kicker">TIME RESOURCE</small><strong>시간 파편</strong><span>100 충전 시 시간대 전환</span></div></section><div class="panel-title compact"><small>TIME PERIOD</small><h2>시간대 선택</h2></div><div class="time-options">${periods.map(p=>{const locked=p.name!==state.currentTime&&state.shards<TIME_SHIFT_COST;return `<button data-time="${p.name}" class="time-card ${state.selectedTime===p.name?'active':''}" ${locked||state.phase!=='계획'?'disabled':''}><span>${p.name}</span><b>${p.type}</b><small>${p.effect}</small>${p.name!==state.currentTime?`<em>${TIME_SHIFT_COST} 필요</em>`:'<em>현재</em>'}</button>`}).join('')}</div><div class="shard-rules"><span><b>+${SHARD_PER_ATTACK}</b> 공격</span><span><b>+${SHARD_PER_COMBO}</b> 콤보</span><span><b>+${SHARD_PER_TURN}</b> 턴</span></div><div class="ai-panel"><div><b>적군 AI · 계획 공개</b><span>현재 전투판만 읽고 자동 계획</span></div><button id="replan-enemy" ${state.phase!=='계획'?'disabled':''}>AI 다시 계획</button></div>`
}

function renderRightRail(){
  const rail=document.querySelector<HTMLDivElement>('#right-rail')!,state=engine.state,unit=engine.selectedUnit,slot=engine.selectedActionSlot,skill=unit?engine.getSkill(unit):undefined
  if(state.phase==='배치'){
    const selected=engine.selectedUnit
    rail.innerHTML=`<div class="panel-title"><small>BATTLE ENTRY</small><h2>초기 배치</h2></div>${selected?unitSummary(selected):''}<ol class="steps"><li>캐릭터 선택</li><li>자기 진영 셀 선택</li><li>모두 배치되면 전투 시작</li></ol><button class="execute" id="start-battle" ${state.units.length<2?'disabled':''}>동전을 던지고 전투 시작</button>${rightTools()}`;return
  }
  if(!unit||!slot){rail.innerHTML=`<p>행동 슬롯이 없습니다.</p>${rightTools()}`;return}
  if(state.phase==='승리'||state.phase==='패배'){rail.innerHTML=`<div class="result ${state.phase}"><small>BATTLE RESULT</small><h2>${state.phase}</h2><p>${state.phase==='승리'?'모든 적이 전투 불능입니다.':'모든 아군이 전투 불능입니다.'}</p><button class="execute" id="restart-battle">다시 배치하기</button></div>${rightTools()}`;return}
  if(state.phase==='실행'){
    const liveSlot=state.slots[state.executingSlot],liveUnit=state.units.find(candidate=>candidate.id===liveSlot?.unitId),liveAction=liveSlot?.plan.action
    const targetName=liveAction?.targetUnitId?state.units.find(candidate=>candidate.id===liveAction.targetUnitId)?.name:undefined
    rail.innerHTML=`<div class="panel-title"><small>NOW RESOLVING</small><h2>계획 실행</h2></div>${liveUnit?unitSummary(liveUnit):'<p class="empty-state">다음 행동을 준비하고 있습니다.</p>'}${liveSlot&&liveAction?`<div class="execution-card"><span>${liveSlot.number}번 행동 · ${liveSlot.team}</span><b>${esc(liveAction.kind)}${liveAction.direction?` · ${liveAction.direction}`:''}${targetName?` · ${esc(targetName)}`:''}${liveAction.targetCell?` · ${liveAction.targetCell.x+1},${liveAction.targetCell.y+1}`:''}</b><small>${liveSlot.result==='대기'?'이동과 사거리를 판정하는 중입니다.':`결과 · ${liveSlot.result}`}</small></div>`:''}<div class="execution-note"><i></i><span>선명한 연결선은 현재 행동, 흐린 선은 아직 실행되지 않은 계획입니다.</span></div>${rightTools()}`;return
  }
  const action=slot.plan.action,definition=mode==='일반공격'?unit.normalAttack:skill
  const plannedDefinition=action.kind==='일반공격'?unit.normalAttack:action.kind==='스킬'?skill:undefined
  const targetPoint=action.targetUnitId?engine.state.units.find(v=>v.id===action.targetUnitId&&v.hp>0)?.position:action.targetCell
  const origin=slot.plan.path.at(-1),hasFreeTargeting=plannedDefinition&&['대상','셀','설치'].includes(plannedDefinition.targeting),castReady=Boolean(hasFreeTargeting&&targetPoint&&origin&&isPointInPattern(origin,targetPoint,plannedDefinition!.rangePatternId,plannedDefinition!.range))
  const rangeRow=hasFreeTargeting&&targetPoint?`<div class="cast-state ${castReady?'ready':'broken'}"><span>시전 판정</span><b>${castReady?'범위 안 · 실행 가능':'범위 밖 · 실행 시 취소'}</b></div>`:''
  rail.innerHTML=`<div class="slot-head"><span>${slot.number}번 행동 · ${unit.team}</span><div><button data-shift="-1">←</button><button data-shift="1">→</button></div></div>${unitSummary(unit)}<div class="plan-block"><div><span>이동 경로</span><b>${slot.plan.path.length-1} / ${unit.moveRange}칸</b></div><div><span>후속 행동</span><b>${esc(action.kind)}${action.direction?` · ${action.direction}`:''}${action.targetUnitId?` · ${esc(engine.state.units.find(u=>u.id===action.targetUnitId)?.name??'')}`:''}${action.targetCell?` · ${action.targetCell.x+1},${action.targetCell.y+1}`:''}</b></div>${rangeRow}</div><div class="command-grid"><button data-mode="이동" class="${mode==='이동'?'active':''}">01 경로</button><button data-mode="일반공격" class="${mode==='일반공격'?'active':''}">02 ${esc(unit.normalAttack.name)}</button><button data-mode="스킬" class="${mode==='스킬'?'active':''}" ${!skill||unit.cooldownRemaining>0?'disabled':''}>03 ${esc(skill?.name??'스킬 없음')}${unit.cooldownRemaining?` (${unit.cooldownRemaining})`:''}</button><button id="plan-none">행동 없음</button></div>${definition?.targeting==='방향'&&mode!=='이동'?`<div class="direction-pad"><button data-direction="상">↑</button><button data-direction="좌">←</button><span>방향</span><button data-direction="우">→</button><button data-direction="하">↓</button></div>`:''}<p class="context-hint">${mode==='이동'?'경로를 바꾸면 목표 연결선과 실행 가능 여부가 즉시 바뀝니다.':definition?.targeting==='대상'?'거리와 관계없이 캐릭터를 지정합니다. 파란 실선이면 실행 가능, 주황 점선이면 실행 시 취소됩니다.':definition?.targeting==='셀'||definition?.targeting==='설치'?'거리와 관계없이 셀을 지정합니다. 실제 시전은 이동 완료 위치에서 사거리를 판정합니다.':'방향을 고른 뒤 공격선과 강제이동 잔상을 확인하세요. 노란 실선은 밀치기, 보라 꺾쇠는 당기기입니다.'}</p><div class="plan-actions"><button id="clear-plan">계획 초기화</button><button class="execute" id="execute-turn" ${state.phase!=='계획'||engine.validatePlans()?'disabled':''}>시간대 잠금 · 계획 실행</button></div>${enemyThreatPanel()}${rightTools()}`
}

function unitSummary(unit:Unit){const skill=engine.getSkill(unit);return `<div class="selected-unit"><span class="portrait large" style="--unit:${esc(unit.color)}">${esc(unit.name.slice(-1))}</span><div><h3>${esc(unit.name)}</h3><p>${unit.type} · HP ${unit.hp}/${unit.maxHp}</p><div class="stats"><span>공격 ${unit.attackPower}</span><span>이동 ${unit.moveRange}</span><span>치명 ${unit.criticalRate}%</span></div><small>${esc(skill?.description??'연결된 스킬 없음')}</small></div></div>`}

function enemyThreatPanel(){
  const threats=engine.getEnemyThreatPredictions(),focused=scene.getThreatFocus()
  return `<section class="threat-panel"><header><div><small>ENEMY INTENT</small><b>적 위협</b></div><span>카드를 누르면 해당 계획만 강조</span></header><div class="threat-list">${threats.map(threat=>{const outcomeText=threat.outcomes.map(outcome=>{const parts:string[]=[];if(outcome.damage)parts.push(`${outcome.critical?'치명타 ':''}피해 ${outcome.damage}`);parts.push(...outcome.statuses);for(const force of outcome.forceMoves)parts.push(`${force.type} ${force.moved}/${force.requested} → ${force.to.x+1},${force.to.y+1}`);if(outcome.ko)parts.push('전투불능');return `<div class="threat-outcome"><strong>${esc(outcome.unitName)}</strong><span>${esc(parts.join(' · ')||'영향 없음')}</span></div>`}).join('');return `<button data-threat-slot="${threat.slotIndex}" class="threat-card ${focused===threat.slotIndex?'active':''} ${threat.state==='적중 예상'?'hit':threat.state==='취소 예상'?'cancel':'empty'}"><i>${threat.slotNumber}</i><div class="threat-main"><span><b>${esc(threat.actorName)}</b> · ${esc(threat.actionName)}${threat.direction?` ${esc(threat.direction)}`:''}</span>${outcomeText||`<div class="threat-outcome"><strong>${esc(threat.intendedTargetName??'대상 없음')}</strong><span>${esc(threat.reason)}</span></div>`}</div><em>${esc(threat.state)}</em></button>`}).join('')}</div></section>`
}

function rightTools(){return `<section class="right-tools"><details class="timing-panel"><summary><span>연출 속도</span><b>${engine.presentationDelayMs} ms</b></summary><div class="timing-control"><label for="execution-delay"><span>행동 사이 간격</span><span id="delay-value">${engine.presentationDelayMs} ms</span></label><input id="execution-delay" type="range" min="0" max="1500" step="10" value="${engine.presentationDelayMs}" ${engine.state.phase==='실행'?'disabled':''}><div class="timing-presets"><button data-delay="100">빠름</button><button data-delay="360">보통</button><button data-delay="800">느림</button></div></div></details><div class="right-log"><header><div><b>전투 로그</b><small>최신 기록부터 표시</small></div><em>${engine.state.log.length}</em></header><div id="log">${engine.state.log.map((line,index)=>`<div class="${index===0?'latest':''}"><i>${String(engine.state.log.length-index).padStart(2,'0')}</i><span>${esc(line)}</span></div>`).join('')}</div></div></section>`}

document.addEventListener('click',async event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return
  if(button.id==='open-editor'){scene.input.enabled=false;document.querySelector('#editor-modal')!.classList.remove('hidden');renderEditor()}
  if(button.id==='close-editor'){scene.input.enabled=true;document.querySelector('#editor-modal')!.classList.add('hidden')}
  if(button.dataset.deployUnit)engine.selectDeployUnit(button.dataset.deployUnit)
  if(button.id==='start-battle'){mode='이동';scene.setInputMode(mode);engine.startBattle()}
  if(button.id==='replan-enemy')engine.planEnemyAi()
  if(button.id==='toggle-plan-lines'){scene.toggleFocusOnly();renderBoardTools()}
  if(button.dataset.slot!==undefined){scene.clearThreatFocus();engine.selectSlot(Number(button.dataset.slot));mode='이동';scene.setInputMode(mode)}
  if(button.dataset.threatSlot!==undefined){scene.setThreatFocus(Number(button.dataset.threatSlot));render()}
  if(button.dataset.shift)engine.shiftSelectedSlot(Number(button.dataset.shift) as -1|1)
  if(button.dataset.mode){mode=button.dataset.mode as InputMode;scene.setInputMode(mode);render()}
  if(button.dataset.direction&&mode!=='이동')engine.planDirection(mode,button.dataset.direction as '상'|'하'|'좌'|'우')
  if(button.id==='plan-none')engine.planNone()
  if(button.id==='clear-plan'){engine.clearPlan();mode='이동';scene.setInputMode(mode)}
  if(button.dataset.time)engine.chooseTime(button.dataset.time as TimePeriod)
  if(button.dataset.delay){engine.setPresentationDelay(Number(button.dataset.delay));localStorage.setItem(SPEED_KEY,String(engine.presentationDelayMs))}
  if(button.id==='execute-turn')await engine.executeTurn()
  if(button.id==='restart-battle')engine.reset(content)
  handleEditorButton(button)
})

function persist(){localStorage.setItem(SAVE_KEY,JSON.stringify(content))}
function currentCollection(){return editorKind==='character'?content.characters:content.skills}
function renderEditor(){
  const collection=currentCollection(),item=collection.find(v=>v.id===selectedEditorId)??collection[0]
  if(item&&(!selectedEditorId||!collection.some(v=>v.id===selectedEditorId)))selectedEditorId=item.id
  document.querySelectorAll<HTMLButtonElement>('[data-editor-tab]').forEach(b=>b.classList.toggle('active',b.dataset.editorTab===editorKind))
  document.querySelector('#editor-list')!.innerHTML=collection.map(v=>`<button data-editor-id="${esc(v.id)}" class="${v.id===selectedEditorId?'active':''}"><b>${esc(v.name)}</b><small>${esc(editorKind==='character'?(v as CharacterDefinition).team:(v as SkillDefinition).targeting)}</small></button>`).join('')||'<p>항목 없음</p>'
  document.querySelector('#syntax-name')!.textContent=editorKind==='character'?'캐릭터 문법':'스킬 문법'
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!;if(item&&editor.dataset.loadedId!==item.id){editor.value=item.source;editor.dataset.loadedId=item.id}
  document.querySelector('#syntax-help')!.innerHTML=editorKind==='character'?'<b>캐릭터 필수 항목</b><p>ID · 진영(아군/적군) · 타입(계승자/각성자/기술자) · 체력 · 공격력 · 이동력 · 치명타피해율 · 일반공격 · 공격방식(대상/방향) · 공격사거리 · 공격범위패턴 · 스킬 ID · 색상 · 상태면역</p>':'<b>스킬 필수 항목</b><p>ID · 방식(대상/셀/설치/방향) · 사거리 · 범위패턴 · 영향셀패턴 · 쿨타임 · 치명타 · 효과. 각 효과에는 적용 범위와 대상 진영을 지정하며 설치 효과에는 환경 요소 ID를 작성합니다.</p>'
  renderEditorChoices()
}

function handleEditorButton(button:HTMLButtonElement){
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,message=document.querySelector<HTMLDivElement>('#editor-message')!
  if(button.dataset.editorTab){editorKind=button.dataset.editorTab as 'character'|'skill';selectedEditorId=currentCollection()[0]?.id??'';editor.dataset.loadedId='';renderEditor()}
  if(button.dataset.editorId){selectedEditorId=button.dataset.editorId;editor.dataset.loadedId='';renderEditor()}
  if(button.id==='load-example'){editor.value=editorKind==='character'?characterExamples.ally:skillExamples.push;editor.dataset.loadedId='';renderEditorChoices()}
  if(button.id==='new-content'){selectedEditorId='';editor.dataset.loadedId='new';editor.value=editorKind==='character'?characterExamples.ally.replaceAll('raon','new_character').replace('여명검 라온','새 캐릭터'):skillExamples.push.replaceAll('shield_crash','new_skill').replace('방패 충각','새 스킬');renderEditorChoices()}
  if(button.id==='add-effect'){editor.value=`${editor.value.trim()}\n효과: 피해 | 적용: 선택대상 | 대상: 적군 | 수치: 1`;renderEditorChoices()}
  if(button.dataset.removeEffect!==undefined){removeEffectLine(Number(button.dataset.removeEffect));renderEditorChoices()}
  if(button.id==='save-content')try{const parsed=editorKind==='character'?parseCharacter(editor.value):parseSkill(editor.value);if(editorKind==='character'){const index=content.characters.findIndex(v=>v.id===selectedEditorId||v.id===parsed.id);if(index>=0)content.characters[index]=parsed as CharacterDefinition;else content.characters.push(parsed as CharacterDefinition)}else{const index=content.skills.findIndex(v=>v.id===selectedEditorId||v.id===parsed.id);if(index>=0)content.skills[index]=parsed as SkillDefinition;else content.skills.push(parsed as SkillDefinition)}selectedEditorId=parsed.id;persist();editor.dataset.loadedId='';message.textContent='저장했습니다. 편성 반영 버튼으로 새 전투에 적용하세요.';message.classList.remove('error');renderEditor()}catch(error){message.textContent=error instanceof Error?error.message:'문법 오류';message.classList.add('error')}
  if(button.id==='delete-content'&&selectedEditorId){if(editorKind==='character')content.characters=content.characters.filter(v=>v.id!==selectedEditorId);else content.skills=content.skills.filter(v=>v.id!==selectedEditorId);selectedEditorId=currentCollection()[0]?.id??'';persist();editor.dataset.loadedId='';message.textContent='삭제했습니다.';renderEditor()}
  if(button.id==='apply-roster'){engine.reset(content);scene.input.enabled=true;document.querySelector('#editor-modal')!.classList.add('hidden');mode='이동';scene.setInputMode(mode)}
}

const choiceOptions=(values:string[],selected:string)=>values.map(value=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(value)}</option>`).join('')
function sourceValue(source:string,key:string){const match=source.match(new RegExp(`^${key}:\\s*(.*)$`,'m'));return match?.[1]?.trim()??''}
function replaceSourceLine(key:string,value:string){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,pattern=new RegExp(`^${key}:.*$`,'m');editor.value=pattern.test(editor.value)?editor.value.replace(pattern,`${key}: ${value}`):`${editor.value.trim()}\n${key}: ${value}`}
function readEffectSource(effect:string){const parts=effect.split('|').map(part=>part.trim()),[type,legacyValue='0']=parts[0].split(/\s+/),fields=new Map(parts.slice(1).map(part=>{const i=part.indexOf(':');return[part.slice(0,i).trim(),part.slice(i+1).trim()]}));return{type,scope:fields.get('적용')??'선택대상',team:fields.get('대상')??'적군',value:fields.get(type==='밀치기'||type==='당기기'?'거리':'수치')??legacyValue,environment:fields.get('환경')??'환경_ID'}}
function effectValues(){return [...document.querySelectorAll<HTMLElement>('.effect-row')].map(row=>{const type=row.querySelector<HTMLSelectElement>('[data-effect-type]')!.value,scope=row.querySelector<HTMLSelectElement>('[data-effect-scope]')!.value,team=row.querySelector<HTMLSelectElement>('[data-effect-team]')!.value,value=Number(row.querySelector<HTMLInputElement>('[data-effect-value]')!.value)||0,environment=row.querySelector<HTMLInputElement>('[data-effect-environment]')!.value.trim()||'환경_ID';if(type==='설치')return `설치 | 적용: 선택셀 | 환경: ${environment}`;const target=` | 적용: ${scope} | 대상: ${team}`;if(type==='피해')return `피해${target} | 수치: ${value}`;if(type==='밀치기'||type==='당기기')return `${type}${target} | 거리: ${value}`;return `${type}${target}`})}
function replaceEffects(values:string[]){const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,without=editor.value.split(/\r?\n/).filter(line=>!/^효과:\s*/.test(line.trim())).join('\n').trim();editor.value=`${without}${values.length?`\n${values.map(value=>`효과: ${value}`).join('\n')}`:''}`}
function removeEffectLine(index:number){const values=effectValues();values.splice(index,1);replaceEffects(values)}

function renderEditorChoices(){
  const editor=document.querySelector<HTMLTextAreaElement>('#editor')!,source=editor.value,host=document.querySelector<HTMLDivElement>('#choice-editor')!
  const select=(label:string,key:string,values:string[])=>`<label><span>${label}</span><select data-source-key="${key}">${choiceOptions(values,sourceValue(source,key))}</select></label>`
  const patterns=['마름모_1','마름모_2','마름모_3','마름모_4','사각형_1','사각형_2','사각형_3','사각형_4','직선_1','직선_2','직선_3','직선_4']
  if(editorKind==='character'){
    const immunity=(sourceValue(source,'상태면역')||'없음').split(',').map(v=>v.trim())
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>선택하면 아래 문법 원문에 자동 반영됩니다.</small></div><div class="choice-grid">${select('진영','진영',['아군','적군'])}${select('캐릭터 타입','타입',['계승자','각성자','기술자'])}${select('일반공격 방식','공격방식',['대상','방향'])}${select('공격 범위 패턴','공격범위패턴',patterns)}<label><span>연결 스킬</span><select data-source-key="스킬">${content.skills.map(skill=>`<option value="${esc(skill.id)}" ${skill.id===sourceValue(source,'스킬')?'selected':''}>${esc(skill.name)} · ${esc(skill.id)}</option>`).join('')}</select></label></div><fieldset class="immunity-choice"><legend>상태 면역</legend><label><input type="checkbox" data-immunity="밀치기" ${immunity.includes('밀치기')?'checked':''}>밀치기</label><label><input type="checkbox" data-immunity="당기기" ${immunity.includes('당기기')?'checked':''}>당기기</label><label><input type="checkbox" data-immunity="띄우기" ${immunity.includes('띄우기')?'checked':''}>띄우기</label><label><input type="checkbox" data-immunity="기절" ${immunity.includes('기절')?'checked':''}>기절</label></fieldset>`
  }else{
    const effects=source.split(/\r?\n/).filter(line=>/^효과:\s*/.test(line.trim())).map(line=>line.replace(/^효과:\s*/,''));
    host.innerHTML=`<div class="choice-heading"><b>선택 항목</b><small>효과는 순서대로 처리되며 각 효과가 대상을 따로 가집니다.</small></div><div class="choice-grid">${select('사용 방식','방식',['대상','셀','설치','방향'])}${select('치명타','치명타',['가능','불가'])}${select('범위 패턴','범위패턴',patterns)}${select('영향 셀 패턴','영향셀패턴',['없음',...patterns])}</div><div class="effect-builder"><div class="effect-title"><b>효과 순서</b><button id="add-effect">+ 효과 추가</button></div>${effects.map((effect,index)=>{const item=readEffectSource(effect),noValue=['띄우기','기절','설치'].includes(item.type);return `<div class="effect-row"><i>${index+1}</i><select data-effect-type aria-label="효과 종류">${choiceOptions(['피해','밀치기','당기기','띄우기','기절','설치'],item.type)}</select><select data-effect-scope aria-label="적용 범위" ${item.type==='설치'?'disabled':''}>${choiceOptions(['선택대상','선택셀','영향셀','자신'],item.type==='설치'?'선택셀':item.scope)}</select><select data-effect-team aria-label="대상 진영" ${item.type==='설치'?'disabled':''}>${choiceOptions(['적군','아군','모두'],item.team)}</select><input data-effect-value aria-label="수치 또는 거리" type="number" min="0" value="${esc(item.value)}" ${noValue?'disabled':''}><input data-effect-environment aria-label="환경 요소 ID" type="text" value="${esc(item.environment)}" ${item.type==='설치'?'':'disabled'}><button data-remove-effect="${index}" aria-label="효과 삭제">×</button></div>`}).join('')}</div>`
  }
}

document.addEventListener('change',event=>{
  const target=event.target as HTMLInputElement|HTMLSelectElement
  if(target.id==='execution-delay'){engine.setPresentationDelay(Number(target.value));localStorage.setItem(SPEED_KEY,String(engine.presentationDelayMs));return}
  if(target.dataset.sourceKey){replaceSourceLine(target.dataset.sourceKey,target.value);renderEditorChoices();return}
  if(target.dataset.immunity){const checked=[...document.querySelectorAll<HTMLInputElement>('[data-immunity]:checked')].map(input=>input.dataset.immunity!);replaceSourceLine('상태면역',checked.length?checked.join(', '):'없음');return}
  if(target.dataset.effectType!==undefined||target.dataset.effectScope!==undefined||target.dataset.effectTeam!==undefined||target.dataset.effectValue!==undefined||target.dataset.effectEnvironment!==undefined){replaceEffects(effectValues());renderEditorChoices()}
})

document.addEventListener('input',event=>{
  const target=event.target as HTMLInputElement|HTMLTextAreaElement
  if(target.id==='execution-delay'){document.querySelector('#delay-value')!.textContent=`${target.value} ms`;return}
  if(target.dataset.effectValue!==undefined||target.dataset.effectEnvironment!==undefined){replaceEffects(effectValues());return}
  if(target.id==='editor')renderEditorChoices()
})

engine.addEventListener('change',render)
engine.addEventListener('shard-gain',event=>showShardCollection((event as CustomEvent<ShardGainEvent>).detail))

function showShardCollection(event:ShardGainEvent){
  const board=document.querySelector<HTMLElement>('#game canvas')?.getBoundingClientRect(),watch=document.querySelector<HTMLElement>('.watch-face')?.getBoundingClientRect()
  if(!board||!watch)return
  const startX=event.source?board.left+(event.source.x+.5)*board.width/9:board.left+board.width*.5
  const startY=event.source?board.top+(event.source.y+.5)*board.height/9:board.top+board.height*.12
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
