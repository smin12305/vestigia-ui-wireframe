# Waredo 2.0 전투 FSM 기획서

> 상태: 보류  
> 문서 범위: 전투 수명 주기 FSM, 턴 FSM, 행동 FSM, 효과 해결·반응 큐, 쿨타임 연결  
> 연계 문서: [전투 시스템 기획서](../../확정/시스템/Waredo_2.0_전투_시스템_기획서.md), [전투판 시스템 기획서](../../확정/시스템/Waredo_2.0_전투판_시스템_기획서.md), [상태이상 시스템 기획서](../../확정/시스템/Waredo_2.0_상태이상_시스템_기획서.md)

## 시스템 브리핑

이 문서는 확정된 전투 규칙을 실제 실행 상태와 전이로 연결하기 위해 작성한 전투 FSM 설계안이다. 전투 진입부터 종료까지의 수명 주기, 턴의 설계와 실행, 행동 슬롯별 이동·주 행동, 효과 해결과 연출 대기 순서를 다룬다.

전투 수명 주기 FSM 아래에 턴 FSM과 행동 FSM을 계층적으로 배치한다. 여러 프레임 동안 유지되거나 외부 완료 이벤트를 기다리는 단계만 상태로 두며, 대상 검증·피해 계산·상태이상 적용 같은 즉시 처리는 각 상태 내부의 해결 파이프라인으로 구성한다.

스킬과 유물의 조건부 효과는 이벤트 구독과 반응 큐를 통해 연결하는 안을 포함한다. 동일한 효과 연쇄가 무한히 반복되지 않도록 구독 범위, 우선순위와 연쇄 식별값을 사용하며, 스킬 사용 성공 시점과 쿨타임 반영 시점도 FSM 흐름에 맞춰 정의한다.

현재 이 문서는 `[보류]` 상태이며 전투 시스템의 확정 구현 기준으로 사용하지 않는다. 전투 규칙·행동·전투판·상태이상 문서는 계속 확정 기준으로 사용하고, FSM 구조를 다시 검토해 승인한 뒤에만 이 문서를 갱신하여 적용한다.

# 1. 기획 의도

복잡한 전투 실행을 계층별 상태와 명확한 완료 신호로 나눠, 행동 연출과 효과 반응이 추가되더라도 전체 순서가 무너지지 않게 하는 것이 목적이다. 동시에 단순 판정을 과도하게 상태로 만들지 않아 흐름을 읽고 수정하기 쉬운 실행 구조를 지향한다.

# 2. 보류 범위

- 이 문서의 상태명, 전이 순서와 효과 해결 큐는 현재 구현 기준이 아니다.
- 확정 전투 규칙과 충돌하는 내용이 있으면 확정 시스템 문서를 우선한다.
- 보류 해제 시 전투·전투판·상태이상 시스템의 최신 규칙을 기준으로 전체 전이를 다시 검수한다.

# 3. 구조 개요

```text
전투 FSM 실행 설계 [보류]
├─ 전투 수명 주기 FSM
├─ 턴 FSM
├─ 행동 FSM
├─ 효과 해결·반응 큐
└─ 쿨타임 연결
```

# 4. FSM 상세 구조

전투 FSM은 [전투 FSM·구독형 스킬·유물 설계 예시](../../제안/시스템/전투_FSM_구독형_스킬_유물_설계_예시_비적용.md)의 구조를 기준으로 전투 수명 주기, 턴, 행동의 상태와 전이를 관리한다. 대상·면역 검증, 피해 계산, 체력 반영과 같은 개별 효과 처리는 `Resolve` 내부 파이프라인으로 둔다.

## 4-1. FSM 계층과 연결

