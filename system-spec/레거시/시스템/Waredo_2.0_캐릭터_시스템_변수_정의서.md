# Waredo 2.0 캐릭터 시스템 변수 정의서

> 목적: 프로그래밍·시스템 기획 공유용 변수와 의존 관계 정의
>
> 기준 문서: `Waredo_2.0_캐릭터_시스템_기획서.md`

## 1. 변수 설계 원칙

| 구분 | 저장 여부 | 정의 | 예시 |
|---|---|---|---|
| 독립 원본 | 저장 | 다른 값만으로 복원할 수 없으며 콘텐츠 제작자나 전투 진행이 직접 변경하는 값 | `maxHp`, `currentHp`, `skillCooldownRemaining` |
| 파생 프로퍼티 | 저장하지 않음 | 원본과 현재 판정 문맥으로 항상 다시 계산할 수 있는 읽기 전용 값 | `effectiveMaxHp`, `isIncapacitated`, `canExecuteMainAction` |
| 실행 임시값 | 지속 저장하지 않음 | 한 번의 행동이나 효과 처리 안에서만 생성하고 소비하는 값 | `movementResult`, 실제 피격 대상 목록 |
| 외부 참조 | 캐릭터에 저장하지 않음 | 전투판·이동·FSM 등 다른 시스템이 단일 원본으로 소유하는 값 | `cellOccupants`, 효과 대기 목록 |

적용 규칙:

1. 같은 사실을 나타내는 저장 변수는 하나만 둔다.
2. 다른 원본으로 완전히 결정되는 bool·enum·수치는 저장하지 않고 조회 규칙으로 정의한다.
3. 서로 배타적인 입력은 nullable 필드 여러 개가 아니라 구분 가능한 묶음 타입으로 작성한다.
4. 효과 종류에 따라 쓰이지 않는 필드는 공통 구조에 두지 않고 효과별 하위 데이터에 둔다.
5. 파생 프로퍼티는 외부에서 값을 설정할 수 없으며, UI·FSM·전투 로직은 같은 조회 규칙을 사용한다.
6. 콘텐츠 원본·필수 참조 ID는 `int`, 값이 없을 수 있는 참조 ID만 `int?`를 사용한다.

## 2. 검수 결과 요약

| 기존 구조 | 수정 구조 | 이유 |
|---|---|---|
| `cancelMainAction: bool` 저장 | `canExecuteMainAction` 파생 조회 | 체력·상태이상·이동 결과·유물 조건으로 항상 결정 가능 |
| `characterBattleState` 저장 | `isIncapacitated = currentHp <= 0` | 현재 체력과 같은 사실을 이중 저장하지 않음 |
| 캐릭터의 `occupiedCell` 저장 | `cellOccupants`에서 `occupiedCell` 조회 | 위치 원본을 전투판 하나로 통일 |
| `targetCharacterId?`, `targetCell?`, `actionDirection?` 동시 보유 | `ActionTarget` 구분 타입 | 타겟팅 유형에 맞지 않는 nullable 조합 방지 |
| 공통 효과의 `damageValue?`, `forceMoveDistance?`, `statusEffectId?` | 효과별 하위 데이터 | 효과 종류에 필요한 값만 보유 |
| `stackCount = 1` | 제거 | 현재 규칙에서 값이 변하지 않음 |
| `isActive: bool` | 활성 목록 포함 여부로 판정 | 목록에 있으면서 비활성인 모순 상태 방지 |
| 현재 미사용 `remainingCount` | 제거 | 확정되지 않은 미래 기능을 런타임에 선반영하지 않음 |
| `durationType`과 `expireEvents` 동시 저장 | `durationRule` 하나로 통합 | 종료 조건의 이중 정의 방지 |
| `sourcePosition`, `targetPosition`, 요청의 `direction` | 전투판 현재 위치 조회와 `DirectionTarget` 사용 | 이미 존재하는 위치·행동 방향을 중복 복사하지 않음 |
| `processingPriority`, `effectQueue`를 캐릭터 변수로 관리 | 전역 큐는 전투 시스템 내부 FSM 책임, 스킬 내부 순서는 `effectSequence` 파생 조회 | 스킬 내부 순서와 서로 다른 출처의 전역 우선순위 소유권 분리 |
| `*Id: string` | `*Id: int` 또는 `int?` | 프로젝트 콘텐츠 ID가 정수 키 |

