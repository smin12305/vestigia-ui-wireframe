# 전투 FSM·구독형 스킬·유물 설계 예시

> 문서 상태: 프로젝트 비적용 설계 예시  
> 용도: FSM 구조와 이벤트 구독형 콘텐츠 제작 방식 검토  
> 주의: 본 문서의 명칭·문법·ID·수치·우선순위는 실제 게임 확정값이 아니다.

## 1. 문서 목적

이 문서는 다음 내용을 하나의 예시 구조로 정리한다.

1. 전투 한 판을 관리하는 전투 수명 주기 FSM
2. 한 턴의 계획·실행·정산을 관리하는 턴 FSM
3. 한 기물의 이동·본 행동·피격·연출을 묶는 행동 실행 FSM
4. 스킬 효과·피격·유물·전투 불능을 해결하는 `Resolve` 파이프라인
5. 스킬·유물·상태·환경 요소가 공통 이벤트를 구독하는 방식
6. 능동 스킬·트리거 스킬·유물의 가상 제작 문법과 실행 예시

## 2. 핵심 설계 원칙

### 2.1 FSM으로 관리할 대상

다음 조건 중 하나 이상을 만족하는 단계만 FSM 상태로 관리한다.

- 여러 프레임 동안 유지된다.
- 플레이어 입력을 기다린다.
- 애니메이션·AI·UI 등 외부 시스템의 응답을 기다린다.
- 취소·실패·재시도·중단 분기가 존재한다.
- 다른 시스템에서 현재 진행 상태를 조회할 필요가 있다.

### 2.2 파이프라인으로 관리할 대상

다음 처리는 별도 FSM 상태를 만들지 않고 한 상태 안의 순차 처리로 실행한다.

- 대상·진영·면역 검증
- 피해 계산과 체력 반영
- 효과 성공·실패 기록
- 유물 조건 검사
- 전투 불능 후보와 체력 재판정
- 다음 `effectSequence` 확인

### 2.3 한 기물 행동 세트

한 기물 행동 세트는 `ActionStart → ActionEnd`만 의미하지 않는다.

```text
SlotSelect
→ Precheck
→ ActionBegin
→ Movement
→ MainActionPrecheck
→ ActionStart
→ WaitForImpact
→ Resolve
→ WaitForPresentation
→ ActionEnd
→ Complete
```

위 전체 범위가 행동 슬롯 하나를 소비하는 한 기물 행동 세트다. 부모 `TurnExecution`은 현재 세트가 `Complete`되기 전에 다음 기물 세트를 시작하지 않는다.

## 3. 전체 FSM 구조

```text
전투 수명 주기 FSM
├─ BattleEntry
├─ Deployment
├─ BattleStart
├─ TurnLoop
│  └─ 턴 FSM
│     ├─ TurnSetup
│     ├─ Planning
│     ├─ PlanLock
│     ├─ TimeShiftResolution
│     ├─ TurnExecution
│     │  └─ 행동 실행 FSM [행동 슬롯마다 호출]
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
│     │     ├─ ActionEnd
│     │     └─ Complete
│     ├─ TurnCleanup
│     └─ TurnResult
└─ BattleEnd
```

## 4. 전투 수명 주기 FSM

### `BattleEntry`

전투에 필요한 데이터를 준비하고 전투 인스턴스를 생성한다.

```text
레벨 데이터 조회
→ 전투판 생성
→ 출전 캐릭터 연결
→ 유물·환경·시간대 데이터 연결
→ 전투 인스턴스 생성
```

### `Deployment`

플레이어의 초기 배치를 처리하고 배치 확정 입력을 기다린다.

### `BattleStart`

전투 최초 상태를 결정한다.

```text
캐릭터 런타임 연결
→ 아군 내부 행동 순서 결정
→ 적 내부 행동 순서 조회
→ 첫 선공 진영 결정
→ 전투 시작 이벤트 발생
```

### `TurnLoop`

턴 FSM을 반복 호출한다.

```text
턴 FSM 호출
→ TurnResult 수신
   ├─ InProgress: 다음 턴 FSM 호출
   ├─ Victory: BattleEnd
   └─ Defeat: BattleEnd
```

### `BattleEnd`

전투 종료 결과를 잠그고 외부 시스템에 전달한다.

```text
전투 입력 차단
→ 잔여 행동·효과·반응 요청 정리
→ 종료 연출 요청
→ 결과 저장
→ 아웃게임에 전달
→ 전투 범위 구독 일괄 해제
```

