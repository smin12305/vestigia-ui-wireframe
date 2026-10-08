import type { ActionPlan, BattleState, Direction, Point, SavedContent, SkillDefinition, SkillEffect, TargetTeam, Unit } from './types'
import { isPointInPattern } from './patterns'

const directions:Direction[]=['상','하','좌','우']
const vectors:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const key=(point:Point)=>`${point.x},${point.y}`
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const inside=(point:Point,boardSize:number)=>point.x>=0&&point.y>=0&&point.x<boardSize&&point.y<boardSize

interface Candidate{plan:ActionPlan;score:number;reason:string;destination:Point}
export interface EnemyAiPlan{slotIndex:number;plan:ActionPlan;reason:string;score:number}

function reachablePaths(unit:Unit,blocked:Set<string>,boardSize:number){
  const paths=new Map<string,Point[]>(),start={...unit.position},queue:Point[]=[start]
  paths.set(key(start),[start])
  while(queue.length){
    const current=queue.shift()!,path=paths.get(key(current))!
    if(path.length-1>=unit.moveRange)continue
    for(const direction of directions){
      const vector=vectors[direction],next={x:current.x+vector.x,y:current.y+vector.y},nextKey=key(next)
      if(!inside(next,boardSize)||blocked.has(nextKey)||paths.has(nextKey))continue
      paths.set(nextKey,[...path,next]);queue.push(next)
    }
  }
  return [...paths.values()]
}

function unitsInLine(origin:Point,direction:Direction,range:number,units:Unit[]){
  const vector=vectors[direction],result:Unit[]=[]
  for(let step=1;step<=range;step++){
    const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step}
    const unit=units.find(candidate=>candidate.hp>0&&candidate.position.x===point.x&&candidate.position.y===point.y)
    if(unit)result.push(unit)
  }
  return result
}

function validTarget(actor:Unit,target:Unit,targetTeam:TargetTeam){return targetTeam==='모두'||(targetTeam==='아군'?target.team===actor.team:target.team!==actor.team)}

function effectTargets(actor:Unit,targets:Unit[],effect:SkillEffect,protectsAlliesFromDamage=false){
  const scoped=effect.scope==='자신'?[actor]:targets
  if(effect.type==='밀치기'||effect.type==='당기기')return scoped
  if(protectsAlliesFromDamage&&effect.type==='피해')return scoped.filter(target=>target.team!==actor.team&&validTarget(actor,target,effect.targetTeam))
  return scoped.filter(target=>validTarget(actor,target,effect.targetTeam))
}

function actionOrder(state:BattleState,unit:Unit){return state.slots.findIndex(slot=>slot.unitId===unit.id)}

function rolePositionScore(actor:Unit,destination:Point,targets:Unit[],allUnits:Unit[],pathLength:number){
  if(actor.aiBehavior==='돌격형')return Math.max(0,targets.length-1)*20-pathLength*.1
  if(actor.aiBehavior==='저격형'){
    const target=targets[0],finish=target?(1-target.hp/target.maxHp)*28:0,spacing=target?distance(destination,target.position)*2:0
    return finish+spacing-pathLength*1.75
  }
  if(actor.aiBehavior==='방벽형'){
    const rear=allUnits.find(unit=>unit.team===actor.team&&unit.aiBehavior==='저격형'&&unit.hp>0)
    return (rear?Math.max(0,4-distance(destination,rear.position))*5:0)-pathLength*.2
  }
  return 0
}

function scoreNormal(actor:Unit,targets:Unit[],allUnits:Unit[],destination:Point,pathLength:number){
  if(!targets.length)return 0
  let score=30+(targets.length-1)*15-pathLength*.15
  for(const target of targets){if(actor.attackPower>=target.hp)score+=45;score+=(1-target.hp/target.maxHp)*5}
  return score+rolePositionScore(actor,destination,targets,allUnits,pathLength)
}

function scoreSkill(actor:Unit,targets:Unit[],allUnits:Unit[],destination:Point,skill:SkillDefinition,state:BattleState,slotIndex:number,pathLength:number){
  let score=8-pathLength*.15,applied=false,protectsAlliesFromDamage=skill.effects.some(effect=>effect.type==='밀치기'||effect.type==='당기기')
  for(const effect of skill.effects){
    const affected=effectTargets(actor,targets,effect,protectsAlliesFromDamage)
    if(effect.type==='설치'){score+=8;applied=true;continue}
    for(const target of affected){
      if(effect.type==='피해'){score+=30;if(effect.value>=target.hp)score+=45;score+=(1-target.hp/target.maxHp)*5;applied=true}
      else if(effect.type==='기절'&&!target.immunities.includes('기절')){score+=actionOrder(state,target)>slotIndex?35:8;applied=true}
      else if(effect.type==='띄우기'&&!target.immunities.includes('띄우기')){score+=25;applied=true}
      else if((effect.type==='밀치기'||effect.type==='당기기')&&!target.immunities.includes(effect.type)){score+=actor.aiBehavior==='방벽형'?45:20;applied=true}
    }
  }
  if(targets.length>1)score+=(targets.length-1)*15
  return applied?score+rolePositionScore(actor,destination,targets,allUnits,pathLength):0
}

