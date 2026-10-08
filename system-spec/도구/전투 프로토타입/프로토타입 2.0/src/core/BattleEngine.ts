import{characters,skillById}from'./content'
import{cellsInPattern,directionFrom,directions,distance,inside,key,reachable,same}from'./grid'
import type{ActionSlot,BattleState,Cell,Direction,Plan,PlannedAction,Present,Team,TimeManipulation,TimePeriod,Unit}from'./types'

const SHARD_ATTACK=20,SHARD_COMBO=30,SHARD_TURN=10
const cloneCell=(cell:Cell)=>({...cell})
const emptyPlan=(position:Cell):Plan=>({path:[cloneCell(position)],action:{kind:'없음'},moveConfirmed:false,actionConfirmed:false})

export class BattleEngine extends EventTarget{
  state!:BattleState
  constructor(){super();this.reset()}

  reset(){
    const enemyPositions:Record<string,Cell>={holy_lancer:{x:1,y:0},holy_shield:{x:4,y:0},tower_guard:{x:5,y:1}}
    const units=characters.map(definition=>({...structuredClone(definition),hp:definition.maxHp,position:definition.team==='적군'?cloneCell(enemyPositions[definition.id]):{x:-1,y:-1},statuses:[],cooldownRemaining:0}))
    this.state={phase:'배치',round:1,firstTeam:'아군',units,deployedAllyIds:[],selectedDeployUnitId:'isaac',selectedUnitId:'isaac',slots:[],currentTime:'현재',timeStreak:1,timeCycleProgress:1,timeDialIndex:0,timeManipulationUsed:false,timeStoppedThisTurn:false,timeManipulationCost:50,shards:0,maxShards:80,executingSlot:-1}
    this.emit()
  }

  private emit(){this.dispatchEvent(new Event('change'))}
  get livingUnits(){return this.state.units.filter(unit=>unit.hp>0)}
  unit(id:string|undefined){return this.state.units.find(unit=>unit.id===id)}
  unitAt(cell:Cell,except?:string){return this.livingUnits.find(unit=>unit.id!==except&&same(unit.position,cell))}
  skill(unit:Unit|undefined){return unit?skillById(unit.skillId):undefined}
  selectedUnit(){return this.unit(this.state.selectedUnitId)}
  slotFor(unitId:string){return this.state.slots.find(slot=>slot.unitId===unitId)}
  selectUnit(unitId:string){if(this.unit(unitId)?.hp){this.state.selectedUnitId=unitId;this.emit()}}
  selectDeployUnit(unitId:string){if(this.state.phase==='배치'&&this.unit(unitId)?.team==='아군'){this.state.selectedDeployUnitId=unitId;this.state.selectedUnitId=unitId;this.emit()}}

  deploy(cell:Cell){
    if(this.state.phase!=='배치'||cell.y<4||!inside(cell)||this.unitAt(cell))return false
    const unit=this.unit(this.state.selectedDeployUnitId);if(!unit||unit.team!=='아군')return false
    unit.position=cloneCell(cell);if(!this.state.deployedAllyIds.includes(unit.id))this.state.deployedAllyIds.push(unit.id)
    const next=this.state.units.find(candidate=>candidate.team==='아군'&&!this.state.deployedAllyIds.includes(candidate.id));if(next){this.state.selectedDeployUnitId=next.id;this.state.selectedUnitId=next.id}
    this.emit();return true
  }

  beginBattle(){
    if(this.state.deployedAllyIds.length!==3)return false
    this.state.firstTeam=Math.random()<.5?'아군':'적군';this.state.phase='계획';this.buildSlots();this.planEnemies();this.state.selectedUnitId=this.state.slots.find(slot=>slot.team==='아군')?.unitId;this.emit();return true
  }

  private buildSlots(){
    const allies=this.livingUnits.filter(unit=>unit.team==='아군'),enemies=this.livingUnits.filter(unit=>unit.team==='적군'),slots:ActionSlot[]=[]
    for(let index=0;index<Math.max(allies.length,enemies.length);index++)for(const team of [this.state.firstTeam,this.state.firstTeam==='아군'?'적군':'아군'] as Team[]){const unit=(team==='아군'?allies:enemies)[index];if(unit)slots.push({number:slots.length+1,unitId:unit.id,team,plan:emptyPlan(unit.position),result:'대기'})}
    this.state.slots=slots
  }

  movementPaths(unit:Unit){
    const blocked=new Set(this.livingUnits.filter(other=>other.id!==unit.id).map(other=>key(other.position)))
    const futureBonus=this.state.currentTime==='미래'?1:0
    return reachable(unit.position,unit.moveRange+futureBonus,blocked)
  }

