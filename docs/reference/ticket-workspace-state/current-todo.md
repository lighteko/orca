# Ticket Workspace — 현재 작업 체크리스트

기준일: 2026-09-30. 이 문서는 현재 실행 상태를 짧게 보여준다. 각 작업의 정확한 계약·선행 조건·검증 기준은 [Task DAG](./task-graph.md), 마일스톤 목표는 [마스터 플랜](./master-plan.md)을 따른다. `[x]`는 적힌 범위의 검증 완료를 뜻하며 마일스톤 전체 완료를 뜻하지 않는다.

## 완료된 기반

- [x] **M0:** Orca의 worktree, folder, agent status, orchestration, cleanup 소유 경계를 확인했다.
- [x] **TW-00:** 비공개 ticket 소스를 게시하고 Orca 서브모듈에 고정했다. 초기 128개 파일의 fresh-clone 해시와 Linux 314개 테스트(1개 skip)를 확인했다. 이후 157개 파일의 Git blob manifest와 51개 contract 테스트·typecheck를 확인했다.
- [x] **M1 기반:** ticket schema/catalog, ledger CAS, 설정 읽기, `doctor`, `status`, fixture 기반 `plan` 투영을 구현했다. 이는 실제 owner 관측을 연결한 완료 상태는 아니다.
- [x] **TW-01:** Orca 내부 local-native Git 관측의 freshness 경계를 구현하고 독립 리뷰를 통과했다.

## 이번 단계 완료

- [x] **TW-00N — 비공개 snapshot 전용 후보:** 기존 Luna contract/fixture 세션이 source-owned 추출, 누락된 거부 사례, 결정적 패키징, 기존 `/v1`과 22건 Node/preload 형태 결과 일치를 검증했다. 새 Sol이 SSH 메타데이터 수정을 요구한 뒤 승인했다. 25개 파일·14,364바이트의 초기 후보는 후속 전달 준비에서 갱신됐다.
- [x] **TW-00C + TW-00F — 비공개 전달 준비:** 같은 Luna 세션이 snapshot 계약을 30개 파일·17,941바이트 archive로 고정하고 fixture 경계·과거 37개 사례를 별도 private 파일로 정리했다. 독립 Sol이 tarball만 사용하는 offline/frozen 설치, 타입 검사, Node/preload형 VM의 22개 source 사례·15개 경계 assertion을 검증했다. private 소스는 `31b3768`에 게시했다.

## 다음 순서: 읽기 전용 M4/M5 검증 지점

