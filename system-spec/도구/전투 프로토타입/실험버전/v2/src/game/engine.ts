import type { ActionPlan, ActionSlot, AttackPresentationEvent, BattleState, BoardSize, CharacterDefinition, CombatTextEvent, Direction, EffectType, ForcedMovePreview, Point, RelicEffectKind, RelicLoadouts, RelicTrigger, SavedContent, ShardGainEvent, TargetTeam, Team, TimeAdvanceEvent, TimeManipulation, TimePeriod, Unit } from './types'
import { createEnemyAiPlans } from './ai'
import { isPointInPattern } from './patterns'
import { predictEnemyThreats } from './prediction'

export const DEFAULT_BOARD_SIZE:BoardSize=9
export const TIME_MANIPULATION_MIN_COST=50
export const TIME_MANIPULATION_STEP=5
export const MAX_TIME_SHARDS=80
export const SHARD_PER_ATTACK=20
export const SHARD_PER_COMBO=30
export const SHARD_PER_TURN=10
export const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
export const rebasePath=(path:Point[],origin:Point)=>{
  const rebased:Point[]=[{...origin}]
  for(let index=1;index<path.length;index++){
    const previous=path[index-1],step=path[index],current=rebased[rebased.length-1]
    rebased.push({x:current.x+step.x-previous.x,y:current.y+step.y-previous.y})
  }
  return rebased
}
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y
const vector:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const opposite:Record<Direction,Direction>={상:'하',하:'상',좌:'우',우:'좌'}
const wait=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms))

export class BattleEngine extends EventTarget{
  state!:BattleState
  presentationDelayMs=360
  enemyAiEnabled=true
  private firstMoveRelicUnits=new Set<string>()
  constructor(public content:SavedContent,public relicLoadouts:RelicLoadouts={},private configuredBoardSize:BoardSize=DEFAULT_BOARD_SIZE){super();this.reset(content)}