```text
전투 수명 주기 FSM
│
├─ BattleEntry
├─ Deployment
├─ BattleStart
│
├─ TurnLoop
│  │
│  └─ 턴 FSM
│     ├─ TurnSetup
│     ├─ Planning
│     ├─ PlanLock
│     ├─ TimeShiftResolution
│     ├─ TurnExecution
│     │  │
│     │  └─ 행동 FSM [actionSlot마다 호출]
│     │     ├─ SlotSelect
│     │     ├─ Precheck 또는 Pass
│     │     ├─ ActionBegin
│     │     ├─ Movement
│     │     ├─ MainActionPrecheck
│     │     ├─ ActionStart
│     │     ├─ WaitForImpact
│     │     ├─ Resolve
│     │     │  └─ 효과 해결 파이프라인·반응 큐
│     │     ├─ WaitForPresentation
│     │     └─ ActionEnd
│     │        └─ Complete
│     │
│     └─ TurnCleanup
│        └─ TurnResult
│
└─ BattleEnd
```

```text
BattleEntry
→ Deployment
→ BattleStart
→ TurnLoop
  → TurnSetup
  → Planning
  → PlanLock
  → TimeShiftResolution
  → TurnExecution
  → TurnCleanup
  → TurnResult
     ├─ InProgress → TurnSetup
     ├─ Victory → BattleEnd
     └─ Defeat → BattleEnd
```

```text
SlotSelect
→ Precheck
   ├─ 행동 불가 → Pass → Complete
   └─ 행동 가능 → ActionBegin
                  → Movement
                  → MainActionPrecheck
                     ├─ 주 행동 없음·실패 → ActionEnd
                     └─ 검증 성공 → ActionStart
                                      → WaitForImpact
                                      → Resolve
                                      → WaitForPresentation
                                      → ActionEnd
                                      → Complete
```

- 행동 FSM의 `Complete` 결과가 반환되면 `TurnExecution`이 다음 `actionSlot`을 호출한다.
- 모든 슬롯이 끝나면 `TurnCleanup`으로 전환한다.
- 모든 피해 해결 지점의 승패 판정은 `TurnResult`까지 미루지 않고 즉시 `BattleEnd`로 전환할 수 있는 공통 인터럽트다.

## 4-2. 전투 수명 주기 상태

### 4-2-1. BattleEntry

| 구분 | 내용 |
|---|---|
| 진입 | 전투 진입 요청 |
| 기능 | 전투 데이터 생성, `turnIndex`·`currentActionNumber`·행동 슬롯·효과 큐 초기화, 참가 요소 로드 |
| 다음 상태 | `Deployment` |
| 실패·예외 | 전투 생성 실패 시 진입 취소 |

### 4-2-2. Deployment

| 구분 | 내용 |
|---|---|
| 진입 | `BattleEntry` 완료 |
| 기능 | 캐릭터·환경 요소 초기 배치와 `cellOccupants` 반영 |
| 다음 상태 | `BattleStart` |
| 세부 규칙 | 전투 진입·초기 배치 `[기존 유지]` |

### 4-2-3. BattleStart

| 구분 | 내용 |
|---|---|
| 진입 | `Deployment` 완료 |
| 기능 | 전투용 트리거 구독, 최초 선공 결정, `BattleStarted` 이벤트 해결 |
| 다음 상태 | `TurnLoop` |
| 인터럽트 | 시작 효과로 승패 확정 시 `BattleEnd` |

- 유물, 패시브·조건부 스킬과 전투 환경 트리거를 구독한다.
- 최초 선공은 전투당 한 번만 동전 던지기로 결정한다.
- 구독 완료 후 `BattleStarted` 이벤트와 그 반응 효과를 해결한다.

### 4-2-4. TurnLoop

| 구분 | 내용 |
|---|---|
| 진입 | `BattleStart` 완료 |
| 기능 | 턴 FSM 호출과 `TurnResult` 수신 |
| 반복 | `InProgress`이면 다음 턴 FSM 호출 |
| 종료 | `Victory` 또는 `Defeat`이면 `BattleEnd` |

- 피해 해결 도중 승패가 확정되는 공통 인터럽트는 현재 턴 FSM을 중단하고 `BattleEnd`로 직접 전환한다.

### 4-2-5. BattleEnd

