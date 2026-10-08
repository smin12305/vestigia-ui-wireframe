import type { ActionPlan, ActionSlot, BattleState, CharacterDefinition, CombatTextEvent, Direction, EffectType, ForcedMovePreview, Point, SavedContent, ShardGainEvent, TargetTeam, Team, TimePeriod, Unit } from './types'
import { createEnemyAiPlans } from './ai'
import { isPointInPattern } from './patterns'
import { predictEnemyThreats } from './prediction'

export const BOARD_SIZE=9
export const TIME_SHIFT_COST=100
export const SHARD_PER_ATTACK=10
export const SHARD_PER_COMBO=20
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
  constructor(public content:SavedContent){super();this.reset(content)}

  private freshState(characters:CharacterDefinition[]):BattleState{
    const ally=[{x:2,y:7},{x:6,y:7},{x:4,y:6},{x:1,y:8},{x:7,y:8}]
    const enemy=[{x:6,y:1},{x:2,y:1},{x:4,y:2},{x:7,y:0},{x:1,y:0}]
    let a=0,e=0
    const units:Unit[]=characters.slice(0,10).map(char=>({...char,hp:char.maxHp,position:{...(char.team==='아군'?ally[a++%ally.length]:enemy[e++%enemy.length])},statuses:[],cooldownRemaining:0}))
    return{phase:'배치' as const,units,round:1,firstTeam:'아군' as Team,slots:[] as ActionSlot[],selectedSlot:0,selectedDeployUnitId:units[0]?.id??'',currentTime:'현재' as TimePeriod,selectedTime:'현재' as TimePeriod,shards:0,maxShards:100,executingSlot:-1,log:['출전 캐릭터를 배치하고 전투를 시작하세요.']}
  }

  reset(content=this.content){this.content=content;this.state=this.freshState(content.characters);this.emit()}
  setPresentationDelay(ms:number){this.presentationDelayMs=Math.min(2000,Math.max(0,Math.round(ms)));this.emit()}
  get livingUnits(){return this.state.units.filter(unit=>unit.hp>0)}
  get selectedActionSlot(){return this.state.slots[this.state.selectedSlot]}
  get selectedUnit(){const id=this.state.phase==='배치'?this.state.selectedDeployUnitId:this.selectedActionSlot?.unitId;return this.state.units.find(unit=>unit.id===id)}
  get selectedPlan(){return this.selectedActionSlot?.plan}
  getSkill(unit:Unit){return this.content.skills.find(skill=>skill.id===unit.skillId)}
  getEnemyThreatPredictions(){return predictEnemyThreats(this.state,this.content)}
  unitAt(point:Point,excludeId=''){return this.livingUnits.find(unit=>unit.id!==excludeId&&same(unit.position,point))}

  selectDeployUnit(id:string){if(this.state.phase!=='배치')return;this.state.selectedDeployUnitId=id;this.emit()}
  moveDeployment(point:Point){
    const unit=this.selectedUnit;if(this.state.phase!=='배치'||!unit||this.unitAt(point,unit.id))return false
    const inZone=unit.team==='아군'?point.y>=6:point.y<=5
    if(!inZone||point.y<0||point.y>=BOARD_SIZE)return false
    unit.position={...point};this.log(`${unit.name} 배치: ${point.x+1}, ${point.y+1}`);this.emit();return true
  }

  startBattle(){
    if(this.state.phase!=='배치'||!this.state.units.length)return
    this.state.firstTeam=Math.random()<.5?'아군':'적군'
    this.state.phase='계획';this.state.log=[];this.log(`동전 결과: ${this.state.firstTeam} 선공`);this.rebuildSlots();this.planEnemyAi(false);this.emit()
  }

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
  shiftSelectedSlot(delta:-1|1){
    const current=this.selectedActionSlot;if(!current||this.state.phase!=='계획')return
    const teamIndexes=this.state.slots.map((slot,index)=>({slot,index})).filter(v=>v.slot.team===current.team).map(v=>v.index)
    const position=teamIndexes.indexOf(this.state.selectedSlot),targetIndex=teamIndexes[position+delta];if(targetIndex===undefined)return
    const target=this.state.slots[targetIndex];[current.unitId,target.unitId]=[target.unitId,current.unitId];[current.plan,target.plan]=[target.plan,current.plan];this.state.selectedSlot=targetIndex;this.emit()
  }

  setPath(path:Point[]){const unit=this.selectedUnit,slot=this.selectedActionSlot;if(this.state.phase!=='계획'||!unit||!slot||!this.canPlanPath(unit,path))return false;slot.plan.path=path.map(p=>({...p}));this.emit();return true}
  canPlanPath(unit:Unit,path:Point[]){return path.length>0&&path.length-1<=unit.moveRange&&same(path[0],unit.position)&&path.slice(1).every((p,i)=>p.x>=0&&p.y>=0&&p.x<BOARD_SIZE&&p.y<BOARD_SIZE&&distance(path[i],p)===1)}
  clearPlan(){const unit=this.selectedUnit,slot=this.selectedActionSlot;if(!unit||!slot)return;slot.plan={path:[{...unit.position}],action:{kind:'없음'}};this.emit()}
  planNone(){const plan=this.selectedPlan;if(!plan)return;plan.action={kind:'없음'};this.emit()}
  planTarget(kind:'일반공격'|'스킬',targetId:string){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,targetUnitId:targetId};this.emit()}
  planCell(kind:'일반공격'|'스킬',targetCell:Point){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,targetCell:{...targetCell}};this.emit()}
  planDirection(kind:'일반공격'|'스킬',direction:Direction){const plan=this.selectedPlan;if(this.state.phase!=='계획'||!plan)return;plan.action={kind,direction};this.emit()}
  chooseTime(period:TimePeriod){if(this.state.phase!=='계획')return;if(period!==this.state.currentTime&&this.state.shards<TIME_SHIFT_COST)return;this.state.selectedTime=period;this.emit()}
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
      for(const target of scoped.filter(unit=>this.validTarget(actor,unit,effect.targetTeam))){
        const moveDirection=effect.type==='밀치기'?direction:opposite[direction],immune=target.immunities.includes(effect.type)
        const from={...target.position};let to={...from},blocked=false
        if(!immune){const v=vector[moveDirection];for(let step=0;step<effect.value;step++){const next={x:to.x+v.x,y:to.y+v.y};if(next.x<0||next.y<0||next.x>=BOARD_SIZE||next.y>=BOARD_SIZE||same(next,origin)||this.unitAt(next,target.id)){blocked=true;break}to=next}}
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
    if(this.state.selectedTime!==this.state.currentTime&&this.state.shards<TIME_SHIFT_COST)return '시간 파편이 부족합니다.'
    return''
  }

  async executeTurn(){
    const error=this.validatePlans();if(error){this.log(error);this.emit();return false}
    this.state.phase='실행';this.state.executingSlot=-1
    if(this.state.selectedTime!==this.state.currentTime){this.state.shards-=TIME_SHIFT_COST;this.state.currentTime=this.state.selectedTime;this.log(`회중시계 전환: ${this.state.currentTime} (-${TIME_SHIFT_COST} 파편)`)}
    else this.log(`${this.state.currentTime} 시간대 유지`)
    if(this.state.currentTime==='미래')for(const unit of this.livingUnits){const healed=Math.round(unit.maxHp*.07);unit.hp=Math.min(unit.maxHp,unit.hp+healed)}
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
      let collision=false
      for(const step of executionPath.slice(1)){
        if(step.x<0||step.y<0||step.x>=BOARD_SIZE||step.y>=BOARD_SIZE){collision=true;slot.result='충돌';this.log(`${unit.name} 경로가 전투판 밖으로 이탈! 후속 행동 취소`);break}
        if(this.unitAt(step,unit.id)){collision=true;slot.result='충돌';this.log(`${unit.name} 충돌! 후속 행동 취소`);break}
        unit.position={...step};this.emit();await wait(Math.max(30,Math.round(this.presentationDelayMs/3)))
      }
      if(!collision)await this.executeAction(unit,slot.plan)
      if(!slot.result||slot.result==='대기')slot.result='완료'
      this.checkOutcome();this.emit();await wait(this.presentationDelayMs)
    }
    if(this.isFinished()){this.emit();return true}
    for(const unit of this.livingUnits)unit.statuses=[]
    this.gainShards(SHARD_PER_TURN,'턴')
    this.state.round++;this.state.firstTeam=this.state.firstTeam==='아군'?'적군':'아군'
    for(const unit of this.livingUnits)unit.cooldownRemaining=Math.max(0,unit.cooldownRemaining-1)
    this.state.phase='계획';this.state.executingSlot=-1;this.rebuildSlots();this.planEnemyAi(false);this.log(`라운드 ${this.state.round}: ${this.state.firstTeam} 선공`);this.emit();return true
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
    const comboReady=targets.some(target=>target.team==='적군'&&target.statuses.some(s=>s.type==='기절'||s.type==='띄워짐'))
    let damagedEnemy=false,shardSource:Point|undefined
    if(isSkill&&skill){
      actor.cooldownRemaining=skill.cooldown
      for(const effect of skill.effects){
        if(effect.type==='설치'){
          const cell=plan.action.targetCell;this.log(`${effect.environmentId} 설치${cell?` · ${cell.x+1}, ${cell.y+1}`:''}`);continue
        }
        const scopedTargets=effect.scope==='자신'?[actor]:effect.scope==='선택대상'?(selectedTarget?[selectedTarget]:targets):effect.scope==='선택셀'?(selectedCellTarget?[selectedCellTarget]:[]):targets
        for(const target of scopedTargets.filter(t=>this.validTarget(actor,t,effect.targetTeam))){
          if(effect.type==='피해'){
            const damage=this.damage(actor,target,effect.value,skill.canCritical);if(damage>0&&actor.team==='아군'&&target.team==='적군'){damagedEnemy=true;shardSource??={...target.position}}
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
      for(const target of targets.filter(t=>t.team!==actor.team)){const damage=this.damage(actor,target,actor.attackPower,true);if(damage>0&&actor.team==='아군'&&target.team==='적군'){damagedEnemy=true;shardSource??={...target.position}}}
      this.log(`${actor.name} — ${actor.normalAttack.name}`)
    }
    if(damagedEnemy){
      this.gainShards(SHARD_PER_ATTACK,'공격',shardSource)
      if(comboReady)this.gainShards(SHARD_PER_COMBO,'콤보',shardSource)
    }
  }

  private validTarget(actor:Unit,target:Unit,targetTeam:TargetTeam){return targetTeam==='모두'||(targetTeam==='아군'?target.team===actor.team:target.team!==actor.team)}
  private unitsInLine(origin:Point,direction:Direction,range:number){const v=vector[direction],points=Array.from({length:range},(_,i)=>({x:origin.x+v.x*(i+1),y:origin.y+v.y*(i+1)}));return points.map(p=>this.unitAt(p)).filter((u):u is Unit=>Boolean(u))}
  private damage(actor:Unit,target:Unit,base:number,canCritical:boolean){let amount=base;if((this.state.currentTime==='과거'&&actor.type==='계승자')||(this.state.currentTime==='현재'&&actor.type==='각성자')||(this.state.currentTime==='미래'&&actor.type==='기술자'))amount*=1.3;const critical=canCritical&&target.statuses.some(s=>s.type==='띄워짐');if(critical)amount*=((actor.criticalRate+(this.state.currentTime==='현재'?30:0))/100);if(this.state.currentTime==='과거')amount*=2;const result=Math.max(0,Math.round(amount));target.hp=Math.max(0,target.hp-result);this.log(`${target.name} ${result} 피해${critical?' · 치명타!':''}`);this.combatText(target,critical?`치명타 -${result}`:`-${result}`,critical?'치명타':'피해');return result}
  private forceMove(target:Unit,direction:Direction,steps:number,effectType:EffectType){if(target.immunities.includes(effectType)){this.combatText(target,`${effectType} 면역`,'면역');return}const start={...target.position},v=vector[direction];for(let i=0;i<steps;i++){const next={x:target.position.x+v.x,y:target.position.y+v.y};if(next.x<0||next.y<0||next.x>=BOARD_SIZE||next.y>=BOARD_SIZE||this.unitAt(next,target.id))break;target.position=next}const moved=distance(start,target.position);this.log(`${target.name} ${effectType}`);this.combatText(target,`${effectType}${moved?` ${moved}칸`:''}`,'상태')}
  private checkOutcome(){const ally=this.livingUnits.some(u=>u.team==='아군'),enemy=this.livingUnits.some(u=>u.team==='적군');if(!ally){this.state.phase='패배';this.log('모든 아군 전투 불능 — 패배')}else if(!enemy){this.state.phase='승리';this.log('모든 적 전투 불능 — 승리')}}
  private isFinished(){return this.state.phase==='승리'||this.state.phase==='패배'}
  private combatText(unit:Unit,text:string,kind:CombatTextEvent['kind']){const detail:CombatTextEvent={unitId:unit.id,position:{...unit.position},text,kind};this.dispatchEvent(new CustomEvent<CombatTextEvent>('combat-text',{detail}))}
  private gainShards(amount:number,reason:ShardGainEvent['reason'],source?:Point){
    const gained=Math.min(amount,this.state.maxShards-this.state.shards);if(gained<=0)return
    this.state.shards+=gained;this.log(`시간 파편 +${gained} (${reason})`)
    const detail:ShardGainEvent={amount:gained,source:source?{...source}:undefined,reason};this.dispatchEvent(new CustomEvent<ShardGainEvent>('shard-gain',{detail}))
  }
  private log(text:string){this.state.log=[text,...this.state.log].slice(0,40)}
  private emit(){this.dispatchEvent(new Event('change'))}
}
