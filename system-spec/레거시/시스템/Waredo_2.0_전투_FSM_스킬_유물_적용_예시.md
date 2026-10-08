# Waredo 2.0 전투 FSM 스킬·유물 적용 예시

## 1. 문서 역할

이 문서는 전투 FSM의 `ActionStart → WaitForImpact → Resolve → WaitForPresentation → Complete` 구조에 여러 스킬과 유물이 어떻게 들어가는지 검증하기 위한 작성 예시다.

- 스킬 문법·효과 순서·실패 계속·전투 불능 확정 시 중단은 캐릭터 시스템 확정 규칙을 따른다.
- 아래 스킬 ID·이름·수치는 구조 검증용 예시이며 실제 캐릭터 콘텐츠 확정값이 아니다.
- 유물은 별도 확정 시스템 문서가 아직 없으므로 아래 문법과 수치는 `[작성 예시·추후 유물 시스템에서 확정]`이다.
- 같은 반응 시점의 복수 유물 우선순위·동률·큐 삽입 위치와 최대 연쇄 깊이는 전투 시스템의 `[확인 필요]` 항목을 유지한다.

## 2. 공통 실행 프레임

```text
행동 슬롯 선택
→ Precheck
→ Movement
→ ActionBegin 반응
→ ActionStart·SkillCast
→ WaitForImpact
→ Impact Marker 또는 ImmediateImpact
→ Resolve
   → effectSequence 순서 처리
   → BeforeApply 반응 큐
   → 직접 효과 적용
   → AfterApply·AfterDamage 반응 큐
   → 전투 불능 후보·방지 반응·재판정
→ WaitForPresentation
→ ActionEnd 반응
→ Complete·ActionSlotResult 반환
```

스킬은 `EFFECT`의 종류와 직접 효과 순서만 제공한다. 유물은 자신이 구독하는 공통 시점과 발동 조건을 제공한다. 전투 FSM만 현재 상태 전이, 반응 큐 처리와 다음 행동 진행을 결정한다.

## 3. 스킬 작성 예시

### 3.1 방패 돌진: 복수 효과·피격 마커

```text
SKILL 101 "방패 돌진"
DESCRIPTION "전방의 대상에게 피해를 주고 밀친 뒤 기절을 시도한다."
TARGETING DIRECTIONAL
RANGE_PATTERN 201
AFFECTED_CELL_PATTERN 301
COOLDOWN 3
CAN_CRITICAL false
RESOLVE_TIMING IMPACT_MARKER

EFFECT 1 DAMAGE AFFECTED_CELLS TARGET_TEAM ENEMY VALUE 20
EFFECT 2 PUSH AFFECTED_CELLS TARGET_TEAM ALL DISTANCE 2
EFFECT 3 STUN AFFECTED_CELLS TARGET_TEAM ENEMY
```

실행:

```text
돌진 애니메이션 시작
→ 방패 충돌 프레임의 Impact Marker
→ 피해 20
→ 생존하면 밀치기 2칸
→ 생존하면 기절 시도
→ 피해·밀치기·기절 결과 연출 완료
```

피해가 면역·대상 없음 등으로 실패해도 밀치기와 기절은 계속 시도한다. 피해 또는 충돌 피해로 대상의 전투 불능이 최종 확정되면 남은 효과를 중단한다.

### 3.2 관통 사격: 단일 효과·피격 마커

```text
SKILL 102 "관통 사격"
DESCRIPTION "지정한 적에게 강한 피해를 준다."
TARGETING IN_RANGE_TARGET
RANGE_PATTERN 202
AFFECTED_CELL_PATTERN NONE
COOLDOWN 2
CAN_CRITICAL true
RESOLVE_TIMING IMPACT_MARKER

EFFECT 1 DAMAGE SELECTED_TARGET TARGET_TEAM ENEMY VALUE 35
```

실행:

```text
사격 애니메이션·투사체 연출 시작
→ 투사체 적중 Impact Marker
→ Damage Resolve
→ AfterDamage 유물 확인
→ 전투 불능 후보·생존 유물 확인
→ 결과 연출 완료
```

### 3.3 지각 붕괴: 앞 효과 실패 후 다음 효과 계속

```text
SKILL 103 "지각 붕괴"
DESCRIPTION "선택한 범위의 적을 띄우고 피해를 준다."
TARGETING CELL_SELECT
RANGE_PATTERN 203
AFFECTED_CELL_PATTERN 303
COOLDOWN 4
CAN_CRITICAL false
RESOLVE_TIMING IMPACT_MARKER

EFFECT 1 AIRBORNE AFFECTED_CELLS TARGET_TEAM ENEMY
EFFECT 2 DAMAGE AFFECTED_CELLS TARGET_TEAM ENEMY VALUE 18
```

실행:

```text
지면 충격 Impact Marker
→ EFFECT 1 AIRBORNE
   → 대상이 띄우기 면역이면 실패 기록
→ EFFECT 2 DAMAGE
   → 앞 효과 실패와 관계없이 피해 처리
```

### 3.4 순간 제압: 즉시 해결

```text
SKILL 104 "순간 제압"
DESCRIPTION "지정한 적에게 즉시 기절을 시도한다."
TARGETING IN_RANGE_TARGET
RANGE_PATTERN 204
AFFECTED_CELL_PATTERN NONE
COOLDOWN 3
CAN_CRITICAL false
RESOLVE_TIMING IMMEDIATE

EFFECT 1 STUN SELECTED_TARGET TARGET_TEAM ENEMY
```

실행:

```text
ActionStart
→ 별도 타격 프레임 없이 ImmediateImpact
→ 기절 조건·면역 검증
→ 기절 적용 또는 실패 확정
→ 결과 이펙트 완료
```

### 3.5 트리거 스킬 확장 예시 `[미확정]`

현재 확정 캐릭터는 능동 스킬 ID를 하나만 소유한다. 아래처럼 자동 반격 스킬을 추가하려면 `triggeredSkillIds` 같은 별도 소유·장착 규칙과 추가 행동의 슬롯 우선순위를 먼저 확정해야 한다. 따라서 아래 블록은 실행 가능성을 설명하는 제안이며 확정 스킬 문법에는 포함하지 않는다.

```text
TRIGGERED_SKILL 105 "응수 사격"
DESCRIPTION "장착자가 피해를 받은 뒤 공격자가 살아 있으면 반격한다."
TRIGGER AFTER_DAMAGE
TRIGGER_EXECUTION EXTRA_ACTION
TRIGGER_LIMIT PER_TURN 1
CONDITION TARGET SELF
CONDITION EVENT_SOURCE_ALIVE true

TARGET EVENT_SOURCE
RESOLVE_TIMING IMPACT_MARKER
EFFECT 1 DAMAGE SELECTED_TARGET TARGET_TEAM ENEMY VALUE 12
```

도입 시 실행 형태:

```text
현재 공격의 AfterDamage
→ 응수 사격 조건 충족
→ 현재 Resolve 안에서 즉시 애니메이션을 시작하지 않음
→ ExtraActionRequest 등록
→ 현재 행동의 결과 연출·ActionEnd 완료
→ 부모 TurnExecution이 추가 행동 요청 선택
→ 기존 행동 실행 FSM을 재사용해 응수 사격 실행
```

이 구조는 반격용 새 FSM을 만들지 않고 기존 행동 실행 FSM을 재사용한다. 다만 추가 행동과 원래 다음 슬롯 중 어느 쪽을 먼저 실행할지, 전투 불능 시 요청을 폐기할지와 연쇄 제한은 별도 확정이 필요하다.

## 4. 유물 작성 예시 문법

아래 형식은 전투 FSM 연동을 설명하기 위한 제안 문법이다.