## 3. 콘텐츠 독립 원본

### 3.1 `CharacterDefinition`

| 변수 이름 | 타입 | 정의 | 용도 | 기본값·제약 |
|---|---|---|---|---|
| `characterId` | `int` | 캐릭터 고유 ID | 데이터 참조, 전투 객체 생성, UI·유물 연결 | 유효한 정수, 중복 불가 |
| `characterName` | `string` | 캐릭터 표시명 | UI·대화·전투 표시 | 빈 값 불가 |
| `characterType` | `CharacterType` | 캐릭터 타입 | 상성 및 시간대 시스템의 타입 구분 | `Pioneer`, `Successor`, `Technician`, `Awakener` |
| `maxHp` | `int` | 최대 체력 원본값 | 유효 최대 체력 계산 | 1 이상 |
| `attackPower` | `int` | 일반 공격력 원본값 | 유효 공격력 계산 | 0 이상 |
| `moveRange` | `int` | 이동 가능 셀 수 원본값 | 유효 이동력 계산 | 0 이상, 대각선 미포함 |
| `criticalDamageRatePercent` | `int` | 치명타 피해율 원본값 | 유효 치명타 피해율 계산 | 공통 초기값 140, 0 이상 |
| `normalAttack` | `NormalAttackDefinition` | 캐릭터가 소유한 일반 공격 | 일반 공격 계획·실행 | 객체 1개 필수 |
| `skillId` | `int` | 캐릭터가 소유한 스킬 ID | 스킬 정의 조회 | 유효 ID 1개 필수 |
| `statusImmunityTags` | `List<StatusTag>` | 적용을 거부할 상태 태그 | 상태 적용 전 면역 판정 | 중복 불가, 빈 목록 허용 |

### 3.2 `NormalAttackDefinition`

| 변수 이름 | 타입 | 정의 | 용도 | 기본값·제약 |
|---|---|---|---|---|
| `normalAttackId` | `int` | 일반 공격 고유 ID | 로그·연출·데이터 식별 | 유효한 정수, 중복 불가 |
| `normalAttackName` | `string` | 일반 공격 표시명 | UI·전투 로그 | 빈 값 불가 |
| `normalAttackType` | `NormalAttackType` | 입력·판정 형태 | 필요한 `ActionTarget` 종류 결정 | `Target`, `TileSelect`, `Directional` |
| `normalAttackRangeId` | `int` | 통합 범위 데이터 ID | 선택 가능 셀·영향 셀 조회 | 유효 ID 필수 |
| `normalAttackTargetTeam` | `ValidTargetTeam` | 공격 가능한 진영 | 선택·피격 대상 필터 | `Enemy`, `Ally`, `All` |

### 3.3 `SkillDefinition`

| 변수 이름 | 타입 | 정의 | 용도 | 기본값·제약 |
|---|---|---|---|---|
| `skillId` | `int` | 스킬 고유 ID | 캐릭터 참조·로그·연출 | 유효한 정수, 중복 불가 |
| `skillName` | `string` | 스킬 표시명 | UI·전투 로그 | 빈 값 불가 |
| `skillDescription` | `string` | 스킬 설명 | UI 툴팁 | 빈 값 불가 |
| `skillTargetingType` | `SkillTargetingType` | 스킬 입력 형태 | 필요한 `ActionTarget` 종류 결정 | `InRangeTarget`, `CellSelect`, `Directional` |
| `skillRangePatternId` | `int` | 스킬 사용 가능 범위 ID | 계획·실행 범위 판정 | 유효 ID 필수 |
| `skillAffectedCellPatternId` | `int?` | 실제 효과 셀 범위 ID | 다수 셀 효과 판정 | 단일 대상·단일 셀이면 `null` |
| `skillEffects` | `List<SkillEffectData>` | 순서가 보장되는 실행 효과 목록 | 목록 인덱스 `+1`을 `effectSequence`로 사용하여 오름차순 효과 요청 생성 | 1개 이상, 문법 순번은 1부터 연속·중복 불가 |
| `cooldownMax` | `int` | 최대 쿨타임 원본값 | 유효 최대 쿨타임 계산 | 1 이상 |
| `canCritical` | `bool` | 띄워짐 대상 치명타 허용 여부 | 스킬 치명타 판정 | `true` 또는 `false` |
| `resolveTiming` | `SkillResolveTiming` | 효과 해결 시작 시점 | 전투 FSM의 `WaitForImpact` 통과 방식 결정 | `ImpactMarker`, `Immediate` |