## 5. 턴 FSM

### `TurnSetup`

현재 턴의 행동 순서와 실행 준비 데이터를 구성한다.

```text
현재 턴 번호 확인
→ 선공 진영 계산
→ 아군·적 내부 순서 조회
→ 행동 슬롯 구성
→ 적 AI 행동 계획 요청
→ 턴 시작 카운터·쿨타임 처리
```

### `Planning`

플레이어의 행동 계획 입력을 기다린다.

```text
이동 경로
일반 공격·스킬
타겟·셀·방향
시간대 선택
턴 종료 입력
```

### `PlanLock`

현재 턴의 전체 계획을 검증하고 실행용 읽기 전용 데이터로 잠근다.

```text
검증 실패
→ 실패 사유 반환
→ Planning 복귀

검증 성공
→ 계획 잠금
→ TimeShiftResolution
```

### `TimeShiftResolution`

잠긴 시간대 선택에 따른 비용·효과·환경·유물 변화를 해결한다.

### `TurnExecution`

행동 슬롯 순서대로 행동 실행 FSM을 호출한다.

```text
현재 슬롯 조회
→ 행동 실행 FSM 호출
→ ActionSlotResult 수신
→ 승패 확인
   ├─ 승패 확정: 잔여 슬롯 중단
   └─ 전투 계속
      → 다음 슬롯 있음?
         ├─ 있음: 다음 행동 실행 FSM 호출
         └─ 없음: TurnCleanup
```

### `TurnCleanup`

현재 턴의 모든 행동이 끝난 뒤 턴 종료 처리를 실행한다.

```text
상태 효과 종료·갱신
→ 환경 턴 종료 처리
→ 유물 턴 종료 처리
→ 시간대 턴 종료 처리
→ 턴 범위 카운터 정리
```

### `TurnResult`

턴 종료 상태와 승패를 판정해 부모 `TurnLoop`에 반환한다.

```text
아군 생존 0명: Defeat
적 생존 0명: Victory
그 외: InProgress
```

## 6. 한 기물 행동 실행 FSM

### `SlotSelect`

부모 `TurnExecution`이 지정한 행동 슬롯과 행동자를 실행 문맥으로 가져온다.

### `Precheck`

현재 행동자의 실행 가능 여부를 확인한다.

```text
전투 불능
기절
외부 행동 차단
슬롯 무효화
```

### `Pass`

행동할 수 없는 슬롯을 삭제하지 않고 패스 결과와 UI 표시 이벤트를 생성한다.

### `ActionBegin`

한 기물 행동 세트의 시작을 알린다.

```text
ActionBegin 이벤트 발행
→ 상태·유물·환경 구독자 확인
→ ReactionRequest 처리
```

### `Movement`

잠긴 이동 경로와 이동 중 발생한 결과를 해결한다.

```text
경로 없음
정상 이동
셀 진입 환경 효과
충돌 정지
충돌 피해
이동 중 전투 불능
이동 연출 완료
```

### `MainActionPrecheck`

실제 이동 종료 위치에서 예정된 본 행동을 다시 검증한다.

```text
행동자 생존
기절 여부
스킬 쿨타임
타겟 생존
타겟 범위
셀 유효성
외부 행동 차단
```

### `ActionStart`

일반 공격·스킬의 시작 연출을 요청한다.

```text
행동자 애니메이션
선행 이펙트
카메라
시전 사운드
SkillCast 이벤트
```

### `WaitForImpact`

효과 해결 시작 타이밍을 기다린다.

이 문서에서는 의미를 명확히 하기 위해 `EffectResolveMarker`를 사용한다. 일반적으로 `Impact Marker`, `Hit Event`, `Animation Event` 등으로 부를 수 있다.

```text
EffectResolveMarker
= 연출 시스템이 전투 시스템에 보내는 효과 해결 시작 신호
```

마커는 피해량·타겟·명중·승패를 결정하지 않는다.

### `Resolve`

일반 공격·스킬의 직접 효과와 반응 요청을 논리적으로 해결한다.

### `WaitForPresentation`

확정 결과를 연출 시스템에 전달하고 필수 연출 완료를 기다린다.

```text
피해 수치
피격 애니메이션
강제 이동 표현
상태이상 이펙트
유물 발동 연출
전투 불능 연출
사운드·카메라
```

### `ActionEnd`

현재 행동의 종료 이벤트를 발행하고 해당 시점의 반응 요청을 처리한다.

### `Complete`