| 구분 | 내용 |
|---|---|
| 진입 | 피해 해결 후 승리·패배 확정 |
| 기능 | 현재 이동·행동, 남은 효과·반응 큐, 남은 행동 슬롯, 다음 턴 전환 중단 |
| 종료 처리 | `BattleEnded` 이벤트, 전투용 구독 해제, 결과 전달 |
| 연결 | 전투 종료·정산 `[기존 유지]` |

- 아군 전원 전투불능은 패배, 적 전원 전투불능은 승리로 연결한다.
- 하나의 효과로 양 진영이 동시에 전멸하면 패배를 우선하여 `Defeat`로 연결한다.

## 4-3. 턴 FSM 상태

### 4-3-1. TurnSetup

| 구분 | 내용 |
|---|---|
| 진입 | `TurnLoop`의 첫 호출 또는 이전 `TurnResult`의 `InProgress` 반환 |
| 기능 | 턴 카운트 증가, 선공 확인, 행동 가능 캐릭터 판정, `actionSlots` 구성, 턴 시작 반응 해결 |
| 다음 상태 | `Planning` |
| 인터럽트 | 턴 시작 효과로 승패 확정 시 `BattleEnd` |

- `currentHp <= 0`이거나 턴 시작부터 `Stun`인 캐릭터는 슬롯에서 제외한다.
- 적은 `enemyActionOrder`에 따라 배정한다. 아군은 첫 턴에만 무작위로 배정하고 이후 턴에는 직전 턴의 아군 상대 순서를 유지한다.
- 선공 진영부터 양 진영을 교차 배치하며, 한 진영이 먼저 소진되면 남은 진영의 캐릭터를 뒤에 연속 배치한다.
- `TurnStarted` 이벤트의 반응은 공통 해결 파이프라인으로 처리한다.

### 4-3-2. Planning

| 구분 | 내용 |
|---|---|
| 진입 | `TurnSetup` 완료 |
| 기능 | 시간대, 아군 슬롯 배정, 캐릭터 이동·주 행동·대상 데이터 편집과 적 행동 계획 전체 공개 |
| 유지 | 플레이어가 설계 중인 동안 |
| 다음 상태 | 플레이어가 `턴 실행` 버튼을 누르는 순간 `PlanLock` |

- 쿨타임이 남은 스킬은 선택할 수 없다.
- 적 캐릭터의 이동 경로, 일반 공격·스킬·주 행동 없음 여부와 대상 캐릭터·선택 타일·방향을 모두 표시한다.

### 4-3-3. PlanLock

| 구분 | 내용 |
|---|---|
| 진입 | 플레이어의 `턴 실행` 버튼 입력 |
| 기능 | 현재 `actionSlots`와 `characterActionPlans`의 편집 차단 |
| 다음 상태 | 현재 데이터를 그대로 잠그고 `TimeShiftResolution` |

- 별도의 `confirmedTurnPlan`이나 실행용 계획 사본은 생성하지 않는다.
- 잠금 이후에는 현재 턴의 `actionSlots`와 `characterActionPlans`를 읽기 전용으로 취급한다.
- `PlanLock`은 별도의 계획 유효성 검증 단계가 아니며 `턴 실행` 입력을 실행 데이터의 편집 차단으로 연결하는 즉시 처리 상태다.
- 이동이나 주 행동을 입력하지 않은 캐릭터는 입력되지 않은 부분을 `None`으로 실행한다. 저장된 대상·타일·방향이 실행 시점에 유효하지 않으면 해당 주 행동만 취소하며 설계 단계로 돌아가지 않는다.

### 4-3-4. TimeShiftResolution

| 구분 | 내용 |
|---|---|
| 진입 | `PlanLock` 성공 |
| 기능 | 선택한 시간대의 비용·효과·환경·유물 반응 해결과 필요한 연출 대기 |
| 다음 상태 | 시간대 관련 해결·연출 완료 시 `TurnExecution` |
| 인터럽트 | 시간대 효과로 승패 확정 시 `BattleEnd` |

### 4-3-5. TurnExecution

