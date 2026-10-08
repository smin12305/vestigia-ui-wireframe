# 첨부 HTML 정적 분석 근거

원본: C:/Users/smin/Documents/카카오톡 받은 파일/전투 프로토타입 최종.html

SHA-256: 4C3F88907AC907A604A8381AB7C49FA6BA37057517FCC7DB7D9BF714C7966C78

2026-09-23 읽기 전용 발췌. 파일은 실행하지 않았다. 함수와 UI 코드가 존재한다는 근거이며 실행 성공을 보증하지 않는다. UTF-16 문자 오프셋은 원본 문자열에서 0부터 센다. 발췌는 함수 전체가 아니라 시작점 주변이다.

## startBattle(){

원본 문자 오프셋: 1392201

startBattle(){!this.canConfirmDeployment()||!this.state.units.length||(this.state.firstTeam="아군",this.state.phase="계획",this.state.log=[],this.log("전투 시작: 아군 선공"),this.rebuildSlots(),this.planEnemyAi(!1),this.emit(),this.announceTimeDamageBuff())}tossFirstTeam(){return this.state.phase!=="배치"?this.state.firstTeam:(this.state.firstTeam="아군",this.log("선공 고정: 아군"),this.emit(),this.state.firstTeam)}debugWinStage(){if(this.state.phase==="실행")return!1;for(const F of this.state.units)F.team==="적군"&&(F.hp=0);return this.state.phase="승리",this.state.executingSlot=-1,this.log("디버그: 현재 스테이지 즉시 승리"),this.em

## tossFirstTeam(){

원본 문자 오프셋: 1392447

```javascript
tossFirstTeam(){return this.state.phase!=="배치"?this.state.firstTeam:(this.state.firstTeam="아군",this.log("선공 고정: 아군"),this.emit(),this.state.firstTeam)}debugWinStage(){if(this.state.phase==="실행")return!1;for(const F of this.state.units)F.team==="적군"&&(F.hp=0);return this.state.phase="승리",this.state.executingSlot=-1,this.log("디버그: 현재 스테이지 즉시 승리"),this.emit(),!0}rebuildSlots(){const F={아군:this.livingUnits.filter(T=>T.team==="아군"),적군:this.livingUnits.filter(T=>T.team==="적군")},G=new Map(this.state.slots.filter(T=>T.team==="아군").map((T,t)=>[T.unitId,t]));F.아군.sort((T,t)=>(G.get(T.id)??1/0)-(G.get(t.id)??1/0)),F.적군.sort((T,t)=>+(t.id==="fallen_paladin")-+(T.id==="fallen_paladin"));const I={아군:0,적군:0},z=this.state.firstTeam==="아군"?"적군":"아군",W=[this.state.firstTeam,z],p=[];for(;I.아군<F.아군.length||I.적군<F.적군.length;)for(const T of W){const t=F[T][I[T]++];t&&p.push({number:p.length+1,team:T,unitId:t.id,plan:{path:[{...t.position}],action:{kind:"없음"}},result:"대기"})}this.state.slots=p,this.state.selectedSlot=Math.max(0,p.findIndex(T=>T.team==="아군")),this.state.selectedTime=this.state.currentTime}selectSlot(F){this.state.phase!=="계획"||!this.state.slots[F]||this.enemyAiEnabled&&this.state.slots[F].team==="적군"||(this.state.selectedSlot=F,this.emit())}clearSelection(){this.state.phase!=="계획"||this.state.selectedSlot<0||(this.state.selectedSlot=-1,this.emit())}shiftSelectedSlot(F){const G=this.sel
```

## canManipulateTime(){

원본 문자 오프셋: 1389729

```javascript
canManipulateTime(){return this.state.phase==="계획"&&this.state.currentTime==="현재"&&!this.state.timeManipulationUsed&&this.state.shards>=100}commitTimeManipulation(F){if(!this.canManipulateTime())return!1;const G=this.state.currentTime,I=this.getTimeManipulationPreview(F),z=this.state.timeManipulationCost;return this.state.shards-=z,this.state.timeManipulationCost=100,this.state.timeManipulationUsed=!0,this.state.timeStoppedThisTurn=!1,this.state.timeDialIndex=I.dialIndex,this.state.timeCycleProgress=1,I.period!==G&&(this.state.currentTime=I.period,this.state.selectedTime=I.period,this.state.timeStreak=1,this.applyTimeEntry(I.period)),this.applyRelicStats(this.state.currentTime),this.log(`${F} 시간대 진입 · 2턴 유지 · 파편 ${z} 소모`),this.dispatchEvent(new CustomEvent("time-advance",{detail:{from:G,to:this.state.currentTime,suppressed:!1,streak:this.state.timeStreak,cycleProgress:this.state.timeCycleProgress,dialIndex:this.state.timeDialIndex,manipulation:F}})),this.emit(),!0}get livingUnits(){return this.state.units.filter(F=>F.hp>0&&(this.state.phase!=="배치"||F.team==="적군"||this.state.deployedAllyIds.includes(F.id)))}get boardSize(){return this.state.boardSize}get selectedActionSlot(){return this.state.slots[this.state.selectedSlot]}get selectedUnit(){const F=this.state.phase==="배치"?this.state.selectedDeployUnitId:this.selectedActionSlot?.unitId;return this.state.units.find(G=>G.id===F)}g
```

## getCriticalRate(F,G){

원본 문자 오프셋: 1384798

```javascript
getCriticalRate(F,G){const I=G??this.state?.currentTime??"현재",z=this.baseCharacter(F),W=F.team==="아군"?this.relicBonus(F,"치명타피해율",I):0;return Math.max(0,z.criticalRate+W+(F.team==="아군"&&I==="미래"?20:0))}actionDamageBeforeTime(F,G,I,z){let W=I;if(F.team==="아군"){W+=this.relicEffects(F,"추가피해",z).filter(t=>["항상","시간대상시"].includes(t.trigger)).reduce((t,l)=>t+l.value,0);const p=this.relicEffects(F,G==="일반공격"?"일반공격피해":"스킬피해",z).filter(t=>["항상","시간대상시"].includes(t.trigger)).reduce((t,l)=>t+l.value,0),T=this.relicEffects(F,"최종피해",z).filter(t=>["항상","시간대상시"].includes(t.trigger)).reduce((t,l)=>t+l.value,0);W*=Math.max(0,1+(p+T)/100)}return W}actionDamageAmount(F,G,I,z){return this.actionDamageBeforeTime(F,G,I,z)}getActionDamagePreview(F,G,I,z=this.state?.currentTime??"현재"){return Math.max(0,Math.floor(this.actionDamageAmount(F,G,I,z)))}getTimeStatBonuses(F,G=this.state?.currentTime??"현재"){const I=this.baseCharacter(F),z=this.isTimeFavored(F,G)?1:0;return{attack:0,move:this.getMoveRange(F,G)-I.moveRange,critical:this.getCriticalRate(F,G)-I.criticalRate,classDamage:0,stacks:z}}isTimeFavored(F,G){return F.team==="아군"&&F.timeTag===G}getMaxHp(F,G){const I=this.baseCharacter(F);return F.team==="아군"?Math.max(1,I.maxHp+this.relicBonus(F,"최대체력",G)):I.maxHp}applyRelicStats(F){for(const G of this.state.units)G.maxHp=this.getMaxHp(G,F),G.hp=Math.min(G.hp,G.maxHp),G.attackPower=this.getAttackPower(G,F),
```

## resetAllyPlans(){

원본 문자 오프셋: 1394984

```javascript
resetAllyPlans(){if(this.state.phase==="계획"){for(const F of this.state.slots.filter(G=>G.team==="아군")){const G=this.state.units.find(I=>I.id===F.unitId);G&&(F.plan={path:[{...G.position}],action:{kind:"없음"}},F.result="대기")}this.emit()}}planNone(){const F=this.selectedPlan;F&&(F.action={kind:"없음"},this.emit())}planDirection(F,G){const I=this.selectedPlan;this.state.phase!=="계획"||!I||(I.action={kind:F,direction:G},this.emit())}planRelativeTarget(F,G){const I=this.selectedPlan,z=I?.path.at(-1);this.state.phase!=="계획"||!I||!z||(I.action={kind:F,relativeTarget:{x:G.x-z.x,y:G.y-z.y}},this.emit())}planSelf(F,G,I=!1){const z=this.selectedPlan;this.state.phase!=="계획"||!z||(z.action={kind:F,selfConfirmed:I,selfTargetCell:{...G}},this.emit())}planEnemyAi(F=!0){if(!this.enemyAiEnabled||this.state.phase!=="계획")return;for(const I of Is(this.state,this.content)){const z=this.state.slots[I.slotIndex];z&&(z.plan={path:I.plan.path.map(W=>({...W})),action:{...I.plan.action,relativeTarget:I.plan.action.relativeTarget?{...I.plan.action.relativeTarget}:void 0,selfTargetCell:I.plan.action.selfTargetCell?{...I.plan.action.selfTargetCell}:void 0}},this.log(`AI ${z.number}. ${this.state.units.find(W=>W.id===z.unitId)?.name??"적군"} — ${I.reason} (${Math.round(I.score)})`))}const G=this.state.slots.findIndex(I=>I.team==="아군");G>=0&&(this.state.selectedSlot=G),F&&this.emit()}getForcedMovePreviews(F){const G
```

## beginMoveDrag(F){

원본 문자 오프셋: 1712938

```javascript
beginMoveDrag(F){const G=this.engine.selectedUnit,I=this.engine.selectedPlan;if(this.engine.state.phase!=="계획"||this.mode!=="이동"||G?.team!=="아군"||!I)return;const z=I.path.findIndex(W=>W.x===F.x&&W.y===F.y);z<0||(this.dragUnitId=G.id,this.dragStarted=!1,this.dragBasePath=I.path.slice(0,z+1).map(W=>({...W})))}continueMoveDrag(F,G){if(!G.isDown||!this.dragUnitId)return;const I=this.engine.selectedUnit,z=this.engine.selectedPlan;if(!I||I.id!==this.dragUnitId||!z)return;const W=this.dragStarted?z.path:this.dragBasePath,p=W[W.length-1];if(Kt(p,F)!==1)return;const T=W.findIndex(l=>l.x===F.x&&l.y===F.y),t=T>=0?W.slice(0,T+1):[...W,{...F}];this.engine.setPath(t)&&(this.dragStarted=!0)}pointFromPointer(F){const G=(F.worldX-rs)/(Ve/2),I=(F.worldY-vi)/(we/2),z={x:Math.round((G+I)/2),y:Math.round((I-G)/2)};return z.x<0||z.y<0||z.x>=this.engine.boardSize||z.y>=this.engine.boardSize?void 0:z}continueMoveFromPointer(F){if(!F.isDown||!this.dragUnitId)return;const G=this.pointFromPointer(F);G&&this.continueMoveDrag(G,F)}endMoveDrag(){this.dragUnitId=void 0,this.dragStarted=!1,this.dragBasePath=[]}isTargetable(F){if(this.engine.state.phase==="배치"||this.engine.state.phase!=="계획"||this.mode==="이동")return!1;const G=this.engine.selectedUnit,I=this.engine.selectedPlan;if(!G||!I)return!1;const z=I.path[I.path.length-1],W=this.mode==="일반공격"?G.normalAttack:this.engine.getSkill(G);return W?W.targeting==="
```

## isTargetable(F){

원본 문자 오프셋: 1714034

```javascript
isTargetable(F){if(this.engine.state.phase==="배치"||this.engine.state.phase!=="계획"||this.mode==="이동")return!1;const G=this.engine.selectedUnit,I=this.engine.selectedPlan;if(!G||!I)return!1;const z=I.path[I.path.length-1],W=this.mode==="일반공격"?G.normalAttack:this.engine.getSkill(G);return W?W.targeting==="자기 기준형"?ye(z,F,W.affectedCellPatternId??W.rangePatternId,W.range):W.targeting==="자가 버프형"?this.mode==="스킬"&&this.engine.getSkill(G)?.effects.some(p=>p.type==="반격")?Math.max(Math.abs(z.x-F.x),Math.abs(z.y-F.y))<=1:z.x===F.x&&z.y===F.y:W.trajectory==="곡사"?Nt(z,F,W.rangePatternId,W.range):(z.x===F.x||z.y===F.y)&&Kt(z,F)>0&&Kt(z,F)<=W.range:!1}isCounterRangePreview(F){if(this.engine.state.phase!=="계획"||this.mode!=="스킬")return!1;const G=this.engine.selectedUnit,I=this.engine.selectedPlan?.path.at(-1);if(!G||!I)return!1;const z=this.engine.getSkill(G);return z?.targeting!=="자가 버프형"||!z.effects.some(W=>W.type==="반격")?!1:Math.max(Math.abs(I.x-F.x),Math.abs(I.y-F.y))<=1}isInCastRange(F){if(this.engine.state.phase!=="계획"||this.mode==="이동")return!1;const G=this.engine.selectedUnit,I=this.engine.selectedPlan?.path.at(-1);if(!G||!I)return!1;const z=this.mode==="일반공격"?G.normalAttack:this.engine.getSkill(G);return z?z.targeting==="자기 기준형"?ye(I,F,z.affectedCellPatternId??z.rangePatternId,z.range):z.targeting==="자가 버프형"?this.mode==="스킬"&&this.engine.getSkill(G)?.effects.some(W=>W.type==="반격")?Math
```

## function Ee(){

원본 문자 오프셋: 26634554

```javascript
function Ee(){const H=q.validatePlans();if(H)return H;const F=q.state.slots.find(I=>I.team==="아군"&&I.plan.action.kind!=="없음"&&!Gt.has(I.unitId));if(!F)return"";const G=q.state.units.find(I=>I.id===F.unitId);return`${F.number}번 ${G?.name??"아군"} 행동을 확정하세요.`}function ds(){const H=q.state;return H.currentTime==="현재"?"":`<div class="time-arrival-drawer" data-period="${H.currentTime}" role="status"><b>${H.currentTime}로 이동</b><small>${Ri(H.currentTime,H.timeCycleProgress)}</small></div>`}function pn(){const H=q.state,F=vn(),G=nt.getThreatFocus()!==void 0,I=G?void 0:q.selectedUnit,z=G?void 0:q.selectedActionSlot,W=I?q.getSkill(I):void 0,p=H.phase==="계획",T=p&&I?.team==="아군"&&z?.team==="아군",t=p&&de&&q.canManipulateTime(),l=document.querySelector("#mobile-time-dock");l.innerHTML=`<div class="pocket-watch-wrap"><div class="mobile-watch period-${H.currentTime} ${H.shards>=H.maxShards?"full":""}" style="--charge:${H.shards/H.maxShards*360}deg;--hand-angle:${us(H.currentTime)}deg"><span class="watch-crown"></span><span class="watch-chain"></span><span class="time-charge-ring ${H.shards>0?"charged":""}" aria-hidden="true"></span><i class="watch-hand"></i><span class="watch-time-callout" aria-live="polite"></span></div></div>${t?'<div class="time-choice-drawer" role="group" aria-label="시간 이동 선택"><button class="past" data-quick-time="과거"><b>과거로 회귀</b></button><button class="future" data-quick-ti
```

## id="confirm-action"

원본 문자 오프셋: 26638649

```javascript
id="confirm-action" class="confirm-action ${a&&!r?"ready":""}" ${a&&!r?"":"disabled"}>${r?"설정 완료":"확정"}</button></div></div><div class="mobile-action-buttons"><button data-mobile-mode="일반공격" class="combat-button attack ${ut==="일반공격"?"active":""}" ${T?"":"disabled"}><i>⚔</i><span>공격</span><small>${I?ue(I.normalAttack.targeting):""}</small></button>${I&&q.getTimeStatBonuses(I).stacks?'<span class="ultimate-button-flame" aria-hidden="true"></span>':""}<button data-mobile-mode="스킬" class="combat-button skill ${I&&q.getTimeStatBonuses(I).stacks?"time-awakened":""} ${e?"":"disabled"} ${ut==="스킬"?"active":""}" ${e?"":"disabled"}>${W&&I?$s(W.cooldown,I.cooldownRemaining):""}<i>✦</i><span>${I&&q.getTimeStatBonuses(I).stacks?"궁극기":"스킬"}</span><small>${W?st(W.name):"없음"}</small></button></div>`,document.querySelector("#mobile-execute-dock").innerHTML=`<button id="mobile-execute" class="mobile-execute ${s?"ready":""}" ${s?"":"disabled"}><span>${s?"작전 개시!":"행동 설계 중"}</span></button><button id="observe-future" class="future-observe-button" ${s?"":"disabled"}>미래 관측</button><button id="mobile-reset-plans" class="mobile-reset-plans" ${p?"":"disabled"}>계획 초기화</button>`}function $i(H){const F=q.selectedUnit;if(!(q.state.phase!=="계획"||F?.team!=="아군")){if(ut===H){Li();return}(!Vt||Vt.unitId!==F.id)&&(Vt={unitId:F.id}),Gt.delete(F.id),ut=H,q.planNone(),nt.clearThreatFocus(),nt.setPlanView("current")
```

## createObservation(){

원본 문자 오프셋: 1383599

```javascript
createObservation(){const F=new Si(structuredClone(this.content),structuredClone(this.relicLoadouts),this.boardSize);return F.state=structuredClone(this.state),F.firstMoveRelicUnits=new Set(this.firstMoveRelicUnits),F.enemyAiEnabled=this.enemyAiEnabled,F.presentationDelayMs=240,F}relicEffects(F,G,I,z){if(F.team!=="아군")return[];const W=this.relicLoadouts[I]??[];return this.content.relics.filter(p=>W.includes(p.id)).flatMap(p=>p.effects).filter(p=>p.kind===G&&(!z||p.trigger===z))}relicBonus(F,G,I){return this.relicEffects(F,G,I).filter(z=>["항상","시간대상시"].includes(z.trigger)&&(!z.hpThreshold||F.hp/F.maxHp*100<=z.hpThreshold)).reduce((z,W)=>z+W.value,0)}baseCharacter(F){return this.content.characters.find(G=>G.id===F.id)??F}getMoveRange(F,G){const I=G??this.state?.currentTime??"현재",z=this.baseCharacter(F),W=this.firstMoveRelicUnits.has(F.id)?this.relicEffects(F,"첫이동력",I,"시간대진입").reduce((T,t)=>T+t.value,0):0,p=F.team==="아군"?this.relicBonus(F,"이동력",I)+W:0;return Math.max(0,z.moveRange+p+(F.team==="아군"&&I==="과거"?1:0))}getAttackPower(F,G){const I=G??this.state?.currentTime??"현재",z=this.baseCharacter(F);return F.team==="아군"?Math.max(0,z.attackPower+this.relicBonus(F,"공격력",I)):z.attackPower}getCriticalRate(F,G){const I=G??this.state?.currentTime??"현재",z=this.baseCharacter(F),W=F.team==="아군"?this.relicBonus(F,"치명타피해율",I):0;return Math.max(0,z.criticalRate+W+(F.team==="아군"&&I==="미래"?20:0))}
```

## async observeFuture(F){

원본 문자 오프셋: 1668390

```javascript
async observeFuture(F){const G=this.engine,I=()=>{F.state.phase!=="계획"&&this.renderBoard()};this.observingFuture=!0,this.engine=F,F.addEventListener("change",I);try{await F.executeTurn()}finally{F.removeEventListener("change",I),this.engine=G,this.observingFuture=!1}}refreshBoard(){this.renderBoard()}setInputMode(F){this.mode=F,this.renderBoard()}getInputMode(){return this.mode}setPlanView(F){this.planView=F,F!=="current"&&(this.threatFocusSlot=void 0),this.renderBoard()}getPlanView(){return this.planView}setThreatFocus(F){return this.planView="current",this.threatFocusSlot=this.threatFocusSlot===F?void 0:F,this.threatFocusSlot===void 0&&(this.planView="all"),this.renderBoard(),this.threatFocusSlot}focusThreat(F){this.planView="current",this.threatFocusSlot=F,this.renderBoard()}clearThreatFocus(){this.threatFocusSlot=void 0,this.renderBoard()}getThreatFocus(){return this.threatFocusSlot}isVisibleSlot(F){if(this.engine.state.phase==="실행")return F===this.engine.state.executingSlot;if(this.engine.state.phase==="계획"){const G=this.engine.state.slots[F];return G?.team==="적군"||F===this.engine.state.selectedSlot||!!(G?.team==="아군"&&this.isActionConfirmed(G.unitId))}return!0}isEmphasizedSlot(F){return this.threatFocusSlot!==void 0?F===this.threatFocusSlot:this.engine.state.phase==="실행"?F===this.engine.state.executingSlot:F===this.engine.state.selectedSlot}renderBoard(){const F=this.engi
```

## async function mn(){

원본 문자 오프셋: 26640716

```javascript
async function mn(){if(ze||ee||q.state.phase!=="계획"||!de||Ee())return;ze=!0;const H=document.querySelector(".game-shell"),F=document.createElement("div");F.className="future-observation-overlay",F.innerHTML='<div class="future-blackout"></div><div class="future-watch-stage"></div><div class="future-observation-label" role="status">미래 관측 · 진입 중</div>',H.append(F);const G=F.querySelector(".future-blackout"),I=F.querySelector(".future-watch-stage"),z=F.querySelector(".future-observation-label"),W=document.querySelector(".mobile-watch");if(W){const t=W.cloneNode(!0);t.removeAttribute("id"),t.querySelectorAll("[id]").forEach(l=>l.removeAttribute("id")),I.append(t)}else I.innerHTML='<div class="future-fallback-clock"><i class="watch-hand"></i></div>';const p=async(t,l,c)=>{await t.animate(l,{duration:c,fill:"forwards",easing:"ease-in-out"}).finished},T=async t=>{z.textContent=t>0?"미래 관측 · 미래로 이동":"미래 관측 · 계획으로 복귀",await p(G,[{opacity:0},{opacity:1}],300),I.style.opacity="1";const l=I.querySelector(".watch-hand");await Promise.all([p(I,[{transform:"translate(-50%,-50%) scale(.65)"},{transform:"translate(-50%,-50%) scale(1.35)",offset:.25},{transform:"translate(-50%,-50%) scale(1.35)",offset:.8},{transform:"translate(-50%,-50%) scale(.65)"}],1200),l?p(l,[{transform:"translateX(-50%) rotate(0deg)"},{transform:`translateX(-50%) rotate(${t*360}deg)`}],1200):_t(1200)]),I.style.opacity="0"}
```

## validatePlans(){

원본 문자 오프셋: 1397200

```javascript
validatePlans(){for(const F of this.state.slots){const G=this.state.units.find(z=>z.id===F.unitId);if(!G)return`${F.number}번 슬롯의 캐릭터가 없습니다.`;if(!this.canPlanPath(G,F.plan.path))return`${F.number}번 ${G.name}의 이동 경로가 유효하지 않습니다.`;const I=F.plan.action;if(I.kind==="스킬"&&G.cooldownRemaining>0)return`${G.name}의 스킬 쿨타임이 남았습니다.`;if(I.kind!=="없음"){const z=I.kind==="일반공격"?G.normalAttack:this.getSkill(G);if(!z)return`${F.number}번 행동 정의가 없습니다.`;if(z.targeting==="방향 선택형"&&z.trajectory==="곡사"&&!I.relativeTarget)return`${F.number}번 행동의 착탄 타일을 선택하세요.`;if(z.targeting==="방향 선택형"&&z.trajectory!=="곡사"&&!I.direction)return`${F.number}번 행동의 방향을 선택하세요.`;if(z.targeting!=="방향 선택형"&&!I.selfConfirmed)return`${F.number}번 행동의 자기 기준 범위를 확정하세요.`}}return""}async executeTurn(){const F=this.validatePlans();if(F)return this.log(F),this.emit(),!1;this.state.phase="실행",this.state.executingSlot=-1,this.applyRelicStats(this.state.currentTime),this.applyTurnRelics(),this.log(`${this.state.currentTime} 시간대 효과 적용`),this.emit(),await Yt(this.presentationDelayMs);for(let G=0;G<this.state.slots.length&&!this.isFinished();G++){const I=this.state.slots[G],z=this.state.units.find(c=>c.id===I.unitId);if(this.state.executingSlot=G,this.emit(),!z||z.hp<=0){I.result="취소";continue}if(z.statuses.some(c=>c.type==="띄워짐")){z.statuses=z.statuses.filter(c=>c.type!=="띄워짐"),I.result="취소",this.log(`${I.number}. ${z.name} — 띄워짐 해제, 행동 패스`)
```

## class="result ${F.phase}"

원본 문자 오프셋: 26644880

```javascript
class="result ${F.phase}"><small>BATTLE RESULT</small><h2>${F.phase}</h2><p>${F.phase==="승리"?"모든 적이 전투 불능입니다.":"모든 아군이 전투 불능입니다."}</p><button class="execute" id="return-main">메인 화면으로</button></div>${Ae()}`;return}if(F.phase==="실행"){const i=F.slots[F.executingSlot],o=F.units.find(d=>d.id===i?.unitId),u=i?.plan.action;H.innerHTML=`<div class="panel-title"><small>NOW RESOLVING</small><h2>계획 실행</h2></div>${o?mi(o):'<p class="empty-state">다음 행동을 준비하고 있습니다.</p>'}${i&&u?`<div class="execution-card"><span>${i.number}번 행동 · ${i.team}</span><b>${st(u.kind)}${u.direction?` · ${u.direction}`:""}${u.selfConfirmed?" · 자기 기준":""}</b><small>${i.result==="대기"?"이동과 공격을 판정하는 중입니다.":`결과 · ${i.result}`}</small></div>`:""}<div class="execution-note"><i></i><span>반격이 발동하면 반격자 돌진과 피격 강조 뒤 피해를 처리하고 실행을 계속합니다.</span></div>${Ae()}`;return}const W=nt.getThreatFocus();if(W!==void 0){H.innerHTML=Sn(W)+Ae();return}if(nt.getPlanView()==="summary"||nt.getPlanView()==="all"){H.innerHTML=Tn(nt.getPlanView())+Ae();return}if(!G||!I){H.innerHTML=`<p>행동 슬롯이 없습니다.</p>${Ae()}`;return}const p=I.plan.action,T=ut==="일반공격"?G.normalAttack:z,t=p.kind==="일반공격"?G.normalAttack:p.kind==="스킬"?z:void 0,l=I.plan.path.at(-1),c=l&&p.relativeTarget?{x:l.x+p.relativeTarget.x,y:l.y+p.relativeTarget.y}:void 0,a=!!(c&&l&&t&&Nt(l,c,t.rangePatternId,t.range)),r=c?`<div class="cast-state ${a?"ready":"broken"}"><span>상대 착탄 위치</span><b>${a?`$
```

## class="deployment-heading"

원본 문자 오프셋: 26630118

```javascript
class="deployment-heading"><small>ALLY DEPLOYMENT · ${F.boardSize}×${F.boardSize}</small><b>파란 구역에 아군을 배치하세요</b><span><button id="back-relic-setup">← 유물 가방</button> 아군 카드를 고르고 파란 셀을 누르세요.</span></div><div class="deployment-roster">${G.map(p=>{const T=F.deployedAllyIds.includes(p.id);return`<button data-deploy-unit="${st(p.id)}" class="${p.id===I?.id?"active ":""}${T?"placed":"unplaced"}">${Ai(p)}<span><b>${st(p.name)}</b><small>${T?"배치 완료":"배치 대기"} · ${p.timeTag?`${p.timeTag} 태그`:"태그 없음"} · HP ${p.hp}/${p.maxHp}</small></span></button>`}).join("")}</div><div class="deployment-confirm"><span><b>${F.firstTeam} 선공 · ${z}/${G.length} 배치</b><small>${W?"전원이 배치되었습니다.":"아군 전원을 배치하세요."}</small></span><button id="start-battle" ${W?"":"disabled"}>배치 확정</button></div>`}function dn(){const H=document.querySelector("#timeline-wrap"),F=document.querySelector("#timeline");H.classList.toggle("hidden",q.state.phase==="배치");const G=H.querySelector("#toggle-reorder");G&&(G.classList.toggle("active",Rt),G.textContent=Rt?"순서 변경 중":"캐릭터 행동 순서 변경",G.disabled=q.state.phase!=="계획"),F.innerHTML=q.state.slots.map((I,z)=>{const W=q.state.units.find(i=>i.id===I.unitId),p=I.plan.action.kind==="없음"?"대기":I.plan.action.kind,T=q.state.phase==="실행"&&I.result&&I.result!=="대기"?I.result:p,t=W?Zt[W.id]:void 0,l=W?.statuses??[],c=l[0]?.type==="기절"?"✦":l[0]?.type==="띄워짐"?"↑":l[0]?.type==="반격"?"↯":"",a=Rt&&At===z,r=Rt&&
```