현재 행동 슬롯 결과를 `ActionSlotResult`로 묶어 부모 `TurnExecution`에 반환한다.

## 7. Resolve 효과 해결 파이프라인

`Resolve` 내부 처리는 별도 FSM이 아닌 순차 파이프라인이다.

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
→ NextEffectCheck
→ EffectBundleComplete
```

### `EffectBundleBegin`

현재 공격·스킬의 효과 목록과 실행 문맥을 준비한다.

### `NextEffectSelect`

아직 처리하지 않은 가장 앞의 `effectSequence`를 선택한다.

### `EffectValidate`

현재 대상·진영·면역·위치·효과 조건을 검사한다.

### `BeforeApply`

현재 직접 효과를 적용하기 전의 반응 요청을 처리한다.

### `DirectEffectApply`

피해·회복·강제 이동·상태 등 현재 직접 효과를 적용한다.

### `AfterApply`

현재 직접 효과가 정상 적용된 직후의 반응 요청을 처리한다.

### `HitConfirmed`

동일한 타격에서 대상에게 첫 번째 직접 효과가 성공하면 대상별 한 번 발생한다.

```text
공격자 관점: 적중 시
대상 관점: 피격 시
```

피해·밀치기·기절이 모두 성공해도 동일 `hitInstanceId`의 동일 대상에게는 한 번만 발생한다.

### `AfterDamage`

대상의 체력이 실제로 1 이상 감소했을 때 발생한다.

```text
피격됐지만 피해 없음: HitConfirmed만 발생
피격되고 피해 발생: HitConfirmed → AfterDamage
```

### `IncapacitationCandidate`

대상 체력이 0 이하일 때 생존·회복·전투 불능 방지 반응 기회를 제공한다.

### `HpRecheck`

생존 반응을 처리한 뒤 체력을 다시 확인한다.

### `IncapacitationConfirmed`

재판정 후에도 체력이 0 이하이면 전투 불능을 최종 확정한다.

```text
점유 해제
현재 행동 무효화
남은 행동 무효화
전투 불능 확정 후 반응
```

### `NextEffectCheck`

```text
현재 효과 실패: 다음 효과 계속
대상 생존: 다음 효과 계속
전투 불능 최종 확정: 남은 직접 효과 중단
```

### `EffectBundleComplete`

성공·실패·전투 불능·중단 결과를 행동 실행 FSM의 `Resolve`에 반환한다.

## 8. 공통 이벤트

| 이벤트 | 발생 시점 | 대표 구독 대상 |
|---|---|---|
| `BattleStart` | 전투 준비 완료 | 유물·환경·패시브 |
| `TurnSetup` | 새 턴 준비 | 유물·상태·환경 |
| `ActionBegin` | 행동 슬롯 실행 시작 | 유물·상태·환경 |
| `SkillCast` | 스킬 시작 성공 | 유물·트리거 스킬 |
| `EffectResolveMarker` | 연출상 효과 적용 시점 | 현재 능동 스킬 실행 인스턴스 |
| `BeforeApply` | 직접 효과 적용 직전 | 방어·감소·면역 유물 |
| `AfterApply` | 직접 효과 적용 직후 | 상태·환경·유물 |
| `HitConfirmed` | 첫 직접 효과 성공 | 적중·피격 반응 |
| `AfterDamage` | 체력 피해 1 이상 | 피해 후 반응 |
| `IncapacitationCandidate` | 체력 0 이하 후보 | 생존·방지 반응 |
| `IncapacitationConfirmed` | 전투 불능 최종 확정 | 사망 후 반응 |
| `ActionEnd` | 행동 세트 종료 | 유물·상태·환경 |
| `TurnCleanup` | 턴 종료 정산 | 유물·상태·환경 |
| `BattleEnd` | 최종 전투 종료 | 전투 범위 구독 해제 |

## 9. 이벤트 문맥 예시

```text
BattleEventContext
- eventId
- eventType
- battleId
- turnIndex
- actionSlotId
- impactIndex
- hitInstanceId
- sourceActorId
- targetActorId
- sourceActionType
- sourceSkillId
- sourceEffectSequence
- appliedValue
```

`hitInstanceId`는 동일 타격에서 `HitConfirmed`가 효과 개수만큼 중복 발생하는 것을 막는 식별값이다.

## 10. 구독 범위

구독 범위(`SUBSCRIPTION_SCOPE`)란 **콘텐츠가 특정 전투 이벤트를 수신할 수 있도록 등록되어 있는 수명과 격리 경계**를 의미한다.

구독 범위는 다음 두 질문에 답한다.

```text
이 구독은 언제 등록되고 언제 해제되는가?
이 구독은 어느 전투·턴·행동 문맥 안에서만 유효한가?
```

구독 범위는 발동 조건이나 효과 실행 순서를 의미하지 않는다.

```text
SUBSCRIBE
→ 어떤 종류의 이벤트를 듣는가?

