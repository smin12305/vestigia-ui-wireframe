import type { ActionPlan, BattleState, Direction, Point, SavedContent, SkillDefinition, SkillEffect, TargetTeam, Unit } from './types'
import { isPointInPattern } from './patterns'

const BOARD_SIZE=9
const directions:Direction[]=['상','하','좌','우']
const vectors:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const key=(point:Point)=>`${point.x},${point.y}`
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const inside=(point:Point)=>point.x>=0&&point.y>=0&&point.x<BOARD_SIZE&&point.y<BOARD_SIZE

interface Candidate{plan:ActionPlan;score:number;reason:string;destination:Point}
export interface EnemyAiPlan{slotIndex:number;plan:ActionPlan;reason:string;score:number}

function reachablePaths(unit:Unit,blocked:Set<string>){
  const paths=new Map<string,Point[]>(),start={...unit.position},queue:Point[]=[start]
  paths.set(key(start),[start])
  while(queue.length){
    const current=queue.shift()!,path=paths.get(key(current))!
    if(path.length-1>=unit.moveRange)continue
    for(const direction of directions){
      const vector=vectors[direction],next={x:current.x+vector.x,y:current.y+vector.y},nextKey=key(next)
      if(!inside(next)||blocked.has(nextKey)||paths.has(nextKey))continue
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

function effectTargets(actor:Unit,targets:Unit[],effect:SkillEffect){
  if(effect.scope==='자신')return[actor]
  return targets.filter(target=>validTarget(actor,target,effect.targetTeam))
}

function actionOrder(state:BattleState,unit:Unit){return state.slots.findIndex(slot=>slot.unitId===unit.id)}

function scoreNormal(actor:Unit,targets:Unit[],pathLength:number){
  if(!targets.length)return 0
  let score=30+(targets.length-1)*15-pathLength*.15
  for(const target of targets){if(actor.attackPower>=target.hp)score+=45;score+=(1-target.hp/target.maxHp)*5}
  return score
}

function scoreSkill(actor:Unit,targets:Unit[],skill:SkillDefinition,state:BattleState,slotIndex:number,pathLength:number){
  let score=8-pathLength*.15,applied=false
  for(const effect of skill.effects){
    const affected=effectTargets(actor,targets,effect)
    if(effect.type==='설치'){score+=8;applied=true;continue}
    for(const target of affected){
      if(effect.type==='피해'){score+=30;if(effect.value>=target.hp)score+=45;score+=(1-target.hp/target.maxHp)*5;applied=true}
      else if(effect.type==='기절'&&!target.immunities.includes('기절')){score+=actionOrder(state,target)>slotIndex?35:8;applied=true}
      else if(effect.type==='띄우기'&&!target.immunities.includes('띄우기')){score+=25;applied=true}
      else if((effect.type==='밀치기'||effect.type==='당기기')&&!target.immunities.includes(effect.type)){score+=20;applied=true}
    }
  }
  if(targets.length>1)score+=(targets.length-1)*15
  return applied?score:0
}

function attackCandidates(actor:Unit,path:Point[],allies:Unit[],allUnits:Unit[],skill:SkillDefinition|undefined,state:BattleState,slotIndex:number){
  const candidates:Candidate[]=[],origin=path[path.length-1],pathLength=path.length-1,normal=actor.normalAttack
  if(normal.targeting==='대상'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,normal.rangePatternId,normal.range)))candidates.push({plan:{path,action:{kind:'일반공격',targetUnitId:target.id}},score:scoreNormal(actor,[target],pathLength),reason:`${target.name} 일반 공격`,destination:origin})
  }else if(normal.targeting==='방향'){
    for(const direction of directions){const targets=unitsInLine(origin,direction,normal.range,allUnits).filter(unit=>unit.team!==actor.team);if(targets.length)candidates.push({plan:{path,action:{kind:'일반공격',direction}},score:scoreNormal(actor,targets,pathLength),reason:`${direction} 방향 일반 공격`,destination:origin})}
  }
  if(!skill||actor.cooldownRemaining>0)return candidates
  if(skill.targeting==='대상'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,skill.rangePatternId,skill.range))){const score=scoreSkill(actor,[target],skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',targetUnitId:target.id}},score,reason:`${target.name}에게 ${skill.name}`,destination:origin})}
  }else if(skill.targeting==='셀'||skill.targeting==='설치'){
    for(const target of allies.filter(unit=>isPointInPattern(origin,unit.position,skill.rangePatternId,skill.range))){const score=scoreSkill(actor,[target],skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',targetCell:{...target.position}}},score,reason:`${target.name} 위치에 ${skill.name}`,destination:origin})}
  }else{
    for(const direction of directions){const targets=unitsInLine(origin,direction,skill.range,allUnits).filter(unit=>unit.team!==actor.team),score=scoreSkill(actor,targets,skill,state,slotIndex,pathLength);if(score>0)candidates.push({plan:{path,action:{kind:'스킬',direction}},score,reason:`${direction} 방향 ${skill.name}`,destination:origin})}
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
    const paths=reachablePaths(actor,blocked),skill=content.skills.find(candidate=>candidate.id===actor.skillId),candidates:Candidate[]=[]
    for(const path of paths)candidates.push(...attackCandidates(actor,path,allies,living,skill,state,slotIndex))
    if(!candidates.length){
      const startDistance=Math.min(...allies.map(target=>distance(actor.position,target.position)))
      for(const path of paths){const destination=path[path.length-1],endDistance=Math.min(...allies.map(target=>distance(destination,target.position))),score=(startDistance-endDistance)*3-(path.length-1)*.05;candidates.push({plan:{path,action:{kind:'없음'}},score,reason:endDistance<startDistance?'가장 가까운 아군에게 접근':'대기',destination})}
    }
    const selected=chooseCandidate(candidates,random)
    occupied.delete(key(actor.position));occupied.add(key(selected.destination))
    plans.push({slotIndex,plan:selected.plan,reason:selected.reason,score:selected.score})
  })
  return plans
}
