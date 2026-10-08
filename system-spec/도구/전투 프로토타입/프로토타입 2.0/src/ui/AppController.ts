import type{BattleEngine}from'../core/BattleEngine'
import{cellsInPattern,directionFrom,key,same}from'../core/grid'
import type{BattleEvent,Cell,TimeManipulation,Unit}from'../core/types'
import type{BattleScene}from'../render/BattleScene'
import{emptyViewState,type InputMode,type ViewState}from'../render/viewState'

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const sameOptional=(a:Cell|undefined,b:Cell)=>Boolean(a&&same(a,b))
const portrait=(unit:Unit)=>`<img src="/assets/characters/${unit.asset}.png" alt="">`

export class AppController{
  private view:ViewState=emptyViewState()
  private front=true
  private timeOpen=false
  private revealedEnemies=new Set<string>()
  private revealRunning=false
  private longPressTimer=0
  private reorderSource?:number
  private reorderTarget?:number
  constructor(private root:HTMLElement,private engine:BattleEngine,private scene:BattleScene){this.mount();this.bind();this.engine.addEventListener('change',()=>this.render());this.scene.events.on('cell-click',(cell:Cell)=>this.onCell(cell));this.scene.events.on('turn-end',()=>void this.revealEnemyPlans());this.scene.events.on('shards',(event:BattleEvent)=>this.onShard(event));this.scene.events.on('time',()=>this.render());this.render()}

  private mount(){this.root.querySelector<HTMLElement>('.game-frame')!.insertAdjacentHTML('beforeend',`
    <section class="main-screen"><img src="/assets/ui/main.png" alt=""><div class="main-copy"><img src="/assets/ui/logo.png" alt="WAREDO"><p>시간을 설계하고 행동 순서를 뒤집는 전술 전투</p><button id="start-game">게임 시작</button><button id="fullscreen">전체화면</button></div></section>
    <section class="deployment-ui"></section>
    <section class="phase-clock"><span class="phase-front">작전타임!</span><span class="phase-back">작전 개시!</span></section>
    <nav class="turn-order" aria-label="행동 순서"></nav>
    <section class="watch-dock"></section>
    <section class="unit-card"></section>
    <section class="action-dock"></section>
    <section class="execute-dock"></section>
    <button class="system-button pause" aria-label="일시정지">Ⅱ</button>
    <div class="reorder-shade"><b>순서를 바꿀 아군 카드 위에서 놓으세요</b><span class="swap-label">순서 교체</span></div>
    <section class="time-modal"></section>
    <section class="result-modal"></section>`)}

