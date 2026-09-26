# Artwork and third-party notices · 1.2.2

The MIT license in LICENSE covers this project's original code and documentation. It does not grant rights to third-party characters, designs, names, trademarks, voice performances, music, or source recordings. This is an unofficial *Ojamajo Doremi* fan project.

## 사용자 제공 캐릭터 원본

사용자가 제공한 다음 PNG **10장**을 수정 없이 보관합니다. 평상복 5장과 이미 투명한 도레미 변신 후 그림은 그대로 표시하며, 나머지 변신 후 4장은 아래의 별도 배경 추출본을 표시합니다.

| 캐릭터 | 평상복 원본 | 변신 후 원본 |
|---|---|---|
| 도레미 | assets/remi-casual.png | assets/remi-transformed.png |
| 장메이 | assets/hazuki-casual.png | assets/hazuki-transformed.png |
| 유사랑 | assets/aiko-casual.png | assets/aiko-transformed.png |
| 진보라 | assets/onpu-casual.png | assets/onpu-transformed.png |
| 나모모 | assets/momoko-casual.png | assets/momoko-transformed.png |

위 보관 원본의 바이트와 배경은 변경하지 않습니다. 최신 사용자 요청에 따라 표시용 파일의 흰 배경을 제거하며, 이전의 표시 배경 유지 지침은 적용하지 않습니다. 기존 assets/remi.png, assets/aiko.png, assets/hazuki.png는 현재 표시 경로와 별개의 이전 파일입니다.

These source images and their derived cutouts in built packages are **excluded from the MIT license**. Rights remain with their respective owners; no separate open license for the supplied artwork was provided. Articulated character rigs are not part of the current implementation.

## 표시용 배경 추출본

ImageGen 내장 배경 추출은 알파 가이드를 얻는 데 사용합니다. 가이드를 원본 경계에 맞게 다듬고 원본 해상도의 RGB에 적용하므로, 표시용 파일에 생성된 얼굴이나 색상을 사용하지 않습니다. 원본 해상도와 RGB는 유지하지만 알파가 달라 전체 RGBA가 원본과 픽셀 단위로 동일하다고 표시하지 않습니다. 원본과 파생본의 출처·알파 처리 관계는 [cutout-sources.json](assets/cutout-sources.json)에 기록합니다.

| 캐릭터 | 표시용 변신 후 이미지 |
|---|---|
| 도레미 | assets/remi-transformed.png · 기존 투명 원본 |
| 장메이 | assets/hazuki-transformed-cutout.png |
| 유사랑 | assets/aiko-transformed-cutout.png |
| 진보라 | assets/onpu-transformed-cutout.png |
| 나모모 | assets/momoko-transformed-cutout.png |

나모모 원본의 하단 표기를 포함한 원본 파일은 assets/momoko-transformed.png에 그대로 보관하며, 최종 표시용 추출본에도 하단 표기를 유지합니다. 배경 추출본은 그 원본에서 파생된 자료로 출처 기록과 연결합니다. 4개 추출본의 원본 RGB 보존·투명 알파를 검사했고, 체크무늬 배경과 실제 변신 화면에서 흰 의상과 외곽선을 확인했습니다.

## 원본 발췌 음성

[기본 음성 모듈](src/bundled-voices.js)에 사용자가 지정한 영상에서 발췌한 약 2~3초의 MP3 **7개**를 포함했습니다. [출처 기록](assets/voices/attribution.json)에 각 슬롯의 URL·발췌 구간·길이·SHA256을 기록했습니다.

| 출처 | 포함 슬롯 | 발췌 구간 |
|---|---|---|
| [한국어 변신](https://www.youtube.com/watch?v=ulQqVjIT0-c) | 도레미·유사랑·장메이·진보라 한국어 | 각각 10~13초, 24~26초, 38~41초, 52~54초 |
| [도레미 일본어](https://www.youtube.com/watch?v=Nd_sv-li7nY) | 도레미 일본어 | 12~15초 |
| [유사랑 일본어](https://www.youtube.com/watch?v=576vUL2A_2w) | 유사랑 일본어 | 12~15초 |
| [나모모 일본어](https://www.youtube.com/watch?v=KdUtVDHts2g) | 나모모 일본어 | 11~14초 |

발췌에는 원본 배경음·효과음이 포함되며 성우 음성만 분리하거나 합성 복제한 것이 아닙니다. 전체 영상·노래는 포함하지 않습니다. [단체 마법 영상](https://www.youtube.com/watch?v=aYGLuNO5S0I)은 연출 참고이며 단체 합창 녹음은 포함하지 않았습니다.

Source performances, incidental music and sound effects remain third-party material and are **not MIT-licensed by this project**. No separate open redistribution license for these excerpts was supplied. Source links and attribution describe provenance, not ownership or an additional license grant.

사용자가 소리 보관함에 추가한 파일은 사용자 브라우저 저장소에 별도로 보관합니다. src/voice-profiles.js의 시스템 시연 대사는 원본 대사가 아닌 창작 문장이고 OS 음성으로 재생되며, 원본 성우 복제 모델이 아닙니다. 원본 발췌·사용자 등록·시스템 시연을 구분합니다.

## 추가 제품 사진

사용자가 제공한 references/rhythm-tap-photo.png와 references/wand-photo.png를 3D 소품의 형태·재질 참고로 보존합니다. 사진 파일은 브라우저·데스크톱 실행 에셋으로 포함하지 않습니다. 사진·제품 디자인의 권리는 원 권리자에게 있으며 프로젝트의 MIT 라이선스가 사진에 적용되는 것은 아닙니다. 새 3D 소품은 사진 기반의 근사 모델로 실제 제조 치수와 동일함을 보증하지 않습니다.

## 소프트웨어

Three.js is MIT-licensed; its license is copied to THIRD_PARTY_LICENSES.txt in the extension build. esbuild is an MIT-licensed development dependency. The separately installed Electron runtime is MIT-licensed and includes Chromium and other dependency notices in its distribution; it is not bundled into the browser extension.