  private relicEffects(unit:Unit,kind:RelicEffectKind,time:TimePeriod,trigger?:RelicTrigger){if(unit.team!=='아군')return[];const ids=this.relicLoadouts[unit.id]??[];return this.content.relics.filter(relic=>ids.includes(relic.id)).flatMap(relic=>relic.effects).filter(effect=>effect.kind===kind&&effect.timePeriods.includes(time)&&(!trigger||effect.trigger===trigger))}
  private relicBonus(unit:Unit,kind:'최대체력'|'공격력'|'이동력'|'치명타피해율',time:TimePeriod){return this.relicEffects(unit,kind,time).filter(effect=>['항상','시간대상시'].includes(effect.trigger)&&(!effect.hpThreshold||unit.hp/unit.maxHp*100<=effect.hpThreshold)).reduce((sum,effect)=>sum+effect.value,0)}
  private baseCharacter(unit:Unit){return this.content.characters.find(character=>character.id===unit.id)??unit}
  getMoveRange(unit:Unit,time?:TimePeriod){const resolvedTime=time??this.state?.currentTime??'현재',base=this.baseCharacter(unit),firstMove=this.firstMoveRelicUnits.has(unit.id)?this.relicEffects(unit,'첫이동력',resolvedTime,'시간대진입').reduce((sum,effect)=>sum+effect.value,0):0,relic=unit.team==='아군'?this.relicBonus(unit,'이동력',resolvedTime)+firstMove:0;return Math.max(0,base.moveRange+relic+(resolvedTime==='미래'?1:0))}
  getAttackPower(unit:Unit,time?:TimePeriod){const resolvedTime=time??this.state?.currentTime??'현재',base=this.baseCharacter(unit);return unit.team==='아군'?Math.max(0,base.attackPower+this.relicBonus(unit,'공격력',resolvedTime)):base.attackPower}
  getCriticalRate(unit:Unit,time?:TimePeriod){const resolvedTime=time??this.state?.currentTime??'현재',base=this.baseCharacter(unit),relic=unit.team==='아군'?this.relicBonus(unit,'치명타피해율',resolvedTime):0;return Math.max(0,base.criticalRate+relic+(resolvedTime==='현재'?20:0))}
  getTimeDamageMultiplier(unit:Unit,time=this.state?.currentTime??'현재'){return this.isTimeFavored(unit,time)?Math.pow(1.2,this.state.timeStreak):1}
  private actionDamageAmount(unit:Unit,actionKind:'일반공격'|'스킬',base:number,time:TimePeriod){let amount=base;if(actionKind==='일반공격'&&time==='과거')amount+=5;amount*=this.getTimeDamageMultiplier(unit,time);if(unit.team==='아군'){const actionBonus=this.relicEffects(unit,actionKind==='일반공격'?'일반공격피해':'스킬피해',time).filter(effect=>['항상','시간대상시'].includes(effect.trigger)).reduce((sum,effect)=>sum+effect.value,0),finalBonus=this.relicEffects(unit,'최종피해',time).filter(effect=>['항상','시간대상시'].includes(effect.trigger)).reduce((sum,effect)=>sum+effect.value,0);amount*=Math.max(0,1+(actionBonus+finalBonus)/100)}return amount}
  getActionDamagePreview(unit:Unit,actionKind:'일반공격'|'스킬',base:number,time=this.state?.currentTime??'현재'){return Math.max(0,Math.floor(this.actionDamageAmount(unit,actionKind,base,time)))}
  getTimeStatBonuses(unit:Unit,time=this.state?.currentTime??'현재'){const base=this.baseCharacter(unit),stacks=this.isTimeFavored(unit,time)?this.state.timeStreak:0,multiplier=this.getTimeDamageMultiplier(unit,time);return{attack:time==='과거'?5:0,move:this.getMoveRange(unit,time)-base.moveRange,critical:this.getCriticalRate(unit,time)-base.criticalRate,classDamage:stacks?Math.round((multiplier-1)*1000)/10:0,stacks}}
  private isTimeFavored(unit:Unit,time:TimePeriod){return(time==='과거'&&unit.type==='계승자')||(time==='현재'&&unit.type==='각성자')||(time==='미래'&&unit.type==='기술자')}
  private getMaxHp(unit:Unit,time:TimePeriod){const base=this.baseCharacter(unit);return unit.team==='아군'?Math.max(1,base.maxHp+this.relicBonus(unit,'최대체력',time)):base.maxHp}
  private applyRelicStats(time:TimePeriod){for(const unit of this.state.units){unit.maxHp=this.getMaxHp(unit,time);unit.hp=Math.min(unit.hp,unit.maxHp);unit.attackPower=this.getAttackPower(unit,time);unit.moveRange=this.getMoveRange(unit,time);unit.criticalRate=this.getCriticalRate(unit,time)}}
  private applyTimeEntry(time:TimePeriod){
    this.applyRelicStats(time)
    const allies=this.livingUnits.filter(unit=>unit.team==='아군')
    let activated=false,totalShards=0;this.firstMoveRelicUnits.clear()
    for(const unit of allies){
      const healing=this.relicEffects(unit,'체력회복',time,'시간대진입').reduce((sum,effect)=>sum+effect.value,0);if(healing){const amount=Math.max(0,Math.min(healing,unit.maxHp-unit.hp));unit.hp+=amount;if(amount)this.combatText(unit,`회복 +${amount}`,'상태');activated=true}
      const cooldown=this.relicEffects(unit,'쿨타임감소',time,'시간대진입').reduce((sum,effect)=>sum+effect.value,0);if(cooldown){unit.cooldownRemaining=Math.max(0,unit.cooldownRemaining-cooldown);activated=true}
      totalShards+=this.relicEffects(unit,'시간포인트',time,'시간대진입').reduce((sum,effect)=>sum+effect.value,0)
      if(this.relicEffects(unit,'첫이동력',time,'시간대진입').length){this.firstMoveRelicUnits.add(unit.id);activated=true}
    }
    if(totalShards){this.gainShards(totalShards,'유물');activated=true}
    if(activated)this.log(`장착자 유물 발동 · ${time} 진입`)
  }

  private freshState(characters:CharacterDefinition[]):BattleState{
    const compact=this.configuredBoardSize===6
    const ally=compact?[{x:1,y:5},{x:4,y:5},{x:2,y:4},{x:0,y:5},{x:5,y:5}]:[{x:2,y:7},{x:6,y:7},{x:4,y:6},{x:1,y:8},{x:7,y:8}]
    const enemy=compact?[{x:4,y:0},{x:1,y:0},{x:3,y:1},{x:5,y:0},{x:0,y:0}]:[{x:6,y:1},{x:2,y:1},{x:4,y:2},{x:7,y:0},{x:1,y:0}]
    let a=0,e=0
    const units:Unit[]=characters.slice(0,10).map(character=>{const unit:Unit={...character,hp:character.maxHp,position:{...(character.team==='아군'?ally[a++%ally.length]:enemy[e++%enemy.length])},statuses:[],cooldownRemaining:0};unit.maxHp=this.getMaxHp(unit,'현재');unit.hp=unit.maxHp;unit.attackPower=this.getAttackPower(unit,'현재');unit.moveRange=this.getMoveRange(unit,'현재');unit.criticalRate=this.getCriticalRate(unit,'현재');return unit})
    return{boardSize:this.configuredBoardSize,phase:'배치' as const,units,round:1,firstTeam:'아군' as Team,slots:[] as ActionSlot[],selectedSlot:0,selectedDeployUnitId:units.find(unit=>unit.team==='아군')?.id??units[0]?.id??'',deployedAllyIds:[],currentTime:'현재' as TimePeriod,selectedTime:'현재' as TimePeriod,timeStreak:1,timeCycleProgress:1,timeDialIndex:0,timeManipulationUsed:false,timeStoppedThisTurn:false,timeManipulationCost:TIME_MANIPULATION_MIN_COST,shards:0,maxShards:MAX_TIME_SHARDS,executingSlot:-1,relicLoadouts:structuredClone(this.relicLoadouts),log:[`${this.configuredBoardSize}×${this.configuredBoardSize} 말판 · 출전 캐릭터를 배치하세요.`]}
  }

