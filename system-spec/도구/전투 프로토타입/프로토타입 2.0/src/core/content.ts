import type{CharacterDefinition,SkillDefinition}from'./types'

export const skills:SkillDefinition[]=[
  {id:'earthquake',name:'지진',description:'자신 중심 3×3 범위의 적을 띄웁니다.',targeting:'자기 기준형',range:1,pattern:'사각형_1',cooldown:2,canCritical:false,effects:[{type:'피해',value:5},{type:'띄우기',value:1}]},
  {id:'snipe',name:'저격',description:'선택한 방향으로 총알을 발사합니다.',targeting:'방향 선택형',range:4,pattern:'직선_4',cooldown:2,canCritical:true,effects:[{type:'피해',value:5}]},
  {id:'revenge',name:'복수',description:'주변에서 행동하는 적에게 반격합니다.',targeting:'자가 버프형',range:1,pattern:'사각형_1',cooldown:2,canCritical:false,effects:[{type:'반격',value:1}]},
  {id:'holy_pierce',name:'성광 관통',description:'전방 3칸을 관통합니다.',targeting:'방향 선택형',range:3,pattern:'직선_3',cooldown:2,canCritical:false,effects:[{type:'피해',value:8}]},
  {id:'holy_wall_crash',name:'성벽 충격',description:'전방을 타격하고 2칸 밀어냅니다.',targeting:'방향 선택형',range:2,pattern:'직선_2',cooldown:2,canCritical:false,effects:[{type:'피해',value:3},{type:'밀치기',value:2}]},
  {id:'tower_barrage',name:'철탑 집중포화',description:'착탄점 주변을 공격합니다.',targeting:'방향 선택형',range:4,pattern:'마름모_4',cooldown:2,canCritical:false,effects:[{type:'피해',value:8}]}
]

export const characters:CharacterDefinition[]=[
  {id:'isaac',name:'아이작',team:'아군',type:'각성자',maxHp:60,attackPower:5,moveRange:3,criticalDamage:150,normalAttack:{name:'기본 공격',targeting:'방향 선택형',range:1,pattern:'직선_1',penetrates:false},skillId:'earthquake',asset:'isaac'},
  {id:'angelica',name:'안젤리카',team:'아군',type:'계승자',maxHp:30,attackPower:10,moveRange:3,criticalDamage:150,normalAttack:{name:'기본 공격',targeting:'방향 선택형',range:3,pattern:'직선_3',penetrates:false},skillId:'snipe',asset:'angelica'},
  {id:'mercan',name:'메르칸',team:'아군',type:'기술자',maxHp:50,attackPower:8,moveRange:3,criticalDamage:150,normalAttack:{name:'기본 공격',targeting:'자기 기준형',range:1,pattern:'사각형_1',penetrates:false},skillId:'revenge',asset:'mercan'},
  {id:'holy_lancer',name:'신성 창병',team:'적군',type:'각성자',maxHp:50,attackPower:8,moveRange:3,criticalDamage:150,normalAttack:{name:'창 찌르기',targeting:'방향 선택형',range:2,pattern:'직선_2',penetrates:true},skillId:'holy_pierce',asset:'holy_lancer'},
  {id:'holy_shield',name:'신성 방패병',team:'적군',type:'계승자',maxHp:60,attackPower:5,moveRange:3,criticalDamage:150,normalAttack:{name:'방패 타격',targeting:'방향 선택형',range:1,pattern:'직선_1',penetrates:false},skillId:'holy_wall_crash',asset:'holy_shield'},
  {id:'tower_guard',name:'철탑 방위병',team:'적군',type:'기술자',maxHp:30,attackPower:10,moveRange:3,criticalDamage:150,normalAttack:{name:'철탑 사격',targeting:'방향 선택형',range:4,pattern:'직선_4',penetrates:false},skillId:'tower_barrage',asset:'tower_guard'}
]

export const skillById=(id:string)=>skills.find(skill=>skill.id===id)