  setDestination(unitId:string,cell:Cell){
    if(this.state.phase!=='계획')return false;const unit=this.unit(unitId),slot=this.slotFor(unitId);if(!unit||unit.team!=='아군'||!slot)return false
    const path=this.movementPaths(unit).get(key(cell));if(!path)return false
    slot.plan.path=path.map(cloneCell);slot.plan.moveConfirmed=true;slot.plan.action={kind:'없음'};slot.plan.actionConfirmed=false;this.emit();return true
  }

  actionOrigin(unitId:string){const slot=this.slotFor(unitId),unit=this.unit(unitId);return slot?.plan.path.at(-1)??unit?.position}
  setAction(unitId:string,action:PlannedAction){const slot=this.slotFor(unitId),unit=this.unit(unitId);if(this.state.phase!=='계획'||!slot||unit?.team!=='아군')return false;slot.plan.action=structuredClone(action);slot.plan.actionConfirmed=false;this.emit();return true}
  confirmAction(unitId:string){const slot=this.slotFor(unitId);if(!slot||!slot.plan.moveConfirmed)return false;slot.plan.actionConfirmed=true;this.emit();return true}
  clearPlan(unitId:string){const unit=this.unit(unitId),slot=this.slotFor(unitId);if(!unit||!slot)return;slot.plan=emptyPlan(unit.position);this.emit()}
  get allAlliesPlanned(){return this.state.slots.filter(slot=>slot.team==='아군').every(slot=>slot.plan.moveConfirmed&&slot.plan.actionConfirmed)}

  swapAllySlots(first:number,second:number){
    const a=this.state.slots[first],b=this.state.slots[second];if(this.state.phase!=='계획'||!a||!b||a.team!=='아군'||b.team!=='아군')return false
    ;[a.unitId,b.unitId]=[b.unitId,a.unitId];[a.plan,b.plan]=[b.plan,a.plan];this.emit();return true
  }

  private planEnemies(){
    for(const slot of this.state.slots.filter(candidate=>candidate.team==='적군')){
      const actor=this.unit(slot.unitId);if(!actor)continue;const targets=this.livingUnits.filter(unit=>unit.team==='아군').sort((a,b)=>distance(actor.position,a.position)-distance(actor.position,b.position)),target=targets[0];if(!target)continue
      const blocked=new Set(this.livingUnits.filter(unit=>unit.id!==actor.id).map(unit=>key(unit.position))),paths=[...reachable(actor.position,actor.moveRange,blocked).values()]
      paths.sort((a,b)=>distance(a.at(-1)!,target.position)-distance(b.at(-1)!,target.position));slot.plan.path=(paths[0]??[actor.position]).map(cloneCell);slot.plan.moveConfirmed=true
      const origin=slot.plan.path.at(-1)!,skill=this.skill(actor),useSkill=Boolean(skill&&actor.cooldownRemaining===0&&this.cellsFor(origin,skill.pattern,skill.range,target.position).some(cell=>same(cell,target.position)))
      slot.plan.action={kind:useSkill?'스킬':'일반공격',target:cloneCell(target.position),direction:directionFrom(origin,target.position)};slot.plan.actionConfirmed=true
    }
  }

  cellsFor(origin:Cell,pattern:Parameters<typeof cellsInPattern>[1],range:number,target?:Cell){return cellsInPattern(origin,pattern,range,target?directionFrom(origin,target):undefined)}
  actionCells(slot:ActionSlot){const unit=this.unit(slot.unitId),origin=slot.plan.path.at(-1);if(!unit||!origin||slot.plan.action.kind==='없음')return[];const definition=slot.plan.action.kind==='스킬'?this.skill(unit):unit.normalAttack;if(!definition)return[];if(definition.targeting!=='방향 선택형')return cellsInPattern(origin,definition.pattern,definition.range);return this.cellsFor(origin,definition.pattern,definition.range,slot.plan.action.target)}

  canManipulate(kind:TimeManipulation){return this.state.phase==='계획'&&!this.state.timeManipulationUsed&&this.state.shards>=this.state.timeManipulationCost&&['가속','정지','역행'].includes(kind)}
  manipulateTime(kind:TimeManipulation){
    if(!this.canManipulate(kind))return false;const from=this.state.currentTime;this.state.shards-=this.state.timeManipulationCost;this.state.timeManipulationCost=Math.min(80,this.state.timeManipulationCost+5);this.state.timeManipulationUsed=true
    if(kind==='정지')this.state.timeStoppedThisTurn=true
    else{this.state.timeDialIndex=(this.state.timeDialIndex+(kind==='가속'?1:11))%12;const to=this.periodAtDial(this.state.timeDialIndex);this.state.timeCycleProgress=this.state.timeDialIndex%2+1;if(to===from)this.state.timeStreak++;else{this.state.currentTime=to;this.state.timeStreak=1}}
    this.emit();return true
  }

