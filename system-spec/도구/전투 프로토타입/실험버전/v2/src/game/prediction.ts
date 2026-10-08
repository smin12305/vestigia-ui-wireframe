import { isPointInPattern } from './patterns'
import type { BattleState, Direction, EnemyThreatPrediction, Point, PredictedTargetOutcome, RelicEffectKind, SavedContent, TargetTeam, TimePeriod, Unit } from './types'

const vectors:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const opposite:Record<Direction,Direction>={상:'하',하:'상',좌:'우',우:'좌'}
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const inside=(point:Point,boardSize:number)=>point.x>=0&&point.y>=0&&point.x<boardSize&&point.y<boardSize
const rebasePath=(path:Point[],origin:Point)=>{const result:Point[]=[{...origin}];for(let index=1;index<path.length;index++){const previous=path[index-1],step=path[index],current=result[result.length-1];result.push({x:current.x+step.x-previous.x,y:current.y+step.y-previous.y})}return result}

export function predictEnemyThreats(state:BattleState,content:SavedContent):EnemyThreatPrediction[]{
  const boardSize=state.boardSize,units:Unit[]=state.units.map(unit=>({...unit,position:{...unit.position},statuses:unit.statuses.map(status=>({...status}))})),threats:EnemyThreatPrediction[]=[]
  const time=state.currentTime
  const relicEffects=(unit:Unit,kind:RelicEffectKind,period:TimePeriod)=>unit.team==='아군'?content.relics.filter(relic=>(state.relicLoadouts[unit.id]??[]).includes(relic.id)).flatMap(relic=>relic.effects).filter(effect=>effect.kind===kind&&effect.timePeriods.includes(period)):[]
  const persistent=(unit:Unit,kind:RelicEffectKind)=>relicEffects(unit,kind,time).filter(effect=>['항상','시간대상시'].includes(effect.trigger)&&(!effect.hpThreshold||unit.hp/unit.maxHp*100<=effect.hpThreshold)).reduce((sum,effect)=>sum+effect.value,0)
  const baseCharacter=(unit:Unit)=>content.characters.find(character=>character.id===unit.id)??unit
  const attackPower=(unit:Unit)=>unit.team==='아군'?Math.max(0,baseCharacter(unit).attackPower+persistent(unit,'공격력')):baseCharacter(unit).attackPower
  for(const unit of units){if(unit.team!=='아군')continue;const base=baseCharacter(unit);unit.maxHp=Math.max(1,base.maxHp+persistent(unit,'최대체력'));unit.hp=Math.min(unit.hp,unit.maxHp);unit.attackPower=attackPower(unit);unit.moveRange=Math.max(0,base.moveRange+persistent(unit,'이동력'));unit.criticalRate=Math.max(0,base.criticalRate+persistent(unit,'치명타피해율'))}
  const living=()=>units.filter(unit=>unit.hp>0),unitAt=(point:Point,excludeId='')=>living().find(unit=>unit.id!==excludeId&&same(unit.position,point))
  const validTarget=(actor:Unit,target:Unit,targetTeam:TargetTeam)=>targetTeam==='모두'||(targetTeam==='아군'?target.team===actor.team:target.team!==actor.team)
  const outcomeFor=(map:Map<string,PredictedTargetOutcome>,target:Unit)=>{let outcome=map.get(target.id);if(!outcome){outcome={unitId:target.id,unitName:target.name,damage:0,critical:false,statuses:[],forceMoves:[],ko:false};map.set(target.id,outcome)}return outcome}
  const damage=(actor:Unit,target:Unit,base:number,canCritical:boolean,actionKind:'일반공격'|'스킬',outcome:PredictedTargetOutcome)=>{let amount=base;if(actionKind==='일반공격'&&time==='과거')amount+=5;const favored=(time==='과거'&&actor.type==='계승자')||(time==='현재'&&actor.type==='각성자')||(time==='미래'&&actor.type==='기술자');if(favored)amount*=Math.pow(1.2,state.timeStreak);if(actor.team==='아군')amount*=Math.max(0,1+(persistent(actor,actionKind==='일반공격'?'일반공격피해':'스킬피해')+persistent(actor,'최종피해'))/100);const critical=canCritical&&target.statuses.some(status=>status.type==='띄워짐');if(critical)amount*=actor.criticalRate/100;if(target.team==='아군')amount*=Math.max(0,1+persistent(target,'받는피해')/100);const result=Math.max(0,Math.floor(amount));target.hp=Math.max(0,target.hp-result);outcome.damage+=result;outcome.critical||=critical;outcome.ko=target.hp<=0}
  const unitsInLine=(origin:Point,direction:Direction,range:number)=>{const vector=vectors[direction],result:Unit[]=[];for(let step=1;step<=range;step++){const unit=unitAt({x:origin.x+vector.x*step,y:origin.y+vector.y*step});if(unit)result.push(unit)}return result}
  const forceMove=(target:Unit,direction:Direction,steps:number,type:'밀치기'|'당기기',outcome:PredictedTargetOutcome)=>{if(target.immunities.includes(type)){outcome.statuses.push(`${type} 면역`);return}const from={...target.position},vector=vectors[direction];let blocked=false;for(let step=0;step<steps;step++){const next={x:target.position.x+vector.x,y:target.position.y+vector.y};if(!inside(next,boardSize)||unitAt(next,target.id)){blocked=true;break}target.position=next}outcome.forceMoves.push({type,from,to:{...target.position},moved:distance(from,target.position),requested:steps,blocked})}


  state.slots.forEach((slot,slotIndex)=>{
    const actor=units.find(unit=>unit.id===slot.unitId),action=slot.plan.action,isEnemy=slot.team==='적군',skill=actor&&action.kind==='스킬'?content.skills.find(item=>item.id===actor.skillId):undefined
    const actionName=action.kind==='스킬'?skill?.name??'스킬':action.kind==='일반공격'?actor?.normalAttack.name??'일반공격':'이동·대기'
    const intendedTargetName=action.targetUnitId?units.find(unit=>unit.id===action.targetUnitId)?.name:undefined
    const threat:EnemyThreatPrediction|undefined=isEnemy?{slotIndex,slotNumber:slot.number,actorId:actor?.id??slot.unitId,actorName:actor?.name??'적군',actionName,direction:action.direction,intendedTargetName,origin:actor?{...actor.position}:{x:0,y:0},outcomes:[],state:'취소 예상',reason:'행동을 판정할 수 없습니다.'}:undefined
    if(!actor||actor.hp<=0){if(threat){threat.reason='행동 전에 전투 불능';threats.push(threat)}return}
    actor.statuses=actor.statuses.filter(status=>status.type!=='띄워짐')
    if(actor.statuses.some(status=>status.type==='기절')){if(threat){threat.reason='기절로 행동 취소';threats.push(threat)}return}
    let collision=false
    for(const step of rebasePath(slot.plan.path,actor.position).slice(1)){if(!inside(step,boardSize)||unitAt(step,actor.id)){collision=true;break}actor.position={...step}}
    if(threat)threat.origin={...actor.position}
    if(collision){if(threat){threat.reason='이동 경로 충돌로 후속 행동 취소';threats.push(threat)}return}
    if(action.kind==='없음'){if(threat){threat.state='이동·대기';threat.reason=slot.plan.path.length>1?'이동 후 대기':'행동 없음';threats.push(threat)}return}
    const range=action.kind==='스킬'?skill?.range:actor.normalAttack.range,targeting=action.kind==='스킬'?skill?.targeting:actor.normalAttack.targeting,patternId=action.kind==='스킬'?skill?.rangePatternId:actor.normalAttack.rangePatternId
    if(!range||!targeting){if(threat){threat.reason='행동 정의 없음';threats.push(threat)}return}
    let targets:Unit[]=[],selectedTarget:Unit|undefined,selectedCellTarget:Unit|undefined,cancelReason=''
    if(targeting==='대상'){
      const target=living().find(unit=>unit.id===action.targetUnitId);if(!target)cancelReason='대상이 전투 불능';else if(!isPointInPattern(actor.position,target.position,patternId,range))cancelReason='실행 시점에 범위 밖';else{selectedTarget=target;targets=[target]}
    }else if(targeting==='셀'||targeting==='설치'){
      const cell=action.targetCell;if(!cell)cancelReason='선택 셀 없음';else if(!isPointInPattern(actor.position,cell,patternId,range))cancelReason='실행 시점에 범위 밖';else{selectedCellTarget=unitAt(cell);targets=selectedCellTarget?[selectedCellTarget]:[]}
    }else if(action.direction)targets=unitsInLine(actor.position,action.direction,range)
    else cancelReason='방향 없음'
    if(cancelReason){if(threat){threat.reason=cancelReason;threats.push(threat)}return}
    const outcomeMap=new Map<string,PredictedTargetOutcome>()
    if(action.kind==='스킬'&&skill){
      const protectsAlliesFromDamage=skill.effects.some(effect=>effect.type==='밀치기'||effect.type==='당기기')
      for(const effect of skill.effects){
        if(effect.type==='설치')continue
        const scoped=effect.scope==='자신'?[actor]:effect.scope==='선택대상'?(selectedTarget?[selectedTarget]:targets):effect.scope==='선택셀'?(selectedCellTarget?[selectedCellTarget]:[]):targets
        const effectTargets=scoped.filter(target=>(effect.type==='밀치기'||effect.type==='당기기')||(protectsAlliesFromDamage&&effect.type==='피해'&&target.team===actor.team?false:validTarget(actor,target,effect.targetTeam)))
        for(const target of effectTargets){const outcome=outcomeFor(outcomeMap,target);if(effect.type==='피해')damage(actor,target,effect.value,skill.canCritical,'스킬',outcome);else if(effect.type==='밀치기'&&action.direction)forceMove(target,action.direction,effect.value,effect.type,outcome);else if(effect.type==='당기기'&&action.direction)forceMove(target,opposite[action.direction],effect.value,effect.type,outcome);else if(effect.type==='띄우기'||effect.type==='기절'){if(target.immunities.includes(effect.type))outcome.statuses.push(`${effect.type} 면역`);else{const statusType=effect.type==='띄우기'?'띄워짐':'기절';target.statuses=target.statuses.filter(status=>status.type!==statusType);target.statuses.push({type:statusType,appliedRound:state.round});outcome.statuses.push(statusType)}}}
      }
    }else for(const target of targets.filter(unit=>unit.team!==actor.team))damage(actor,target,attackPower(actor),true,'일반공격',outcomeFor(outcomeMap,target))
    if(threat){threat.outcomes=[...outcomeMap.values()];threat.state=threat.outcomes.length?'적중 예상':'대상 없음';threat.reason=threat.outcomes.length?'현재 전체 계획을 행동 순서대로 계산한 결과':'공격 범위 안에 적용 대상 없음';threats.push(threat)}
  })
  return threats
}