| 구분 | 내용 |
|---|---|
| 진입 | `TimeShiftResolution` 완료 |
| 기능 | `currentActionNumber` 순서로 행동 FSM 반복 호출 |
| 다음 상태 | 남은 슬롯이 없으면 `TurnCleanup` |
| 인터럽트 | 행동 해결 중 승패 확정 시 `BattleEnd` |

```text
현재 actionSlot로 행동 FSM 호출
→ 행동 FSM 완료
   ├─ 남은 슬롯 있음 → currentActionNumber 증가·행동 FSM 재호출
   └─ 남은 슬롯 없음 → TurnCleanup
```

### 4-3-6. TurnCleanup

| 구분 | 내용 |
|---|---|
| 진입 | 현재 턴의 모든 행동 슬롯 완료 |
| 기능 | 턴 종료 반응 해결, 상태이상 종료, 쿨타임 갱신, 선공 교대 |
| 다음 상태 | 정산 완료 후 `TurnResult` |
| 인터럽트 | 턴 종료 효과로 승패 확정 시 `BattleEnd` |

```text
TurnEnding 이벤트
→ 턴 종료 효과·반응 해결
→ 승패 확인
→ 남은 Airborne·Stun 제거
→ 쿨타임 갱신
→ TurnEnded 이벤트
→ 선공 진영 교대
→ TurnResult
```

- 쿨타임은 사용한 턴과 같은 `turnIndex`에서는 감소시키지 않는다.
- 다음 턴 종료에 감소시키므로 쿨타임 1 스킬은 사용 다음 턴을 쉬고 그다음 턴부터 사용할 수 있다.

### 4-3-7. TurnResult

| 구분 | 내용 |
|---|---|
| 진입 | `TurnCleanup` 완료 |
| 기능 | 현재 턴 결과를 부모 `TurnLoop`에 반환 |
| 반환 | 전투 계속 시 `InProgress`, 아군 전원 전투불능 시 `Defeat`, 적 전원 전투불능 시 `Victory` |
| 다음 상태 | `InProgress`이면 `TurnSetup`, 그 외 `BattleEnd` |

- 피해가 발생한 시점에 이미 승패가 확정되면 `TurnResult`까지 진행하지 않고 즉시 `BattleEnd`로 전환한다.
- 양 진영이 동시에 전멸한 경우에는 `Defeat`를 우선 반환한다.
- `TurnResult`의 승패 검사는 피해 이외의 상태 변경이 누락되는 것을 막기 위한 최종 안전 판정이다.

## 4-4. 행동 FSM

### 4-4-1. SlotSelect

| 구분 | 내용 |
|---|---|
| 진입 | `TurnExecution`이 현재 행동 슬롯 호출 |
| 기능 | 현재 `actionSlot`과 슬롯의 `characterId`를 실행 문맥으로 가져오고 해당 `characterActionPlans` 조회 |
| 다음 상태 | `Precheck` |

### 4-4-2. Precheck

| 구분 | 내용 |
|---|---|
| 진입 | `SlotSelect` 완료 |
| 기능 | 행동 시작 시점의 `currentHp`와 `activeStatusEffects` 직접 확인 |
| 다음 상태 | 행동 가능 시 `ActionBegin`, 행동 불가 시 `Pass` |


```text
currentHp <= 0 → Pass
Airborne 있음 → Airborne 제거·현재 행동 취소 → Pass
Stun 있음 → 현재 행동 스킵 → Pass
그 외 → ActionBegin
```

### 4-4-3. Pass

| 구분 | 내용 |
|---|---|
| 진입 | `Precheck`에서 행동 불가 판정 |
| 기능 | 슬롯을 삭제하거나 뒤 순서를 바꾸지 않고 행동 취소·스킵 결과 기록 |
| 다음 상태 | `Complete` |

### 4-4-4. ActionBegin