```text
RELIC <유물ID> "<유물명>"
DESCRIPTION "<설명>"
TRIGGER <공통 반응 시점>
OWNER <EQUIPPED_CHARACTER>
ACTIVATION <AUTO | SELECT>
LIMIT <PER_ACTION N | PER_TURN N | PER_BATTLE N | NONE>
CONDITION <조건>

REACTION <효과종류> <대상> VALUE <수치>
```

유물 데이터는 조건을 만족했을 때 `ReactionRequest`를 반환할 뿐 체력·쿨타임·FSM 상태를 직접 변경하지 않는다.

### 4.1 축전 코일: 스킬 사용 반응

```text
RELIC 1001 "축전 코일"
DESCRIPTION "장착자가 스킬을 시전하면 이번 행동의 첫 피해가 5 증가한다."
TRIGGER SKILL_CAST
OWNER EQUIPPED_CHARACTER
ACTIVATION AUTO
LIMIT PER_ACTION 1
CONDITION SOURCE_ACTION SKILL

REACTION MODIFY_NEXT_DAMAGE SELF VALUE 5
```

사용 위치:

```text
방패 돌진 ActionStart
→ SkillCast
→ 축전 코일 ReactionRequest
→ 이번 행동 문맥에 첫 피해 +5 보정 등록
→ Impact Marker
→ EFFECT 1 DAMAGE 20이 25로 해결
```

### 4.2 응급 심박기: 전투 불능 방지

```text
RELIC 1002 "응급 심박기"
DESCRIPTION "장착자가 전투 불능 후보가 되면 체력을 10 회복한다. 전투당 1회."
TRIGGER INCAPACITATION_CANDIDATE
OWNER EQUIPPED_CHARACTER
ACTIVATION AUTO
LIMIT PER_BATTLE 1
CONDITION TARGET SELF

REACTION HEAL SELF VALUE 10
```

사용 위치:

```text
피해 적용
→ currentHp가 0 이하
→ IncapacitationCandidate
→ 응급 심박기 회복 10
→ currentHp 재확인
→ 0보다 크면 전투 불능 취소·다음 effectSequence 계속
```

### 4.3 반사 렌즈: 피해 후 연쇄 반응

```text
RELIC 1003 "반사 렌즈"
DESCRIPTION "장착자가 피해를 받으면 피해를 준 대상에게 5 피해를 요청한다. 행동당 1회."
TRIGGER AFTER_DAMAGE
OWNER EQUIPPED_CHARACTER
ACTIVATION AUTO
LIMIT PER_ACTION 1
CONDITION TARGET SELF
CONDITION DAMAGE_GREATER_THAN 0

REACTION DAMAGE EVENT_SOURCE VALUE 5
```

사용 위치:

```text
적의 피해 적용
→ AfterDamage
→ 반사 렌즈 ReactionRequest 등록
→ 반사 피해 5 해결
→ 반사 피해가 새 AfterDamage를 발생시킬 수 있음
→ 동일 유물 행동당 1회 제한과 전역 연쇄 깊이 규칙 적용
```

전역 최대 연쇄 깊이가 미확정이므로 이 유물의 최종 데이터 확정 전에 해당 규칙을 먼저 정해야 한다.

### 4.4 충격 흡수판: 피해 적용 전 반응

```text
RELIC 1004 "충격 흡수판"
DESCRIPTION "장착자가 받는 첫 피해를 4 감소시킨다. 턴당 1회."
TRIGGER BEFORE_APPLY
OWNER EQUIPPED_CHARACTER
ACTIVATION AUTO
LIMIT PER_TURN 1
CONDITION TARGET SELF
CONDITION EFFECT_TYPE DAMAGE

REACTION REDUCE_INCOMING_DAMAGE SELF VALUE 4
```

사용 위치:

