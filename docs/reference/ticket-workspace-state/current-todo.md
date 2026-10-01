# Ticket Workspace — 현재 작업 체크리스트

기준일: 2026-10-01. 이 문서는 현재 실행 상태를 짧게 보여준다. 각 작업의 정확한 계약·선행 조건·검증 기준은 [Task DAG](./task-graph.md), 마일스톤 목표는 [마스터 플랜](./master-plan.md)을 따른다. `[x]`는 적힌 범위의 검증 완료를 뜻하며 마일스톤 전체 완료를 뜻하지 않는다.

## 현재 실행 중 — 2026-10-01

- [x] **TW-M1P-D1:** 기존 Luna 배포 workstream이 7가지 결정의 추천안과 private verifier packet을 완성했다. `profile-delivery.md`.
- [x] **TW-06-CT1:** Luna 전송 workstream이 단일 시간 제한·공유 source port·high-water·monotonic 최신성 계약을 고정했다. `resident-ticket-transport.md`.
- [x] **TW-02L-CT1:** Luna owner workstream이 같은 source 읽기의 eligibility·owner 결합·클릭 재검증 계약을 고정했다. `workspace-owner-boundary.md`.
- [x] **TW-EXEC-GATE-REVIEW:** Fresh Sol 6.1 xhigh가 네 코드 packet을 승인하고, 운영 준비를 독립 모듈 구현까지 막던 DAG 조건을 수정했다. 사용자가 이 네 작업과 이후 계획 범위의 검토된 가역적 로컬 작업을 승인했다.
- [x] **TW-06-B1:** Caller 시간 제한·공유 타입·checked token issuer·전송 직전 만료 검사를 구현했다. 집중 33개 테스트, Node 타입·코드 품질·형식 검사와 fresh Sol 6.1 독립 코드 리뷰를 통과했다.
- [x] **TW-M1P-I:** 비공개 manifest·서명·해시·profile 검증기를 구현했다. 계약 59개·CLI 257개 통과/45개 skip, 전체 타입 검사·코드 품질·독립 Sol 6.1 리뷰와 C1 원본 5개 해시의 읽기 전용 재생을 통과했다. 커밋 `052fa3b`는 아래 `b556834`와 함께 비공개 원격에 게시됐다.
- [x] **TW-02L-I:** 같은 Luna owner workstream이 주입형 owner 조합을 구현했다. 기존 binder·selector·capture를 포함한 47개 테스트, Node 타입·품질·형식 검사와 fresh Sol 6.1 독립 코드 리뷰를 통과했다. 실제 source adapter 연결은 아래 IJ에서 검증했다.
- [x] **TW-06-I:** 같은 Luna 전송 workstream이 주입형 admission·high-water·최신성을 구현했다. 71개 집중 테스트, Node 타입·품질·형식 검사와 fresh Sol 6.1 독립 리뷰를 통과했다. 리뷰어의 실제 소스 재현 검사 18개도 통과했다.

