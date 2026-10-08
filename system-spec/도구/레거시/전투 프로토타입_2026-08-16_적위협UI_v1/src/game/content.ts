import type { SavedContent } from './types'
import { parseCharacter, parseSkill } from './parser'

export const characterExamples = {
  ally:`캐릭터: 여명검 라온
ID: raon
진영: 아군
타입: 계승자
최대체력: 34
공격력: 8
이동력: 4
치명타피해율: 150
일반공격: 검격
공격방식: 대상
공격사거리: 1
공격범위패턴: 마름모_1
스킬: shield_crash
색상: #55c7e8
상태면역: 없음`,
  enemy:`캐릭터: 황혼의 고르
ID: gor
진영: 적군
타입: 기술자
최대체력: 40
공격력: 7
이동력: 3
치명타피해율: 150
일반공격: 철퇴
공격방식: 대상
공격사거리: 1
공격범위패턴: 마름모_1
스킬: iron_pull
색상: #e2665c
상태면역: 없음`,
  isaac:`캐릭터: 아이작
ID: isaac
진영: 아군
타입: 각성자
최대체력: 60
공격력: 10
이동력: 3
치명타피해율: 150
일반공격: 기본 공격
공격방식: 방향
공격사거리: 1
공격범위패턴: 직선_1
스킬: uppercut
색상: #62c6d8
상태면역: 없음`,
  angelica:`캐릭터: 안젤리카
ID: angelica
진영: 아군
타입: 계승자
최대체력: 30
공격력: 20
이동력: 3
치명타피해율: 150
일반공격: 기본 공격
공격방식: 대상
공격사거리: 3
공격범위패턴: 마름모_3
스킬: snipe
색상: #e1b769
상태면역: 없음`,
  mercan:`캐릭터: 메르칸
ID: mercan
진영: 아군
타입: 기술자
최대체력: 50
공격력: 15
이동력: 3
치명타피해율: 150
일반공격: 기본 공격
공격방식: 대상
공격사거리: 1
공격범위패턴: 사각형_1
스킬: big_shotgun
색상: #7fdb9d
상태면역: 없음`,
}

export const skillExamples = {
  push:`스킬: 방패 충각
ID: shield_crash
설명: 직선의 대상을 타격하고 뒤로 밀어냅니다.
방식: 방향
사거리: 2
범위패턴: 직선_2
영향셀패턴: 직선_2
쿨타임: 2
치명타: 불가
효과: 피해 | 적용: 영향셀 | 대상: 적군 | 수치: 5
효과: 밀치기 | 적용: 영향셀 | 대상: 적군 | 거리: 2`,
  airborne:`스킬: 중력 반전
ID: gravity_flip
설명: 먼 적을 띄워 다음 공격의 치명타 조건을 만듭니다.
방식: 대상
사거리: 4
범위패턴: 마름모_4
영향셀패턴: 없음
쿨타임: 2
치명타: 가능
효과: 피해 | 적용: 선택대상 | 대상: 적군 | 수치: 4
효과: 띄우기 | 적용: 선택대상 | 대상: 적군`,
  stun:`스킬: 시계추 낙하
ID: pendulum_drop
설명: 직선의 대상을 기절시켜 이번 턴 행동을 건너뜁니다.
방식: 방향
사거리: 3
범위패턴: 직선_3
영향셀패턴: 직선_3
쿨타임: 3
치명타: 가능
효과: 피해 | 적용: 영향셀 | 대상: 적군 | 수치: 6
효과: 기절 | 적용: 영향셀 | 대상: 적군`,
  pull:`스킬: 철선 회수
ID: iron_pull
설명: 직선의 대상을 끌어당겨 다음 행동을 준비합니다.
방식: 방향
사거리: 3
범위패턴: 직선_3
영향셀패턴: 직선_3
쿨타임: 2
치명타: 불가
효과: 피해 | 적용: 영향셀 | 대상: 적군 | 수치: 3
효과: 당기기 | 적용: 영향셀 | 대상: 적군 | 거리: 2`,
  uppercut:`스킬: 어퍼컷
ID: uppercut
설명: 전방 직선 2칸의 적을 타격해 띄웁니다.
방식: 방향
사거리: 2
범위패턴: 직선_2
영향셀패턴: 직선_2
쿨타임: 2
치명타: 불가
효과: 피해 | 적용: 영향셀 | 대상: 적군 | 수치: 15
효과: 띄우기 | 적용: 영향셀 | 대상: 적군`,
  snipe:`스킬: 저격
ID: snipe
설명: 상하좌우로 연결된 마름모 4칸 안의 적 하나를 저격합니다.
방식: 대상
사거리: 4
범위패턴: 마름모_4
영향셀패턴: 없음
쿨타임: 2
치명타: 가능
효과: 피해 | 적용: 선택대상 | 대상: 적군 | 수치: 20`,
  bigShotgun:`스킬: 빅샷건
ID: big_shotgun
설명: 전방 직선 3칸의 적을 2칸 밀어냅니다.
방식: 방향
사거리: 3
범위패턴: 직선_3
영향셀패턴: 직선_3
쿨타임: 2
치명타: 불가
효과: 밀치기 | 적용: 영향셀 | 대상: 적군 | 거리: 2`,
}

export const seedContent:SavedContent={
  skills:Object.values(skillExamples).map(parseSkill),
  characters:[
    {id:'gor',name:'황혼의 고르',team:'적군',type:'기술자',maxHp:40,attackPower:7,moveRange:3,criticalRate:150,normalAttack:{name:'철퇴',targeting:'대상',range:1,rangePatternId:'마름모_1'},skillId:'iron_pull',color:'#e2665c',immunities:[],source:characterExamples.enemy},
    {id:'sera',name:'붉은 사제 세라',team:'적군',type:'각성자',maxHp:28,attackPower:7,moveRange:3,criticalRate:150,normalAttack:{name:'적광',targeting:'대상',range:3,rangePatternId:'마름모_3'},skillId:'pendulum_drop',color:'#e38c69',immunities:[],source:`캐릭터: 붉은 사제 세라\nID: sera\n진영: 적군\n타입: 각성자\n최대체력: 28\n공격력: 7\n이동력: 3\n치명타피해율: 150\n일반공격: 적광\n공격방식: 대상\n공격사거리: 3\n공격범위패턴: 마름모_3\n스킬: pendulum_drop\n색상: #e38c69\n상태면역: 없음`},
    parseCharacter(characterExamples.isaac),
    parseCharacter(characterExamples.angelica),
    parseCharacter(characterExamples.mercan),
  ]
}