SUBSCRIPTION_SCOPE
→ 어느 수명과 문맥 동안 이벤트를 들을 수 있는가?

EVENT_FILTER
→ 수신한 이벤트가 어느 행동자·대상·슬롯의 이벤트여야 하는가?

CONDITION
→ 현재 체력·상태·수치 등 실제 발동 조건을 만족하는가?
```

### 10.1 `CURRENT_ACTION`

현재 행동 세트에만 유효한 구독 범위다.

```text
등록: 현재 행동의 ActionStart
유효 문맥: 등록할 때 캡처한 battleId·turnIndex·actionSlotId
해제: 현재 행동의 ActionEnd 또는 행동 강제 중단
대표 사용 대상: 능동 스킬 실행 인스턴스
```

`CURRENT_ACTION` 구독자는 동일한 `actionSlotId`를 가진 이벤트만 받을 수 있다. 다른 기물이나 다른 행동 슬롯에서 같은 이벤트가 발생해도 수신 대상에서 제외한다.

```text
방패 돌진 실행 인스턴스
→ actionSlotId 3의 EffectResolveMarker 구독

actionSlotId 2의 EffectResolveMarker
→ 범위 불일치, 무시

actionSlotId 3의 EffectResolveMarker
→ 범위 일치, 이벤트 전달

