# 이어서 작업하기

저장소: [hwangyksiriai/Remi-Magic](https://github.com/hwangyksiriai/Remi-Magic)

2026-09-27 변경 버전 **1.2.2**. 사용자 제공 원본 PNG 10장을 바이트 변경 없이 보관하며 최신 요청에 따라 변신 후 그림 4개의 흰 배경을 별도 파일에서 제거합니다. 표시용 파일은 원본 해상도·RGB에 다듬은 알파 마스크를 적용합니다. 원본 발췌 음성 7개는 유지합니다. docs/의 기존 공개 사이트 파일은 이전 버전이며 이번 변경에 Pages 재배포는 포함하지 않습니다.

## 준비

Node.js 22.12 이상에서 npm ci → npm run check. 체험은 npm run dev, 바탕화면 앱은 npm run desktop 또는 **바탕화면 마법사 실행.cmd**. 확장은 dist를 로드하고 업데이트 후 확장과 웹페이지를 새로고침합니다.

## 핵심 파일

| 파일 | 역할 |
|---|---|
| assets/{remi,hazuki,aiko,onpu,momoko}-{casual,transformed}.png | 사용자 원본 10장. 보관 파일의 바이트는 변경하지 않음 |
| assets/{hazuki,aiko,onpu,momoko}-transformed-cutout.png | 원본 해상도·RGB와 ImageGen 가이드로 다듬은 알파를 결합한 표시용 PNG 4장 |
| assets/character-sources.json, assets/cutout-sources.json | 원본 출처와 배경 추출본의 연결·처리 기록 |
| src/characters.js | 원본·추출본 경로, 사전 디코딩, 비율 유지 표시 |
| src/transformation.js | 평상복 → 리듬탭·빛 → 변신 후 이미지 타임라인 |
| src/engine.js, src/models.js | 3D 커서·리듬탭, 변신과 음성 종료 후 캡처 |
| src/wand-model.js, references/*-photo.png | 실제 제품 사진 기반 요술봉 모델·소품 참고 사진. 사진은 실행 에셋에 미포함 |
| src/product-lighting.js, src/showcase.js | 부드럽고 따뜻한 조명, 무거운 투영 그림자 없는 사선 3D 진열 |
| src/audio.js, src/bundled-voices.js | 원본 발췌 7개·사용자 녹음 우선·취소·완료 |
| src/voice-profiles.js | 선택 가능한 시스템 시연 음성. 원본 성우·대사와 구분 |
| assets/voices/attribution.json | 원본 음성 URL·발췌 구간·길이·SHA256 |
| src/settings.js, src/demo.js, src/popup.js | 설정·체험·음성 가져오기 |
| src/background.js | 캡처 포커스·탭·권한 검증 |
| desktop/main.mjs, desktop/preload.cjs | Electron 투명 창·트레이·제한된 IPC |
| desktop/scheduler.mjs, desktop/overlay.js | 등장 간격·취소·경계·원본 그림 이동·마법 |
| desktop/controls.*, scripts/build-desktop.mjs | 설정 창·번들·원본 assets 복사 |

## 유지해야 할 사항

- 캐릭터의 외형을 유지하는 것이 배경 추출의 목표입니다. 새 캐릭터나 관절·가상의 중간 의상 제작으로 바꾸지 않습니다. 산책은 평상복 원본 그림 전체의 이동입니다.
- 다섯 명 모두 리듬탭을 사용하며, 변신 전·후 정지 그림을 빛으로 연결합니다.
- 최신 사용자가 흰 배경 제거를 요청했으므로 이전의 배경 유지 지침은 표시용 4장에 적용하지 않습니다. 보관 원본 10장은 바꾸지 않고 *-transformed-cutout.png를 별도로 사용합니다. 도레미 변신 후와 평상복 5장은 변경하지 않습니다.
- ImageGen은 알파 가이드를 얻는 데 사용합니다. 가이드를 원본 경계에 맞게 다듬어 원본 RGB에 적용하며 생성된 얼굴·색상은 표시하지 않습니다. 해상도와 RGB는 유지하지만 알파가 바뀌므로 전체 RGBA가 원본과 동일하다고 주장하지 않습니다. 얼굴·손·의상·요술봉·외곽선과 투명 경계를 시각적으로 확인한 뒤 검증 결과를 기록합니다. 추출본의 체크무늬 합성·변신 화면 시각 검증과 원본 RGB 채널 차이 0 검사를 완료했습니다.
- 연속 중간 프레임이 없으므로 원작과 동일한 변신 안무라고 표현하지 않습니다.
- 원본 음성은 한국어 도레미·유사랑·장메이·진보라, 일본어 도레미·유사랑·나모모의 7슬롯입니다. **나모모 한국어·장메이 일본어·진보라 일본어**는 별도 자료가 필요합니다.
- 발췌에는 원본 배경음·효과음이 포함됩니다. 성우 음성만 분리하거나 합성한 것이 아닙니다. 실제 청취 비교를 완료했다고 주장하지 않습니다.
- 사용자 음성 가져오기는 기본 발췌를 덮어쓰고 삭제하면 기본값이 복구됩니다. 시스템 시연은 기본 꺼짐입니다.

브라우저 사용자 녹음·Electron 사용자 설정·desktop/artifacts/smoke-profile은 배포하지 않습니다. 데스크톱 검증은 npx electron desktop/main.mjs --smoke-test; 결과 PNG와 원본 해시는 desktop/artifacts/에 저장됩니다.

나모모 원본의 하단 표기는 보관 원본과 최종 표시용 추출본 모두에 유지합니다. 파생 파일의 출처 관계와 마스크 처리 방식은 assets/cutout-sources.json과 ASSET_NOTICE.md에서 확인할 수 있게 합니다.

npm run check의 테스트 84개와 브라우저·데스크톱 빌드는 통과했습니다. 소품의 실제 렌더에서 무거운 투영 그림자가 사라지고 부드러운 따뜻한 조명이 적용된 것을 확인했습니다. 데스크톱 2D 리듬탭도 케이스·그림자·구슬 가장자리의 어두운 부분을 완화했습니다. 네 추출본의 체크무늬 합성과 실제 변신 화면, 장메이 카드 저장, 모바일 표시를 확인했습니다. 새 에셋을 포함한 Windows Electron 스모크 테스트도 통과했습니다.

실제 설치한 확장의 탭 PNG 다운로드, 물리 마우스 클릭 통과, 스피커 출력·원본 음색 비교, macOS는 별도 확인 대상입니다. [요청 대비 차이](IMPLEMENTATION_NOTES.md)와 [에셋 안내](ASSET_NOTICE.md)를 함께 읽어 주세요.
