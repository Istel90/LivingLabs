# 로컬 플랫폼 자동 복구 (2026-09-28)

## 적용 상태

**최신 정책: 사용자 요청으로 매분 예약 작업은 비활성화했다. 기존 하루 한 번 점검만 유지한다.**
현재 서버와 DB는 중지하지 않았다. 아래의 매분 실행·복구 시험은 이전 적용 이력이다.
설치 스크립트에서도 분 단위 반복 트리거를 제거했다. 재설치는 로그인/부팅 자동 시작이
별도로 요청될 때만 수행하며, 비활성화된 작업을 임의로 재활성화하지 않는다.

Windows 예약 작업 `LivingLabs Local Recovery`를 현재 사용자, 일반 권한,
로그인 시 실행 + 매분 반복으로 등록했다. 외부 터널과 배포 작업은 실행하지 않는다.
로그아웃 중 또는 로그인 전에는 실행되지 않는다. 절전/전원 종료 중 가용성을 보장하지 않는다.

로그인 전 부팅 실행용 S4U 등록은 Windows Access Denied로 실패했다.
관리자 권한에서 아래 명령으로 교체할 수 있으나, S4U는 암호화 파일 및 Windows 네트워크
인증을 사용할 수 없으므로 해당 모드의 데이터 연동 검증이 별도로 필요하다.

```powershell
# 저장소 루트에서 관리자 PowerShell로 실행 (현재는 미적용)
npm run platform:local:install-autostart
# 로그인 후 실행 모드로 설치/복원
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-local-platform-autostart.ps1 -AtLogonOnly
```

## 동작과 운영

- `watch-platform.ps1`은 중복 실행 잠금을 잡고 DB 준비 상태와 4173 소유자를 확인한다.
- DB가 실행 중이지만 복구 중이면 다음 주기에 재확인한다. 없는 경우 기존 데이터 디렉터리로 시작한다.
- 서버가 없으면 기존 `pages-dist`를 제공한다. 자동 빌드, 데이터 변경, 외부 배포는 하지 않는다.
- 기존 터널 토큰 파일이 있으면 서버 자식 프로세스에만 전달하며 로그에 출력하지 않는다.
- 다른 프로세스가 4173을 사용하면 종료하지 않고 오류를 기록한다.
- `npm run platform:stop`: 자동 복구 일시정지 + 확인된 플랫폼만 종료. DB와 다른 포트는 유지한다.
- DB까지 정상 종료: `powershell -File scripts/stop-platform.ps1 -IncludeDatabase`.
- `npm run platform:start`: 일시정지 해제 및 복구. 기존 빌드가 있어야 한다.
- `npm run platform:refresh`: 기존 통합 빌드 후 서버 실행 확인. 서버/DB를 일괄 종료하지 않는다.
- 자동 복구 해제: `Disable-ScheduledTask -TaskName 'LivingLabs Local Recovery'`.
- 상태: `npm run platform:status`, `.runtime-logs/platform-watchdog-status.json`.
- 실패 로그: `.runtime-logs/platform-watchdog-YYYYMMDD.log`; 서버 로그는 실행 시각별 보존.

## 검증 범위

예약 작업 결과 0, DB 준비 완료, 서버 포트 확인, 의도적 중지/일시정지/재개 확인.
13:19 예약 작업 복구 시험에서 노드 PID 28676 종료 후 새 PID 19012로 복구됨을 확인했다.
DB PID 28760은 중지/재개와 서버 복구 시험 전체에서 유지되었다.
DB 강제 종료 및 PC 재부팅 시험은 수행하지 않았다.
브라우저 접근은 도구 정책 차단으로 미검증이다. 현재 감시는 프로세스/DB 준비 상태 감시이며,
HTTP 응답 지연이나 지표 계산 실패를 자동으로 해결하는 기능은 아니다.
최신 홍수 화면과 실제 지표 응답 검증은 기존 일일 점검을 유지한다.

참고: https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype
