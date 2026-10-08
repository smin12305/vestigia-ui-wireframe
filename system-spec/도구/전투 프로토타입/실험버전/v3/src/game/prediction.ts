import type { BattleState, EnemyThreatPrediction, Point, SavedContent, Unit } from './types'

const relativeTargetPoint=(origin:Point,offset:Point|undefined)=>offset?{x:origin.x+offset.x,y:origin.y+offset.y}:undefined

/** v3의 적 정보는 결과 시뮬레이션이 아니라 AI가 확정한 고정 예고다. */
export function predictEnemyThreats(state:BattleState,content:SavedContent):EnemyThreatPrediction[]{
  return state.slots.flatMap((slot,slotIndex)=>{
    if(slot.team!=='적군')return[]
    const actor=state.units.find(unit=>unit.id===slot.unitId),action=slot.plan.action
    if(!actor)return[]
    const skill=action.kind==='스킬'?content.skills.find(item=>item.id===actor.skillId):undefined
    const definition=action.kind==='스킬'?skill:action.kind==='일반공격'?actor.normalAttack:undefined
    const origin=slot.plan.path.at(-1)??actor.position
    const relativePoint=relativeTargetPoint(origin,action.relativeTarget)
    const intendedTarget=relativePoint?state.units.find(unit=>unit.hp>0&&unit.position.x===relativePoint.x&&unit.position.y===relativePoint.y):undefined
    const actionName=action.kind==='스킬'?skill?.name??'스킬':action.kind==='일반공격'?actor.normalAttack.name:'이동·대기'
    const threat:EnemyThreatPrediction={
      slotIndex,slotNumber:slot.number,actorId:actor.id,actorName:actor.name,actionName,
      direction:action.direction,intendedTargetName:intendedTarget?.name,origin:{...origin},outcomes:[],
      state:definition?'행동 예고':'이동·대기',
      reason:definition?`${definition.targeting} · ${definition.trajectory}${definition.penetrates?' · 관통':''}`:(slot.plan.path.length>1?'이동 후 대기':'행동 없음'),
    }
    return[threat]
  })
}

export const previewUnitAt=(units:Unit[],point:Point)=>units.find(unit=>unit.hp>0&&unit.position.x===point.x&&unit.position.y===point.y)
