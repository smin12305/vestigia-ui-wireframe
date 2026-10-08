export type Team = '아군' | '적군'
export type AiBehavior = '공통형' | '돌격형' | '방벽형' | '저격형'
export type TimePeriod = '과거' | '현재' | '미래'
export type TimeTag = '과거' | '미래'
export type TimeManipulation = TimeTag
export type Direction = '상' | '하' | '좌' | '우'
export type TargetingType = '방향 선택형' | '자기 기준형' | '자가 버프형'
export type TrajectoryType = '없음' | '직사' | '곡사'
export type EffectType = '피해' | '밀치기' | '당기기' | '띄우기' | '기절' | '반격'
export type TargetTeam = '적군' | '아군' | '모두'
export type EffectScope = '선택대상' | '선택셀' | '영향셀' | '자신'
export type RelicRarity = '일반' | '희귀' | '전설'
export type RelicStat = '최대체력' | '공격력' | '이동력' | '치명타피해율'
export type RelicEffectKind = RelicStat | '체력회복' | '추가피해' | '쿨타임감소' | '시간포인트' | '최종피해' | '받는피해' | '일반공격피해' | '스킬피해' | '첫이동력'
export type RelicTrigger = '항상' | '시간대상시' | '시간대진입' | '턴시작' | '유효공격'
export type Phase = '배치' | '계획' | '실행' | '승리' | '패배'
export type BoardSize = 6
export interface Point { x:number; y:number }
export interface AttackDefinition { name:string; targeting:TargetingType; trajectory:TrajectoryType; penetrates:boolean; range:number; rangePatternId:string; affectedCellPatternId?:string }
export interface SkillEffect { type:EffectType; scope:EffectScope; targetTeam:TargetTeam; value:number; environmentId?:string }
export interface SkillDefinition { id:string; name:string; description:string; targeting:TargetingType; trajectory:TrajectoryType; penetrates:boolean; range:number; rangePatternId:string; affectedCellPatternId?:string; cooldown:number; canCritical:boolean; effects:SkillEffect[]; source:string }
export interface CharacterDefinition { id:string; name:string; team:Team; timeTag?:TimeTag; aiBehavior:AiBehavior; maxHp:number; attackPower:number; moveRange:number; criticalRate:number; normalAttack:AttackDefinition; skillId:string; ultimateSkillId?:string; color:string; immunities:EffectType[]; source:string }
export interface RelicEffect { kind:RelicEffectKind; trigger:RelicTrigger; timePeriods:TimePeriod[]; value:number; hpThreshold?:number }
export interface RelicDefinition { id:string; name:string; rarity:RelicRarity; description:string; effects:RelicEffect[]; source:string }
export type RelicLoadouts = Partial<Record<TimePeriod,string[]>>
export interface StatusInstance { type:'띄워짐'|'기절'|'반격'; appliedRound:number; triggeredTargetIds?:string[]; enhanced?:boolean }
export interface Unit extends CharacterDefinition { hp:number; position:Point; statuses:StatusInstance[]; cooldownRemaining:number }
export interface PlannedAction { kind:'없음'|'일반공격'|'스킬'; direction?:Direction; relativeTarget?:Point; selfConfirmed?:boolean; selfTargetCell?:Point }
export interface ActionPlan { path:Point[]; action:PlannedAction }
export interface ActionSlot { number:number; team:Team; unitId:string; plan:ActionPlan; result?:'대기'|'완료'|'충돌'|'취소'|'기절' }
export interface BattleState { boardSize:BoardSize; phase:Phase; units:Unit[]; round:number; firstTeam:Team; slots:ActionSlot[]; selectedSlot:number; selectedDeployUnitId:string; deployedAllyIds:string[]; currentTime:TimePeriod; selectedTime:TimePeriod; timeStreak:number; timeCycleProgress:number; timeDialIndex:number; timeManipulationUsed:boolean; timeStoppedThisTurn:boolean; timeManipulationCost:number; shards:number; maxShards:number; executingSlot:number; relicLoadouts:RelicLoadouts; log:string[] }
export interface CombatTextEvent { unitId:string; position:Point; text:string; kind:'피해'|'치명타'|'상태'|'면역'|'버프' }
export interface AttackPresentationEvent { actorId:string; actorPosition:Point; team:Team; actionKind:'일반공격'|'스킬'; actionName:string; targeting:TargetingType; trajectory:TrajectoryType; affectedCellPatternId?:string; range:number; rangePatternId:string; direction?:Direction; targetPoint?:Point; durationMs:number; ultimate?:boolean }
export interface CounterPresentationEvent { counterId:string; targetId:string; counterPosition:Point; targetPosition:Point; durationMs:number }
export interface ImpactPresentationEvent { actorId:string; targetId:string; actorPosition:Point; targetPosition:Point; actionKind:'일반공격'|'스킬'|'반격'; damage:number; critical:boolean; defeated:boolean }
export interface ShardGainEvent { amount:number; source?:Point; reason:'공격'|'콤보'|'턴'|'유물'; reachedMax?:boolean }
export interface TimeAdvanceEvent { from:TimePeriod; to:TimePeriod; suppressed:boolean; streak:number; cycleProgress:number; dialIndex:number; manipulation?:TimeManipulation }
export interface ForcedMovePreview { targetId:string; type:'밀치기'|'당기기'; direction:Direction; from:Point; to:Point; requested:number; moved:number; blocked:boolean; immune:boolean }
export interface PredictedTargetOutcome { unitId:string; unitName:string; damage:number; critical:boolean; statuses:string[]; forceMoves:{type:'밀치기'|'당기기';from:Point;to:Point;moved:number;requested:number;blocked:boolean}[]; ko:boolean }
export interface EnemyThreatPrediction { slotIndex:number; slotNumber:number; actorId:string; actorName:string; actionName:string; direction?:Direction; intendedTargetName?:string; origin:Point; outcomes:PredictedTargetOutcome[]; state:'행동 예고'|'이동·대기'; reason:string }
export interface SavedContent { characters:CharacterDefinition[]; skills:SkillDefinition[]; relics:RelicDefinition[] }
