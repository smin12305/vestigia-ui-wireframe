import type { SavedContent, CharacterDefinition, SkillDefinition } from './types'

export const FINAL_STAGE=4
export function healStageReward(units:{id:string;hp:number;maxHp:number;team:string}[]){
  return units.filter(unit=>unit.team==='아군'&&unit.hp>0).map(unit=>{
    const amount=Math.max(0,Math.min(unit.maxHp-unit.hp,Math.ceil(unit.maxHp*.2)))
    unit.hp+=amount
    return{unitId:unit.id,amount,hp:unit.hp,maxHp:unit.maxHp}
  })
}
export function stageContent(source:SavedContent,stage:number,hp:Record<string,number>={}):SavedContent{
  const allies=source.characters.filter(c=>c.team==='아군'&&(hp[c.id]??1)>0)
  const increase=stage-1
  let enemies=source.characters.filter(c=>c.team==='적군').map(c=>({...c,maxHp:c.maxHp+increase*5}))
  const skills=[...source.skills]
  if(stage===FINAL_STAGE){
    const skill:SkillDefinition={id:'fallen_cross',name:'타락의 심판',description:'자기 중심 폭 3칸, 사거리 3칸 십자 범위에 피해 10과 기절. 쿨타임 2턴.',targeting:'자기 기준형',trajectory:'없음',penetrates:true,range:3,rangePatternId:'십자폭3_3',affectedCellPatternId:'십자폭3_3',cooldown:2,canCritical:false,effects:[{type:'피해',scope:'영향셀',targetTeam:'적군',value:10},{type:'기절',scope:'영향셀',targetTeam:'적군',value:1}],source:''}
    const boss:CharacterDefinition={id:'fallen_paladin',name:'타락한 성기사',team:'적군',aiBehavior:'돌격형',maxHp:100,attackPower:10,moveRange:5,criticalRate:150,normalAttack:{name:'타락의 검격',targeting:'방향 선택형',trajectory:'직사',penetrates:true,range:3,rangePatternId:'직선_3'},skillId:skill.id,color:'#a376e4',immunities:[],source:''}
    const lancer=source.characters.find(c=>c.id==='holy_lancer')??enemies[0]
    enemies=[boss,...(lancer?[1,2].map(n=>({...lancer,id:`boss_lancer_${n}`,name:`신성 창병 ${n}`,maxHp:lancer.maxHp+15,attackPower:lancer.attackPower+6})):[])]
    skills.push(skill)
  }
  return{...source,characters:[...allies,...enemies],skills}
}

export function rewardChoices(source:SavedContent,owned:Set<string>){
  const pool=source.relics.filter(r=>!owned.has(r.id))
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  return pool.slice(0,3).map(r=>r.id)
}