  reset(content=this.content){this.content=content;this.firstMoveRelicUnits.clear();this.state=this.freshState(content.characters);this.emit()}
  setBoardSize(size:BoardSize){if(size===this.configuredBoardSize)return false;this.configuredBoardSize=size;this.reset(this.content);return true}
  setRelicLoadouts(loadouts:RelicLoadouts){
    if(this.state.phase!=='배치')return false
    const positions=new Map(this.state.units.map(unit=>[unit.id,{...unit.position}])),selected=this.state.selectedDeployUnitId,deployed=[...this.state.deployedAllyIds]
    const used=new Set<string>();this.relicLoadouts={}
    for(const [unitId,ids] of Object.entries(loadouts)){if(!this.content.characters.some(character=>character.id===unitId&&character.team==='아군'))continue;this.relicLoadouts[unitId]=ids.filter(id=>this.content.relics.some(relic=>relic.id===id)&&!used.has(id)&&(used.add(id),true)).slice(0,3)}
    this.firstMoveRelicUnits.clear()
    this.state=this.freshState(this.content.characters)
    for(const unit of this.state.units){const position=positions.get(unit.id);if(position)unit.position=position}
    this.state.deployedAllyIds=deployed.filter(id=>this.state.units.some(unit=>unit.id===id&&unit.team==='아군'))
    if(this.state.units.some(unit=>unit.id===selected))this.state.selectedDeployUnitId=selected
    const count=Object.values(this.relicLoadouts).reduce((sum,ids)=>sum+ids.length,0)
    this.state.log=[count?`캐릭터별 유물 ${count}개 장착`:'장착한 유물이 없습니다.'];this.emit();return true
  }
  setPresentationDelay(ms:number){this.presentationDelayMs=Math.min(2000,Math.max(0,Math.round(ms)));this.emit()}
  private periodAtDial(index:number):TimePeriod{const normalized=(index%12+12)%12;return normalized%6<2?'현재':normalized%6<4?'미래':'과거'}
  getTimeManipulationPreview(kind:TimeManipulation){const delta=kind==='가속'?1:kind==='역행'?-1:0,dialIndex=(this.state.timeDialIndex+delta+12)%12;return{dialIndex,period:this.periodAtDial(dialIndex)}}
  canManipulateTime(){return this.state.phase==='계획'&&!this.state.timeManipulationUsed&&this.state.shards>=this.state.timeManipulationCost&&this.state.timeManipulationCost<=this.state.maxShards}
  commitTimeManipulation(kind:TimeManipulation){
    if(!this.canManipulateTime())return false
    const from=this.state.currentTime,preview=this.getTimeManipulationPreview(kind),cost=this.state.timeManipulationCost
    this.state.shards-=cost;this.state.timeManipulationCost+=TIME_MANIPULATION_STEP;this.state.timeManipulationUsed=true;this.state.timeStoppedThisTurn=kind==='정지'
    this.state.timeDialIndex=preview.dialIndex;this.state.timeCycleProgress=preview.dialIndex%2+1
    if(preview.period!==from){this.state.currentTime=preview.period;this.state.selectedTime=preview.period;this.state.timeStreak=1;this.applyTimeEntry(preview.period)}
    this.applyRelicStats(this.state.currentTime)
    this.log(`시간 ${kind} 확정 · ${from} → ${this.state.currentTime} · 파편 ${cost} 소모 · 다음 비용 ${this.state.timeManipulationCost}`)
    this.dispatchEvent(new CustomEvent<TimeAdvanceEvent>('time-advance',{detail:{from,to:this.state.currentTime,suppressed:false,streak:this.state.timeStreak,cycleProgress:this.state.timeCycleProgress,dialIndex:this.state.timeDialIndex}}))
    this.emit();return true
  }
  get livingUnits(){return this.state.units.filter(unit=>unit.hp>0&&(this.state.phase!=='배치'||unit.team==='적군'||this.state.deployedAllyIds.includes(unit.id)))}
  get boardSize(){return this.state.boardSize}
  get selectedActionSlot(){return this.state.slots[this.state.selectedSlot]}
  get selectedUnit(){const id=this.state.phase==='배치'?this.state.selectedDeployUnitId:this.selectedActionSlot?.unitId;return this.state.units.find(unit=>unit.id===id)}
  get selectedPlan(){return this.selectedActionSlot?.plan}
  getSkill(unit:Unit){return this.content.skills.find(skill=>skill.id===unit.skillId)}
  getEnemyThreatPredictions(){return predictEnemyThreats(this.state,this.content)}
  unitAt(point:Point,excludeId=''){return this.livingUnits.find(unit=>unit.id!==excludeId&&same(unit.position,point))}

