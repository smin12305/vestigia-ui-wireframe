export type Team = '아군' | '적군'
export type CharacterType = '계승자' | '각성자' | '기술자'
export type TimePeriod = '과거' | '현재' | '미래'
export type Direction = '상' | '하' | '좌' | '우'
export type TargetingType = '대상' | '셀' | '설치' | '방향'
export type EffectType = '피해' | '밀치기' | '당기기' | '띄우기' | '기절' | '설치'
export type TargetTeam = '적군' | '아군' | '모두'
export type EffectScope = '선택대상' | '선택셀' | '영향셀' | '자신'
export type Phase = '배치' | '계획' | '실행' | '승리' | '패배'
export interface Point { x:number; y:number }
export interface AttackDefinition { name:string; targeting:TargetingType; range:number; rangePatternId:string }
export interface SkillEffect { type:EffectType; scope:EffectScope; targetTeam:TargetTeam; value:number; environmentId?:string }
export interface SkillDefinition { id:string; name:string; description:string; targeting:TargetingType; range:number; rangePatternId:string; affectedCellPatternId?:string; cooldown:number; canCritical:boolean; effects:SkillEffect[]; source:string }
export interface CharacterDefinition { id:string; name:string; team:Team; type:CharacterType; maxHp:number; attackPower:number; moveRange:number; criticalRate:number; normalAttack:AttackDefinition; skillId:string; color:string; immunities:EffectType[]; source:string }
export interface StatusInstance { type:'띄워짐'|'기절'; appliedRound:number }
export interface Unit extends CharacterDefinition { hp:number; position:Point; statuses:StatusInstance[]; cooldownRemaining:number }
export interface PlannedAction { kind:'없음'|'일반공격'|'스킬'; targetUnitId?:string; targetCell?:Point; direction?:Direction }
export interface ActionPlan { path:Point[]; action:PlannedAction }
export interface ActionSlot { number:number; team:Team; unitId:string; plan:ActionPlan; result?:'대기'|'완료'|'충돌'|'취소'|'기절' }
export interface BattleState { phase:Phase; units:Unit[]; round:number; firstTeam:Team; slots:ActionSlot[]; selectedSlot:number; selectedDeployUnitId:string; currentTime:TimePeriod; selectedTime:TimePeriod; shards:number; maxShards:number; executingSlot:number; log:string[] }
export interface CombatTextEvent { unitId:string; position:Point; text:string; kind:'피해'|'치명타'|'상태'|'면역' }
export interface ShardGainEvent { amount:number; source?:Point; reason:'공격'|'콤보'|'턴' }
export interface ForcedMovePreview { targetId:string; type:'밀치기'|'당기기'; direction:Direction; from:Point; to:Point; requested:number; moved:number; blocked:boolean; immune:boolean }
export interface PredictedTargetOutcome { unitId:string; unitName:string; damage:number; critical:boolean; statuses:string[]; forceMoves:{type:'밀치기'|'당기기';from:Point;to:Point;moved:number;requested:number;blocked:boolean}[]; ko:boolean }
export interface EnemyThreatPrediction { slotIndex:number; slotNumber:number; actorId:string; actorName:string; actionName:string; direction?:Direction; intendedTargetName?:string; origin:Point; outcomes:PredictedTargetOutcome[]; state:'적중 예상'|'취소 예상'|'대상 없음'|'이동·대기'; reason:string }
export interface SavedContent { characters:CharacterDefinition[]; skills:SkillDefinition[] }