### 3.4 `SkillEffectData` 구분 타입

모든 효과는 다음 공통값을 가진다.

| 변수 이름 | 타입 | 정의 | 용도 |
|---|---|---|---|
| `effectType` | `SkillEffectType` | 효과 종류 | 하위 데이터와 처리기 선택 |
| `targetScope` | `SkillEffectTargetScope` | 효과 대상 범위 | 선택 대상·선택 셀·영향 셀·자신 구분 |
| `effectTargetTeam` | `ValidTargetTeam` | 적용 가능한 진영 | 효과 대상 필터 |

효과별 추가값은 해당 하위 데이터에만 저장한다.

| 하위 데이터 | `effectType` | 추가 변수 | 타입 | 제약 |
|---|---|---|---|---|
| `DamageEffectData` | `Damage` | `damageValue` | `int` | 0 이상 |
| `ForceMoveEffectData` | `Push`, `Pull` | `forceMoveDistance` | `int` | 0 이상 |
| `PersistentStatusEffectData` | `Airborne`, `Stun` | `statusEffectId` | `int` | 해당 상태 정의의 유효 ID |

이 구조에서는 `Damage` 효과가 이동 거리나 상태 ID를 갖지 않으며, 사용하지 않는 값에 `null`을 넣는 방식도 사용하지 않는다.

`effectSequence`는 `SkillEffectData`의 독립 저장 필드가 아니다. 스킬 문법의 `EFFECT <효과순번>`을 파싱할 때 1부터 시작하는 연속 순번인지 검증하고, 등록 후에는 `skillEffects` 목록 인덱스 `+1`로 항상 다시 계산한다.

### 3.5 `StatusEffectDefinition`

띄워짐과 기절만 지속 인스턴스를 생성한다. 밀치기와 당기기는 `ForceMoveEffectData`를 즉시 처리하므로 이 정의를 참조하지 않는다.

| 변수 이름 | 타입 | 정의 | 용도 | 기본값·제약 |
|---|---|---|---|---|
| `statusEffectId` | `int` | 지속 상태이상 고유 ID | 적용 요청·인스턴스 참조 | 유효한 정수, 중복 불가 |
| `statusEffectName` | `string` | 상태이상 표시명 | UI·로그 | 빈 값 불가 |
| `statusTag` | `StatusTag` | 면역·상태 조회용 태그 | 면역 및 `hasStatus` 판정 | `Airborne`, `Stun` |
| `durationRule` | `StatusDurationRule` | 종료 시점 규칙 | FSM 이벤트에서 제거 여부 판정 | 상태 종류에 맞는 값 |

`durationRule` 값은 다음과 같다.

| 값 | 종료 규칙 |
|---|---|
| `UntilNextActionOrTurnCleanup` | 대상의 다음 `ActionBegin` 또는 적용 턴 `TurnCleanup` 중 먼저 발생한 시점에 종료 |
| `UntilAppliedTurnCleanup` | 적용된 턴의 `TurnCleanup`에서 종료 |

## 4. 캐릭터 전투 상태 런타임

### 4.1 `CharacterBattleRuntime`

| 변수 이름 | 타입 | 정의 | 용도 | 초기값·제약 |
|---|---|---|---|---|
| `currentHp` | `int` | 전투와 전투 사이에 유지되는 현재 체력 | 피해·회복·전투 불능 판정 | 전투 진입 시 아웃게임 저장값 유지, 범위 0~현재 상한. 최초 생성값은 아웃게임 문서 확인 필요 |
| `skillCooldownRemaining` | `int` | 소유 스킬의 남은 쿨타임 | 스킬 사용 가능 여부 | 0, 범위 0~`effectiveCooldownMax` |
| `activeStatusEffects` | `List<StatusEffectInstance>` | 유지 중인 지속 상태 목록 | 띄워짐·기절 판정과 UI 표시 | 빈 목록, 동일 상태 ID 1개 이하 |

`effective*`, `characterBattleState`, `occupiedCell`은 이 구조에 저장하지 않는다.

`currentHp`는 전투 종료 시 아웃게임·세이브 상태에 반영하고 다음 전투의 `CharacterBattleRuntime` 생성값으로 다시 전달한다. `skillCooldownRemaining`과 `activeStatusEffects`는 현재 규칙대로 새 전투에서 초기화한다.

