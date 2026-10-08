# Waredo 2.0 캐릭터 콘텐츠 변수 정의 및 연결표

> 결정 상태: [확정] — 사용자 변수 통합 문서 작성·기존 인덱스 교체 요청
> 검수 상태: 주 작업자 자체 검토
> 최근 수정일: 2026-09-20
> 목적: 캐릭터 콘텐츠에 무엇을 어떤 값으로 작성하고 어느 기획서를 따라야 하는지 한곳에서 확인한다.
> 기존 문서: 캐릭터 콘텐츠 인덱스를 이 문서로 교체했다. 기존 정수 ID 등록은 8장에 보존한다.

## 1. 문서 사용 기준

- 이 문서는 변수·입력 문법·원본 기획서의 연결 사전이다. 기능·실행 규칙은 연결된 시스템, 실제 콘텐츠 값은 각 캐릭터 문서, 문법과 빈 양식은 [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md)가 단일 원본이다.
- 표의 변수명은 기존 기획서의 식별자를 사용한다. 이름·설명·관통 등 별도 식별자가 없는 항목은 현재 문서의 입력 항목 이름으로 표시한다.
- 캐릭터 표의 분류 CATEGORY와 공격·스킬 표의 분류 CONTENT_TYPE은 다른 값이다.
- ID는 int다. 범위 없음은 등록 ID 9를 참조한다. 적의 궁극기처럼 범위 외 선택 참조의 없음은 기존 0 규칙을 따른다. 미정은 [작성 필요]이며 없음으로 대신하지 않는다.
- int는 정수, float는 소수 허용 수치, string은 표시 문장, bool은 true/false, enum은 정해진 선택지다. 자세한 단위는 [공통 자료형 규칙](../문서관리/Waredo_2.0_기획_조정값_통합표.md#공통-자료형-규칙)을 따른다.
- 이름이나 설명의 숫자로 효과를 추정하지 않는다. 수치·범위·효과 순서·관통은 해당 입력 항목으로 확인한다.

## 2. 캐릭터 기본 정보

| 표 항목 | 변수·작성 문법 | 자료형 | 허용값·작성 조건 | 원본 기획서 |
|---|---|---|---|---|
| 캐릭터 ID | characterId / CHARACTER의 ID | int | 1 이상, 캐릭터 정의 안에서 중복 불가. 전투 개체 ID와 구별 | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 이름 | CHARACTER의 따옴표 안 이름 | string | 표시 이름. ID로 사용하지 않음 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 분류 | characterCategory / CATEGORY | enum | NORMAL_ENEMY / BOSS_ENEMY / ALLY | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 시간대 태그 | timeTag / TIME_TAG | enum | 아군 PAST 또는 FUTURE, 적 NONE | [캐릭터 4-1-3](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 최대 체력 | maxHp / MAX_HP | int | 1 이상. 보정 전 기본값 | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 이동력 | moveRange / MOVE_RANGE | int | 0 이상, 셀 거리. 현재 이동 경로와 구별 | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 치명타 피해율 | criticalDamageRatePercent / CRITICAL_DAMAGE_RATE_PERCENT | int (%) | 0 이상, 기본 150. 150은 150%이며 확률이 아님 | [캐릭터 4-1-2](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 일반 공격 ID | characterNormalAttackId / NORMAL_ATTACK | int | 등록된 일반 공격 1개. 연결 정의는 ATTACK | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 일반 스킬 ID | characterSkillId / SKILL | int | 등록된 일반 스킬 1개. 연결 정의는 SKILL | [캐릭터 4-1-1](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 각성·궁극기 ID | characterUltimateSkillId / ULTIMATE_SKILL | int | 아군은 ULTIMATE 정의 참조. 적은 0 | [캐릭터 4-1-3·6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 상태이상 면역 태그 | statusImmunityTags / STATUS_IMMUNITY | enum 목록 | AIRBORNE / STUN / PUSH / PULL. 면역 없으면 NONE으로 표시 | [캐릭터 4-1-4](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |

- 일반 공격력·스킬 공격력을 캐릭터 기본 표에 별도 원본으로 중복 입력하지 않는다. 아래 공격·효과 정의의 값을 참조한다.
- 기본 면역은 캐릭터 콘텐츠, 유물이 추가하는 면역은 유물 효과가 소유한다. 최종 면역은 적용 시점의 상태이상 규칙을 따른다.

## 3. 공격·스킬·궁극기 기본 정보

| 표 항목 | 변수·작성 문법 | 자료형 | 허용값·작성 조건 | 원본 기획서 |
|---|---|---|---|---|
| 분류 | contentType / CONTENT_TYPE | enum | ATTACK / SKILL / ULTIMATE. 궁극기는 스킬 정의 형식 사용 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| ID | normalAttackId 또는 skillId / 정의 첫 줄 ID | int | 1 이상. 공격 ID와 스킬 ID는 종류별 관리, 스킬·궁극기는 같은 ID 집합 | [캐릭터 4-1-5](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-3-일반-공격-정의-규칙) · [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 이름 | NORMAL_ATTACK 또는 SKILL의 따옴표 안 이름 | string | 표시 이름 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 설명 | DESCRIPTION | string | 스킬의 효과·사용 목적. 숫자와 효과 행이 일치해야 함 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 타겟팅 | normalAttackTargetingType 또는 skillTargetingType / TARGETING | enum | DIRECTIONAL / SELF_CENTERED / TILE_SELECT. 스킬·궁극기는 SELF_BUFF도 허용 | [캐릭터 4-1-5](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-3-일반-공격-정의-규칙) · [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 사용 가능 범위 | normalAttackRangePatternId 또는 skillRangePatternId / RANGE_PATTERN | int | 통합 범위 ID. 현재 일반 공격은 빈 범위 불가, 자가 버프는 6 | [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md) |
| 영향 범위 | normalAttackAffectedCellPatternId 또는 skillAffectedCellPatternId / AFFECTED_CELL_PATTERN | int | 실제 효과 대상 탐색 범위. 자가 버프의 별도 영향 범위 없음은 9 | [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md) |
| 범위 설명 | 범위 설명(표 항목) | 표시 설명 | 연결된 범위 데이터 요약. 별도 사거리 수치 원본 아님 | [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md) |
| 일반 공격 대상 | normalAttackValidTargetTeam / VALID_TARGET_TEAM | enum | ENEMY / ALLY / ALL. 시전자 진영을 기준으로 판단 | [캐릭터 4-1-5](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-3-일반-공격-정의-규칙) |
| 일반 공격 효과 종류 | normalAttackEffectType / EFFECT_TYPE | enum | DAMAGE / HEAL | [캐릭터 4-1-5-5](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-5-피해회복-수치-효과) |
| 일반 공격력·회복 수치 | normalAttackValue / VALUE | int | 0 이상, 보정 전 값. 피해·회복 용도는 EFFECT_TYPE으로 결정 | [캐릭터 4-1-5](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-3-일반-공격-정의-규칙) |
| 공격 전달 방식 | attackDeliveryType / ATTACK_DELIVERY | enum | DIRECT / AREA / NONE. NONE은 자가 버프 등 전달 자체가 없는 경우 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) · [전투 4-1-6·7](../시스템/Waredo_2.0_전투_시스템_기획서.md) |
| 관통 | 관통(표 항목) | bool 적용값 + 작성 상태 | 있음=true, 없음=false. 적용 대상이 아니면 해당 없음, 미정이면 [작성 필요]. 별도 문법 키는 현재 없음 | [문법 1.4](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) · [환경요소 4-1-2](../시스템/Waredo_2.0_환경요소_시스템_기획서.md) |
| 쿨타임 | cooldownMax / COOLDOWN | int | 스킬·궁극기 1 이상, 같은 캐릭터의 둘은 동일. 일반 공격은 해당 없음 | [캐릭터 4-1-6·전투 쿨타임](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) · [전투 4-1-7](../시스템/Waredo_2.0_전투_시스템_기획서.md) |
| 스킬 효과·순서 | skillEffects / EFFECT 행 순서 | 효과 목록 | 1개 이상, 작성한 위→아래 순서. 다단 효과도 순서대로 작성 | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 치명타 | 치명타(표 설명) | 규칙 참조 | 피해 직전 상태 기반 판정. 새 bool 스위치·확률을 넣지 않음. 회복에는 피해 치명타 미적용 | [캐릭터 4-1-2](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) · [상태이상 4-1~7](../시스템/Waredo_2.0_상태이상_시스템_기획서.md) |
| 반격 범위 | counterRangePatternId / EFFECT COUNTER의 RANGE_PATTERN | int | COUNTER는 비어 있지 않은 범위 필수. 반격이 없는 표 칸은 9 | [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) · [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md) |
| 반격 시 기절 | counterAppliesStun / APPLY_STUN | bool | COUNTER 효과에 true 또는 false. 반격이 없는 표 칸은 해당 없음 | [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) |

## 4. 스킬 효과 한 줄의 변수

| 항목 | 변수·문법 | 자료형 | 허용값·작성 조건 | 원본 기획서 |
|---|---|---|---|---|
| 소속 스킬 | skillId / 효과 표의 스킬 ID | int | 같은 SKILL 정의의 ID로 연결 | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 효과 순서 | 효과 순서(표 항목) | int | 같은 스킬 안 1부터 순서대로. 문법에서는 EFFECT 행 순서로 표현 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 효과 종류 | skillEffects 각 행의 EFFECT | enum | NUMERIC / PUSH / PULL / AIRBORNE / STUN / COUNTER | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 효과 대상 범위 | effectTargetScope / EFFECT 뒤 범위 | enum | SELECTED_CELL / AFFECTED_CELLS / SELF. 효과 종류별 허용 조합 유지 | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 효과 대상 진영 | effectTargetTeam / TARGET_TEAM | enum | ENEMY / ALLY / ALL. COUNTER SELF는 대상 진영 인자를 따로 쓰지 않음 | [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 피해·회복 용도 | numericEffectType / TYPE | enum | NUMERIC 행에 DAMAGE 또는 HEAL | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 스킬 공격력·회복 수치 | numericEffectValue / VALUE | int | NUMERIC 행에 0 이상. 각 타격·효과의 기본 수치 | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| 강제 이동 거리 | forcedMoveDistance / DISTANCE | int | PUSH·PULL에 0 이상. 방향 선택형에서만 사용 | [상태이상 4-1~7](../시스템/Waredo_2.0_상태이상_시스템_기획서.md) · [작성 문법 1장](../문서관리/Waredo_2.0_캐릭터_스킬_공격_관리표.md) |
| 반격 발동 범위 | counterRangePatternId / RANGE_PATTERN | int | COUNTER SELF의 발동 감지 범위. 사용 가능·영향 범위와 별개 | [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) |
| 반격 시 기절 여부 | counterAppliesStun / APPLY_STUN | bool | COUNTER에만 작성. 성공한 반격의 대상에게 기절 적용 여부 | [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) |
| 발동 조건 | effectTriggerCondition / 발동·지속 조건 참조 | 규칙 참조 | 해당 효과·전투 실행의 발동 시점. 임의 트리거 enum을 추가하지 않음 | [캐릭터 4-1-6](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) · [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) |
| 지속·해제 | effectDurationRule / 발동·지속 조건 참조 | 규칙 참조 | 상태별 행동·턴 기준을 따름. 별도 지속 턴을 임의 입력하지 않음 | [상태이상 4-1~7](../시스템/Waredo_2.0_상태이상_시스템_기획서.md) · [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) |

- NUMERIC은 대상 범위·진영·TYPE·VALUE를 작성한다.
- PUSH·PULL은 AFFECTED_CELLS·대상 진영·DISTANCE를 작성한다.
- AIRBORNE·STUN은 AFFECTED_CELLS·대상 진영을 작성한다. 별도 수치·확률·거리 필드를 만들지 않는다.
- COUNTER는 SELF·반격 범위 ID·APPLY_STUN을 작성하며 SELF_BUFF 유형에서 사용한다.
- SELF_CENTERED 스킬은 수치 효과를 하나 이상 포함한다. 효과별 실패·면역·중단이 다른 효과를 취소하는지는 원본 실행 규칙을 따른다.

## 5. enum 값 찾아보기

| 입력 항목 | 문법 enum | 뜻 | 조건 |
|---|---|---|---|
| CATEGORY | NORMAL_ENEMY / BOSS_ENEMY / ALLY | 일반 적 / 보스 적 / 아군 | 캐릭터 분류 |
| TIME_TAG | PAST / FUTURE / NONE | 과거 / 미래 / 시간대 태그 없음 | 아군은 과거·미래, 적은 없음 |
| CONTENT_TYPE | ATTACK / SKILL / ULTIMATE | 공격 / 스킬 / 궁극기 | 정의 ID와 함께 사용 |
| TARGETING | DIRECTIONAL | 방향 선택형 | 상·하·좌·우 중 하나 선택 |
| TARGETING | SELF_CENTERED | 자기 기준형 | 시전자 중심 범위 확정 |
| TARGETING | TILE_SELECT | 셀 선택형 | 선택 셀의 시전자 기준 상대 위치를 계획 |
| TARGETING | SELF_BUFF | 자가 버프형 | 스킬·궁극기에서 자신에게 효과 |
| ATTACK_DELIVERY | DIRECT | 직사 | 기존 직사 차단·관통 규칙 적용 |
| ATTACK_DELIVERY | AREA | 범위 적용 | 영향 셀 안 유효 대상에게 효과 |
| ATTACK_DELIVERY | NONE | 공격 전달 없음 | 반격 상태 부여 등. 미정 표시 아님 |
| EFFECT_TYPE / TYPE | DAMAGE / HEAL | 피해 / 회복 | 숫자는 별도 VALUE |
| VALID_TARGET_TEAM / TARGET_TEAM | ENEMY / ALLY / ALL | 적 / 아군 / 양쪽 | 시전자 기준, 환경요소의 진영을 만드는 값 아님 |
| effectTargetScope | SELECTED_CELL / AFFECTED_CELLS / SELF | 선택 셀 / 영향 셀 / 자신 | 효과별 기존 허용 문법 적용 |
| EFFECT | NUMERIC / PUSH / PULL / AIRBORNE / STUN / COUNTER | 수치 효과 / 밀치기 / 당기기 / 띄워짐 / 기절 / 반격 | 세부 입력은 4장 |
| STATUS_IMMUNITY | AIRBORNE / STUN / PUSH / PULL | 각 효과의 면역 태그 | 여러 태그 가능. 면역 없음은 NONE 표시 |

- 시스템 본문의 Directional·SelfCentered·TileSelect·SelfBuff와 문법의 DIRECTIONAL·SELF_CENTERED·TILE_SELECT·SELF_BUFF는 같은 항목이다. 다른 enum을 새로 만든 것이 아니다.
- [작성 필요]·해당 없음은 작성 상태 표기이며 실제 enum 선택지가 아니다.
- NONE 전달, NONE 면역 표시, 범위 없음 ID 9, 자기 셀 ID 6은 의미가 다르다.

## 6. 함께 연결할 기획서

| 확인할 관계 | 따라갈 원본 | 확인할 내용 |
|---|---|---|
| 선택 범위 → 실제 영향 범위 | [캐릭터 4-1-5-4](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md#4-1-5-4-사용-가능-범위와-영향-범위) · [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md) | 범위 역할·원점·회전·좌표·빈 범위 구분 |
| 공격 전달 → 환경요소 | [환경요소 4-1-2](../시스템/Waredo_2.0_환경요소_시스템_기획서.md) | 비관통 직사는 박스에서 종료, 관통도 바위에서 차단. 환경요소 무효 효과는 원본 참조 |
| 피해·회복 → 보정 | [캐릭터 4-1-2](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) · [유물 4-3-4](../시스템/Waredo_2.0_가방_유물_시스템_기획서.md) | 회복도 피해 보정. 일반 공격·스킬·둘 다의 적용 조건 유지 |
| 시간대 태그 → 활성 스킬 | [캐릭터 4-1-3](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) · [시간대 시스템](../시스템/Waredo_2.0_시간대_전환_시스템_기획서.md) | 태그 일치 시 궁극기, 일반 스킬과 남은 쿨타임 공유 |
| 상태 부여 → 면역·교체·해제 | [상태이상 4-1~7](../시스템/Waredo_2.0_상태이상_시스템_기획서.md) | 띄워짐·기절 후속 교체, 밀치기·당기기 위치 변경, 면역 추가 시 기존 해당 상태 제거 |
| 반격 상태 → 실제 반격 | [전투 4-1-8](../시스템/Waredo_2.0_전투_시스템_기획서.md#4-1-8-반격) | 발동 시점·범위·대상별 제한·피해·기절·중단 |
| 계획 → 실제/가상 실행 | [전투 4-1-4~9](../시스템/Waredo_2.0_전투_시스템_기획서.md) | 이동 후 실제 위치에서 실행, 미지정 행동 없음, 가상 결과는 실제 상태 미변경 |

## 7. 콘텐츠 입력이 아닌 표시·상태 항목

| 항목 | 자료형·성격 | 관리 기준·연결 |
|---|---|---|
| characterInstanceId | int · 전투 개체 ID | 기본 정의 characterId와 별개. [캐릭터 4-1-7·9](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| currentHp / cooldownRemaining | int · 현재 상태 | 현재 체력·남은 쿨타임은 전투 중 상태. 콘텐츠 기본값과 중복 입력 금지 |
| activeSkillId | int · 파생 | 시간대와 캐릭터 태그로 결정. 캐릭터 정의에 별도 입력하지 않음 |
| effectiveMaxHp / effectiveMoveRange / effectiveCooldownMax | int · 보정 결과 | 기본값과 보정으로 산출. [캐릭터 4-1-2](../시스템/Waredo_2.0_캐릭터_시스템_기획서.md) |
| effectiveCriticalDamageRatePercent / finalDamage / isCritical | float (%) / int / bool · 계산·판정 | 피해 직전 조건과 보정 결과. 콘텐츠 입력값 아님 |
| targetDirection / relativeTargetOffset / movePath | enum / 정수 좌표 / 좌표 목록 · 계획 | 플레이어·AI의 행동 입력. [전투 4-1-4·5](../시스템/Waredo_2.0_전투_시스템_기획서.md) |
| activeStatusEffects / counterState | 전투 상태 | 상태이상·반격 시스템이 관리 |
| 범위 설명·효과 순서 요약·치명타 가능 설명 | 표시용 설명 | 원본 ID·효과 행·공통 규칙을 요약. 별도 기능 값으로 해석하지 않음 |
| 결정 상태·검수 상태·책임자·날짜·관련 문서·확정 범위 | 문서 관리 정보 | 캐릭터 콘텐츠 데이터가 아님. 기존 문서 양식 참조 |
| 이전 DAMAGE / EFFECT DAMAGE | 기존 피해형 호환 문법 | VALUE / EFFECT NUMERIC TYPE DAMAGE에 대응. 기존 수치·대상·순서 유지 |
| 이전 CAN_CRITICAL | bool 형태의 기존 호환 표기 | 신규 입력 스위치가 아님. 상태 기반 판정 규칙을 바꾸지 않음 |

## 8. 등록된 콘텐츠 ID

- 기존 인덱스의 실제 ID 연결은 아래에 보존한다. 별도 표시 인덱스·영문 ID 키는 사용하지 않는다.
- ID는 정의 종류별로 중복 불가, 삭제한 ID는 재사용하지 않는다. 일반 스킬·궁극기는 같은 ID 집합을 사용한다.
- 범위 ID·좌표 등록은 [통합 범위 3·4장](../시스템/Waredo_2.0_통합_범위_데이터_시스템.md)가 소유한다. 과거 영문 ID 대응은 Git 이력에서 확인한다.

| 캐릭터 ID | 콘텐츠 문서 | 공격 ID (ATTACK) | 스킬 ID (SKILL) | 궁극기 ID (ULTIMATE) |
|---|---|---|---|---|
| 1 | [아이작](Waredo_2.0_아이작_캐릭터_콘텐츠_테이블.md) | 1 | 1 | 2 |
| 2 | [안젤리카](Waredo_2.0_안젤리카_캐릭터_콘텐츠_테이블.md) | 2 | 3 | 4 |
| 3 | [아르제나](Waredo_2.0_아르제나_캐릭터_콘텐츠_테이블.md) | 3 | 5 | 6 |
| 4 | [클로이](Waredo_2.0_클로이_캐릭터_콘텐츠_테이블.md) | 4 | 7 | 8 |
| 5 | [야나](Waredo_2.0_야나_캐릭터_콘텐츠_테이블.md) | 5 | 9 | 10 |

### 8.1 `[검수필요]` 적 캐릭터 임시 ID 예약

- 다음 ID는 사용자 요청으로 `확정/콘텐츠`에 우선 등록한 검수 필요 문서에서 사용한다.
- 검수 완료 전 공식 구현 ID로 간주하지 않는다. 최종 승인 시 이 표의 상태를 실제 ID 등록으로 변경하고 각 문서의 임시 배정 표시를 제거한다.

| 상태 | 캐릭터 ID | 콘텐츠 문서 | 공격 ID (ATTACK) | 스킬 ID (SKILL) | 궁극기 ID (ULTIMATE) |
|---|---:|---|---:|---:|---:|
| `[검수필요]` | 6 | [철탑 방위병](%5B검수필요%5D_Waredo_2.0_철탑_방위병_캐릭터_콘텐츠_테이블.md) | 6 | 11 | 0 |
| `[검수필요]` | 7 | [신성 창병](%5B검수필요%5D_Waredo_2.0_신성_창병_캐릭터_콘텐츠_테이블.md) | 7 | 12 | 0 |
| `[검수필요]` | 8 | [신성 방패병](%5B검수필요%5D_Waredo_2.0_신성_방패병_캐릭터_콘텐츠_테이블.md) | 8 | 13 | 0 |
| `[검수필요]` | 9 | [휘령수정령](%5B검수필요%5D_Waredo_2.0_휘령수정령_캐릭터_콘텐츠_테이블.md) | 9 | 14 | 0 |
| `[검수필요]` | 10 | [흐림지기](%5B검수필요%5D_Waredo_2.0_흐림지기_캐릭터_콘텐츠_테이블.md) | 10 | 15 | 0 |
| `[검수필요]` | 11 | [타락한 성기사](%5B검수필요%5D_Waredo_2.0_타락한_성기사_캐릭터_콘텐츠_테이블.md) | 11 | 16 | 0 |

## 9. 기획 시 확인사항

- 캐릭터의 참조 ID와 CONTENT_TYPE이 일치하는지 확인한다.
- TARGETING·ATTACK_DELIVERY·피해/회복·관통·대상 진영을 서로 대신하는 값으로 쓰지 않는다.
- 효과별 VALUE·DISTANCE·범위 ID·조건을 구분하고 다단 효과의 순서를 유지한다.
- 범위 참조의 null·0·빈칸 대신 등록된 범위 없음 9를 사용한다. 실제로 필요한 범위가 미정이면 [작성 필요]다.
- 일반 스킬·궁극기의 쿨타임은 동일하게 작성한다.
- 아직 정하지 않은 관통·연속 사격·추가 범위·지속·확률은 임의로 확정하지 않는다. 원본의 해결된 항목만 확인 필요 목록에서 제거한다.
- 대각선 이동·대각선 충돌의 취소선 처리 상태는 그대로 유지한다. 범위 그림이 해당 이동 기능을 활성화하지 않는다.
- 참고 문서 관리·검수 규칙은 [제안] 상태다. 이 문서의 검토는 입력 항목·참조의 자체 검토이며 실제 게임 실행 검수를 대신하지 않는다.