actionSlotId 3의 ActionEnd
→ 구독 해제
```

### 10.2 `CURRENT_TURN`

현재 턴에만 유효한 구독 범위다.

```text
등록: TurnSetup 또는 현재 턴 중 효과 생성 시점
유효 문맥: 등록할 때 캡처한 battleId·turnIndex
해제: 해당 턴의 TurnCleanup 완료 또는 전투 종료
대표 사용 대상: 이번 턴 한정 버프·디버프·유물 효과
```

다음 턴에 같은 이벤트가 발생해도 이전 턴 구독자는 이벤트를 받지 않는다.

### 10.3 `BATTLE`

현재 전투 전체에서 유효한 구독 범위다.

```text
등록: BattleStart, 콘텐츠 장착 활성화 또는 전투 중 콘텐츠 생성 시점
유효 문맥: 현재 battleId
해제: 장착 해제·비활성화·전투 불능 정책 또는 BattleEnd
대표 사용 대상: 트리거 스킬·유물·환경 요소
```

`BATTLE`은 전투 내 모든 이벤트를 무조건 발동시킨다는 뜻이 아니다. 이벤트를 수신한 뒤 `EVENT_FILTER`와 `CONDITION`을 통과해야 실제 요청을 생성한다.

### 10.4 `STATUS_LIFETIME`

특정 상태 인스턴스가 유지되는 동안만 유효한 구독 범위다.

```text
등록: 상태 인스턴스 적용 성공
유효 문맥: battleId·상태 보유자 ID·상태 인스턴스 ID
해제: 상태 제거·대상 제거·BattleEnd
대표 사용 대상: 지속 상태 효과
```

상태를 갱신할 때 기존 인스턴스를 유지한다면 구독을 중복 등록하지 않고 기존 구독의 적용 시점만 갱신한다.

### 10.5 범위별 요약

| 구독 범위 | 등록 시점 | 해제 시점 | 자동 격리 키 | 대표 사용 대상 |
|---|---|---|---|---|
| `CURRENT_ACTION` | `ActionStart` | `ActionEnd`·행동 강제 중단 | `battleId`, `turnIndex`, `actionSlotId` | 능동 스킬 실행 인스턴스 |
| `CURRENT_TURN` | `TurnSetup`·턴 중 생성 | `TurnCleanup`·`BattleEnd` | `battleId`, `turnIndex` | 턴 한정 효과 |
| `BATTLE` | `BattleStart`·활성화 | 비활성화·`BattleEnd` | `battleId` | 트리거 스킬·유물·환경 |
| `STATUS_LIFETIME` | 상태 적용 성공 | 상태 제거·`BattleEnd` | `battleId`, 대상 ID, 상태 인스턴스 ID | 상태 효과 |

### 10.6 이벤트 필터

이벤트 필터는 구독 수명과 별개로, 수신한 이벤트가 어느 주체의 이벤트여야 하는지를 제한한다.

```text
EVENT_FILTER ACTION_SLOT_IS CURRENT_ACTION
EVENT_FILTER SOURCE_IS OWNER
EVENT_FILTER TARGET_IS OWNER
EVENT_FILTER SOURCE_TEAM IS ALLY
EVENT_FILTER ACTION_TYPE IS SKILL
```

예를 들어 전투 범위에서 `AfterDamage`를 구독하는 반사 유물은 다음처럼 해석한다.

```text
SUBSCRIBE AFTER_DAMAGE
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
CONDITION DAMAGE_GREATER_THAN 0
```

전투가 진행되는 동안 모든 `AfterDamage` 이벤트를 수신 후보로 삼지만, 장착자가 피해 대상인 이벤트만 통과시킨다.

### 10.7 구독 판정 순서

```text
이벤트 발생
→ eventType이 SUBSCRIBE와 일치하는가?
→ SUBSCRIPTION_SCOPE가 아직 유효한가?
→ 범위의 battleId·turnIndex·actionSlotId가 일치하는가?
→ EVENT_FILTER를 통과하는가?
→ CONDITION을 통과하는가?
→ 발동 횟수 제한을 통과하는가?
→ 요청 생성
```

### 10.8 구독 범위 종료 원칙

1. 범위가 종료된 구독은 이후 이벤트를 받을 수 없다.
2. `BattleEnd`에서는 범위 종류와 관계없이 해당 전투의 모든 구독을 해제한다.
3. 같은 콘텐츠 인스턴스가 같은 이벤트를 같은 범위에 중복 등록하지 못하게 한다.
4. 구독 해제 후 이미 큐에 등록된 요청을 실행할지는 요청 생성 시점과 소유자 생존 정책에 따라 별도 결정한다.
5. 이벤트 수신 대상 선정과 실제 효과 적용은 구분한다. 구독 조건을 통과해도 전투 시스템의 효과 검증에서 실패할 수 있다.

## 11. 요청 종류

구독자는 전투 상태를 직접 변경하지 않고 요청을 반환한다.

### `InlineEffectRequest`

현재 행동의 직접 효과 묶음으로 처리한다.

```text
용도: 능동 스킬, 일반 공격
실행 위치: 현재 Resolve
```

### `ReactionRequest`

현재 공통 반응 시점의 큐에서 처리한다.

```text
용도: 피해 감소, 회복, 반사 피해, 전투 불능 방지
실행 위치: 현재 Resolve 반응 큐
```

### `ExtraActionRequest`

현재 행동 세트가 끝난 뒤 기존 행동 실행 FSM을 재사용해 처리한다.

```text
용도: 반격, 지원 사격, 추격 공격
실행 위치: 부모 TurnExecution
```

## 12. 가상 스킬 문법

### 12.1 능동 스킬

```text
SKILL <스킬ID> "<스킬명>"
DESCRIPTION "<설명>"

ACTIVATION ACTIVE
SUBSCRIBE <EFFECT_RESOLVE_MARKER | ACTION_START>
SUBSCRIPTION_SCOPE CURRENT_ACTION
EVENT_FILTER ACTION_SLOT_IS CURRENT_ACTION
EVENT_FILTER SOURCE_IS OWNER
EXECUTION INLINE_RESOLVE

TARGETING <IN_RANGE_TARGET | CELL_SELECT | DIRECTIONAL>
RANGE_PATTERN <범위ID>
AFFECTED_CELL_PATTERN <영향범위ID | NONE>
COOLDOWN <1 이상의 정수>
CAN_CRITICAL <true | false>

EFFECT <효과순번> <효과 정의>
```

### 12.2 트리거 스킬

```text
SKILL <스킬ID> "<스킬명>"
DESCRIPTION "<설명>"

ACTIVATION TRIGGERED
SUBSCRIBE <공통 이벤트>
SUBSCRIPTION_SCOPE <BATTLE | CURRENT_TURN>
EVENT_FILTER <이벤트 주체 필터>
EXECUTION <REACTION | EXTRA_ACTION>

CONDITION <발동 조건>
TRIGGER_LIMIT <PER_ACTION N | PER_TURN N | PER_BATTLE N>

