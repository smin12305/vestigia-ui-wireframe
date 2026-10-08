export const BOARD_SIZE=6 as const
export type Team='아군'|'적군'
export type Phase='배치'|'계획'|'실행'|'승리'|'패배'
export type TimePeriod='과거'|'현재'|'미래'
export type TimeManipulation='가속'|'정지'|'역행'
export type CharacterType='계승자'|'각성자'|'기술자'
export type Direction='상'|'하'|'좌'|'우'
export type Targeting='방향 선택형'|'자기 기준형'|'자가 버프형'
export type Pattern='직선_1'|'직선_2'|'직선_3'|'직선_4'|'사각형_1'|'마름모_3'|'마름모_4'
export type StatusType='띄워짐'|'기절'|'반격'
export interface Cell{x:number;y:number}
export interface AttackDefinition{name:string;targeting:Targeting;range:number;pattern:Pattern;penetrates:boolean}
export interface SkillEffect{type:'피해'|'밀치기'|'당기기'|'띄우기'|'기절'|'반격';value:number}
export interface SkillDefinition{id:string;name:string;description:string;targeting:Targeting;range:number;pattern:Pattern;cooldown:number;canCritical:boolean;effects:SkillEffect[]}
export interface CharacterDefinition{id:string;name:string;team:Team;type:CharacterType;maxHp:number;attackPower:number;moveRange:number;criticalDamage:number;normalAttack:AttackDefinition;skillId:string;asset:string}
export interface Status{type:StatusType;appliedRound:number;triggeredTargetIds?:string[]}
export interface Unit extends CharacterDefinition{hp:number;position:Cell;statuses:Status[];cooldownRemaining:number}
export interface PlannedAction{kind:'없음'|'일반공격'|'스킬';target?:Cell;direction?:Direction}
export interface Plan{path:Cell[];action:PlannedAction;moveConfirmed:boolean;actionConfirmed:boolean}
export interface ActionSlot{number:number;unitId:string;team:Team;plan:Plan;result:'대기'|'완료'|'충돌'|'취소'|'기절'}
export interface BattleState{phase:Phase;round:number;firstTeam:Team;units:Unit[];deployedAllyIds:string[];selectedDeployUnitId:string;selectedUnitId?:string;slots:ActionSlot[];currentTime:TimePeriod;timeStreak:number;timeCycleProgress:number;timeDialIndex:number;timeManipulationUsed:boolean;timeStoppedThisTurn:boolean;timeManipulationCost:number;shards:number;maxShards:number;executingSlot:number}
export type BattleEvent=
  |{type:'move';unitId:string;from:Cell;to:Cell}
  |{type:'attack';actorId:string;name:string;kind:'일반공격'|'스킬'|'반격';origin:Cell;target:Cell;cells:Cell[]}
  |{type:'damage';actorId:string;targetId:string;amount:number;critical:boolean;timeBonus:boolean;defeated:boolean}
  |{type:'status';unitId:string;status:StatusType}
  |{type:'force';unitId:string;from:Cell;to:Cell;direction:Direction;distance:number}
  |{type:'shards';amount:number;source?:Cell;reason:'공격'|'콤보'|'턴'}
  |{type:'time';from:TimePeriod;to:TimePeriod;streak:number;dialIndex:number;manipulation?:TimeManipulation}
  |{type:'turn-end'}
export type Present=(event:BattleEvent)=>Promise<void>
