# VESTIGIA UI Wireframe

2D 턴제 전략 게임 **VESTIGIA**의 인게임 UI/UX 와이어프레임을 리팩터링하고, 실제 플레이 흐름을 검증할 수 있는 프로토타입을 설계하는 작업 공간입니다.

## 우선순위

1. 플레이어의 판단과 조작 흐름이 명확한가
2. 전투 정보의 위계와 화면 배치가 합리적인가
3. 선택, 행동, 타겟팅, 확인/취소, 결과 상태가 충분히 표현되는가
4. 아트와 개발이 구현 구조를 이해할 수 있는가
5. 반복 UI에 필요한 수준으로만 컴포넌트와 오토레이아웃을 정리했는가

## 기본 작업 흐름

현재 Figma 화면 진단 → 필요한 상태 프레임 정의 → 프로토타입 연결 → 정보 위계와 배치 개선 → 컴포넌트 정리 → 아트/개발 핸드오프

Figma 파일이나 프레임 링크가 연결되면 기존 화면을 먼저 읽고, 수정 전에 진단 결과와 변경 범위를 정리합니다.

## 현재 작업: 전투 화면 읽기 전용 진단

사용자가 Figma를 직접 수정합니다. 별도 수정 요청 전까지 Figma에는 어떠한 편집도 하지 않습니다.

- [전투 화면 비교·누락 분석](analysis/전투_UI_누락_분석_2026-09-23.md): 추가 화면 우선순위, 기존 화면 보완, 기획서와 프로토타입 차이.
- [Figma 조회 기록](analysis/figma-readonly-inventory.json): 화면별 자식 레이어, 숨김 상태, 내부 프로토타입 연결.
- [HTML 정적 분석 근거](analysis/prototype-evidence.md): 첨부 원본의 함수·UI 발췌. 브라우저 실행 검증과 구별합니다.
- 기준 Figma: [인게임_전투](https://www.figma.com/design/EnCDeN7hohOA5p8rE2rsNA?node-id=0-1).
- 기획서 사본: `system-spec/` — [원격 저장소](https://github.com/ss1218s/Waredo-2.0), 분석 당시 HEAD `0f3b23f59ea51f294a9c1db636d80b5abe4b2c44`와 일치.
- 비교 프로토타입: [전투 프로토타입 최종.html](references/전투%20프로토타입%20최종.html).

이전 작업의 기획서 사본은 변경 사항이 없는 상태라 그대로 재사용했습니다. 원본 기획서와 첨부 HTML은 수정하지 않았습니다.

## 다른 컴퓨터에서 이어서 작업하기

이 저장소에는 명세서, 이전 버전, 분석 자료, 참고 기획서 사본과 문서 작성·검수 작업 자료가 함께 들어 있습니다. `system-spec/`은 참고 기획서의 파일 사본으로 포함되어 있어 별도 저장소를 받을 필요가 없습니다.

Git을 사용하는 경우 다음과 같이 받습니다.

```text
git clone https://github.com/smin12305/vestigia-ui-wireframe.git
cd vestigia-ui-wireframe
```

GitHub의 **Code → Download ZIP**으로 전체 파일을 내려받아도 됩니다. 비공개 저장소이므로 접근 가능한 GitHub 계정으로 로그인해야 합니다.

현재 편집할 문서는 `docs/`의 공통 명세서 v0.0.1, 전투 UI 명세서 v0.0.1, 가방 UI 명세서 초안 v0.5.0입니다. 전투 v0.0.1은 2.4까지 보존하고 v0.9.1의 B00~B13 내용을 공통 기준으로 이관한 초안이며, 추가 결정이 필요한 항목은 문서에 표시되어 있습니다. `docs/old/`는 이전 버전, `outputs/`는 작성·검수 작업 자료입니다.

작업 시작 전에 최신 파일을 받고, 작업 후에는 Word 문서를 저장·닫은 뒤 변경 파일을 올립니다. 같은 Word 파일을 여러 컴퓨터에서 동시에 수정하지 않도록 합니다.

```text
git pull
git add .
git commit -m "Update UI specifications"
git push
```

Figma 작업은 README의 Figma 링크에서 이어갑니다. 이 저장소에는 Figma 조회·분석 자료와 명세서 이미지가 포함되어 있습니다.