### 4.2 `StatusEffectInstance`

| 변수 이름 | 타입 | 정의 | 용도 | 초기값·제약 |
|---|---|---|---|---|
| `statusEffectId` | `int` | 적용된 지속 상태 ID | 정의 데이터 참조 | 유효 ID |
| `sourceCharacterId` | `int` | 적용 주체 캐릭터 ID | 로그·효과 출처 | 전투 참여 캐릭터 |
| `appliedAt` | `BattleTimingStamp` | 가장 최근 적용 시점 | `durationRule` 종료 시점 계산 | FSM이 제공한 턴·행동 시점 |

대상 ID는 인스턴스를 보유한 `CharacterBattleRuntime`으로 알 수 있으므로 저장하지 않는다. 인스턴스가 `activeStatusEffects`에 존재하면 활성 상태이며, 제거되면 비활성이다. 재적용 시 새 인스턴스나 중첩 수를 만들지 않고 `appliedAt`만 갱신한다.

## 5. 행동 계획 구조

### 5.1 `ActionPlan`

| 변수 이름 | 타입 | 정의 | 용도 | 초기값·제약 |
|---|---|---|---|---|
| `movePath` | `List<Vector2Int>` | 계획한 이동 셀 순서 | 미리보기·이동 실행 | 빈 목록, 직교 인접 셀, 길이≤`effectiveMoveRange` |
| `mainAction` | `MainActionPlan?` | 이동 후 실행할 본 행동 | 일반 공격·스킬 실행 | 이동만 하면 `null` |

### 5.2 `MainActionPlan`과 `ActionTarget`

| 구조 | 변수 | 타입 | 규칙 |
|---|---|---|---|
| `MainActionPlan` | `actionType` | `MainActionType` | `NormalAttack`, `Skill` 중 하나 |
| `MainActionPlan` | `target` | `ActionTarget` | 정의 데이터의 타겟팅 유형과 같은 하위 타입 1개 |
| `CharacterTarget` | `characterId` | `int` | `Target`, `InRangeTarget`에서 사용 |
| `CellTarget` | `cell` | `Vector2Int` | `TileSelect`, `CellSelect`에서 사용, 방향 없음 |
| `DirectionTarget` | `direction` | `Direction` | `Directional`에서 사용, 상·하·좌·우 |

세 가지 타겟 필드를 nullable로 동시에 보유하지 않으므로 잘못된 복수 입력이나 입력 누락을 구조 단계에서 차단한다.

## 6. 요청과 실행 임시 데이터

### 6.1 `StatusEffectApplyRequest`

띄워짐·기절 적용 시 한 번 생성하여 상태이상 처리기에 전달한 뒤 폐기한다.

| 변수 이름 | 타입 | 정의 | 제약 |
|---|---|---|---|
| `statusEffectId` | `int` | 적용할 지속 상태 ID | 유효 ID |
| `sourceCharacterId` | `int` | 적용 주체 | 전투 참여 캐릭터 |
| `targetCharacterId` | `int` | 적용 대상 | 전투 참여 캐릭터 |
| `sourceSkillId` | `int?` | 발생 스킬 | 스킬 외 출처면 `null` |

### 6.2 `ForceMoveRequest`

밀치기·당기기 처리 시 한 번 생성하여 이동 처리기에 전달한 뒤 폐기한다.

| 변수 이름 | 타입 | 정의 | 제약 |
|---|---|---|---|
| `effectType` | `SkillEffectType` | 강제 이동 종류 | `Push`, `Pull` |
| `sourceCharacterId` | `int` | 효과 적용 주체 | 전투 참여 캐릭터 |
| `targetCharacterId` | `int` | 강제 이동 대상 | 전투 참여 캐릭터 |
| `sourceSkillId` | `int` | 발생 스킬 | 유효 스킬 ID |
| `forceMoveDistance` | `int` | 이동할 최대 셀 수 | 0 이상 |
| `actionDirection` | `Direction` | 플레이어가 스킬에 지정한 방향 | 상·하·좌·우 |

`sourcePosition`과 `targetPosition`은 저장하지 않고 처리 시 `cellOccupants`에서 조회한다. 실제 이동 방향은 `Push`이면 `actionDirection`, `Pull`이면 반대 방향으로 파생한다.

### 6.3 기타 실행 임시값