| 구분 | 내용 |
|---|---|
| 진입 | `Precheck` 통과 |
| 기능 | `ActionBegin` 이벤트 발행과 상태·유물·환경 반응 요청 해결 |
| 다음 상태 | `Movement` |
| 인터럽트 | 행동 시작 반응으로 행동자 전투불능 또는 승패 확정 시 `BattleEnd` 또는 `ActionEnd` |

### 4-4-5. Movement

| 구분 | 내용 |
|---|---|
| 진입 | `ActionBegin` 완료 |
| 기능 | 저장된 직교 이동 경로의 셀 진입, 점유·충돌, 환경 효과와 반응 해결 |
| 다음 상태 | 이동 계획 없음·이동 완료 시 `MainActionPrecheck` |
| 중단 | 행동 캐릭터 전투불능 또는 기절 시 `ActionEnd`, 승패 확정 시 `BattleEnd` |

- 셀 진입 효과와 충돌 피해는 공통 해결 파이프라인으로 처리한다.
- 충돌로 이동이 조기 종료되어도 캐릭터가 전투불능·기절 상태가 아니면 멈춘 위치에서 `MainActionPrecheck`로 진행한다. 계획한 일반 공격 또는 스킬은 해당 위치를 기준으로 범위와 대상을 다시 검증한 뒤 실행한다.

### 4-4-6. MainActionPrecheck

| 구분 | 내용 |
|---|---|
| 진입 | `Movement` 완료 또는 이동 계획 없음 |
| 기능 | 행동자 생존·기절, 주 행동 종류, 쿨타임, 저장 대상·타일·방향과 실제 범위 재검증 |
| 다음 상태 | 검증 성공 시 `ActionStart`, 주 행동 없음·검증 실패 시 `ActionEnd` |

- 범위·대상 검증 실패는 자동 재타겟팅 없이 취소한다.
- 스킬 검증 실패는 사용으로 처리하지 않으며 쿨타임을 변경하지 않는다.

### 4-4-7. ActionStart

| 구분 | 내용 |
|---|---|
| 진입 | `MainActionPrecheck` 성공 |
| 기능 | 일반 공격·스킬 시작 연출과 `SkillCast` 이벤트 처리, 스킬 사용·쿨타임 확정 |
| 다음 상태 | `WaitForImpact` |
| 취소 | 사용 전 반응으로 취소되면 쿨타임을 확정하지 않고 `ActionEnd` |

- 스킬은 사용 전 반응을 통과한 `SkillCommit` 시점에 사용과 쿨타임을 확정한다.

### 4-4-8. WaitForImpact

| 구분 | 내용 |
|---|---|
| 진입 | 일반 공격·스킬 실행 확정 |
| 기능 | 공격·스킬의 효과 적용 시점까지 시전·투사체 연출 대기 |
| 다음 상태 | Impact 이벤트 수신 시 `Resolve` |
| 즉시 효과 | 대기 없이 `Resolve` |

### 4-4-9. Resolve

| 구분 | 내용 |
|---|---|
| 진입 | Impact 이벤트 또는 이동·턴·전투 이벤트의 효과 해결 요청 |
| 기능 | 원본 효과 큐와 반응 큐를 결정된 순서로 해결 |
| 다음 상태 | 행동 효과 해결이면 `WaitForPresentation`, 호출 상태에 따라 원래 FSM으로 복귀 |
| 인터럽트 | 승패 확정 시 `BattleEnd` |

`EffectSelect`, `BeforeReaction`, `EffectApply`, `DeathResolution`, `BattleResultCheck`, `AfterReaction`, `ReactionQueue`는 별도 FSM 상태가 아니라 `Resolve` 내부 파이프라인 단계다.

### 4-4-10. WaitForPresentation

| 구분 | 내용 |
|---|---|
| 진입 | 행동 효과 해결 완료 |
| 기능 | 기록된 효과·피해·상태이상·전투불능 연출 완료 대기 |
| 다음 상태 | 연출 완료 이벤트 수신 시 `ActionEnd` |
| 즉시 처리 | 연출 요청이 없으면 바로 `ActionEnd` |

### 4-4-11. ActionEnd