EFFECT <효과순번> <효과 정의>
```

## 13. 스킬 예시

### 13.1 방패 돌진

```text
SKILL 101 "방패 돌진"
DESCRIPTION "전방의 적에게 피해를 주고 밀친 뒤 기절을 시도한다."

ACTIVATION ACTIVE
SUBSCRIBE EFFECT_RESOLVE_MARKER
SUBSCRIPTION_SCOPE CURRENT_ACTION
EVENT_FILTER ACTION_SLOT_IS CURRENT_ACTION
EVENT_FILTER SOURCE_IS OWNER
EXECUTION INLINE_RESOLVE

TARGETING DIRECTIONAL
RANGE_PATTERN 201
AFFECTED_CELL_PATTERN 301
COOLDOWN 3
CAN_CRITICAL false

EFFECT 1 DAMAGE AFFECTED_CELLS TARGET_TEAM ENEMY VALUE 20
EFFECT 2 PUSH AFFECTED_CELLS TARGET_TEAM ALL DISTANCE 2
EFFECT 3 STUN AFFECTED_CELLS TARGET_TEAM ENEMY
```

```text
ActionStart
→ 방패 돌진 실행 인스턴스 생성
→ 현재 actionSlotId의 EffectResolveMarker 구독
→ 충돌 애니메이션 마커 수신
→ DAMAGE → PUSH → STUN
→ ActionEnd에서 구독 해제
```

### 13.2 관통 사격

```text
SKILL 102 "관통 사격"
DESCRIPTION "지정한 적에게 강한 피해를 준다."

ACTIVATION ACTIVE
SUBSCRIBE EFFECT_RESOLVE_MARKER
SUBSCRIPTION_SCOPE CURRENT_ACTION
EVENT_FILTER ACTION_SLOT_IS CURRENT_ACTION
EVENT_FILTER SOURCE_IS OWNER
EXECUTION INLINE_RESOLVE

TARGETING IN_RANGE_TARGET
RANGE_PATTERN 202
AFFECTED_CELL_PATTERN NONE
COOLDOWN 2
CAN_CRITICAL true

EFFECT 1 DAMAGE SELECTED_TARGET TARGET_TEAM ENEMY VALUE 35
```

### 13.3 순간 제압

```text
SKILL 103 "순간 제압"
DESCRIPTION "지정한 적에게 즉시 기절을 시도한다."

ACTIVATION ACTIVE
SUBSCRIBE ACTION_START
SUBSCRIPTION_SCOPE CURRENT_ACTION
EVENT_FILTER ACTION_SLOT_IS CURRENT_ACTION
EVENT_FILTER SOURCE_IS OWNER
EXECUTION INLINE_RESOLVE

TARGETING IN_RANGE_TARGET
RANGE_PATTERN 203
AFFECTED_CELL_PATTERN NONE
COOLDOWN 3
CAN_CRITICAL false

EFFECT 1 STUN SELECTED_TARGET TARGET_TEAM ENEMY
```

`ACTION_START`를 구독하므로 별도 타격 마커 없이 즉시 `Resolve`로 들어간다.

### 13.4 응수 사격

```text
SKILL 104 "응수 사격"
DESCRIPTION "피격된 뒤 공격자가 살아 있으면 반격한다."

ACTIVATION TRIGGERED
SUBSCRIBE HIT_CONFIRMED
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
EXECUTION EXTRA_ACTION

CONDITION EVENT_SOURCE_ALIVE true
TRIGGER_LIMIT PER_TURN 1

TARGET EVENT_SOURCE
EFFECT 1 DAMAGE SELECTED_TARGET TARGET_TEAM ENEMY VALUE 12
```

```text
HitConfirmed
→ 조건 검사
→ ExtraActionRequest 생성
→ 현재 행동 세트 완료
→ TurnExecution이 기존 행동 실행 FSM으로 응수 사격 실행
```

### 13.5 가시 반사

```text
SKILL 105 "가시 반사"
DESCRIPTION "피해를 받으면 공격자에게 즉시 피해를 반사한다."

ACTIVATION TRIGGERED
SUBSCRIBE AFTER_DAMAGE
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
EXECUTION REACTION

CONDITION DAMAGE_GREATER_THAN 0
TRIGGER_LIMIT PER_ACTION 1

EFFECT 1 DAMAGE EVENT_SOURCE TARGET_TEAM ENEMY VALUE 5
```

반격 애니메이션 없이 현재 `Resolve`의 반응 큐에서 처리한다.

## 14. 가상 유물 문법

```text
RELIC <유물ID> "<유물명>"
DESCRIPTION "<설명>"