function attackCandidates(actor:Unit,path:Point[],allies:Unit[],allUnits:Unit[],skill:SkillDefinition|undefined,state:BattleState,slotIndex:number){
  const candidates:Candidate[]=[],origin=path[path.length-1],pathLength=path.length-1,normal=actor.normalAttack
  if(normal.targeting==='대상'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,normal.rangePatternId,normal.range)))candidates.push({plan:{path,action:{kind:'일반공격',targetUnitId:target.id}},score:scoreNormal(actor,[target],allUnits,origin,pathLength),reason:`${actor.aiBehavior} · ${target.name} 일반 공격`,destination:origin})
  }else if(normal.targeting==='방향'){
    for(const direction of directions){const targets=unitsInLine(origin,direction,normal.range,allUnits).filter(unit=>unit.team!==actor.team);if(targets.length)candidates.push({plan:{path,action:{kind:'일반공격',direction}},score:scoreNormal(actor,targets,allUnits,origin,pathLength),reason:`${actor.aiBehavior} · ${direction} 방향 일반 공격`,destination:origin})}
  }
  if(!skill||actor.cooldownRemaining>0)return candidates
  if(skill.targeting==='대상'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,skill.rangePatternId,skill.range))){const score=scoreSkill(actor,[target],allUnits,origin,skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',targetUnitId:target.id}},score,reason:`${actor.aiBehavior} · ${target.name}에게 ${skill.name}`,destination:origin})}
  }else if(skill.targeting==='셀'||skill.targeting==='설치'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,skill.rangePatternId,skill.range))){const score=scoreSkill(actor,[target],allUnits,origin,skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',targetCell:{...target.position}}},score,reason:`${actor.aiBehavior} · ${target.name} 위치에 ${skill.name}`,destination:origin})}
  }else{
    for(const direction of directions){const targets=unitsInLine(origin,direction,skill.range,allUnits).filter(unit=>unit.team!==actor.team),score=scoreSkill(actor,targets,allUnits,origin,skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',direction}},score,reason:`${actor.aiBehavior} · ${direction} 방향 ${skill.name}`,destination:origin})}
  }
  return candidates
}

function chooseCandidate(candidates:Candidate[],random:()=>number){
  const sorted=candidates.sort((a,b)=>b.score-a.score),top=sorted.slice(0,3)
  if(!top.length)throw new Error('AI 행동 후보가 없습니다.')
  const roll=random(),index=roll<.7?0:roll<.9?Math.min(1,top.length-1):Math.min(2,top.length-1)
  return top[index]
}

export function createEnemyAiPlans(state:BattleState,content:SavedContent,random=Math.random):EnemyAiPlan[]{
  const living=state.units.filter(unit=>unit.hp>0),allies=living.filter(unit=>unit.team==='아군')
  const occupied=new Set(living.map(unit=>key(unit.position))),plans:EnemyAiPlan[]=[]
  state.slots.forEach((slot,slotIndex)=>{
    if(slot.team!=='적군')return
    const actor=living.find(unit=>unit.id===slot.unitId);if(!actor)return
    const blocked=new Set(occupied);blocked.delete(key(actor.position))
    const paths=reachablePaths(actor,blocked,state.boardSize),skill=content.skills.find(candidate=>candidate.id===actor.skillId),candidates:Candidate[]=[]
    for(const path of paths)candidates.push(...attackCandidates(actor,path,allies,living,skill,state,slotIndex))
    if(!candidates.length){
      const startDistance=Math.min(...allies.map(target=>distance(actor.position,target.position)))
      for(const path of paths){const destination=path[path.length-1],endDistance=Math.min(...allies.map(target=>distance(destination,target.position)));let score=(startDistance-endDistance)*3-(path.length-1)*.05,reason=endDistance<startDistance?'가장 가까운 아군에게 접근':'대기';if(actor.aiBehavior==='돌격형'){score+=(startDistance-endDistance)*3;reason=`돌격형 · ${reason}`}else if(actor.aiBehavior==='방벽형'){const rear=living.find(unit=>unit.team===actor.team&&unit.aiBehavior==='저격형');if(rear)score+=Math.max(0,5-distance(destination,rear.position))*4;reason='방벽형 · 철탑 방위병 근처에서 진로 차단'}else if(actor.aiBehavior==='저격형'){score+=(startDistance-endDistance)*2-(path.length-1);reason='저격형 · 사격 사거리 확보'}candidates.push({plan:{path,action:{kind:'없음'}},score,reason,destination})}
    }
    const selected=chooseCandidate(candidates,random)
    occupied.delete(key(actor.position));occupied.add(key(selected.destination))
    plans.push({slotIndex,plan:selected.plan,reason:selected.reason,score:selected.score})
  })
  return plans
}