| 구분 | 내용 |
|---|---|
| 진입 | 행동 스킵·취소 또는 행동·연출 완료 |
| 기능 | `ActionEnded` 이벤트와 행동 종료 반응 해결 |
| 다음 상태 | `Complete` |
| 인터럽트 | 행동 종료 효과로 승패 확정 시 `BattleEnd` |

### 4-4-12. Complete

| 구분 | 내용 |
|---|---|
| 진입 | `Pass` 또는 `ActionEnd` 완료 |
| 기능 | 현재 행동 슬롯 결과를 `ActionSlotResult`로 묶어 반환 |
| 다음 상태 | 부모 `TurnExecution`이 다음 슬롯 또는 `TurnCleanup` 결정 |

## 4-5. 스킬 효과·트리거 해결 순서

### 4-5-1. 스킬 사용 순서

```text
스킬 기본 검증
→ BeforeSkillUse
→ SkillCommit
→ SkillUsed 반응 큐
→ WaitForImpact
→ skillEffects 원본 순서 해결
→ AfterSkillResolved
→ WaitForPresentation
→ ActionEnd
```

- `BeforeSkillUse`에서 취소되면 사용과 쿨타임을 확정하지 않는다.
- `SkillCommit`에서 스킬 사용과 쿨타임을 확정한다.
- `SkillCommit` 뒤의 반응으로 행동 캐릭터가 Impact 전에 전투불능이 되면 원본 스킬 효과는 실행하지 않지만 확정된 쿨타임은 유지한다.
- 원본 효과는 캐릭터 시스템의 `skillEffects` 작성 순서대로 처리한다.
- 각 원본 효과의 반응 큐를 모두 해결한 후 다음 원본 효과로 진행한다. 앞 효과가 만든 상태·위치 변경은 뒤 효과에 반영한다.

### 4-5-2. 개별 효과 해결 파이프라인

```text
EffectBundleBegin
→ NextEffectSelect
→ EffectValidate
→ BeforeApply
→ DirectEffectApply
→ AfterApply
→ HitConfirmed
→ AfterDamage
→ IncapacitationCandidate
→ HpRecheck
→ IncapacitationConfirmed
→ BattleResultCheck
→ NextEffectCheck
→ EffectBundleComplete
```

- `HitConfirmed`는 같은 `hitInstanceId`의 같은 대상에게 첫 직접 효과가 성공했을 때 한 번 발생한다.
- `AfterDamage`는 대상의 `currentHp`가 실제로 1 이상 감소했을 때만 발생한다.
- 모든 피해는 `DirectEffectApply` 직전에 대상의 `activeStatusEffects`를 조회한다. 대상에게 `Airborne` 또는 `Stun`이 있으면 피해 종류와 관계없이 `isCritical = true`로 설정하고 캐릭터 시스템의 `effectiveCriticalDamageRatePercent`를 적용한다.
- `currentHp <= 0`이면 `IncapacitationCandidate` 반응을 해결한 뒤 체력을 다시 확인한다. 재확인 후에도 0 이하면 전투불능을 확정하고 캐릭터의 셀 점유와 전투판 표시를 즉시 제거한다.
- 피해가 발생하는 모든 `DirectEffectApply`와 반응 효과에서 전투불능·승패를 확인한다.
- 광역 효과는 같은 직접 효과의 전체 대상에게 적용을 마친 뒤 전투불능·승패를 한 번 판정한다.
- 반응 효과도 동일한 효과 해결 파이프라인을 사용한다.
- 승패가 확정되면 `TurnResult`까지 기다리지 않고 남은 원본 효과·반응 효과·행동 슬롯을 중단한 뒤 `BattleEnd`로 전환한다.
- 현재 효과가 실패해도 뒤의 `effectSequence`는 계속 처리한다. 대상의 전투불능 확정 시 해당 대상을 향한 남은 직접 효과를 중단한다.

### 4-5-3. 트리거 구독·정렬 규칙

