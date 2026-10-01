#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
harness="$script_dir/authority-spike.sh"
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
resource="$test_root/resources/repository-a"
export TWS_COORDINATOR_STATE_ROOT="$test_root"
export TWS_COORDINATOR_DISTRO="${WSL_DISTRO_NAME:?WSL_DISTRO_NAME is required}"

run() {
  "$harness" "$@"
}

expect_code() {
  local expected=$1
  shift
  set +e
  "$@" >/dev/null 2>&1
  local actual=$?
  set -e
  [[ $actual -eq $expected ]] || {
    echo "expected exit $expected, got $actual: $*" >&2
    exit 1
  }
}

run authorize "$test_root" "$resource" operation-1 generation-1
expect_code 66 run authorize "$test_root/alternate" "$resource" operation-x generation-x
TWS_FAILPOINT=after-effect run ensure "$test_root" "$resource" operation-1 generation-1 || [[ $? -eq 75 ]]
run ensure "$test_root" "$resource" operation-1 generation-1
[[ "$(<"$resource/.ticket-workspace-owner")" == generation-1 ]]

signal="$test_root/locked"
TWS_LOCKED_SIGNAL="$signal" TWS_HOLD_SECONDS=2 run ensure "$test_root" "$resource" operation-1 generation-1 &
holder_pid=$!
while [[ ! -e "$signal" ]]; do sleep 0.02; done
start_seconds=$SECONDS
run authorize "$test_root" "$resource" operation-2 generation-2
wait "$holder_pid"
[[ $((SECONDS - start_seconds)) -ge 1 ]]
expect_code 73 run dispose "$test_root" "$resource" operation-1 generation-1

run authorize "$test_root" "$resource" operation-2 generation-1
printf '%s\n' generation-2 >"$resource/.ticket-workspace-owner"
expect_code 74 run dispose "$test_root" "$resource" operation-2 generation-1
run authorize "$test_root" "$resource" operation-2 generation-2
touch "$resource/.dirty"
expect_code 76 run dispose "$test_root" "$resource" operation-2 generation-2
rm "$resource/.dirty"
touch "$resource/.active-work"
expect_code 76 run dispose "$test_root" "$resource" operation-2 generation-2
rm "$resource/.active-work"

TWS_FAILPOINT=after-detach run dispose "$test_root" "$resource" operation-2 generation-2 || [[ $? -eq 77 ]]
run dispose "$test_root" "$resource" operation-2 generation-2
run ensure "$test_root" "$resource" operation-2 generation-2
TWS_FAILPOINT=after-effect run dispose "$test_root" "$resource" operation-2 generation-2 || [[ $? -eq 75 ]]
run dispose "$test_root" "$resource" operation-2 generation-2
[[ -f "$test_root/acks/operation-2-generation-2-dispose" ]]

alias_path="$test_root/resources/../resources/repository-a"
run authorize "$test_root" "$alias_path" operation-3 generation-3
run ensure "$test_root" "$resource" operation-3 generation-3
[[ "$(<"$resource/.ticket-workspace-owner")" == generation-3 ]]

echo "mutation authority spike passed"
