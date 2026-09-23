# 다른 컴퓨터에서 이어서 작업하기

저장소: https://github.com/hwangyksiriai/Remi-Magic

## 개발 환경 준비

Node.js 18 이상과 Git이 필요합니다. Windows와 macOS에서 아래 명령을 사용합니다.

```sh
git clone https://github.com/hwangyksiriai/Remi-Magic.git
cd Remi-Magic
npm ci
npm run check
npm run dev
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. `npm run dev`는 `dist`를 제공하므로 소스를 수정한 뒤에는 `npm run build`를 실행하고 체험 페이지를 새로고침합니다.

Git 없이 작업하려면 [소스 ZIP](https://github.com/hwangyksiriai/Remi-Magic/releases/latest/download/remi-magic-source.zip)을 풀고 프로젝트 폴더에서 `npm ci`부터 실행하세요.

## 확장 프로그램만 설치

[설치 ZIP](https://github.com/hwangyksiriai/Remi-Magic/releases/latest/download/remi-magic-extension.zip)을 풀고 Chrome의 `chrome://extensions` 또는 Edge의 `edge://extensions`에서 개발자 모드를 켭니다. **압축해제된 확장 프로그램 로드**로 `manifest.json`이 들어 있는 폴더를 선택합니다. 설치에 Node.js는 필요하지 않습니다.

직접 빌드했다면 같은 방법으로 프로젝트의 `dist` 폴더를 선택합니다. 확장 프로그램 코드를 수정한 뒤에는 빌드 → 확장 프로그램 관리에서 새로고침 → 사용 중인 웹페이지 새로고침 순으로 적용합니다.

## 현재 구현

- 160px 기본 크기의 Three.js 요술봉, 7색 14개 구슬의 움직임
- 마우스 이동 궤적·음표·별, 짧은 클릭 효과음
- 스크롤 방향에 따른 꽃잎 리듬탭 회전
- 길게 누르기 → 리듬탭 → 레미·사랑이·메이 원화 연출
- 확장 프로그램의 현재 탭 PNG 캡처, 체험 페이지의 캐릭터 카드 저장
- 캐릭터별 주문과 공통 효과음 파일을 브라우저에 넣는 기능

## 작업 파일

| 파일 | 역할 |
|---|---|
| `src/models.js` | 요술봉·리듬탭 3D 모형, 구슬 물리 |
| `src/engine.js` | 커서, 입자, 입력 이벤트, 변신 시퀀스 |
| `src/gesture.js` | 길게 누르기·드래그·취소 판정 |
| `src/audio.js` | 합성 효과음과 가져온 음성 재생 |
| `src/background.js` | 탭/포커스 검증과 PNG 저장 |
| `src/content.js` | 웹페이지에 확장 기능 연결 |
| `src/popup.js`, `popup.html` | 확장 설정 |
| `src/demo.js`, `demo.html` | 로컬 체험 및 소리 보관함 |
| `extension/manifest.json` | 확장 권한과 파일 구성 |
| `tests/` | Node.js 자동 테스트 28개 |

## 다음에 할 작업과 한계

- 소품은 절차적 3D 모형이고 캐릭터는 제공된 **2D 원화**입니다. 영상과 동일한 3D 캐릭터·의상 변신은 미구현입니다.
- 원본 성우 음성·정확한 주문·원작 음악은 포함되지 않았습니다. 현재 소리는 합성 벨이며, 별도 음성 파일을 연결할 수 있습니다.
- macOS 실기기와 설치된 Chrome/Edge의 실제 웹페이지 캡처는 추가 검증이 필요합니다. 기존 환경에서는 자동 테스트 28개와 체험 페이지의 실제 PNG 다운로드를 확인했습니다.
- 브라우저 내부 설정 페이지·확장 스토어 등 보호된 페이지와 OS 바탕화면에는 적용되지 않습니다.
- 브라우저 설정과 사용자가 등록한 음성은 `chrome.storage.local` 또는 체험 사이트의 로컬 저장소에 있습니다. Git/ZIP에 포함되지 않으므로 다른 컴퓨터에서는 다시 설정/등록합니다.

코드·문서는 MIT 라이선스이며, 캐릭터 이미지 등의 별도 권리는 `ASSET_NOTICE.md`를 확인하세요.
