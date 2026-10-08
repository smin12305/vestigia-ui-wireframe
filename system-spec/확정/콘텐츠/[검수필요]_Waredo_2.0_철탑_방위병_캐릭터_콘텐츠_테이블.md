# [검수필요] Waredo 2.0 철탑 방위병 캐릭터 콘텐츠 테이블

> 결정 상태: `[검수필요]` — 사용자 요청으로 `확정/콘텐츠`에 우선 등록했으나 공식 구현 기준 사용 전 검수 필요
> 검수 상태: `[검수 요청]`
> 문서 책임자: 프로젝트 책임자(사용자)
> 검수자: `[작성 필요]`
> 최초 작성일: 2026-09-14
> 최근 수정일: 2026-09-14
> 변수 정의: [캐릭터 콘텐츠 변수 정의 및 연결표](Waredo_2.0_캐릭터_콘텐츠_변수_정의_및_연결표.md)
> 관련 시스템: [캐릭터](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md), [전투](../시스템/Waredo_2.0_전투_시스템_기획서.md), [통합 범위](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md), [환경요소](../시스템/Waredo_2.0_환경요소_시스템_기획서.md)
> 검수 범위: 역할, 기본 능력치, 일반 공격, 일반 스킬, 확정 시스템 호환성

## 1. 캐릭터 관리표

| 항목 | 값 |
|---|---|
| 캐릭터 ID | 6 — 검수 전 임시 배정 |
| 이름 | 철탑 방위병 |
| 분류 | NORMAL_ENEMY — 일반 적 |
| 전투 역할 | 원거리 직선 압박 |
| 시간대 태그 | NONE |
| 최대 체력 | 55 |
| 이동력 | 2칸 |
| 치명타 피해율 | 150% |
| 상태이상 면역 태그 | NONE |
| 일반 공격 ID | 6 — 검수 전 임시 배정 |
| 일반 스킬 ID | 11 — 검수 전 임시 배정 |
| 궁극기 ID | 0 — 적군 궁극기 없음 |

## 2. 공격·스킬 관리표

| 항목 | 일반 공격 | 일반 스킬 |
|---|---|---|
| 분류 | ATTACK | SKILL |
| ID | 6 | 11 |
| 이름 | 철탑 사격 | 과충전 관통탄 |
| 타겟팅 | DIRECTIONAL | DIRECTIONAL |
| 사용 가능 범위 | 범위 4 — 전방 5칸 | 범위 4 — 전방 5칸 |
| 영향 범위 | 범위 4 — 전방 5칸 | 범위 4 — 전방 5칸 |
| 대상 | ENEMY — 시전자 기준 반대 진영 | ENEMY — 시전자 기준 반대 진영 |
| 효과 | 피해 12 | 피해 16 |
| 공격 전달 방식 | DIRECT | DIRECT |
| 관통 | 없음 | 있음 |
| 쿨타임 | 해당 없음 | 3 |

## 3. 작성 문법

```text
CHARACTER 6 "철탑 방위병"
CATEGORY NORMAL_ENEMY
TIME_TAG NONE
MAX_HP 55
MOVE_RANGE 2
CRITICAL_DAMAGE_RATE_PERCENT 150
NORMAL_ATTACK 6
SKILL 11
ULTIMATE_SKILL 0
STATUS_IMMUNITY NONE
```

```text
NORMAL_ATTACK 6 "철탑 사격"
CONTENT_TYPE ATTACK
ATTACK_DELIVERY DIRECT
EFFECT_TYPE DAMAGE
VALUE 12
TARGETING DIRECTIONAL
RANGE_PATTERN 4
AFFECTED_CELL_PATTERN 4
VALID_TARGET_TEAM ENEMY
```

```text
SKILL 11 "과충전 관통탄"
CONTENT_TYPE SKILL
ATTACK_DELIVERY DIRECT
DESCRIPTION "선택 방향의 직선 5칸을 관통해 범위 안의 반대 진영 캐릭터에게 피해 16을 준다."
TARGETING DIRECTIONAL
RANGE_PATTERN 4
AFFECTED_CELL_PATTERN 4
COOLDOWN 3
EFFECT NUMERIC AFFECTED_CELLS TYPE DAMAGE TARGET_TEAM ENEMY VALUE 16
```

## 4. 실행·기획 유의사항

- 낮은 이동력과 체력 대신 긴 사거리로 안전한 이동 경로를 제한하는 후방 적이다.
- 일반 공격은 비관통 직사이므로 먼저 만난 차단 대상에서 종료한다.
- 과충전 관통탄은 캐릭터와 나무 박스를 관통할 수 있지만 바위에서는 차단되는 기존 환경요소 규칙을 따른다.
- 적 AI는 여러 아군이 일렬로 들어오는 위치와 후방 안전 지점을 선호하는 방향으로 추후 연결한다. 정확한 우선순위는 적 AI 문서에서 정의한다.
- 플레이어는 일렬 배치를 피하고 차단물을 이용하거나 낮은 이동력을 이용해 접근하는 방식으로 대응한다.

## 5. 작성·확인 필요

- 캐릭터·공격·스킬 ID 6·6·11의 최종 등록 여부.
- 관통탄이 같은 범위의 모든 유효 대상을 맞히는 현재 해석의 최종 승인.
- 적 AI의 거리 유지, 사선 선택 및 목표 우선순위.

## 6. 검수·변경 기록

- 2026-09-14: 사용자 요청에 따라 기존 아군 콘텐츠 양식을 참고해 검수 필요 초안으로 작성했다.
- 수치와 행동 성향은 설계 제안이며 사용자 최종 승인 전 확정값으로 간주하지 않는다.
- 2026-09-20: 개발팀 피드백 반영으로 폐기된 전방 6칸 범위 ID 5 참조를 전방 5칸 범위 ID 4로 변경했다. 피해·관통·쿨타임은 유지했다.