SUBSCRIBE <공통 이벤트>
SUBSCRIPTION_SCOPE <BATTLE | CURRENT_TURN>
EVENT_FILTER <이벤트 주체 필터>
ACTIVATION <AUTO | SELECT>
LIMIT <PER_ACTION N | PER_TURN N | PER_BATTLE N | NONE>

CONDITION <발동 조건>
REACTION <효과 정의>
```

유물은 이벤트를 수신해 조건을 검사하고 `ReactionRequest`만 반환한다.

## 15. 유물 예시

### 15.1 축전 코일

```text
RELIC 1001 "축전 코일"
DESCRIPTION "장착자가 스킬을 시전하면 이번 행동의 첫 피해가 5 증가한다."

SUBSCRIBE SKILL_CAST
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER SOURCE_IS OWNER
ACTIVATION AUTO
LIMIT PER_ACTION 1

REACTION MODIFY_NEXT_DAMAGE SELF VALUE 5
```

### 15.2 충격 흡수판

```text
RELIC 1002 "충격 흡수판"
DESCRIPTION "장착자가 받는 첫 피해를 4 감소시킨다. 턴당 1회."

SUBSCRIBE BEFORE_APPLY
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
ACTIVATION AUTO
LIMIT PER_TURN 1

CONDITION EFFECT_TYPE DAMAGE
REACTION REDUCE_INCOMING_DAMAGE SELF VALUE 4
```

### 15.3 반사 렌즈

```text
RELIC 1003 "반사 렌즈"
DESCRIPTION "장착자가 피해를 받으면 공격자에게 5 피해를 요청한다."

SUBSCRIBE AFTER_DAMAGE
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
ACTIVATION AUTO
LIMIT PER_ACTION 1

CONDITION DAMAGE_GREATER_THAN 0
REACTION DAMAGE EVENT_SOURCE VALUE 5
```

### 15.4 응급 심박기

```text
RELIC 1004 "응급 심박기"
DESCRIPTION "장착자가 전투 불능 후보가 되면 체력을 10 회복한다. 전투당 1회."

SUBSCRIBE INCAPACITATION_CANDIDATE
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
ACTIVATION AUTO
LIMIT PER_BATTLE 1

REACTION HEAL SELF VALUE 10
```

### 15.5 마지막 기록침

```text
RELIC 1005 "마지막 기록침"
DESCRIPTION "장착자의 전투 불능이 확정되면 공격자에게 8 피해를 요청한다."

SUBSCRIBE INCAPACITATION_CONFIRMED
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
ACTIVATION AUTO
LIMIT PER_BATTLE 1

REACTION DAMAGE EVENT_SOURCE VALUE 8
```

### 15.6 피격 경보기

```text
RELIC 1006 "피격 경보기"
DESCRIPTION "장착자가 피격되면 다음 이동력이 1 증가한다."

SUBSCRIBE HIT_CONFIRMED
SUBSCRIPTION_SCOPE BATTLE
EVENT_FILTER TARGET_IS OWNER
ACTIVATION AUTO
LIMIT PER_TURN 1

REACTION ADD_NEXT_MOVE_RANGE SELF VALUE 1
```

기절·밀치기만 적용되고 체력 피해가 없어도 `HitConfirmed`가 발생하면 발동할 수 있다.

## 16. 복합 실행 예시

### 16.1 방패 돌진·축전 코일·응급 심박기

조건:

```text
공격자: 방패 돌진, 축전 코일
대상: 현재 체력 22, 응급 심박기
방패 돌진 기본 피해: 20
```

실행:

```text
ActionStart
→ SkillCast
→ 축전 코일 ReactionRequest
→ 이번 행동 첫 피해 +5
→ EffectResolveMarker
→ EFFECT 1 DAMAGE 25
→ 대상 체력 22 → -3
→ HitConfirmed
→ AfterDamage
→ IncapacitationCandidate
→ 응급 심박기 HEAL 10
→ 대상 체력 -3 → 7
→ 전투 불능 취소
→ EFFECT 2 PUSH
→ EFFECT 3 STUN
→ WaitForPresentation
→ ActionEnd
→ Complete
```

### 16.2 방패 돌진으로 전투 불능 확정

```text
EFFECT 1 DAMAGE
→ HitConfirmed
→ AfterDamage
→ IncapacitationCandidate
→ 생존 반응 없음
→ HpRecheck
→ IncapacitationConfirmed
→ EFFECT 2 PUSH 중단
→ EFFECT 3 STUN 중단
→ 결과 연출
→ Complete
```

### 16.3 앞 효과 실패 후 다음 효과 계속

```text
EFFECT 1 AIRBORNE
→ 대상 면역
→ 실패 기록
→ EFFECT 2 DAMAGE 계속
```

### 16.4 피격과 피해 구분

```text
기절만 정상 적용
→ HitConfirmed 발생
→ AfterDamage 없음