- 액티브 스킬은 행동 계획에서 직접 실행한다. 실행 인스턴스가 연출의 `EffectResolveMarker`를 기다려야 할 때에만 현재 행동 범위로 해당 이벤트를 구독한다.
- 유물, 패시브·조건부 스킬과 전투 환경 효과는 필요한 공통 이벤트를 구독한다.
- 구독자는 전투 상태를 직접 변경하지 않고 보정값 또는 효과 명령을 반환한다. 효과 명령은 `reactionQueue`에서 해결한다.
- 이벤트 발생 시점에 발동 가능한 구독자 목록을 확정하며 처리 도중 추가·해제된 구독은 현재 이벤트 목록을 변경하지 않는다.
- 트리거는 `단계 → triggerPriority → 원본 행동 슬롯 순서 → sourceCharacterId → triggerId` 순서로 정렬한다.
- 구독 등록 순서는 로드 순서에 따라 달라질 수 있으므로 동률 기준으로 사용하지 않는다.

```text
1. 사용 금지·취소
2. 효과 대체
3. 대상 변경
4. 면역·방어
5. 수치 보정
6. 원본 효과 적용
7. 전투불능 처리·전투불능 반응
8. 적용 후 반응
9. 후속 효과
```

- 트리거의 발동 범위는 `PerSkill`, `PerEffect`, `PerTarget`, `PerDamage`, `PerAction`, `PerTurn`, `PerBattle` 중 효과 정의가 지정한다.
- 동일 연쇄는 하나의 `triggerChainId`를 공유한다.
- 자신의 효과에 대한 재발동은 명시적으로 허용된 경우만 가능하며, 행동·턴·전투당 횟수와 연쇄 최대 처리 수로 무한 반복을 막는다.
- 전투불능 캐릭터는 `CharacterIncapacitated` 전용 트리거 외에는 발동하지 않는다.

### 4-5-4. 구독 범위와 요청 종류

| 구독 범위 | 유효 기간 | 대표 사용 대상 |
|---|---|---|
| `CURRENT_ACTION` | 현재 `actionSlot`의 `ActionStart`부터 `ActionEnd`까지 | 능동 스킬 실행 인스턴스 |
| `CURRENT_TURN` | 등록된 `turnIndex`의 `TurnCleanup` 완료까지 | 턴 한정 상태·유물 효과 |
| `BATTLE` | 현재 전투의 `BattleEnd`까지 | 트리거 스킬·유물·환경 요소 |
| `STATUS_LIFETIME` | 상태 적용 성공부터 상태 제거까지 | 지속 상태이상 인스턴스 |

```text
이벤트 종류 일치
→ 구독 범위 유효
→ battleId·turnIndex·actionSlotId 문맥 일치
→ 이벤트 필터 통과
→ 발동 조건 통과
→ 횟수 제한 통과
→ 요청 생성
```

- `InlineEffectRequest`는 현재 `Resolve`의 직접 효과 묶음에 추가한다.
- `ReactionRequest`는 현재 반응 큐에서 처리한다.
- `ExtraActionRequest`는 현재 행동의 `Complete` 이후 부모 `TurnExecution`이 새로운 행동 실행 FSM 호출로 처리한다.
- `BattleEnd`에서는 현재 전투의 모든 구독을 해제한다.

## 4-6. 쿨타임 연결 규칙

- `Planning`에서 `cooldownRemaining > 0`인 스킬의 선택을 차단한다.
- `MainActionPrecheck`에서 실행 직전 쿨타임을 다시 확인한다.
- 대상·범위 또는 `BeforeSkillUse` 검증에 실패하면 쿨타임을 변경하지 않는다.
- `SkillCommit`에서 `cooldownRemaining=effectiveCooldownMax`로 설정하고 적용 턴을 기록한다.
- `TurnCleanup`에서는 현재 턴보다 이전 턴에 적용된 쿨타임만 1 감소시킨다. 현재 턴에 사용한 스킬의 쿨타임은 같은 턴에 감소시키지 않는다.