  selectDeployUnit(id:string){if(this.state.phase!=='배치'||!this.state.units.some(unit=>unit.id===id&&unit.team==='아군'))return;this.state.selectedDeployUnitId=id;this.emit()}
  moveDeployment(point:Point){
    const unit=this.selectedUnit;if(this.state.phase!=='배치'||!unit||this.unitAt(point,unit.id))return false
    const allyStart=Math.ceil(this.boardSize*2/3),inZone=unit.team==='아군'?point.y>=allyStart:point.y<allyStart
    if(!inZone||point.x<0||point.y<0||point.x>=this.boardSize||point.y>=this.boardSize)return false
    unit.position={...point};if(!this.state.deployedAllyIds.includes(unit.id))this.state.deployedAllyIds.push(unit.id);this.log(`${unit.name} 배치: ${point.x+1}, ${point.y+1}`);this.emit();return true
  }

  canConfirmDeployment(){const allies=this.state.units.filter(unit=>unit.team==='아군');return this.state.phase==='배치'&&allies.length>0&&allies.every(unit=>this.state.deployedAllyIds.includes(unit.id))}

  startBattle(){
    if(!this.canConfirmDeployment()||!this.state.units.length)return
    this.state.phase='계획';this.state.log=[];this.log(`동전 결과: ${this.state.firstTeam} 선공`);this.rebuildSlots();this.planEnemyAi(false);this.emit();this.announceTimeDamageBuff()
  }
  tossFirstTeam(){if(this.state.phase!=='배치')return this.state.firstTeam;this.state.firstTeam=Math.random()<.5?'아군':'적군';this.log(`동전 결과: ${this.state.firstTeam} 선공`);this.emit();return this.state.firstTeam}

  private rebuildSlots(){
    const byTeam:{아군:Unit[];적군:Unit[]}={아군:this.livingUnits.filter(u=>u.team==='아군'),적군:this.livingUnits.filter(u=>u.team==='적군')}
    const indexes:{아군:number;적군:number}={아군:0,적군:0};const other:Team=this.state.firstTeam==='아군'?'적군':'아군';const order=[this.state.firstTeam,other]
    const slots:ActionSlot[]=[]
    while(indexes.아군<byTeam.아군.length||indexes.적군<byTeam.적군.length){
      for(const team of order){const unit=byTeam[team][indexes[team]++];if(unit)slots.push({number:slots.length+1,team,unitId:unit.id,plan:{path:[{...unit.position}],action:{kind:'없음'}},result:'대기'})}
    }
    this.state.slots=slots;this.state.selectedSlot=Math.max(0,slots.findIndex(slot=>slot.team==='아군'));this.state.selectedTime=this.state.currentTime
  }

  selectSlot(index:number){if(this.state.phase!=='계획'||!this.state.slots[index]||this.enemyAiEnabled&&this.state.slots[index].team==='적군')return;this.state.selectedSlot=index;this.emit()}
  clearSelection(){if(this.state.phase!=='계획'||this.state.selectedSlot<0)return;this.state.selectedSlot=-1;this.emit()}
  shiftSelectedSlot(delta:-1|1){
    const current=this.selectedActionSlot;if(!current||this.state.phase!=='계획')return
    const teamIndexes=this.state.slots.map((slot,index)=>({slot,index})).filter(v=>v.slot.team===current.team).map(v=>v.index)
    const position=teamIndexes.indexOf(this.state.selectedSlot),targetIndex=teamIndexes[position+delta];if(targetIndex===undefined)return
    const target=this.state.slots[targetIndex];[current.unitId,target.unitId]=[target.unitId,current.unitId];[current.plan,target.plan]=[target.plan,current.plan];this.state.selectedSlot=targetIndex;this.emit()
  }

  swapAllySlots(firstIndex:number,secondIndex:number){
    if(this.state.phase!=='계획'||firstIndex===secondIndex)return false
    const first=this.state.slots[firstIndex],second=this.state.slots[secondIndex]
    if(!first||!second||first.team!=='아군'||second.team!=='아군')return false
    ;[first.unitId,second.unitId]=[second.unitId,first.unitId]
    ;[first.plan,second.plan]=[second.plan,first.plan]
    this.state.selectedSlot=secondIndex
    this.emit();return true
  }