```text
DamageEffectRequest 검증
→ BeforeApply
→ 충격 흡수판으로 예정 피해 -4
→ 감소된 최종 피해를 currentHp에 반영
→ AfterDamage
```

### 4.5 마지막 기록침: 전투 불능 확정 후 반응

```text
RELIC 1005 "마지막 기록침"
DESCRIPTION "장착자의 전투 불능이 확정되면 공격자에게 8 피해를 요청한다."
TRIGGER INCAPACITATION_CONFIRMED
OWNER EQUIPPED_CHARACTER
ACTIVATION AUTO
LIMIT PER_BATTLE 1
CONDITION TARGET SELF

REACTION DAMAGE EVENT_SOURCE VALUE 8
```

사용 위치:

```text
IncapacitationCandidate 반응 종료
→ currentHp 재확인
→ 전투 불능 최종 확정
→ 점유 해제·행동 무효화
→ IncapacitationConfirmed
→ 마지막 기록침 피해 요청
→ 반응 결과까지 해결한 후 승패 판정
```

## 5. 복합 실행 예시

### 5.1 방패 돌진 대 응급 심박기

조건:

- 공격자: 방패 돌진, 축전 코일 장착
- 대상: 응급 심박기 장착, 현재 체력 22
- 방패 돌진 기본 피해 20

```text
ActionStart·SkillCast
→ 축전 코일 발동: 첫 피해 +5
→ Impact Marker
→ EFFECT 1 DAMAGE 25
→ 대상 currentHp 22 → -3
→ IncapacitationCandidate
→ 응급 심박기 발동: 체력 +10
→ 대상 currentHp -3 → 7
→ 전투 불능 취소
→ EFFECT 2 PUSH 계속
→ EFFECT 3 STUN 계속
→ 결과 연출 완료
→ ActionSlotResult 반환
```

### 5.2 방패 돌진으로 전투 불능 확정

조건:

- 대상 현재 체력 10
- 생존 유물 없음

```text
Impact Marker
→ EFFECT 1 DAMAGE 20
→ AfterDamage 반응 없음
→ currentHp 0 이하
→ IncapacitationCandidate 반응 없음
→ 전투 불능 최종 확정
→ IncapacitationConfirmed 반응 처리
→ EFFECT 2 PUSH와 EFFECT 3 STUN 중단
→ 결과 연출 완료
→ 승패 판정 요청 반환
```

### 5.3 같은 시점에 복수 유물 발동

대상이 `반사 렌즈`와 다른 `AfterDamage` 유물을 함께 장착했다고 가정한다.

```text
AfterDamage 개방
→ 반사 렌즈 ReactionRequest
→ 다른 AfterDamage 유물 ReactionRequest
→ 두 요청의 우선순위·동률·삽입 위치 필요
```

현재 전투 문서에는 이 정렬 기준이 `[확인 필요]`이므로 어떤 유물이 먼저 실행된다고 확정하지 않는다. 유물 시스템 작성 전에 최소한 `sourcePriority`, `contentPriority`, `insertionSequence` 또는 이에 준하는 정렬 계약을 결정해야 한다.

## 6. 작성 결과 해석

1. 스킬의 효과 수가 달라도 행동 실행 FSM은 동일하다.
2. `RESOLVE_TIMING`만 시작 연출과 효과 적용의 연결 방식을 바꾼다.
3. 유물은 공통 반응 시점을 구독하므로 스킬마다 유물 호출 코드를 따로 작성하지 않는다.
4. 유물 효과는 `ReactionRequest`로 들어오므로 현재 공격·스킬의 직접 `effectSequence`를 변경하지 않는다.
5. 앞 스킬 효과 실패는 다음 순번을 계속하지만 전투 불능 최종 확정은 남은 직접 효과를 중단한다.
6. 한 행동의 필수 연출과 `ActionEnd` 반응이 완료되어야 부모 `TurnExecution`이 다음 기물을 실행한다.