```text
1턴에 쿨타임 1인 스킬 사용
→ 1턴 TurnCleanup: 감소하지 않음
→ 2턴 Planning·MainActionPrecheck: 사용 불가
→ 2턴 TurnCleanup: 1에서 0으로 감소
→ 3턴부터 사용 가능
```

`CooldownCheck`와 `CooldownTick`은 별도 FSM 상태가 아니라 `Planning`, `MainActionPrecheck`, `TurnCleanup`의 내부 처리다.

## 4-7. FSM·효과 해결 변수

| 변수·용어 | 의미 | 값 형태 | 소유·성격 |
|---|---|---|---|
| `effectQueue` | 현재 해결할 원본 효과 목록 | 효과 명령 목록 | 전투 FSM > Resolve 소유·상태 |
| `reactionQueue` | 트리거로 생성된 후속 효과 목록 | 효과 명령 목록 | 전투 FSM > Resolve 소유·상태 |
| `triggerChainId` | 하나의 원본 효과와 연쇄 반응을 묶는 식별값 | ID | 전투 FSM > Resolve 소유·상태 |
| `triggerPriority` | 같은 트리거 단계 안의 처리 우선순위 | 정수 | 캐릭터 시스템 또는 가방·유물 시스템의 효과 정의 소유·참조 |
| `triggerScope` | 트리거의 발동 횟수 기준 | 열거값 | 캐릭터 시스템 또는 가방·유물 시스템의 효과 정의 소유·참조 |
| `subscriptionScope` | 구독의 유효 수명과 문맥 범위 | `CURRENT_ACTION`, `CURRENT_TURN`, `BATTLE`, `STATUS_LIFETIME` | 전투 FSM > 구독 관리 소유·상태 |
| `hitInstanceId` | 동일 타격의 중복 `HitConfirmed` 방지 식별값 | ID | 전투 FSM > Resolve 소유·상태 |
| `actionSlotResult` | 행동 슬롯의 패스·성공·실패·중단 결과 | 결과값 | 행동 FSM > Complete 소유·결과 |
| `cooldownAppliedTurnIndex` | 현재 쿨타임이 적용된 턴 | 턴 번호 | 전투 스킬 쿨타임 모듈 소유·상태 |

#### 외부 변수 참조 출처

| 외부 변수·데이터 | 가져오는 시스템 | 현재 FSM에서의 사용 | 원본 문서·번호 |
|---|---|---|---|
| `currentHp`, `characterId`, `skillEffects`, `effectiveCooldownMax` | 캐릭터 시스템 | 행동 판정, 스킬 효과 순서, 쿨타임 시작 | `확정/시스템/Waredo_2.0_캐릭터_시스템_기획서.md` 4-1-2·4-1-6 |
| `activeStatusEffects` | 상태이상 시스템 | `Airborne`·`Stun` 행동 취소와 턴 종료 해제 | 상태이상 시스템 기획서 4-1~3 |
| `actionSlots`, `currentActionNumber`, `turnIndex` | 전투 규칙 | 턴·행동 FSM 반복과 트리거 동률 정렬 | [전투 시스템 기획서](../../확정/시스템/Waredo_2.0_전투_시스템_기획서.md) 4-1-1·4-1-3 |
| `characterActionPlans` | 행동 | 현재 슬롯 캐릭터의 이동·주 행동 조회 | [전투 시스템 기획서](../../확정/시스템/Waredo_2.0_전투_시스템_기획서.md) 4-1-4 |
| `cellOccupants` | 전투판 시스템 | 이동·강제 이동 중 점유·충돌 판정 | 전투판 시스템 기획서 4-2~3 |
| `currentTimePeriod` | 시간대 전환 시스템 | 계획 단계 즉시 전환 후 현재 시간대 참조 | `확정/시스템/Waredo_2.0_시간대_전환_시스템_기획서.md` |
| 유물 트리거 정의 | 가방·유물 시스템 | 구독 이벤트, 우선순위, 범위, 반응 효과 조회 | 가방·유물 시스템 기획서 `[작성 전]` |