  setPath(path:Point[]){const unit=this.selectedUnit,slot=this.selectedActionSlot;if(this.state.phase!=='계획'||!unit||!slot||!this.canPlanPath(unit,path))return false;slot.plan.path=path.map(p=>({...p}));this.emit();return true}
  canPlanPath(unit:Unit,path:Point[]){return path.length>0&&path.length-1<=this.getMoveRange(unit)&&same(path[0],unit.position)&&path.slice(1).every((p,i)=>p.x>=0&&p.y>=0&&p.x<this.boardSize&&p.y<this.boardSize&&distance(path[i],p)===1)}
  clearPlan(){const unit=this.selectedUnit,slot=this.selectedActionSlot;if(!unit||!slot)return;slot.plan={path:[{...unit.position}],action:{kind:'없음'}};this.emit()}
  resetAllyPlans(){
    if(this.state.phase!=='계획')return
    for(const slot of this.state.slots.filter(candidate=>candidate.team==='아군')){
      const unit=this.state.units.find(candidate=>candidate.id===slot.unitId);if(!unit)continue
      slot.plan={path:[{...unit.position}],action:{kind:'없음'}};slot.result='대기'
    }
    this.emit()
  }
  planNone(){const plan=this.selectedPlan;if(!plan)return;plan.action={kind:'없음'};this.emit()}
  planTarget(kind:'일반공격'|'스킬',targetId:string){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,targetUnitId:targetId};this.emit()}
  planCell(kind:'일반공격'|'스킬',targetCell:Point){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,targetCell:{...targetCell}};this.emit()}
  planDirection(kind:'일반공격'|'스킬',direction:Direction){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,direction};this.emit()}
  planEnemyAi(shouldEmit=true){
    if(!this.enemyAiEnabled||this.state.phase!=='계획')return
    for(const result of createEnemyAiPlans(this.state,this.content)){
      const slot=this.state.slots[result.slotIndex];if(!slot)continue
      slot.plan={path:result.plan.path.map(point=>({...point})),action:{...result.plan.action,targetCell:result.plan.action.targetCell?{...result.plan.action.targetCell}:undefined}}
      this.log(`AI ${slot.number}. ${this.state.units.find(unit=>unit.id===slot.unitId)?.name??'적군'} — ${result.reason} (${Math.round(result.score)})`)
    }
    const allySlot=this.state.slots.findIndex(slot=>slot.team==='아군');if(allySlot>=0)this.state.selectedSlot=allySlot
    if(shouldEmit)this.emit()
  }

  getForcedMovePreviews(slotIndex:number):ForcedMovePreview[]{
    const slot=this.state.slots[slotIndex],actor=this.state.units.find(unit=>unit.id===slot?.unitId),direction=slot?.plan.action.direction
    if(!slot||!actor||slot.plan.action.kind!=='스킬'||!direction)return[]
    const skill=this.getSkill(actor),origin=slot.plan.path.at(-1);if(!skill||!origin||skill.targeting!=='방향')return[]
    const targets=this.unitsInLine(origin,direction,skill.range),previews:ForcedMovePreview[]=[]
    for(const effect of skill.effects){
      if(effect.type!=='밀치기'&&effect.type!=='당기기')continue
      const scoped=effect.scope==='자신'?[actor]:effect.scope==='선택셀'?[]:targets
      for(const target of scoped){
        const moveDirection=effect.type==='밀치기'?direction:opposite[direction],immune=target.immunities.includes(effect.type)
        const from={...target.position};let to={...from},blocked=false
        if(!immune){const v=vector[moveDirection];for(let step=0;step<effect.value;step++){const next={x:to.x+v.x,y:to.y+v.y};if(next.x<0||next.y<0||next.x>=this.boardSize||next.y>=this.boardSize||same(next,origin)||this.unitAt(next,target.id)){blocked=true;break}to=next}}
        previews.push({targetId:target.id,type:effect.type,direction:moveDirection,from,to,requested:effect.value,moved:distance(from,to),blocked,immune})
      }
    }
    return previews
  }

  validatePlans(){
    for(const slot of this.state.slots){
      const unit=this.state.units.find(u=>u.id===slot.unitId);if(!unit)return `${slot.number}번 슬롯의 캐릭터가 없습니다.`
      if(!this.canPlanPath(unit,slot.plan.path))return `${slot.number}번 ${unit.name}의 이동 경로가 유효하지 않습니다.`
      const action=slot.plan.action
      if(action.kind==='스킬'&&unit.cooldownRemaining>0)return `${unit.name}의 스킬 쿨타임이 남았습니다.`
      if(action.kind!=='없음'){
        const targeting=action.kind==='일반공격'?unit.normalAttack.targeting:this.getSkill(unit)?.targeting
        if(targeting==='대상'&&!action.targetUnitId)return `${slot.number}번 행동의 대상을 선택하세요.`
        if((targeting==='셀'||targeting==='설치')&&!action.targetCell)return `${slot.number}번 행동의 셀을 선택하세요.`
        if(targeting==='방향'&&!action.direction)return `${slot.number}번 행동의 방향을 선택하세요.`
      }
    }
    return''
  }

  async executeTurn(){
    const error=this.validatePlans();if(error){this.log(error);this.emit();return false}
    this.state.phase='실행';this.state.executingSlot=-1
    this.applyRelicStats(this.state.currentTime);this.log(`${this.state.currentTime} ${this.state.timeStreak}턴째 효과 적용`)
    this.emit();await wait(this.presentationDelayMs)
    for(let index=0;index<this.state.slots.length;index++){
      if(this.isFinished())break
      const slot=this.state.slots[index],unit=this.state.units.find(u=>u.id===slot.unitId)
      this.state.executingSlot=index;this.emit();if(!unit||unit.hp<=0){slot.result='취소';continue}
      unit.statuses=unit.statuses.filter(status=>status.type!=='띄워짐')
      if(unit.statuses.some(status=>status.type==='기절')){slot.result='기절';this.log(`${slot.number}. ${unit.name} — 기절, 행동 패스`);await wait(this.presentationDelayMs);continue}
      this.log(`${slot.number}. ${unit.name} 행동`)
      const shifted=!same(unit.position,slot.plan.path[0]),executionPath=rebasePath(slot.plan.path,unit.position)
      if(shifted)this.log(`${unit.name}: 밀쳐진 위치에서 계획 경로 재생`)
      let collision=false,moved=false
      for(const step of executionPath.slice(1)){
        if(step.x<0||step.y<0||step.x>=this.boardSize||step.y>=this.boardSize){collision=true;slot.result='충돌';this.log(`${unit.name} 경로가 전투판 밖으로 이탈! 후속 행동 취소`);break}
        if(this.unitAt(step,unit.id)){collision=true;slot.result='충돌';this.log(`${unit.name} 충돌! 후속 행동 취소`);break}
        unit.position={...step};moved=true;this.emit();await wait(Math.max(30,Math.round(this.presentationDelayMs/3)))
      }
      if(moved&&unit.team==='아군')this.firstMoveRelicUnits.delete(unit.id)
      if(!collision)await this.executeAction(unit,slot.plan)
      if(!slot.result||slot.result==='대기')slot.result='완료'
      this.checkOutcome();this.emit();await wait(this.presentationDelayMs)
    }
    if(this.isFinished()){this.emit();return true}
    for(const unit of this.livingUnits)unit.statuses=[]
    this.gainShards(SHARD_PER_TURN,'턴')
    this.advanceTimeAfterTurn()
    this.state.round++;this.state.firstTeam=this.state.firstTeam==='아군'?'적군':'아군'
    for(const unit of this.livingUnits)unit.cooldownRemaining=Math.max(0,unit.cooldownRemaining-1)
    this.state.phase='계획';this.state.executingSlot=-1;this.rebuildSlots();this.planEnemyAi(false);this.log(`라운드 ${this.state.round}: ${this.state.firstTeam} 선공`);this.emit();this.announceTimeDamageBuff();return true
  }

  private async executeAction(actor:Unit,plan:ActionPlan){
    if(plan.action.kind==='없음')return
    const isSkill=plan.action.kind==='스킬',skill=isSkill?this.getSkill(actor):undefined
    const range=isSkill?skill?.range:actor.normalAttack.range,targeting=isSkill?skill?.targeting:actor.normalAttack.targeting
    if(!range||!targeting)return
    let targets:Unit[]=[],selectedTarget:Unit|undefined,selectedCellTarget:Unit|undefined
    if(targeting==='대상'){
      const target=this.livingUnits.find(u=>u.id===plan.action.targetUnitId)
      const patternId=isSkill?skill?.rangePatternId:actor.normalAttack.rangePatternId
      if(!target||!isPointInPattern(actor.position,target.position,patternId,range)){this.log(`${actor.name}: 대상이 범위를 벗어나 행동 취소`);return}
      selectedTarget=target;targets=[target]
    }else if(targeting==='셀'||targeting==='설치'){
      const cell=plan.action.targetCell
      const patternId=isSkill?skill?.rangePatternId:actor.normalAttack.rangePatternId
      if(!cell||!isPointInPattern(actor.position,cell,patternId,range)){this.log(`${actor.name}: 선택 셀이 범위를 벗어나 행동 취소`);return}
      selectedCellTarget=this.unitAt(cell);targets=selectedCellTarget?[selectedCellTarget]:[]
    }else if(plan.action.direction){targets=this.unitsInLine(actor.position,plan.action.direction,range)}
    const actionName=isSkill&&skill?skill.name:actor.normalAttack.name
    const targetPoint=selectedTarget?.position??selectedCellTarget?.position??targets[0]?.position??plan.action.targetCell??(plan.action.direction?{x:actor.position.x+vector[plan.action.direction].x*range,y:actor.position.y+vector[plan.action.direction].y*range}:undefined)
    const attackPresentationMs=Math.max(260,Math.min(520,240+Math.round(this.presentationDelayMs*.45)))
    const presentation:AttackPresentationEvent={actorId:actor.id,actorPosition:{...actor.position},team:actor.team,actionKind:plan.action.kind,actionName,targeting,range,rangePatternId:isSkill&&skill?skill.rangePatternId:actor.normalAttack.rangePatternId,direction:plan.action.direction,targetPoint:targetPoint?{...targetPoint}:undefined,durationMs:attackPresentationMs}
    this.dispatchEvent(new CustomEvent<AttackPresentationEvent>('attack-presentation',{detail:presentation}))
    await wait(attackPresentationMs)
    const comboReady=targets.some(target=>target.team==='적군'&&target.statuses.some(s=>s.type==='기절'||s.type==='띄워짐'))
    let damagedEnemy=false,shardSource:Point|undefined
    if(isSkill&&skill){
      const protectsAlliesFromDamage=skill.effects.some(effect=>effect.type==='밀치기'||effect.type==='당기기')
      actor.cooldownRemaining=skill.cooldown
      for(const effect of skill.effects){
        if(effect.type==='설치'){
          const cell=plan.action.targetCell;this.log(`${effect.environmentId} 설치${cell?` · ${cell.x+1}, ${cell.y+1}`:''}`);continue
        }
        const scopedTargets=effect.scope==='자신'?[actor]:effect.scope==='선택대상'?(selectedTarget?[selectedTarget]:targets):effect.scope==='선택셀'?(selectedCellTarget?[selectedCellTarget]:[]):targets
        const effectTargets=scopedTargets.filter(target=>(effect.type==='밀치기'||effect.type==='당기기')||(protectsAlliesFromDamage&&effect.type==='피해'&&target.team===actor.team?false:this.validTarget(actor,target,effect.targetTeam)))
        for(const target of effectTargets){
          if(effect.type==='피해'){
            const damage=this.damage(actor,target,effect.value,skill.canCritical,'스킬');if(damage>0&&actor.team==='아군'&&target.team==='적군'){damagedEnemy=true;shardSource??={...target.position}}
          }else if(effect.type==='밀치기'&&plan.action.direction)this.forceMove(target,plan.action.direction,effect.value,effect.type)
          else if(effect.type==='당기기'&&plan.action.direction)this.forceMove(target,opposite[plan.action.direction],effect.value,effect.type)
          else if(effect.type==='띄우기'||effect.type==='기절'){
            if(target.immunities.includes(effect.type)){this.combatText(target,`${effect.type} 면역`,'면역');continue}
            const statusType=effect.type==='띄우기'?'띄워짐':'기절';target.statuses=target.statuses.filter(s=>s.type!==statusType);target.statuses.push({type:statusType,appliedRound:this.state.round});this.log(`${target.name}: ${statusType}`);this.combatText(target,statusType,'상태')
          }
        }
      }
      this.log(`${actor.name} — ${skill.name}`)
    }else{
      for(const target of targets.filter(t=>t.team!==actor.team)){const damage=this.damage(actor,target,this.getAttackPower(actor),true,'일반공격');if(damage>0&&actor.team==='아군'&&target.team==='적군'){damagedEnemy=true;shardSource??={...target.position}}}
      this.log(`${actor.name} — ${actor.normalAttack.name}`)
    }
    if(damagedEnemy){
      const relicShards=actor.team==='아군'?this.relicEffects(actor,'시간포인트',this.state.currentTime,'유효공격').reduce((sum,effect)=>sum+effect.value,0):0
      this.gainShards(SHARD_PER_ATTACK+relicShards,'공격',shardSource)
      if(comboReady)this.gainShards(SHARD_PER_COMBO,'콤보',shardSource)
    }
  }

  private validTarget(actor:Unit,target:Unit,targetTeam:TargetTeam){return targetTeam==='모두'||(targetTeam==='아군'?target.team===actor.team:target.team!==actor.team)}
  private unitsInLine(origin:Point,direction:Direction,range:number){const v=vector[direction],points=Array.from({length:range},(_,i)=>({x:origin.x+v.x*(i+1),y:origin.y+v.y*(i+1)}));return points.map(p=>this.unitAt(p)).filter((u):u is Unit=>Boolean(u))}
  private damage(actor:Unit,target:Unit,base:number,canCritical:boolean,actionKind:'일반공격'|'스킬'){
    const time=this.state.currentTime;let amount=this.actionDamageAmount(actor,actionKind,base,time)
    const critical=canCritical&&target.statuses.some(s=>s.type==='띄워짐')
    if(critical)amount*=this.getCriticalRate(actor,time)/100
    if(target.team==='아군'){
      const received=this.relicEffects(target,'받는피해',time).filter(effect=>['항상','시간대상시'].includes(effect.trigger)).reduce((sum,effect)=>sum+effect.value,0)
      amount*=Math.max(0,1+received/100)
    }
    const result=Math.max(0,Math.floor(amount));target.hp=Math.max(0,target.hp-result);this.log(`${target.name} ${result} 피해${critical?' · 치명타!':''}`);this.combatText(target,critical?`치명타 -${result}`:`-${result}`,critical?'치명타':'피해');return result
  }
  private forceMove(target:Unit,direction:Direction,steps:number,effectType:EffectType){if(target.immunities.includes(effectType)){this.combatText(target,`${effectType} 면역`,'면역');return}const start={...target.position},v=vector[direction];for(let i=0;i<steps;i++){const next={x:target.position.x+v.x,y:target.position.y+v.y};if(next.x<0||next.y<0||next.x>=this.boardSize||next.y>=this.boardSize||this.unitAt(next,target.id))break;target.position=next}const moved=distance(start,target.position);this.log(`${target.name} ${effectType}`);this.combatText(target,`${effectType}${moved?` ${moved}칸`:''}`,'상태')}
  private checkOutcome(){const ally=this.livingUnits.some(u=>u.team==='아군'),enemy=this.livingUnits.some(u=>u.team==='적군');if(!ally){this.state.phase='패배';this.log('모든 아군 전투 불능 — 패배')}else if(!enemy){this.state.phase='승리';this.log('모든 적 전투 불능 — 승리')}}
  private isFinished(){return this.state.phase==='승리'||this.state.phase==='패배'}
  private combatText(unit:Unit,text:string,kind:CombatTextEvent['kind']){const detail:CombatTextEvent={unitId:unit.id,position:{...unit.position},text,kind};this.dispatchEvent(new CustomEvent<CombatTextEvent>('combat-text',{detail}))}
  private announceTimeDamageBuff(){for(const unit of this.livingUnits.filter(candidate=>this.isTimeFavored(candidate,this.state.currentTime)))this.combatText(unit,`피해 20% 증가 (${this.state.timeStreak}중첩)`,'버프')}
  private gainShards(amount:number,reason:ShardGainEvent['reason'],source?:Point){
    const gained=Math.min(amount,this.state.maxShards-this.state.shards);if(gained<=0)return
    this.state.shards+=gained;this.log(`시간 파편 +${gained} (${reason})`)
    const detail:ShardGainEvent={amount:gained,source:source?{...source}:undefined,reason};this.dispatchEvent(new CustomEvent<ShardGainEvent>('shard-gain',{detail}))
  }
  private advanceTimeAfterTurn(){
    const from=this.state.currentTime
    if(this.state.timeStoppedThisTurn){this.state.timeStoppedThisTurn=false;this.state.timeManipulationUsed=false;this.state.timeStreak++;this.log(`시간 정지 유지 · ${from} ${this.state.timeStreak}턴째`);this.dispatchEvent(new CustomEvent<TimeAdvanceEvent>('time-advance',{detail:{from,to:from,suppressed:true,streak:this.state.timeStreak,cycleProgress:this.state.timeCycleProgress,dialIndex:this.state.timeDialIndex}}));return}
    this.state.timeManipulationUsed=false
    this.state.timeDialIndex=(this.state.timeDialIndex+1)%12
    if(this.state.timeCycleProgress>=2){const next:Record<TimePeriod,TimePeriod>={현재:'미래',미래:'과거',과거:'현재'},to=next[from];this.state.currentTime=to;this.state.selectedTime=to;this.state.timeStreak=1;this.state.timeCycleProgress=1;this.applyTimeEntry(to);this.log(`시간 순환 · ${from} → ${to}`);this.dispatchEvent(new CustomEvent<TimeAdvanceEvent>('time-advance',{detail:{from,to,suppressed:false,streak:1,cycleProgress:1,dialIndex:this.state.timeDialIndex}}));return}
    this.state.timeCycleProgress++;this.state.timeStreak++;this.log(`${from} ${this.state.timeStreak}턴째로 진행`);this.dispatchEvent(new CustomEvent<TimeAdvanceEvent>('time-advance',{detail:{from,to:from,suppressed:false,streak:this.state.timeStreak,cycleProgress:this.state.timeCycleProgress,dialIndex:this.state.timeDialIndex}}))
  }
  private log(text:string){this.state.log=[text,...this.state.log].slice(0,40)}
  private emit(){this.dispatchEvent(new Event('change'))}
}