| 임시값 | 생성 주체 | 소비 시점 |
|---|---|---|
| `movementResult: MovementResult` | 이동 시스템 | `canExecuteMainAction` 조회 후 행동 종료 시 폐기 |
| 실제 피격 대상 목록 | 공격·스킬 실행기 | 범위·진영·생존 재검증 후 효과 요청 생성 시 폐기 |
| `sourceSkillId`, `sourceEffectSequence` | 스킬 실행기 | 효과 요청의 발생 스킬과 스킬 내부 순서를 식별하고 해당 효과 처리 후 폐기 |
| 강제 이동 경로·최종 셀 | 이동 시스템 | 셀별 진입 처리 후 폐기 |

## 7. 파생 프로퍼티

| 조회명 | 반환형 | 의존 원본·문맥 | 계산 규칙 | 용도 |
|---|---|---|---|---|
| `effectiveMaxHp` | `int` | `maxHp`, 현재 파라미터 보정 | 공통 보정 후 1 이상 제한 | 체력 상한·회복 |
| `effectiveAttackPower` | `int` | `attackPower`, 현재 파라미터 보정 | 공통 보정 후 0 이상 제한 | 일반 공격 피해 |
| `effectiveMoveRange` | `int` | `moveRange`, 현재 파라미터 보정 | 공통 보정 후 0 이상 제한 | 이동 경로 검증 |
| `effectiveCriticalDamageRatePercent` | `int` | `criticalDamageRatePercent`, 현재 파라미터 보정 | 공통 보정 후 0 이상 제한 | 치명타 피해 |
| `effectiveCooldownMax` | `int` | `cooldownMax`, 현재 파라미터 보정 | 공통 보정 후 1 이상 제한 | 쿨타임 상한 |
| `isIncapacitated` | `bool` | `currentHp` | `currentHp <= 0` | 전투 불능 조건 조회. 유물 반응 후에도 `true`일 때 전투 불능 처리 확정 |
| `occupiedCell` | `Vector2Int?` | `cellOccupants`, `characterId` | 캐릭터 ID가 점유한 셀, 없으면 `null` | 범위 원점·이동·UI |
| `hasStatus(tag)` | `bool` | `activeStatusEffects`, 상태 정의 | 같은 태그의 인스턴스 존재 여부 | 띄워짐·기절 판정 |
| `hitTargetRule` | `NormalAttackHitTargetRule` | `normalAttackType` | `Target`은 `SelectedTarget`, 나머지는 `CharactersInAffectedCells` | 일반 공격 대상 확정 |
| `forceMoveDirection` | `Direction` | `effectType`, `actionDirection` | `Push`는 동일 방향, `Pull`은 반대 방향 | 강제 이동 경로 생성 |
| `effectSequence` | `int` | `skillEffects` 목록 위치 | 목록 인덱스 `+1`, 결과는 1부터 연속 | 같은 스킬의 효과 등록·처리 순서 |
| `canExecuteMainAction` | `bool` | `ActionExecutionContext` | 차단 사유가 0개이면 `true` | 일반 공격·스킬 실행 여부 |
| `canUseSkill` | `bool` | `skillCooldownRemaining`, `canExecuteMainAction` | 쿨타임 0이고 본 행동 실행 가능 | 스킬 선택·실행 |

### 7.1 `canExecuteMainAction` 계산 규칙

`cancelMainAction`은 저장하지 않는다. 다음 조회 결과로 본 행동 실행 여부를 결정한다.

```text
GetActionBlockReasons(context)
├─ currentHp <= 0                         → Incapacitated
├─ hasStatus(Stun)                        → Stunned
├─ movementResult == Incapacitated        → IncapacitatedDuringMove
└─ 유물·전투 효과가 제공한 차단 조건 충족    → ExternalEffectBlocked

canExecuteMainAction = GetActionBlockReasons(context).Count == 0
```

`movementResult == Collision`은 행동 차단 사유가 아니다. 충돌 피해 처리 후 `currentHp > 0`이면 직전 유효 셀에서 예정된 일반 공격 또는 스킬을 실행한다.

| 입력 | 소유자 | 비고 |
|---|---|---|
| `currentHp` | 캐릭터 런타임 | 전투 불능 여부 계산 |
| `activeStatusEffects` | 캐릭터 런타임 | 기절 여부 계산 |
| `movementResult` | 이동 시스템 반환값 | 이번 행동 안에서만 사용 |
| 행동 차단 조건 목록 | 유물·전투 효과 시스템 | 조건 제공자 방식으로 조회, 캐릭터에 bool 추가 금지 |

