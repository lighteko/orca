#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: authority-spike.sh <authorize|ensure|dispose> <state-root> <resource> <operation-id> <generation>" >&2
  exit 64
}

[[ $# -eq 5 ]] || usage

command_name=$1
state_root=$(realpath -m -- "$2")
resource=$(realpath -m -- "$3")
operation_id=$4
generation=$5

configured_root=${TWS_COORDINATOR_STATE_ROOT:?TWS_COORDINATOR_STATE_ROOT is required}
configured_distro=${TWS_COORDINATOR_DISTRO:?TWS_COORDINATOR_DISTRO is required}
configured_root=$(realpath -m -- "$configured_root")
[[ "$state_root" == "$configured_root" ]] || {
  echo "coordinator state root mismatch" >&2
  exit 66
}
[[ "${WSL_DISTRO_NAME:-}" == "$configured_distro" ]] || {
  echo "coordinator distro mismatch" >&2
  exit 66
}

case "$resource/" in
  "$state_root"/resources/*/) ;;
  *) echo "resource must be under $state_root/resources" >&2; exit 65 ;;
esac

mkdir -p -- \
  "$state_root/locks" \
  "$state_root/authority" \
  "$state_root/acks" \
  "$state_root/removing" \
  "$state_root/resources"
resource_key=$(printf '%s' "$resource" | sha256sum | cut -d' ' -f1)
lock_path="$state_root/locks/$resource_key.lock"
authority_path="$state_root/authority/$resource_key"
marker_path="$resource/.ticket-workspace-owner"
tombstone="$state_root/removing/$resource_key-$generation"

exec 9>"$lock_path"
flock -x 9

if [[ -n "${TWS_LOCKED_SIGNAL:-}" ]]; then
  : >"$TWS_LOCKED_SIGNAL"
fi
if [[ -n "${TWS_HOLD_SECONDS:-}" ]]; then
  sleep "$TWS_HOLD_SECONDS"
fi

write_atomic() {
  local target=$1
  local value=$2
  local temporary="$target.tmp.$$"
  printf '%s\n' "$value" >"$temporary"
  sync -f "$temporary"
  mv -f -- "$temporary" "$target"
  sync -f "$(dirname -- "$target")"
}

read_authority() {
  [[ -f "$authority_path" ]] || return 1
  IFS='|' read -r authorized_operation authorized_generation <"$authority_path"
  [[ "$authorized_operation" == "$operation_id" && "$authorized_generation" == "$generation" ]]
}

ack() {
  write_atomic "$state_root/acks/$operation_id-$generation-$1" complete
}

case "$command_name" in
  authorize)
    write_atomic "$authority_path" "$operation_id|$generation"
    ;;
  ensure)
    if ! read_authority; then
      echo "stale mutation authority" >&2
      exit 73
    fi
    if [[ -e "$resource" && ! -d "$resource" ]]; then
      echo "resource locator is occupied" >&2
      exit 74
    fi
    if [[ -f "$marker_path" ]]; then
      [[ "$(<"$marker_path")" == "$generation" ]] || {
        echo "resource generation mismatch" >&2
        exit 74
      }
    else
      mkdir -p -- "$resource"
      write_atomic "$marker_path" "$generation"
    fi
    [[ "${TWS_FAILPOINT:-}" != after-effect ]] || exit 75
    ack ensure
    ;;
  dispose)
    if ! read_authority; then
      echo "stale mutation authority" >&2
      exit 73
    fi
    if [[ ! -e "$resource" ]]; then
      if [[ -e "$tombstone" ]]; then
        [[ -d "$tombstone" && -f "$tombstone/.ticket-workspace-owner" && \
          "$(<"$tombstone/.ticket-workspace-owner")" == "$generation" ]] || {
          echo "tombstone generation mismatch" >&2
          exit 74
        }
        rm -f -- "$tombstone/.ticket-workspace-owner"
        rmdir -- "$tombstone"
      fi
      ack dispose
      exit 0
    fi
    [[ -d "$resource" && -f "$marker_path" && "$(<"$marker_path")" == "$generation" ]] || {
      echo "resource generation mismatch" >&2
      exit 74
    }
    [[ ! -e "$resource/.dirty" ]] || { echo "dirty resource" >&2; exit 76; }
    [[ ! -e "$resource/.active-work" ]] || { echo "active work" >&2; exit 76; }
    [[ ! -e "$tombstone" ]] || { echo "tombstone already exists" >&2; exit 74; }
    mv -- "$resource" "$tombstone"
    [[ "${TWS_FAILPOINT:-}" != after-detach ]] || exit 77
    rm -f -- "$tombstone/.ticket-workspace-owner"
    rmdir -- "$tombstone"
    [[ "${TWS_FAILPOINT:-}" != after-effect ]] || exit 75
    ack dispose
    ;;
  *) usage ;;
esac