피해 10 정상 적용
→ HitConfirmed 발생
→ AfterDamage 발생
```

### 16.5 트리거 스킬 추가 행동

```text
기물 A가 기물 B 공격
→ B에게 HitConfirmed
→ B의 응수 사격 조건 충족
→ ExtraActionRequest 등록
→ 기물 A 행동 세트 Complete
→ TurnExecution이 요청 확인
→ B의 응수 사격 행동 세트 실행
→ 원래 다음 슬롯 진행
```

## 17. 행동 세트 간 전달 정보

```text
ActionSlotResult
- actionSlotId
- actorId
- resultType
- movementResult
- mainActionResult
- effectResults
- affectedActorIds
- incapacitatedActorIds
- generatedReactionResults
- generatedExtraActionRequests
- battleOutcomeRequest
- presentationCompleted
```

다음 행동 세트에 체력·위치·상태 복사본을 직접 넘기지 않는다. 다음 행동은 다음 단일 원본에서 최신 상태를 다시 조회한다.

```text
위치·점유: 전투판 점유 데이터
체력·상태: 캐릭터 전투 런타임
행동 순서: 행동 슬롯 목록
반응 요청: 반응 큐
승패: 현재 전투 결과 조회
```

## 18. 구독 해제 규칙

```text
능동 스킬 실행 인스턴스
→ ActionEnd에서 구독 해제

트리거 스킬
→ 전투 불능·스킬 비활성화·BattleEnd에서 구독 해제

유물
→ 장착 해제·BattleEnd에서 구독 해제

상태 효과
→ 상태 제거 시 구독 해제

환경 요소
→ 파괴·비활성화·BattleEnd에서 구독 해제

BattleEnd
→ 남은 전투 범위 구독 일괄 해제
```

## 19. 무한 연쇄 방지에 필요한 규칙

아래 값은 실제 적용 전에 반드시 확정해야 한다.

```text
동일 콘텐츠의 행동당 발동 제한
동일 콘텐츠의 턴당 발동 제한
동일 콘텐츠의 전투당 발동 제한
자신이 발생시킨 이벤트로 자신을 재발동할 수 있는지
트리거 효과가 다른 트리거를 발동할 수 있는지
최대 반응 연쇄 깊이
최대 ExtraAction 연쇄 횟수
제한 초과 요청의 폐기·로그 정책
```

## 20. 미확정 결정 목록

1. 같은 반응 시점의 스킬·유물·상태·환경 우선순위
2. 동일 우선순위의 동률 처리
3. 반응 처리 중 생성된 신규 요청의 큐 앞·뒤 삽입 기준
4. `ReactionRequest` 최대 연쇄 깊이
5. 추가 행동과 원래 다음 슬롯의 우선순위
6. 추가 행동을 발생시킨 캐릭터가 전투 불능일 때 요청 폐기 여부
7. `EffectResolveMarker`가 오지 않을 때 타임아웃·강제 진행 방식
8. 필수 결과 연출 완료 이벤트가 오지 않을 때 처리
9. 다단 공격의 `impactIndex` 작성 방식
10. 선택 발동 유물의 입력 시간과 자동 진행 방식

## 21. 최종 요약

```text
전투 수명 주기 FSM
→ 전투 한 판의 시작·반복·종료

턴 FSM
→ 한 턴의 계획·실행·정산

행동 실행 FSM
→ 한 기물의 이동·본 행동·피격·연출 전체 세트

Resolve 파이프라인
→ 직접 효과·적중·피격·피해·유물·전투 불능 처리

구독 시스템
→ 스킬·유물·상태·환경이 공통 이벤트를 수신하고 요청 생성
```

능동 스킬은 현재 행동 범위에서 실행 이벤트를 임시 구독하고, 트리거 스킬·유물은 전투 범위 이벤트를 지속 구독한다. 모든 콘텐츠는 직접 FSM을 전이시키지 않고 `InlineEffectRequest`, `ReactionRequest`, `ExtraActionRequest` 중 하나를 전투 시스템에 반환한다.
