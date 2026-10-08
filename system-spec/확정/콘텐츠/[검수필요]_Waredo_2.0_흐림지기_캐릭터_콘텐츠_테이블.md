# [검수필요] Waredo 2.0 흐림지기 캐릭터 콘텐츠 테이블

> 결정 상태: `[검수필요]` — 사용자 요청으로 `확정/콘텐츠`에 우선 등록했으나 공식 구현 기준 사용 전 검수 필요
> 검수 상태: `[검수 요청]`
> 문서 책임자: 프로젝트 책임자(사용자)
> 검수자: `[작성 필요]`
> 최초 작성일: 2026-09-14
> 최근 수정일: 2026-09-14
> 변수 정의: [캐릭터 콘텐츠 변수 정의 및 연결표](Waredo_2.0_캐릭터_콘텐츠_변수_정의_및_연결표.md)
> 관련 시스템: [캐릭터](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md), [전투](../시스템/Waredo_2.0_전투_시스템_기획서.md), [상태이상](../시스템/Waredo_2.0_상태이상_시스템_기획서.md)
> 검수 범위: 역할, 기본 능력치, 일반 공격, 기절 스킬, 확정 시스템 호환성

## 1. 캐릭터 관리표

| 항목 | 값 |
|---|---|
| 캐릭터 ID | 10 — 검수 전 임시 배정 |
| 이름 | 흐림지기 |
| 분류 | NORMAL_ENEMY — 일반 적 |
| 전투 역할 | 고기동 근거리 기절 유틸리티 |
| 시간대 태그 | NONE |
| 최대 체력 | 60 |
| 이동력 | 4칸 |
| 치명타 피해율 | 150% |
| 상태이상 면역 태그 | NONE |
| 일반 공격 ID | 10 — 검수 전 임시 배정 |
| 일반 스킬 ID | 15 — 검수 전 임시 배정 |
| 궁극기 ID | 0 — 적군 궁극기 없음 |

## 2. 공격·스킬 관리표

| 항목 | 일반 공격 | 일반 스킬 |
|---|---|---|
| 분류 | ATTACK | SKILL |
| ID | 10 | 15 |
| 이름 | 흐린 칼날 | 흐림의 낙인 |
| 타겟팅 | DIRECTIONAL | DIRECTIONAL |
| 사용 가능 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 영향 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 대상 | ENEMY | ENEMY |
| 효과 | 피해 8 | 피해 4 → 기절 |
| 공격 전달 방식 | DIRECT | DIRECT |
| 관통 | 없음 | 없음 |
| 쿨타임 | 해당 없음 | 4 |

## 3. 작성 문법

```text
CHARACTER 10 "흐림지기"
CATEGORY NORMAL_ENEMY
TIME_TAG NONE
MAX_HP 60
MOVE_RANGE 4
CRITICAL_DAMAGE_RATE_PERCENT 150
NORMAL_ATTACK 10
SKILL 15
ULTIMATE_SKILL 0
STATUS_IMMUNITY NONE
```

```text
NORMAL_ATTACK 10 "흐린 칼날"
CONTENT_TYPE ATTACK
ATTACK_DELIVERY DIRECT
EFFECT_TYPE DAMAGE
VALUE 8
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
VALID_TARGET_TEAM ENEMY
```

```text
SKILL 15 "흐림의 낙인"
CONTENT_TYPE SKILL
ATTACK_DELIVERY DIRECT
DESCRIPTION "선택 방향의 인접한 반대 진영 캐릭터에게 피해 4를 준 뒤 기절을 부여한다."
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
COOLDOWN 4
EFFECT NUMERIC AFFECTED_CELLS TYPE DAMAGE TARGET_TEAM ENEMY VALUE 4
EFFECT STUN AFFECTED_CELLS TARGET_TEAM ENEMY
```

## 4. 실행·기획 유의사항

- 피해보다 아직 행동하지 않은 아군의 다음 행동을 끊는 것이 주 역할이다.
- 피해 4를 먼저 적용하고 살아 있는 대상에게 기절을 적용한다. 새 기절은 앞선 피해를 소급해 치명타로 바꾸지 않는다.
- 기절은 상태 기반 치명타 조건이 아니다. 후속 피해는 대상에게 띄워짐이 별도로 적용된 경우에만 상태이상 시스템의 치명타 조건을 따를 수 있다.
- 이미 행동을 마친 대상은 같은 턴에 추가 행동이 없다면 기절의 행동 취소 가치가 낮다.
- 적 AI는 아직 행동하지 않았고 기절 면역이 없는 아군을 선호하도록 추후 연결한다.

## 5. 작성·확인 필요

- 캐릭터·공격·스킬 ID 10·10·15의 최종 등록 여부.
- 피해 4, 기절, 쿨타임 4 조합의 최종 승인.
- 행동 순서와 면역을 읽는 적 AI 우선순위.

## 6. 검수·변경 기록

- 2026-09-14: 클로이의 피해 후 기절 효과 순서와 확정 상태이상 규칙을 참고해 검수 필요 초안으로 작성했다.
- 기절의 높은 행동 취소 가치를 고려해 직접 피해를 낮게 제안했다.
- 2026-09-20: 개발팀 피드백 반영으로 기절이 치명타 조건에서 제외된 현행 상태이상 규칙에 맞춰 설명을 수정했다.
