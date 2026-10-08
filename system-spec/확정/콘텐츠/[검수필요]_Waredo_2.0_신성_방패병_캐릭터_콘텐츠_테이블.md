# [검수필요] Waredo 2.0 신성 방패병 캐릭터 콘텐츠 테이블

> 결정 상태: `[검수필요]` — 사용자 요청으로 `확정/콘텐츠`에 우선 등록했으나 공식 구현 기준 사용 전 검수 필요
> 검수 상태: `[검수 요청]`
> 문서 책임자: 프로젝트 책임자(사용자)
> 검수자: `[작성 필요]`
> 최초 작성일: 2026-09-14
> 최근 수정일: 2026-09-14
> 변수 정의: [캐릭터 콘텐츠 변수 정의 및 연결표](Waredo_2.0_캐릭터_콘텐츠_변수_정의_및_연결표.md)
> 관련 시스템: [캐릭터](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md), [전투](../시스템/Waredo_2.0_전투_시스템_기획서.md), [상태이상](../시스템/Waredo_2.0_상태이상_시스템_기획서.md), [전투판](../시스템/Waredo_2.0_전투판_시스템_기획서.md)
> 검수 범위: 역할, 기본 능력치, 일반 공격, 밀치기 스킬, 확정 시스템 호환성

## 1. 캐릭터 관리표

| 항목 | 값 |
|---|---|
| 캐릭터 ID | 8 — 검수 전 임시 배정 |
| 이름 | 신성 방패병 |
| 분류 | NORMAL_ENEMY — 일반 적 |
| 전투 역할 | 근거리 방벽·밀치기 |
| 시간대 태그 | NONE |
| 최대 체력 | 115 |
| 이동력 | 2칸 |
| 치명타 피해율 | 150% |
| 상태이상 면역 태그 | NONE |
| 일반 공격 ID | 8 — 검수 전 임시 배정 |
| 일반 스킬 ID | 13 — 검수 전 임시 배정 |
| 궁극기 ID | 0 — 적군 궁극기 없음 |

## 2. 공격·스킬 관리표

| 항목 | 일반 공격 | 일반 스킬 |
|---|---|---|
| 분류 | ATTACK | SKILL |
| ID | 8 | 13 |
| 이름 | 방패 가격 | 신성 방패 돌진 |
| 타겟팅 | DIRECTIONAL | DIRECTIONAL |
| 사용 가능 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 영향 범위 | 범위 1 — 전방 1칸 | 범위 1 — 전방 1칸 |
| 대상 | ENEMY | ENEMY |
| 효과 | 피해 7 | 피해 6 → 밀치기 2칸 |
| 공격 전달 방식 | DIRECT | DIRECT |
| 관통 | 없음 | 없음 |
| 쿨타임 | 해당 없음 | 3 |

## 3. 작성 문법

```text
CHARACTER 8 "신성 방패병"
CATEGORY NORMAL_ENEMY
TIME_TAG NONE
MAX_HP 115
MOVE_RANGE 2
CRITICAL_DAMAGE_RATE_PERCENT 150
NORMAL_ATTACK 8
SKILL 13
ULTIMATE_SKILL 0
STATUS_IMMUNITY NONE
```

```text
NORMAL_ATTACK 8 "방패 가격"
CONTENT_TYPE ATTACK
ATTACK_DELIVERY DIRECT
EFFECT_TYPE DAMAGE
VALUE 7
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
VALID_TARGET_TEAM ENEMY
```

```text
SKILL 13 "신성 방패 돌진"
CONTENT_TYPE SKILL
ATTACK_DELIVERY DIRECT
DESCRIPTION "선택 방향의 인접한 반대 진영 캐릭터에게 피해 6을 준 뒤 시전자 반대 방향으로 2칸 밀친다."
TARGETING DIRECTIONAL
RANGE_PATTERN 1
AFFECTED_CELL_PATTERN 1
COOLDOWN 3
EFFECT NUMERIC AFFECTED_CELLS TYPE DAMAGE TARGET_TEAM ENEMY VALUE 6
EFFECT PUSH AFFECTED_CELLS TARGET_TEAM ENEMY DISTANCE 2
```

## 4. 실행·기획 유의사항

- 일반 적 중 높은 체력으로 통로를 막고 수정령·방위병을 보호한다.
- 스킬은 피해를 먼저 적용한 뒤 살아 있는 대상에게 밀치기를 요청한다.
- 밀치기 면역이면 피해만 적용한다. 이동 중 점유 셀·환경요소·전투판 경계와 접촉하면 기존 충돌 규칙을 따른다.
- 일반 공격에는 밀치기를 넣지 않아 스킬의 역할과 사용 시점을 구분한다.
- 적 AI는 충돌을 만들거나 다른 적의 공격 범위로 대상을 보내는 방향을 선호하도록 추후 연결한다.

## 5. 작성·확인 필요

- 캐릭터·공격·스킬 ID 8·8·13의 최종 등록 여부.
- 피해 후 밀치기 순서와 밀치기 거리 2칸의 최종 승인.
- 충돌 예상 및 아군 사선 연계를 평가하는 적 AI 규칙.

## 6. 검수·변경 기록

- 2026-09-14: 사용자 요청에 따라 기존 아군 콘텐츠와 상태이상 문법을 참고해 검수 필요 초안으로 작성했다.
- 강제 이동의 실제 경로·충돌·면역 처리는 상태이상·전투판 시스템을 참조한다.
