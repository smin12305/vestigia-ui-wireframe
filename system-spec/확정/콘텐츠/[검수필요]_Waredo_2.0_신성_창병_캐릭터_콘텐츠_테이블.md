# [검수필요] Waredo 2.0 신성 창병 캐릭터 콘텐츠 테이블

> 결정 상태: `[검수필요]` — 사용자 요청으로 `확정/콘텐츠`에 우선 등록했으나 공식 구현 기준 사용 전 검수 필요
> 검수 상태: `[검수 요청]`
> 문서 책임자: 프로젝트 책임자(사용자)
> 검수자: `[작성 필요]`
> 최초 작성일: 2026-09-14
> 최근 수정일: 2026-09-14
> 변수 정의: [캐릭터 콘텐츠 변수 정의 및 연결표](Waredo_2.0_캐릭터_콘텐츠_변수_정의_및_연결표.md)
> 관련 시스템: [캐릭터](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md), [전투](../시스템/Waredo_2.0_전투_시스템_기획서.md), [통합 범위](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md)
> 검수 범위: 역할, 기본 능력치, 일반 공격, 일반 스킬, 확정 시스템 호환성

## 1. 캐릭터 관리표

| 항목 | 값 |
|---|---|
| 캐릭터 ID | 7 — 검수 전 임시 배정 |
| 이름 | 신성 창병 |
| 분류 | NORMAL_ENEMY — 일반 적 |
| 전투 역할 | 고기동 근거리 공격수 |
| 시간대 태그 | NONE |
| 최대 체력 | 75 |
| 이동력 | 4칸 |
| 치명타 피해율 | 150% |
| 상태이상 면역 태그 | NONE |
| 일반 공격 ID | 7 — 검수 전 임시 배정 |
| 일반 스킬 ID | 12 — 검수 전 임시 배정 |
| 궁극기 ID | 0 — 적군 궁극기 없음 |

## 2. 공격·스킬 관리표

| 항목 | 일반 공격 | 일반 스킬 |
|---|---|---|
| 분류 | ATTACK | SKILL |
| ID | 7 | 12 |
| 이름 | 신성 창격 | 심판의 찌르기 |
| 타겟팅 | DIRECTIONAL | DIRECTIONAL |
| 사용 가능 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 영향 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 대상 | ENEMY | ENEMY |
| 효과 | 피해 11 | 피해 18 |
| 공격 전달 방식 | DIRECT | DIRECT |
| 관통 | 없음 | 없음 |
| 쿨타임 | 해당 없음 | 3 |

## 3. 작성 문법

```text
CHARACTER 7 "신성 창병"
CATEGORY NORMAL_ENEMY
TIME_TAG NONE
MAX_HP 75
MOVE_RANGE 4
CRITICAL_DAMAGE_RATE_PERCENT 150
NORMAL_ATTACK 7
SKILL 12
ULTIMATE_SKILL 0
STATUS_IMMUNITY NONE
```

```text
NORMAL_ATTACK 7 "신성 창격"
CONTENT_TYPE ATTACK
ATTACK_DELIVERY DIRECT
EFFECT_TYPE DAMAGE
VALUE 11
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
VALID_TARGET_TEAM ENEMY
```

```text
SKILL 12 "심판의 찌르기"
CONTENT_TYPE SKILL
ATTACK_DELIVERY DIRECT
DESCRIPTION "선택 방향의 인접한 반대 진영 캐릭터에게 피해 18을 준다."
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
COOLDOWN 3
EFFECT NUMERIC AFFECTED_CELLS TYPE DAMAGE TARGET_TEAM ENEMY VALUE 18
```

## 4. 실행·기획 유의사항

- 이동력 4로 후열에 접근하는 순수 근거리 공격수다. 밀치기·기절 같은 부가 기능은 갖지 않는다.
- 현재 확정 범위 안에서 작성하기 위해 두 공격 모두 전방 1칸을 사용한다.
- 높은 스킬 피해는 접근 성공 보상이며, 기절·띄워짐으로 이동이나 행동을 끊어 대응할 수 있다.
- 적 AI는 체력이 낮은 후열과 접근 가능한 대상을 선호하는 방향으로 추후 연결한다.

## 5. 작성·확인 필요

- 캐릭터·공격·스킬 ID 7·7·12의 최종 등록 여부.
- 창의 거리감을 위해 신규 전방 2칸 범위를 추가할지 여부. 추가 전까지 범위 1을 사용한다.
- 후열·낮은 체력 대상 우선순위의 적 AI 반영 여부.

## 6. 검수·변경 기록

- 2026-09-14: 사용자 요청에 따라 기존 아군 콘텐츠 양식을 참고해 검수 필요 초안으로 작성했다.
- 신규 범위가 확정되지 않아 현재 확정 범위 1을 사용하는 호환안으로 기록했다.