  private bind(){
    this.root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('button,[data-unit-card]');if(!button)return;void this.onButton(button)})
    this.root.addEventListener('pointerdown',event=>this.beginLongPress(event))
    window.addEventListener('pointermove',event=>this.moveReorder(event))
    window.addEventListener('pointerup',()=>this.finishReorder())
    window.addEventListener('keydown',event=>{if(event.key==='Escape')this.cancelReorder()})
  }

  private render(){
    const state=this.engine.state,frame=this.root.querySelector<HTMLElement>('.game-frame')!;frame.dataset.phase=state.phase;frame.dataset.time=state.currentTime;frame.classList.toggle('front-open',this.front);frame.classList.toggle('revealing',this.revealRunning);frame.classList.toggle('reordering',this.reorderSource!==undefined)
    this.renderDeployment();this.renderTimeline();this.renderWatch();this.renderUnitCard();this.renderActions();this.renderExecute();this.renderTimeModal();this.renderResult();this.scene.setViewState({...this.view,selectedUnitId:state.selectedUnitId})
  }

  private renderDeployment(){const host=this.root.querySelector<HTMLElement>('.deployment-ui')!,allies=this.engine.state.units.filter(unit=>unit.team==='아군');host.innerHTML=`<div><small>ALLY DEPLOYMENT · 6×6</small><b>파란 구역에 아군을 배치하세요</b></div><div class="deploy-roster">${allies.map(unit=>`<button data-deploy-unit="${unit.id}" class="${this.engine.state.selectedDeployUnitId===unit.id?'active':''} ${this.engine.state.deployedAllyIds.includes(unit.id)?'placed':''}">${portrait(unit)}<span>${esc(unit.name)}</span></button>`).join('')}</div><button id="confirm-deployment" ${this.engine.state.deployedAllyIds.length===allies.length?'':'disabled'}>배치 확정</button>`}
  private renderTimeline(){const host=this.root.querySelector<HTMLElement>('.turn-order')!;host.innerHTML=this.engine.state.slots.map((slot,index)=>{const unit=this.engine.unit(slot.unitId)!,planned=slot.team==='아군'&&slot.plan.moveConfirmed&&slot.plan.actionConfirmed,revealed=slot.team==='적군'&&this.revealedEnemies.has(unit.id),active=this.engine.state.executingSlot===index;return`<button class="turn-orb ${slot.team==='아군'?'ally':'enemy'} ${planned?'planned':''} ${revealed?'revealed':''} ${active?'executing':''}" data-slot="${index}" data-unit="${unit.id}" aria-label="${esc(unit.name)}">${portrait(unit)}</button>`}).join('')}
  private watchMarkup(){const state=this.engine.state,ticks=Array.from({length:12},(_,index)=>`<i class="tick ${index===state.timeDialIndex?'active':''}" style="--i:${index}"></i>`).join('');return`<button class="pocket-watch" id="open-time" style="--charge:${state.shards/state.maxShards*360}deg;--hand:${state.timeDialIndex*30}deg" aria-label="시간 조작"><span class="watch-crown"></span><span class="watch-chain"></span>${ticks}<span class="watch-hand"></span><b>${state.currentTime}</b></button><div class="shard-gauge"><span style="width:${state.shards/state.maxShards*100}%"></span></div><small>시간 파편 ${state.shards}/${state.maxShards}</small>`}
  private renderWatch(){this.root.querySelector<HTMLElement>('.watch-dock')!.innerHTML=this.watchMarkup()}
  private renderUnitCard(){const unit=this.engine.selectedUnit(),host=this.root.querySelector<HTMLElement>('.unit-card')!;if(!unit){host.innerHTML='';return}const skill=this.engine.skill(unit),slot=this.engine.slotFor(unit.id);host.className=`unit-card ${unit.team==='적군'?'enemy':''}`;host.innerHTML=`<div class="unit-portrait">${portrait(unit)}</div><div><small>${unit.team} · ${unit.type}</small><b>${esc(unit.name)}</b><div class="hp"><span style="width:${unit.hp/unit.maxHp*100}%"></span></div><p>HP ${unit.hp}/${unit.maxHp} · 이동 ${unit.moveRange}</p><em>${unit.normalAttack.name} · 사거리 ${unit.normalAttack.range}</em>${skill?`<em>${skill.name} · ${skill.cooldown}턴</em>`:''}${slot?.team==='아군'?`<button id="clear-plan">계획 초기화</button>`:''}</div>`}
  private renderActions(){const host=this.root.querySelector<HTMLElement>('.action-dock')!,unit=this.engine.selectedUnit(),ally=unit?.team==='아군'&&this.engine.state.phase==='계획',slot=unit?this.engine.slotFor(unit.id):undefined,pending=Boolean(slot&&slot.plan.action.kind!=='없음'&&!slot.plan.actionConfirmed);host.innerHTML=`${pending?'<button id="confirm-action" class="confirm-orb">확정</button>':''}<div class="action-row"><button class="action-orb attack ${this.view.mode==='일반공격'?'active':''}" data-mode="일반공격" ${ally?'':'disabled'}><span>⚔</span><small>공격</small></button><button class="action-orb skill ${this.view.mode==='스킬'?'active':''}" data-mode="스킬" ${ally&&unit.cooldownRemaining===0?'':'disabled'}><span>✦</span><small>스킬</small></button><button class="wait-button" id="wait-action" ${ally?'':'disabled'}>대기</button></div>`}
  private renderExecute(){const ready=this.engine.allAlliesPlanned;this.root.querySelector<HTMLElement>('.execute-dock')!.innerHTML=`<button id="execute-turn" class="${ready?'ready':''}" ${ready&&!this.revealRunning?'':'disabled'}>${ready?'작전 개시!':'행동을 설계하세요'}</button>`}
  private renderTimeModal(){const host=this.root.querySelector<HTMLElement>('.time-modal')!;if(!this.timeOpen){host.innerHTML='';host.classList.remove('open');return}host.classList.add('open');host.innerHTML=`<div class="time-card"><header><div><small>TIME MANIPULATION</small><b>시간 조작</b></div><button id="close-time">×</button></header><div class="large-watch">${this.watchMarkup()}</div><div class="time-options">${(['가속','정지','역행']as TimeManipulation[]).map(kind=>`<button data-time="${kind}" ${this.engine.canManipulate(kind)?'':'disabled'}><b>${kind}</b><span>${kind==='가속'?'시간을 한 칸 앞으로 이동':kind==='정지'?'이번 턴 시간 진행 정지':'시간을 한 칸 뒤로 이동'}</span><em>${this.engine.state.timeManipulationCost} 파편</em></button>`).join('')}</div></div>`}
  private renderResult(){const host=this.root.querySelector<HTMLElement>('.result-modal')!,phase=this.engine.state.phase;if(phase!=='승리'&&phase!=='패배'){host.innerHTML='';host.classList.remove('open');return}host.classList.add('open');host.innerHTML=`<div><small>BATTLE COMPLETE</small><b>${phase}</b><button id="retry">다시하기</button><button id="to-main">메인 화면</button></div>`}

  private async onButton(button:HTMLElement){
    if(button.id==='start-game'){this.front=false;this.render();return}if(button.id==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await this.root.requestFullscreen();return}
    const deploy=button.dataset.deployUnit;if(deploy){this.engine.selectDeployUnit(deploy);return}if(button.id==='confirm-deployment'){if(this.engine.beginBattle()){this.resetView();void this.revealEnemyPlans()}return}
    const unitId=button.dataset.unit;if(unitId&&button.dataset.slot!==undefined){const unit=this.engine.unit(unitId);if(unit){this.engine.selectUnit(unitId);this.resetView(unitId);if(unit.team==='적군')void this.scene.revealEnemy(unit.id)}return}
    const mode=button.dataset.mode as InputMode|undefined;if(mode&&mode!=='이동'){this.beginTargeting(mode);return}if(button.id==='confirm-action'){this.confirmSelectedAction();return}if(button.id==='wait-action'){const unit=this.engine.selectedUnit();if(unit){const origin=this.engine.actionOrigin(unit.id)??unit.position;this.engine.setDestination(unit.id,origin);this.engine.setAction(unit.id,{kind:'없음'});this.engine.confirmAction(unit.id);this.resetView(unit.id)}return}
    if(button.id==='clear-plan'){const unit=this.engine.selectedUnit();if(unit){this.engine.clearPlan(unit.id);this.resetView(unit.id)}return}if(button.id==='execute-turn'){await this.startExecution();return}
    if(button.id==='open-time'){this.timeOpen=true;this.render();return}if(button.id==='close-time'){this.timeOpen=false;this.render();return}const manipulation=button.dataset.time as TimeManipulation|undefined;if(manipulation&&this.engine.manipulateTime(manipulation)){this.timeOpen=false;this.render();return}
    if(button.id==='retry'){this.engine.reset();this.front=false;this.revealedEnemies.clear();this.resetView();return}if(button.id==='to-main'){this.engine.reset();this.front=true;this.revealedEnemies.clear();this.resetView()}
  }

  private onCell(cell:Cell){
    if(this.front||this.revealRunning||this.reorderSource!==undefined)return
    if(this.engine.state.phase==='배치'){this.engine.deploy(cell);return}if(this.engine.state.phase!=='계획')return
    if(this.view.targeting){if(!this.view.selectableCells.some(candidate=>same(candidate,cell)))return;const unit=this.engine.selectedUnit();if(!unit)return;if(sameOptional(this.view.targetCell,cell)){this.confirmSelectedAction();return}const kind=this.view.mode as'일반공격'|'스킬';this.engine.setAction(unit.id,{kind,target:cell,direction:directionFrom(this.engine.actionOrigin(unit.id)??unit.position,cell)});const slot=this.engine.slotFor(unit.id)!;this.view.targetCell={...cell};this.view.selectedCells=this.engine.actionCells(slot);this.scene.setViewState(this.view);this.render();return}
    const occupant=this.engine.unitAt(cell);if(occupant){this.engine.selectUnit(occupant.id);this.resetView(occupant.id);if(occupant.team==='적군')void this.scene.revealEnemy(occupant.id);return}
    const unit=this.engine.selectedUnit();if(unit?.team==='아군'&&this.engine.setDestination(unit.id,cell))this.resetView(unit.id)
  }

  private beginTargeting(mode:Exclude<InputMode,'이동'>){const unit=this.engine.selectedUnit();if(!unit||unit.team!=='아군')return;const origin=this.engine.actionOrigin(unit.id)??unit.position;this.engine.setDestination(unit.id,origin);const definition=mode==='스킬'?this.engine.skill(unit):unit.normalAttack;if(!definition)return;let cells:Cell[]=[];if(definition.targeting==='자가 버프형'||definition.targeting==='자기 기준형')cells=[origin];else if(definition.pattern.startsWith('직선'))for(const direction of ['상','하','좌','우']as const)cells.push(...cellsInPattern(origin,definition.pattern,definition.range,direction));else cells=cellsInPattern(origin,definition.pattern,definition.range);this.view={mode,selectedUnitId:unit.id,selectableCells:[...new Map(cells.map(cell=>[key(cell),cell])).values()],selectedCells:[],targeting:true};this.render()}
  private confirmSelectedAction(){const unit=this.engine.selectedUnit();if(!unit)return;const slot=this.engine.slotFor(unit.id);if(!slot||slot.plan.action.kind==='없음')return;this.engine.confirmAction(unit.id);this.resetView(unit.id)}
  private resetView(selectedUnitId=this.engine.state.selectedUnitId){this.view={...emptyViewState(),selectedUnitId};this.render()}
  private async revealEnemyPlans(){if(this.engine.state.phase!=='계획')return;this.revealRunning=true;this.revealedEnemies.clear();this.render();for(const slot of this.engine.state.slots.filter(candidate=>candidate.team==='적군')){this.revealedEnemies.add(slot.unitId);this.render();await this.scene.revealEnemy(slot.unitId)}this.revealRunning=false;this.view.enemyPreviewUnitId=undefined;this.render()}
  private async startExecution(){if(!this.engine.allAlliesPlanned)return;const frame=this.root.querySelector<HTMLElement>('.game-frame')!;frame.classList.add('operation-start');window.setTimeout(()=>frame.classList.remove('operation-start'),450);await this.engine.executeTurn(event=>this.scene.present(event))}
  private onShard(event:BattleEvent){if(event.type!=='shards')return;const watch=this.root.querySelector<HTMLElement>('.pocket-watch');watch?.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:350})}

  private beginLongPress(event:PointerEvent){const orb=(event.target as HTMLElement).closest<HTMLElement>('.turn-orb.ally');if(!orb||this.engine.state.phase!=='계획')return;const index=Number(orb.dataset.slot);window.clearTimeout(this.longPressTimer);this.longPressTimer=window.setTimeout(()=>{this.reorderSource=index;this.reorderTarget=undefined;this.render()},2000)}
  private moveReorder(event:PointerEvent){if(this.reorderSource===undefined)return;let nearest:{index:number;distance:number}|undefined;for(const orb of this.root.querySelectorAll<HTMLElement>('.turn-orb.ally')){const index=Number(orb.dataset.slot);orb.classList.remove('swap-target');if(index===this.reorderSource){orb.style.position='fixed';orb.style.left=`${event.clientX-orb.offsetWidth/2}px`;orb.style.top=`${event.clientY-orb.offsetHeight/2}px`;orb.style.zIndex='130';continue}const box=orb.getBoundingClientRect(),distance=Math.hypot(event.clientX-(box.left+box.width/2),event.clientY-(box.top+box.height/2));if(!nearest||distance<nearest.distance)nearest={index,distance}}this.reorderTarget=nearest&&nearest.distance<75?nearest.index:undefined;if(this.reorderTarget!==undefined)this.root.querySelector<HTMLElement>(`.turn-orb[data-slot="${this.reorderTarget}"]`)?.classList.add('swap-target');const label=this.root.querySelector<HTMLElement>('.swap-label')!;label.classList.toggle('show',this.reorderTarget!==undefined);label.style.left=`${event.clientX}px`;label.style.top=`${event.clientY}px`}
  private finishReorder(){window.clearTimeout(this.longPressTimer);if(this.reorderSource===undefined)return;if(this.reorderTarget!==undefined)this.engine.swapAllySlots(this.reorderSource,this.reorderTarget);this.cancelReorder()}
  private cancelReorder(){window.clearTimeout(this.longPressTimer);this.reorderSource=undefined;this.reorderTarget=undefined;this.render()}
}
