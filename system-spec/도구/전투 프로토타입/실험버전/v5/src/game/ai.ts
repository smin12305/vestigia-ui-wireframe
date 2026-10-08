import type { ActionPlan, AttackDefinition, BattleState, Direction, Point, SavedContent, SkillDefinition, Unit } from './types'
import { isPointInPattern } from './patterns'

const directions:Direction[]=['상','하','좌','우']
const vectors:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const key=(point:Point)=>`${point.x},${point.y}`
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const inside=(point:Point,boardSize:number)=>point.x>=0&&point.y>=0&&point.x<boardSize&&point.y<boardSize
const inArea=(origin:Point,point:Point,pattern:string|undefined,range:number)=>origin.x===point.x&&origin.y===point.y||isPointInPattern(origin,point,pattern,range)

interface Candidate{plan:ActionPlan;score:number;reason:string;destination:Point}
export interface EnemyAiPlan{slotIndex:number;plan:ActionPlan;reason:string;score:number}

function reachablePaths(unit:Unit,blocked:Set<string>,boardSize:number){
  const paths=new Map<string,Point[]>(),start={...unit.position},queue:Point[]=[start];paths.set(key(start),[start])
  while(queue.length){const current=queue.shift()!,path=paths.get(key(current))!;if(path.length-1>=unit.moveRange)continue;for(const direction of directions){const vector=vectors[direction],next={x:current.x+vector.x,y:current.y+vector.y};if(!inside(next,boardSize)||blocked.has(key(next))||paths.has(key(next)))continue;paths.set(key(next),[...path,next]);queue.push(next)}}
  return[...paths.values()]
}

function lineUnits(origin:Point,direction:Direction,range:number,units:Unit[],penetrates:boolean){
  const result:Unit[]=[],vector=vectors[direction]
  for(let step=1;step<=range;step++){const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step},unit=units.find(candidate=>candidate.hp>0&&candidate.position.x===point.x&&candidate.position.y===point.y);if(unit){result.push(unit);if(!penetrates)break}}
  return result
}

function roleBonus(actor:Unit,destination:Point,targets:Unit[],allUnits:Unit[],pathLength:number){
  if(actor.aiBehavior==='돌격형')return targets.length*12-pathLength*.1
  if(actor.aiBehavior==='저격형'){const nearest=Math.min(...allUnits.filter(unit=>unit.team!==actor.team&&unit.hp>0).map(unit=>distance(destination,unit.position)));return nearest*2-pathLength*1.4}
  if(actor.aiBehavior==='방벽형'){const rear=allUnits.find(unit=>unit.team===actor.team&&unit.aiBehavior==='저격형'&&unit.hp>0);return rear?Math.max(0,4-distance(destination,rear.position))*5:0}
  return 0
}

function targetScore(actor:Unit,targets:Unit[],baseDamage:number){
  let score=targets.length?18:0
  for(const target of targets){if(target.team===actor.team){score-=45;continue}score+=24+(baseDamage>=target.hp?45:0)+(1-target.hp/target.maxHp)*8}
  return score
}

function affectedAt(point:Point,definition:AttackDefinition|SkillDefinition,units:Unit[]){const pattern=definition.affectedCellPatternId??definition.rangePatternId;return units.filter(unit=>unit.hp>0&&inArea(point,unit.position,pattern,definition.trajectory==='곡사'?1:definition.range))}

function actionCandidates(actor:Unit,path:Point[],allUnits:Unit[],skill:SkillDefinition|undefined){
  const result:Candidate[]=[],origin=path.at(-1)!,pathLength=path.length-1
  const addDefinition=(kind:'일반공격'|'스킬',definition:AttackDefinition|SkillDefinition)=>{
    const baseDamage=kind==='일반공격'?actor.attackPower:(definition as SkillDefinition).effects.find(effect=>effect.type==='피해')?.value??0
    const add=(action:ActionPlan['action'],targets:Unit[],label:string)=>{const score=targetScore(actor,targets,baseDamage)+roleBonus(actor,origin,targets,allUnits,pathLength);if(score>0)result.push({plan:{path,action},score,reason:`${actor.aiBehavior} · ${label}`,destination:origin})}
    if(definition.targeting==='자가 버프형'){result.push({plan:{path,action:{kind,selfConfirmed:true}},score:20+roleBonus(actor,origin,[],allUnits,pathLength),reason:`${actor.aiBehavior} · ${definition.name}`,destination:origin});return}
    if(definition.targeting==='자기 기준형'){const targets=affectedAt(origin,definition,allUnits).filter(target=>target.id!==actor.id);add({kind,selfConfirmed:true},targets,`${definition.name} 자기 중심 범위`);return}
    if(definition.trajectory==='곡사'){
      for(const target of allUnits.filter(unit=>unit.team!==actor.team&&isPointInPattern(origin,unit.position,definition.rangePatternId,definition.range))){const relativeTarget={x:target.position.x-origin.x,y:target.position.y-origin.y},targets=affectedAt(target.position,definition,allUnits);add({kind,relativeTarget},targets,`${target.name} 위치에 ${definition.name}`)}
      return
    }
    for(const direction of directions){const targets=lineUnits(origin,direction,definition.range,allUnits,definition.penetrates);add({kind,direction},targets,`${direction} 방향 ${definition.name}`)}
  }
  addDefinition('일반공격',actor.normalAttack)
  if(skill&&actor.cooldownRemaining===0)addDefinition('스킬',skill)
  return result
}

function chooseCandidate(candidates:Candidate[],random:()=>number){const top=candidates.sort((a,b)=>b.score-a.score).slice(0,3);if(!top.length)throw new Error('AI 행동 후보가 없습니다.');const roll=random(),index=roll<.7?0:roll<.9?Math.min(1,top.length-1):Math.min(2,top.length-1);return top[index]}

export function createEnemyAiPlans(state:BattleState,content:SavedContent,random=Math.random):EnemyAiPlan[]{
  const living=state.units.filter(unit=>unit.hp>0),allies=living.filter(unit=>unit.team==='아군'),occupied=new Set(living.map(unit=>key(unit.position))),plans:EnemyAiPlan[]=[]
  state.slots.forEach((slot,slotIndex)=>{
    if(slot.team!=='적군')return
    const actor=living.find(unit=>unit.id===slot.unitId);if(!actor)return
    const blocked=new Set(occupied);blocked.delete(key(actor.position));const paths=reachablePaths(actor,blocked,state.boardSize),skill=content.skills.find(candidate=>candidate.id===actor.skillId),candidates=paths.flatMap(path=>actionCandidates(actor,path,living,skill))
    if(!candidates.length){const startDistance=Math.min(...allies.map(target=>distance(actor.position,target.position)));for(const path of paths){const destination=path.at(-1)!,endDistance=Math.min(...allies.map(target=>distance(destination,target.position)));candidates.push({plan:{path,action:{kind:'없음'}},score:(startDistance-endDistance)*5-(path.length-1)*.05,reason:`${actor.aiBehavior} · 접근 후 대기`,destination})}}
    const selected=chooseCandidate(candidates,random);occupied.delete(key(actor.position));occupied.add(key(selected.destination));plans.push({slotIndex,plan:selected.plan,reason:selected.reason,score:selected.score})
  })
  return plans
}