- [x] **TW-02L-06-IJ:** 실제 인증된 source adapter·high-water·owner 조합을 연결한 7개 테스트와 독립 Sol 6.1 코드 리뷰를 통과했다. Root 관련 회귀 18개 suite/143개 테스트, 최종 Node 타입 검사와 변경 코드 품질 검사 175개 파일도 통과했다.
- [x] **최종 통합·DAG 리뷰:** fresh Sol 6.1이 실제 연결과 완료 문서, 다음 작업 경계를 검증해 `INTEGRATION_APPROVE`를 판정했다.
- [x] **공개 코드 커밋:** `5b39c5963`에 검토된 공개 코드·테스트·문서 39개 파일을 커밋했다. 사용자 게시 승인 후 완료 문서 `6ca4bb7e5`와 핀 갱신 `52c1525c2`까지 기존 공개 PR #1에 게시했다.
- [x] **TW-M1P-L1:** 같은 배포 Luna가 unbound 설치·업데이트·롤백·명시적 복구 상태머신을 구현했다. 집중 16개, 독립 리뷰 회귀 35개, Root 전체 계약 59개·CLI 273개 통과/45개 skip, 타입·정확한 파일 품질·형식 검사를 통과했다. 로컬 비공개 커밋 `b556834`; 실제 파일 설치·WSL·운영 키 변경과 재시작 내구성 증명은 포함되지 않는다.
- [x] **게시 후보 검토·게시:** Fresh Sol 6.1 검토와 사용자 승인 후 비공개 `b556834`를 먼저 게시·검증하고 공개 `52c1525c2`를 게시했다. [비공개 새 Ubuntu CI](https://github.com/lighteko/ticket-workspace/actions/runs/36800471659)는 잠금 설치·빌드·타입 검사, 계약 59개·CLI 297개 통과/21개 skip이다.
- [x] **TW-06-CI-F1:** 첫 공개 CI는 한 파일의 중복 타입 import 경고와 연쇄 verify 실패로 29개 성공·8개 skip·2개 실패였다. 같은 전송 Luna의 import 전용 수정, native lint·Node 타입·형식·독립 Sol 6.1 리뷰를 통과해 `ab422754b`로 게시했다. 기능·계약 변경은 없다.
- [x] **공개 CI 완료 확인:** 수정된 공개 `ab422754b`의 [PR Checks](https://github.com/lighteko/orca/actions/runs/36802113499)와 전체 PR 검사가 31개 성공·8개 skip·실패 0개다. 비공개 `b556834`의 새 Ubuntu CI도 별도로 통과했다.
- [x] **다음 병렬 구현 경계 검토:** Fresh Sol 6.1이 현재 소스·DAG·후보 전체의 기술적 준비도를 검토했고 Astra가 목표 대비 가치를 재검증했다. L2만 준비된 packet이었으나 연기했다. 실제-ticket pilot의 새 packet을 고정하기 전에는 후보를 구현 가능하다고 부르거나 배정하지 않는다.
- [x] **Astra xhigh 방향성 감사:** 원래 플랜·현재 코드·최근 구현을 독립 검토해 **부분적 방향 이탈**로 판정했다. 올바른 내부 기반을 만들었지만 실제 사용 흐름보다 배포·롤백·복구에 투자가 앞섰다. [근거·결정](./review-findings.md#astra-direction-audit--2026-10-01).
- [ ] **TW-M1P-L2 — 연기:** 첫 수정 전에 동결했으며 변경 파일은 없다. 실제 티켓 pilot에 필요한 근거가 생기기 전까지 staging·runtime recovery 후속 작업과 함께 연기한다. 완료된 verifier/L1 코드는 보존한다.
- [x] **방향 재정렬:** read-only 관측기를 effect gateway에서 분리하고, 설치 전체를 첫 pilot의 선행 조건으로 두지 않도록 DAG를 수정했다. HWM 계약 단순화와 CLI/resident 단일 release는 검토할 제안이며 아직 구현 결정이 아니다.
- [ ] **다음 실제 사용 흐름 packet:** 실제 티켓 생성·최소 enrollment, 승인된 개발 대상·신뢰 입력, resident entrypoint·명시적 lifecycle, HWM 정책과 live DTO를 고정한다. 완료 기준은 실제 티켓 한 건의 Tickets 표시·정확한 workspace 이동이며 effect·공개 `clear`는 비활성이다. 아직 새 코드 배정은 없다.

**이번 코드 사이클 완료 기준:** 집중 테스트·적용 타입/품질 검사·독립 코드 리뷰·owner/cache 통합 리뷰·로컬 커밋. 실제 운영 설치·키·호스트 활성화는 이 사이클의 완료 조건에서 분리한다.

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
- [x] **TW-06F (main/preload workstream, M4 fixture):** 승인된 계약으로 main/preload에서 검증하고 action·target 없는 ticket/workspace 표시 행만 투영한다. 실제 preload 번들의 22개 corpus 사례와 거부된 IPC fallback, 전체 타입 검사, 통합 Sol 리뷰를 통과했다. 화면 연결은 완료된 TW-07F에서 검증했다.
- [x] **이전 통합 CI:** 당시 검토 구현 커밋 `8ba6d003e`의 [PR #1 검사](https://github.com/lighteko/orca/actions/runs/36587099645)는 31개 성공·8개 건너뜀·실패 0개다. Linux 패키지 작업에서 실제 preload 검증이 통과했다.
- [x] **TW-07F 다음 단계 독립 리뷰:** M5 fixture tree가 다음 핵심 경로임을 확인했지만 기존 패킷은 수정 필요로 판정했다. 클릭 재매칭 IPC가 아직 없고, fixture는 실제 coordinator·agent·이슈 링크를 증명하지 않는다. [Task DAG의 수정 패킷](./task-graph.md)을 구현 전 검증한다.
- [x] **TW-07F selector bridge:** main/preload의 정확한 match·click 재결합 계약을 구현하고 독립 Sol 재리뷰를 통과했다. 실제 preload 번들은 다른 revision·ticket·repository 응답을 거부하며, 배송된 fixture의 owner mismatch는 실패 사례로 유지한다.
- [x] **TW-07F M5 fixture 화면:** Phase A의 전체 행 접근·Projects 복귀·접근성·변경 제어 차단·틴트 대비와 Phase B의 selector 전용 클릭 재결합을 구현하고 각각 fresh Sol 리뷰를 통과했다. 실제 main/preload 통합의 긍정 합성 이동과 배포 fixture의 owner 불일치 차단을 검증했다. 숨겨진 Electron CDP E2E 1건이 창을 표시하지 않고 통과해 스크린샷을 남겼다. 이는 live 상태·액션·`clear` 완료가 아니다.
- [x] **현재 M5 통합 CI:** [PR #1](https://github.com/lighteko/orca/pull/1)의 동일 HEAD `fa4e622f4`에서 31개 성공·8개 건너뜀·실패 0개를 확인했다. 번역 카탈로그 누락은 표준 동기화로 수정했고, M5 전달·CI 관문은 완료됐다.

- [x] **현재 공개 통합:** Orca `d5e0ab670`이 비공개 `14c69a1`을 고정하며, 독립 Sol 리뷰 후 [동일 HEAD 공개 PR CI](https://github.com/lighteko/orca/actions/runs/36694672961)가 31개 성공·8개 건너뜀·실패 0개로 끝났다. 변경 범위는 상태 문서와 서브모듈 핀이다.

## 지금 병렬로 준비할 수 있는 작업 축

TW-07F만 다음 작업인 것은 아니다. [전체 병렬 작업 경계](./task-graph.md#full-parallel-frontier-at-this-checkpoint)의 다음 항목은 서로 다른 소유 영역에서 계약·증거를 준비할 수 있다. 코드 구현 가능 시점은 각 선행 조건을 따른다.

- [x] **TW-06T 전송 후보 조사:** Orca `spawnProcess`와 기존 WSL hook relay의 범위를 독립 Sol 리뷰로 확인했다. pinned WSL stdio는 운영 endpoint 후보이며 주입형 클라이언트는 fake duplex에서만 검증됐다. 실제 endpoint·키 전달·호스트 수명 증명은 열려 있다.
- [x] **TW-06P projection 소스 조사:** 초기 조사에서 catalog→snapshot 직접 필드와 build ID·대상 억제·SSH·high-water·clock 공백을 확인했다. 이후 P4/P5 주입형 projector는 구현·리뷰됐지만 운영 서비스 산출물과 currentness는 없다.
- [x] **TW-06P 생산자 규칙 재검토:** 한 번의 bound catalog 읽기, 검증된 catalog의 canonical digest, catalog 전용 sequence 0, 실제 role, action/match 부재, 최종 직렬화 2 MiB 제한을 v1 기계적 기준으로 채택했다. 독립 Sol이 모든 pending transition ref를 일괄 제거하는 안을 거부했다. 이후 P4/P5 주입형 억제·SSH 정책이 검토됐으며 운영 host 매핑·high-water·clock 증명은 열려 있다.
- [x] **TW-06P/T 주입형 논리 v1 계약:** 정확한 메시지·인증·투영 정책과 [공유 벡터](./resident-ticket-transport.md)가 2026-09-30 fresh Sol 독립 리뷰를 통과했다. 이 범위의 병렬 코드 작업과 새 벡터 파일 두 개의 공개 게시를 사용자가 각각 승인했다. 실제 WSL endpoint·자격증명·호스트 매핑·current/high-water의 운영 P1–P8 증명은 계속 열려 있다.
- [x] **TW-06P 주입형 생산자:** 기존 Luna 티켓 소스 workstream이 순수 projector와 주입형 server/handler를 구현하고 비공개 `f0b3181`로 게시했다. source 검증·T1–T12·정확한 2 MiB·골든 프레임·시간 제한/취소를 포함한 집중 테스트 23개와 CLI 타입 검사가 통과했고 독립 Sol 코드 리뷰가 승인했다. 운영 서비스 실행과 current 게시는 범위 밖이다.
- [x] **TW-06P-F1 비공개 테스트 이식성:** `f7d66d1`에 승인된 41,713바이트 골든 벡터를 비공개 test fixture로 고정하고 경로와 LF 속성을 수정했다. 단독 소스 checkout에서 로컬 의존성 junction을 사용해 집중 테스트 23개·CLI 타입 검사·해시를 확인했고 독립 Sol 리뷰를 통과했다. 이후 `14c69a1`의 새 Ubuntu CI에서 깨끗한 설치와 전체 native Linux CLI 검증도 통과했다.
- [x] **TW-00-R1 Windows preflight 테스트 격리:** 승인된 테스트 한 파일 수정이 비공개 원격 `9f10125`에 게시됐고 독립 Sol 리뷰를 통과했다. Windows 전체 CLI 250개 통과·41개 건너뜀, 타입 검사 통과. Orca PR `c4e87fa3b`가 이를 고정했고 CI는 Windows 작업 재실행 후 31개 성공·8개 건너뜀이다.
- [x] **TW-00-R2 새 Ubuntu 검증 기반:** 비공개 `8322dbf`의 단일 workflow가 독립 리뷰 후 게시됐다. 새 Ubuntu 24.04/ext4에서 Node 22.23.2·pnpm 12의 잠금 설치, 빌드, 타입 검사는 통과했다. [첫 전체 테스트](https://github.com/lighteko/ticket-workspace/actions/runs/36680256035)는 264개 통과·15개 건너뜀·12개 실패이며, 실패는 WSL을 전제로 한 테스트 두 파일에 모였다.
- [x] **TW-00-R3A/R3B 전체 native Linux 테스트:** 사용자 승인 아래 기존 Luna 두 계열이 서로 다른 테스트 파일을 병렬 수정했다. SQLite 잠금 테스트는 정확한 테스트용 WSL 증거와 실제 native 거부 사례를 분리했고, state-root 준비 테스트는 실제 WSL 성공 사례를 호스트 증거로 제한했다. 독립 Sol 리뷰 후 비공개 `main` `14c69a1`에서 [새 Ubuntu CI](https://github.com/lighteko/ticket-workspace/actions/runs/36691726008)가 계약 53개, CLI 274개 통과·21개 건너뜀·실패 0개로 끝났다. 실제 WSL 성공 사례는 이 수치에 포함되지 않는다.
- [x] **TW-00-R4 실제 WSL 성공 경로:** 정확한 비공개 `14c69a1`의 Windows Git archive를 이미 실행 중인 `Ubuntu-24.04` WSL2의 작업 전용 ext4 경로에서 Node 22.23.2·pnpm 12로 검증했다. 계약 53개·CLI 292개 통과, 3개 건너뜀, 실패 0개이며 핵심 준비 6개·CLI 4개도 개별 통과했다. Sol 6.1 xhigh가 입력 해시·185개 파일의 줄바꿈 변환·로그·정리를 독립 확인하고 승인했다. 실제 사용자 설정·서비스·등록은 바꾸지 않았다. 이는 production host binding이나 서비스 setup 완료가 아니다.
- [x] **TW-06T 가짜 duplex 클라이언트:** 기존 Luna Orca 전송 workstream이 인증 프레임·경계·취소·no-start를 별도 모듈로 구현했다. 집중 테스트 30개, 변경 코드 품질 검사, Node 타입 검사, 독립 Sol 코드 리뷰를 통과했다. 두 구현의 메모리 스트림 통합 검증도 정상 읽기와 epoch 변경 거부를 확인했다. 실제 WSL 시작과 UI/IPC 연결은 범위 밖이다.
- [x] **TW-06 live cache/overlay 조사:** fixture 서비스는 late-result 격리만 제공하고 live cache는 아니다. 독립 Sol이 host·profile·authority·epoch 파티션, digest high-water, source clock, stale 수명, 혼합 SSH `unsupported`, 별도 overlay의 TW-02L 선행 조건을 확인했다. 스키마가 허용하는 producer `matched`·action 행도 초기 생산 정책에서 별도로 거부해야 한다.
- [ ] **TW-06 live 연결:** CT1이 주입형 admission·high-water·최신성 계약을 고정하고 독립 리뷰를 통과했다. 코드 범위는 위 TW-06-I다. 실제 main/preload·overlay 연결은 운영 증명과 TW-02L 뒤에 배정하며 fixture IPC 수정은 직렬화한다.
- [x] **TW-02L live owner 사전 조사:** 별도 Luna가 fresh source tuple·WorkspaceRef와 Orca owner/host·완전 조회·clock 조건을 확인했고 독립 Sol이 기본 재읽기·5필드 결합을 검증했다. snapshot에는 pruning/pruned disposition이 없어 retained ref의 live match/click 억제 신호가 별도로 필요하다는 누락을 찾았다.
- [x] **TW-02L eligibility 계약:** CT1과 독립 Sol 6.1 리뷰가 같은 검증된 source 읽기의 P4/P5 target 억제와 main-owned currentness port를 고정했다. Match/click 두 읽기·evidence 세 읽기·최종 owner 재검증은 위 TW-02L-I에서 구현한다. 실제 운영 등록은 별도 증명 뒤에 한다.
- [x] **TW-05/05G 계약 조사:** 현재 Orca·ticket 소스와 대조한 결정 매트릭스가 독립 리뷰를 통과했다. 일반 Run 호출은 ticket용 엄격한 caller attestation이 아니며, v1 catalog·folder host proof·reset fence에도 빈틈이 있다.
- [ ] **TW-05/05G 소유자 결정:** 문서 allowlist·기존 pointer 이전·catalog version·Orca folder/Run 증명을 확정한 뒤 구현한다. 효과 코드는 계속 대기한다.
- [x] **TW-04A 생산 증거 조사:** Docker와 IIS 모두 현재 소스에서 실제 endpoint·물리 ID·owner marker·완전 조회 범위·clock handoff를 증명하지 못했다.
- [ ] **TW-04A 생산 소유자 증거:** 각 adapter 소유자가 위 증거를 제공하기 전에는 typed production fixture·adapter·효과를 구현하지 않는다.
- [x] **TW-03 사전 조사:** 독립 Sol 리뷰로 여섯 행의 구조적 admission은 완전 조회·clock handoff 증명이 아님을 확인했다. 현재 CLI는 provider 없이 `incomplete`/`blocked`만 내며 공개 `clear` 누출은 없다. host status store와 renderer 필터를 구분했고, `/v1`의 generic `test-lease` 허용과 구형 typed intent의 누락을 구분했다.
- [ ] **TW-03 소유자 계약:** agent의 정확한 host/workspace 결합과 완전 조회, test-lease의 ledger/adapter 범위, ownership/host 증명, source clock handoff를 확정한다. 최종 `plan` provider 구현은 TW-02L·TW-04B와 이 계약 뒤에 한다.
- [x] **TW-M1P 사전 조사:** 기존 오프라인 CLI 설치 검증은 Linux Node와 profile의 실제 배포·업데이트·rollback을 증명하지 않음을 확인했다. Node 배포자, 비공개 패키지 채널, 해시·host 결합, 복구 결정이 남아 있다.
- [x] **TW-M1P 계약 후보:** [profile/base-runtime 전달 초안](./profile-delivery.md)은 unbound 설치→별도 authority issue/adopt→명시적 bind, 단일 ext4 활성 기록, rollback 복구, 검증된 패키지 폐쇄성을 분리했고 독립 Sol 리뷰를 통과했다. Node 22.23.3과 Ubuntu WSL2 x64는 후보이지 승인된 배포 대상이 아니다.
- [ ] **TW-M1P profile 전달:** D1의 [7가지 추천안](./profile-delivery.md#recommended-decisions-and-owner-actions)은 완성됐다. 주입형 검증기는 위 TW-M1P-I에서 구현하며 실제 profile 값·키와 게시자·호스트 정책은 운영 활성화 전에 확정한다. 설치·업데이트·rollback과 별도 TW-06P service artifact는 후속 범위다.
- [x] **TW-M1P-C1 산출물 폐쇄성 replay:** 현재 소스의 로컬 빌드와 서명·해시가 검증된 후보 Node 22.23.3/npm 10.9.9, CLI·contracts·Zod·noble 4개 tarball을 재생했다. 차단된 namespace에서 별도 빈 캐시로 잠금 생성·설치가 통과했고, scratch CLI의 help와 설정 누락 `incomplete` 결과·파일 불변성을 확인했다. Sol 6.1 xhigh가 원본 로그·해시·두 guest 경로 정리를 승인했다. Windows 증거 99개·43개 해시는 정리 후에도 일치한다. 생산 Node 선택·profile 설치·업데이트·rollback은 별도 게이트다.
- [x] **TW-08 액션 경계 조사:** 기존 삭제 UI는 id·instanceId·host를 확인하지만 제거 RPC에는 instanceId가 전달되지 않는다. 일반 확인 대화상자와 Orca 영수증은 ticket의 one-use 승인·adapter 영수증을 증명하지 않는다. 독립 Sol이 이를 소스에서 확인했고 일반 UI 삭제 결함으로 확대하지 말라고 판정했다.
- [x] **TW-08 액션 계약표:** [액션별 권한·확인·영수증 행렬](./action-authority-matrix.md)을 같은 Luna workstream이 작성하고 fresh Sol 재리뷰를 통과했다. 이는 읽기 전용 계약 조사이며 액션 구현 승인이 아니다.
- [ ] **TW-08 효과 구현:** 정확한 M6 액션 목록과 액션별 preview·one-use 권한·재시도/중단 계약을 확정한다. 효과 코드는 M3·TW-05G·TW-02L·live TW-06/TW-07과 액션별 증명 뒤에 한다.

TW-06 currentness와 TW-02L 같은 읽기 기반 owner 계약, TW-08 action/receipt 경계의 읽기 전용 후보가 검토됐다. 세 구현 영역은 각각의 live·root 권한 선행 조건 뒤에 둔다. 병렬 준비 축의 존재가 구현 worker 자동 배정을 뜻하지 않는다.

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

**운영 규칙:** 사용자 승인에 따라 기존 계획 범위의 독립 리뷰를 통과한 가역적 로컬 구현·테스트·통합·커밋은 배정마다 다시 묻지 않고 계속 진행한다. 외부 게시·운영 설정 변경·실제 키와 보안 정책 결정은 Sol이 승인을 요청한다. 관련 작업은 같은 Luna workstream 세션을 이어 쓰며 독립 리뷰는 새 **Sol 6.1 xhigh**가 수행한다.