UI와 전투 로그는 `GetActionBlockReasons`를 사용하여 실행 불가 원인을 표시한다. 여러 차단 조건이 동시에 성립하면 모두 반환하되 FSM은 본 행동을 한 번만 취소한다.

## 8. 외부 참조

| 항목 | 타입 | 단일 소유자 | 캐릭터 시스템 사용 방식 |
|---|---|---|---|
| `cellOccupants` | `Dictionary<Vector2Int, int>` | 전투판 시스템 | 위치 조회, 이동·사망 시 점유 변경 요청 |
| 효과 대기 목록 | FSM 전용 타입 | 전투 FSM | 같은 스킬의 요청을 `sourceEffectSequence` 오름차순으로 등록하고 처리 결과를 수신. 서로 다른 출처의 전역 정렬·삽입은 FSM 규칙 사용 |
| 전투 불능 전 반응 처리 | 전투 이벤트 전용 타입 | 전투 시스템·전투 FSM | `currentHp <= 0` 조건 발생 시 피해 적용 후·전투 불능 전 유물 결과를 반영하고 최종 전투 불능 처리 여부를 수신 |
| 현재 턴·행동 시점 | `BattleTimingStamp` | 전투 FSM | 지속 상태 생성·갱신 시 `appliedAt`으로 복사 |
| 파라미터 보정 목록 | 보정 시스템 전용 타입 | 유물·전투 효과 시스템 | `effective*` 조회 시 읽기 |

캐릭터 시스템은 외부 참조의 복사본을 자체 상태로 유지하지 않는다.

`isIncapacitated`는 `currentHp`로 즉시 계산되는 조건 조회지만, 점유 해제·행동 무효화는 전투 불능 전 반응 창이 끝난 뒤에도 조회 결과가 `true`일 때만 확정한다. 반응 효과로 `currentHp > 0`이 되면 전투 불능 처리를 하지 않는다.

## 9. 데이터 및 의존 관계 검증

| 검증 대상 | 실패 조건 | 처리 |
|---|---|---|
| 캐릭터 ID | 유효하지 않은 정수 또는 중복 | 캐릭터 데이터 등록 거부 |
| 일반 공격 정의 | 객체 누락, 유효하지 않은 범위 ID, 허용하지 않는 공격 형태 | 캐릭터 데이터 등록 거부 |
| 스킬 ID | 존재하지 않는 스킬 참조 | 캐릭터 데이터 등록 거부 |
| 상태 면역 목록 | 중복 또는 허용하지 않는 태그 | 캐릭터 데이터 등록 거부 |
| 최대 체력 | 1 미만 | 캐릭터 데이터 등록 거부 |
| 공격력·이동력·치명타 피해율 | 0 미만 | 캐릭터 데이터 등록 거부 |
| 효과 하위 데이터 | `effectType`과 하위 타입 불일치 | 스킬 데이터 등록 거부 |
| 스킬 효과 순번 | 1부터 시작하지 않음, 중복·누락 또는 문서 배치 순서와 불일치 | 스킬 데이터 등록 거부 |
| 스킬 해결 시점 | `ImpactMarker`, `Immediate` 이외 값 또는 값 누락 | 스킬 데이터 등록 거부 |
| 행동 타겟 | 타겟팅 유형과 `ActionTarget` 하위 타입 불일치 | 행동 계획 확정 거부 |
| 현재 체력 | 0~`effectiveMaxHp` 범위 밖 | 유효 범위로 제한 |
| 현재 쿨타임 | 0~`effectiveCooldownMax` 범위 밖 | 유효 범위로 제한 |
| 지속 상태 목록 | 같은 `statusEffectId`가 둘 이상 존재 | 기존 인스턴스의 `appliedAt` 갱신 |
| 위치 | 동일 캐릭터 ID가 여러 셀을 점유 | 전투판 갱신 거부 및 오류 기록 |

## 10. 남은 확정 사항

1. 통합 범위 데이터의 실제 자료형과 좌표·회전 규칙
2. 서로 다른 스킬·유물·환경·연쇄 효과 요청 사이의 전역 우선순위와 큐 삽입 위치
3. `BattleTimingStamp`의 실제 필드 구성
4. 유물·전투 효과의 파라미터 보정 및 행동 차단 조건 제공 인터페이스
