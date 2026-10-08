# [검수필요] Waredo 2.0 휘령수정령 캐릭터 콘텐츠 테이블

> 결정 상태: `[검수필요]` — 사용자 요청으로 `확정/콘텐츠`에 우선 등록했으나 공식 구현 기준 사용 전 검수 필요
> 검수 상태: `[검수 요청]`
> 문서 책임자: 프로젝트 책임자(사용자)
> 검수자: `[작성 필요]`
> 최초 작성일: 2026-09-14
> 최근 수정일: 2026-09-14
> 변수 정의: [캐릭터 콘텐츠 변수 정의 및 연결표](Waredo_2.0_캐릭터_콘텐츠_변수_정의_및_연결표.md)
> 관련 시스템: [캐릭터](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md), [전투](../시스템/Waredo_2.0_전투_시스템_기획서.md), [통합 범위](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md)
> 검수 범위: 역할, 기본 능력치, 일반 공격, 광역 회복 스킬, 확정 시스템 호환성

## 1. 캐릭터 관리표

| 항목 | 값 |
|---|---|
| 캐릭터 ID | 9 — 검수 전 임시 배정 |
| 이름 | 휘령수정령 |
| 분류 | NORMAL_ENEMY — 일반 적 |
| 전투 역할 | 광역 회복 지원 |
| 시간대 태그 | NONE |
| 최대 체력 | 45 |
| 이동력 | 3칸 |
| 치명타 피해율 | 150% |
| 상태이상 면역 태그 | NONE |
| 일반 공격 ID | 9 — 검수 전 임시 배정 |
| 일반 스킬 ID | 14 — 검수 전 임시 배정 |
| 궁극기 ID | 0 — 적군 궁극기 없음 |

## 2. 공격·스킬 관리표

| 항목 | 일반 공격 | 일반 스킬 |
|---|---|---|
| 분류 | ATTACK | SKILL |
| ID | 9 | 14 |
| 이름 | 수정 파편 | 휘령수 치유파 |
| 타겟팅 | DIRECTIONAL | SELF_CENTERED |
| 사용 가능 범위 | 범위 2 — 전방 3칸 | 범위 7 — 자기 중심 3×3 |
| 영향 범위 | 범위 2 — 전방 3칸 | 범위 7 — 자기 중심 3×3 |
| 대상 | ENEMY | ALLY — 시전자와 같은 적군 진영 |
| 효과 | 피해 5 | 범위 안 대상 각각 회복 8 |
| 공격 전달 방식 | DIRECT | AREA |
| 관통 | 없음 | 해당 없음 |
| 쿨타임 | 해당 없음 | 4 |

## 3. 작성 문법

```text
CHARACTER 9 "휘령수정령"
CATEGORY NORMAL_ENEMY
TIME_TAG NONE
MAX_HP 45
MOVE_RANGE 3
CRITICAL_DAMAGE_RATE_PERCENT 150
NORMAL_ATTACK 9
SKILL 14
ULTIMATE_SKILL 0
STATUS_IMMUNITY NONE
```

```text
NORMAL_ATTACK 9 "수정 파편"
CONTENT_TYPE ATTACK
ATTACK_DELIVERY DIRECT
EFFECT_TYPE DAMAGE
VALUE 5
TARGETING DIRECTIONAL
RANGE_PATTERN 2
AFFECTED_CELL_PATTERN 2
VALID_TARGET_TEAM ENEMY
```

```text
SKILL 14 "휘령수 치유파"
CONTENT_TYPE SKILL
ATTACK_DELIVERY AREA
DESCRIPTION "자기 중심 3×3 범위 안 같은 진영 캐릭터의 체력을 각각 8 회복한다. 자신을 포함하며 전투불능 대상은 부활시키지 않는다."
TARGETING SELF_CENTERED
RANGE_PATTERN 7
AFFECTED_CELL_PATTERN 7
COOLDOWN 4
EFFECT NUMERIC AFFECTED_CELLS TYPE HEAL TARGET_TEAM ALLY VALUE 8
```

## 4. 실행·기획 유의사항

- 일반 적 중 가장 낮은 체력과 낮은 공격력을 가지며, 적 전열을 유지시키는 우선 제거 대상이다.
- `TARGET_TEAM ALLY`는 시전자 기준 같은 진영을 뜻하므로 수정령과 다른 적군을 회복한다.
- 자신도 자기 중심 범위의 같은 진영 캐릭터이므로 회복 대상에 포함한다.
- 최대 체력까지만 회복하고 전투불능 캐릭터는 부활시키지 않는다. 실제 회복량이 0이어도 유효 사용이면 쿨타임을 적용한다.
- 적 AI는 다수의 부상 적 또는 크게 피해를 받은 보스를 회복할 수 있는 위치를 선호하도록 추후 연결한다.

## 5. 작성·확인 필요

- 캐릭터·공격·스킬 ID 9·9·14의 최종 등록 여부.
- 회복량 8과 쿨타임 4의 최종 승인.
- 회복 사용 조건과 부상 대상 우선순위의 적 AI 정의.

## 6. 검수·변경 기록

- 2026-09-14: 야나의 자기 중심 회복 구조와 확정 회복 규칙을 참고해 적군 힐러 검수 필요 초안으로 작성했다.
- 회복량은 야나의 10보다 낮은 제안값 8로 설정했다.