- [x] **공개 파일 후보 구성:** [정확한 7개 파일·87,199바이트 제안](./public-redistribution-proposal.md)을 비공개 staging하고 파일별 해시·재생을 새 Sol이 검증했다.
- [x] **공개 전달 결정:** 사용자가 [정확한 계약 archive 1개와 fixture 6개](./public-redistribution-proposal.md)의 공개 복사와 전달을 승인했다.
- [x] **TW-00C/F 공개 전달 통합:** 승인된 7개 파일, 고정 `file:` 의존성·잠금 파일·공개 PR 재생 단계를 넣었다. 로컬 검증·독립 Sol 리뷰와 [PR #1의 `cde43160f` 검사](https://github.com/lighteko/orca/actions/runs/36565823569)(31개 성공, 8개 건너뜀, 실패 0개)를 확인했다. 실제 main/preload 연결은 TW-06F다.
- [x] **다음 병렬 경계 확정:** 독립 Sol이 [fixture 표시 DTO·owner 매칭·세 필드 이동 요청의 분리](./task-graph.md)를 검토했다. 공개 `snapshot.full`은 화면 표시에는 유효하지만 repository/ref가 달라 owner 매칭의 실패 사례다. 실제 매칭 성공 사례는 Orca 측에서 별도로 만든다.
- [x] **TW-02F (owner workstream):** 검증된 fixture의 `WorkspaceRef`를 기존 Orca binder에 정확히 매핑하고, 이동 클릭 시 main에서 세 필드 selector로 다시 확인한다. 독립·통합 Sol 리뷰와 집중 테스트를 통과했다. Live owner 증거는 TW-02L에 남는다.
- [x] **TW-06F (main/preload workstream, M4 fixture):** 승인된 계약으로 main/preload에서 검증하고 action·target 없는 ticket/workspace 표시 행만 투영한다. 실제 preload 번들의 22개 corpus 사례와 거부된 IPC fallback, 전체 타입 검사, 통합 Sol 리뷰를 통과했다. 화면 연결은 TW-07F에 남는다.
- [x] **이번 통합 CI:** 최신 검토 구현 커밋 `8ba6d003e`의 [PR #1 검사](https://github.com/lighteko/orca/actions/runs/36587099645)는 31개 성공·8개 건너뜀·실패 0개다. Linux 패키지 작업에서 실제 preload 검증이 통과했다.
- [x] **TW-07F 다음 단계 독립 리뷰:** M5 fixture tree가 다음 핵심 경로임을 확인했지만 기존 패킷은 수정 필요로 판정했다. 클릭 재매칭 IPC가 아직 없고, fixture는 실제 coordinator·agent·이슈 링크를 증명하지 않는다. [Task DAG의 수정 패킷](./task-graph.md)을 구현 전 검증한다.
- [ ] **TW-07F (M5 fixture, 미착수):** selector 전용 main/preload 연결 → 기존 workspaces body 안의 읽기 전용 Projects/Tickets tree → 정확한 Orca ID 이동·상태 연결을 직렬로 진행한다. 배송된 fixture의 owner mismatch는 실패 사례이고, 성공 이동은 합성 Orca 소유 fixture로만 검증한다. worker 배정은 수정 패킷 검증과 승인 범위를 확인한 뒤 결정한다.

## 지금 병렬로 준비할 수 있는 작업 축

TW-07F만 다음 작업인 것은 아니다. [전체 병렬 작업 경계](./task-graph.md#full-parallel-frontier-at-this-checkpoint)의 다음 항목은 서로 다른 소유 영역에서 계약·증거를 준비할 수 있다. 코드 구현 가능 시점은 각 선행 조건을 따른다.

- [ ] **TW-06P/T:** live snapshot producer·resident transport의 공동 프로토콜과 인증·freshness 계약을 확정한다. 이후 private producer와 Orca transport를 분리 구현할 수 있다.
- [ ] **TW-05/05G:** coordinator 폴더·문서·Run 등록의 소유 경계를 조사하고, 문서 allowlist·기존 pointer 이전 등 소유자가 확정할 결정안을 준비한다. root gateway의 caller attestation·binding fence도 조사한다. 효과 코드는 아직 대기한다.
- [ ] **TW-04A 후속:** Docker와 IIS의 실제 endpoint, 물리 ID, owner marker, 완전한 조회 범위, clock 증거를 각각 조사한다. 생산용 adapter와 효과는 아직 대기한다.
- [ ] **TW-03 사전 조사:** agent, test/lease, ownership/host 관측의 소유 API·완전성·clock 계약을 권한별로 확인한다. 최종 `plan` provider 구현은 선행 작업 뒤에 한다.
- [ ] **M1 profile 전달:** CLI/catalog 배포물의 provenance 기반 설치·업데이트·rollback 계약과 profile 버전 결합을 정한다. 아직 별도 구현 패킷이 없다.

TW-06 live cache와 TW-08 action/receipt 경계도 읽기 전용으로 미리 검토할 수 있다. 두 구현은 각각의 live·root 권한 선행 조건 뒤에 둔다. 병렬 작업 축의 존재가 worker 자동 배정을 뜻하지 않는다.

Fixture 완료는 live `current`, 외부 효과 또는 공개 `clear`를 뜻하지 않는다.

## M1 완료까지 별도로 남은 일

- [ ] Profile/catalog CLI의 provenance 기반 설치·업데이트·rollback을 구현한다.
- [ ] **TW-02L과 6종 owner 관측:** 인증된 live source·TW-01 Git capture를 결합한 뒤 worktree, agent, test, lease, host, ownership의 소유자 API·완전성·freshness를 증명한다. TW-02F fixture 매칭만으로는 이 항목이 완료되지 않는다. 외부 자원 관측은 TW-04 계열 계약과 제공자에 의존한다.
- [ ] **TW-03:** 여섯 관측을 ticket `plan`에 연결하고 실제 상태에 대한 end-to-end 읽기 전용 결과를 검증한다. 현재 공개 CLI는 관측 provider가 없어 의도적으로 `incomplete`를 반환한다. 모든 근거가 갖춰지기 전에는 `clear`를 내지 않는다.

## 후속 경로

- [ ] **Live M4/M5:** ticket snapshot producer와 인증된 resident transport(TW-06P/06T)를 검증한 뒤 TW-06/TW-07로 live 상태를 연결한다.
- [x] **TW-04A 공통 계약:** 비공개 소스 `54477c2`에 별도 resource-universe DTO·validator·artifact와 50개 합성 사례를 게시했다. 독립 Sol 리뷰, contract 테스트 53개와 타입 검사를 통과했다. 생산용 Docker/IIS adapter 증명은 포함하지 않는다.
- [ ] **M2/M3 후속:** 생산용 adapter·역할 수렴(TW-04B/C)과 coordinator folder·root gateway(TW-05/05G)는 미착수다. 효과 실행은 승인·소유권·재시도 계약을 충족한 뒤에만 연결한다.
- [ ] **M6–M8:** 기존 workspace/agent action 연결(TW-08), 실제 ticket 상태와 Sellmate 통합(TW-09), 배포·파일럿(TW-10)을 완료한다.

**운영 규칙:** 다음 구현 배정은 선행 조건과 독립 리뷰를 확인한 뒤 사용자 승인 범위에서만 시작한다. 관련 작업은 같은 Luna workstream 세션을 이어 쓰고, 의미 있는 통합 지점은 새 Sol이 검토한다.
