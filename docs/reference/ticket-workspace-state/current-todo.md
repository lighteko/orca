# Ticket Workspace — 현재 작업 체크리스트

기준일: 2026-09-29. 이 문서는 현재 실행 상태를 짧게 보여준다. 각 작업의 정확한 계약·선행 조건·검증 기준은 [Task DAG](./task-graph.md), 마일스톤 목표는 [마스터 플랜](./master-plan.md)을 따른다. `[x]`는 적힌 범위의 검증 완료를 뜻하며 마일스톤 전체 완료를 뜻하지 않는다.

## 완료된 기반

- [x] **M0:** Orca의 worktree, folder, agent status, orchestration, cleanup 소유 경계를 확인했다.
- [x] **TW-00:** 비공개 ticket 소스를 게시하고 Orca 서브모듈에 고정했다. 초기 128개 파일의 fresh-clone 해시와 Linux 314개 테스트(1개 skip)를 확인했다. 현재 157개 파일의 Git blob manifest와 51개 contract 테스트·typecheck를 확인했다.
- [x] **M1 기반:** ticket schema/catalog, ledger CAS, 설정 읽기, `doctor`, `status`, fixture 기반 `plan` 투영을 구현했다. 이는 실제 owner 관측을 연결한 완료 상태는 아니다.
- [x] **TW-01:** Orca 내부 local-native Git 관측의 freshness 경계를 구현하고 독립 리뷰를 통과했다.

## 이번 단계 완료

- [x] **TW-00N — 비공개 snapshot 전용 후보:** 기존 Luna contract/fixture 세션이 source-owned 추출, 누락된 거부 사례, 결정적 패키징, 기존 `/v1`과 22건 Node/preload 형태 결과 일치를 검증했다. 새 Sol이 SSH 메타데이터 수정을 요구한 뒤 승인했다. 25개 파일·14,364바이트의 초기 후보는 후속 전달 준비에서 갱신됐다.
- [x] **TW-00C + TW-00F — 비공개 전달 준비:** 같은 Luna 세션이 snapshot 계약을 30개 파일·17,941바이트 archive로 고정하고 fixture 경계·과거 37개 사례를 별도 private 파일로 정리했다. 독립 Sol이 tarball만 사용하는 offline/frozen 설치, 타입 검사, Node/preload형 VM의 22개 source 사례·15개 경계 assertion을 검증했다. private 소스는 `31b3768`에 게시했다.

## 다음 순서: 읽기 전용 M4/M5 검증 지점

- [x] **공개 파일 후보 구성:** [정확한 7개 파일·87,199바이트 제안](./public-redistribution-proposal.md)을 비공개 staging하고 파일별 해시·재생을 새 Sol이 검증했다.
- [x] **공개 전달 결정:** 사용자가 [정확한 계약 archive 1개와 fixture 6개](./public-redistribution-proposal.md)의 공개 복사와 전달을 승인했다.
- [x] **TW-00C/F 공개 전달 통합:** 승인된 7개 파일, 고정 `file:` 의존성·잠금 파일·공개 PR 재생 단계를 넣었다. 로컬 검증·독립 Sol 리뷰와 [PR #1의 `cde43160f` 검사](https://github.com/lighteko/orca/actions/runs/36565823569)(31개 성공, 8개 건너뜀, 실패 0개)를 확인했다. 실제 main/preload 연결은 TW-06F다.
- [ ] **TW-06F (M4 fixture):** 전달된 contract 전체 의미 검증을 사용하는 Orca main/preload 읽기 전용 경계를 구현하고 fixture corpus로 검증한다. 선행: TW-00C + TW-00F.
- [ ] **TW-02:** ticket `WorkspaceRef`를 정확한 Orca owner tuple에 결합하고 host·instance·revision 변경 시 재검증한다. 선행: TW-00C + TW-01.
- [ ] **TW-07F (M5 fixture):** 기존 sidebar에 읽기 전용 Projects/Tickets tree를 구현한다. mutation 동작을 숨기고, workspace 이동은 TW-02가 확인한 ID만 허용한다. 선행: TW-06F + TW-02.

Fixture 완료는 live `current`, 외부 효과 또는 공개 `clear`를 뜻하지 않는다.

## M1 완료까지 별도로 남은 일

- [ ] Profile/catalog CLI의 provenance 기반 설치·업데이트·rollback을 구현한다.
- [ ] TW-02의 정확한 owner mapping 뒤 worktree, agent, test, lease, host, ownership **6종 관측**의 소유자 API·완전성·freshness를 증명한다. 외부 자원 관측은 TW-04 계열의 계약과 제공자에 의존한다.
- [ ] **TW-03:** 여섯 관측을 ticket `plan`에 연결하고 실제 상태에 대한 end-to-end 읽기 전용 결과를 검증한다. 현재 공개 CLI는 관측 provider가 없어 의도적으로 `incomplete`를 반환한다. 모든 근거가 갖춰지기 전에는 `clear`를 내지 않는다.

## 후속 경로

- [ ] **Live M4/M5:** ticket snapshot producer와 인증된 resident transport(TW-06P/06T)를 검증한 뒤 TW-06/TW-07로 live 상태를 연결한다.
- [ ] **M2/M3:** 외부 자원 계약·adapter·역할 수렴(TW-04A/B/C)과 coordinator folder·root gateway(TW-05/05G)를 검증한다. 효과 실행은 승인·소유권·재시도 계약을 충족한 뒤에만 연결한다.
- [ ] **M6–M8:** 기존 workspace/agent action 연결(TW-08), 실제 ticket 상태와 Sellmate 통합(TW-09), 배포·파일럿(TW-10)을 완료한다.

**운영 규칙:** 다음 구현 배정은 선행 조건과 독립 리뷰를 확인한 뒤 사용자 승인 범위에서만 시작한다. 관련 작업은 같은 Luna workstream 세션을 이어 쓰고, 의미 있는 통합 지점은 새 Sol이 검토한다.