  async executeTurn(present:Present){
    if(this.state.phase!=='계획'||!this.allAlliesPlanned)return false;this.state.phase='실행';this.emit()
    for(let index=0;index<this.state.slots.length;index++){
      this.state.executingSlot=index;const slot=this.state.slots[index],unit=this.unit(slot.unitId);this.emit();if(!unit||unit.hp<=0){slot.result='취소';continue}
      if(unit.statuses.some(status=>status.type==='기절')){slot.result='기절';continue}
      let collided=false
      for(const step of slot.plan.path.slice(1)){if(!inside(step)||this.unitAt(step,unit.id)){collided=true;slot.result='충돌';break}const from=cloneCell(unit.position);unit.position=cloneCell(step);await present({type:'move',unitId:unit.id,from,to:cloneCell(step)});this.emit();if(await this.triggerCounters(unit,present))break}
      if(unit.hp<=0||collided)continue
      await this.resolveAction(unit,slot,present);slot.result=unit.hp>0?'완료':'취소';this.checkOutcome();if(!this.livingUnits.some(candidate=>candidate.team==='아군')||!this.livingUnits.some(candidate=>candidate.team==='적군'))break
    }
    this.state.executingSlot=-1;if(String(this.state.phase)==='실행')await this.finishTurn(present);this.emit();return true
  }

  private async resolveAction(actor:Unit,slot:ActionSlot,present:Present){
    if(slot.plan.action.kind==='없음')return;const skill=slot.plan.action.kind==='스킬'?this.skill(actor):undefined,definition=skill??actor.normalAttack,origin=cloneCell(actor.position),cells=definition.targeting==='방향 선택형'?this.cellsFor(origin,definition.pattern,definition.range,slot.plan.action.target):cellsInPattern(origin,definition.pattern,definition.range)
    await present({type:'attack',actorId:actor.id,name:definition.name,kind:slot.plan.action.kind,origin,target:slot.plan.action.target??origin,cells})
    if(skill&&skill.effects.some(effect=>effect.type==='반격')){actor.statuses.push({type:'반격',appliedRound:this.state.round,triggeredTargetIds:[]});actor.cooldownRemaining=skill.cooldown;await present({type:'status',unitId:actor.id,status:'반격'});return}
    const targets=this.livingUnits.filter(unit=>unit.team!==actor.team&&cells.some(cell=>same(cell,unit.position)))
    for(const target of targets){const hadCombo=target.statuses.some(status=>status.type==='띄워짐'||status.type==='기절'),damageEffect=skill?.effects.find(effect=>effect.type==='피해'),base=actor.attackPower+(damageEffect?.value??0);await this.dealDamage(actor,target,base,Boolean(skill?.canCritical),slot.plan.action.kind,present);if(actor.team==='아군'){await this.gainShards(SHARD_ATTACK,'공격',target.position,present);if(hadCombo)await this.gainShards(SHARD_COMBO,'콤보',target.position,present)}if(target.hp<=0)continue
      for(const effect of skill?.effects??[]){if(effect.type==='띄우기'||effect.type==='기절'){const status=effect.type==='띄우기'?'띄워짐':'기절';target.statuses.push({type:status,appliedRound:this.state.round});await present({type:'status',unitId:target.id,status})}if(effect.type==='밀치기'||effect.type==='당기기')await this.forceMove(target,directionFrom(actor.position,target.position),effect.type==='당기기'?this.opposite(directionFrom(actor.position,target.position)):directionFrom(actor.position,target.position),effect.value,present)}
    }
    if(skill)actor.cooldownRemaining=skill.cooldown
    await this.triggerCounters(actor,present)
  }

  private async dealDamage(actor:Unit,target:Unit,base:number,canCritical:boolean,kind:'일반공격'|'스킬'|'반격',present:Present){
    const critical=canCritical&&target.statuses.some(status=>status.type==='띄워짐'),immediateBase=base+(kind==='일반공격'&&this.state.currentTime==='과거'?5:0),immediate=Math.max(0,Math.floor(immediateBase*(critical?actor.criticalDamage/100:1))),favored=this.favored(actor),total=favored?Math.floor(immediate*Math.pow(1.2,this.state.timeStreak)):immediate,bonus=Math.max(0,total-immediate)
    target.hp=Math.max(0,target.hp-immediate);await present({type:'damage',actorId:actor.id,targetId:target.id,amount:immediate,critical,timeBonus:false,defeated:target.hp<=0});this.emit();if(target.hp<=0||!bonus)return
    target.hp=Math.max(0,target.hp-bonus);await present({type:'damage',actorId:actor.id,targetId:target.id,amount:bonus,critical:false,timeBonus:true,defeated:target.hp<=0});this.emit()
  }

  private async forceMove(target:Unit,_fromDirection:Direction,direction:Direction,steps:number,present:Present){const from=cloneCell(target.position),vector=directions[direction];for(let count=0;count<steps;count++){const next={x:target.position.x+vector.x,y:target.position.y+vector.y};if(!inside(next)||this.unitAt(next,target.id))break;target.position=next}const moved=distance(from,target.position);if(moved)await present({type:'force',unitId:target.id,from,to:cloneCell(target.position),direction,distance:moved});this.emit()}
  private opposite(direction:Direction):Direction{return({상:'하',하:'상',좌:'우',우:'좌'}as const)[direction]}
  private async triggerCounters(mover:Unit,present:Present){for(const counter of this.livingUnits.filter(unit=>unit.team!==mover.team&&unit.statuses.some(status=>status.type==='반격'))){const status=counter.statuses.find(item=>item.type==='반격')!;if(Math.max(Math.abs(counter.position.x-mover.position.x),Math.abs(counter.position.y-mover.position.y))>1||status.triggeredTargetIds?.includes(mover.id))continue;status.triggeredTargetIds?.push(mover.id);await present({type:'attack',actorId:counter.id,name:'반격',kind:'반격',origin:cloneCell(counter.position),target:cloneCell(mover.position),cells:[cloneCell(mover.position)]});await this.dealDamage(counter,mover,counter.attackPower,false,'반격',present);if(counter.team==='아군')await this.gainShards(SHARD_ATTACK,'공격',mover.position,present);this.checkOutcome();return mover.hp<=0}return false}
  private favored(unit:Unit){return(this.state.currentTime==='현재'&&unit.type==='각성자')||(this.state.currentTime==='미래'&&unit.type==='기술자')||(this.state.currentTime==='과거'&&unit.type==='계승자')}
  private async gainShards(amount:number,reason:'공격'|'콤보'|'턴',source:Cell|undefined,present:Present){const before=this.state.shards;this.state.shards=Math.min(this.state.maxShards,this.state.shards+amount);const gained=this.state.shards-before;if(gained)await present({type:'shards',amount:gained,source:source?cloneCell(source):undefined,reason});this.emit()}
  private checkOutcome(){const allies=this.livingUnits.some(unit=>unit.team==='아군'),enemies=this.livingUnits.some(unit=>unit.team==='적군');if(!enemies)this.state.phase='승리';else if(!allies)this.state.phase='패배'}
  private periodAtDial(index:number):TimePeriod{return index<2||index>=10?'현재':index<6?'미래':'과거'}
  private async finishTurn(present:Present){
    await this.gainShards(SHARD_TURN,'턴',undefined,present);for(const unit of this.livingUnits){unit.cooldownRemaining=Math.max(0,unit.cooldownRemaining-1);unit.statuses=unit.statuses.filter(status=>status.type==='반격'?false:status.appliedRound>=this.state.round)}
    const from=this.state.currentTime;if(this.state.timeStoppedThisTurn){this.state.timeStoppedThisTurn=false;this.state.timeStreak++}else{this.state.timeDialIndex=(this.state.timeDialIndex+1)%12;this.state.timeCycleProgress++;if(this.state.timeCycleProgress>2){this.state.timeCycleProgress=1;this.state.currentTime=from==='현재'?'미래':from==='미래'?'과거':'현재';this.state.timeStreak=1}else this.state.timeStreak++}
    await present({type:'time',from,to:this.state.currentTime,streak:this.state.timeStreak,dialIndex:this.state.timeDialIndex});this.state.timeManipulationUsed=false;this.state.round++;this.state.firstTeam=this.state.firstTeam==='아군'?'적군':'아군';this.state.phase='계획';this.buildSlots();this.planEnemies();this.state.selectedUnitId=this.state.slots.find(slot=>slot.team==='아군')?.unitId;await present({type:'turn-end'});this.emit()
  }
}
