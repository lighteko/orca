import { isDeepStrictEqual } from 'node:util'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { isWslUncPath } from '../../shared/wsl-paths'
import { areWorktreePathsEqual } from '../git/worktree-path-comparison'
import { nativeGitSubjectMatchesRegistration } from '../git/native-worktree-subject-attestation'
import type { NativeGitWorktreeSubject } from '../git/worktree-catalog-registration-identity'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'

export type ExactLocalNativeGitSubjectAttestation = {
  binding: ExactLocalNativeGitWorktreeBinding
  effectiveSubject: NativeGitWorktreeSubject
}

export type RuntimeGitSubjectAttestationHost = {
  isBindingCurrent(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<boolean>
  readEffectiveSubject(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<NativeGitWorktreeSubject | null>
}

export class RuntimeGitSubjectAttestationUnavailableError extends Error {
  readonly code = 'runtime_git_subject_attestation_unavailable'

  constructor() {
    super('The exact local native Git subject attestation is unavailable.')
    this.name = 'RuntimeGitSubjectAttestationUnavailableError'
  }
}

export class RuntimeGitSubjectAttestationCommands {
  constructor(private readonly host: RuntimeGitSubjectAttestationHost) {}

  async attestExactLocalNativeGitSubject(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitSubjectAttestation> {
    if (
      signal?.aborted ||
      !hasExactLocalNativeGitBindingShape(binding) ||
      !(await this.host.isBindingCurrent(binding, signal))
    ) {
      throw new RuntimeGitSubjectAttestationUnavailableError()
    }

    const effectiveSubject = await this.host.readEffectiveSubject(binding, signal)
    if (
      signal?.aborted ||
      !effectiveSubject ||
      !nativeGitSubjectMatchesRegistration(effectiveSubject, binding.registrationIdentity) ||
      !(await this.host.isBindingCurrent(binding, signal))
    ) {
      throw new RuntimeGitSubjectAttestationUnavailableError()
    }
    return { binding, effectiveSubject }
  }
}

function hasExactLocalNativeGitBindingShape(binding: ExactLocalNativeGitWorktreeBinding): boolean {
  const { request, registrationIdentity, target, token } = binding
  const repo = target.repo
  return Boolean(
    repo &&
    target.executionHostId === LOCAL_EXECUTION_HOST_ID &&
    getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID &&
    !repo.connectionId &&
    repo.kind !== 'folder' &&
    !isWslUncPath(repo.path) &&
    !isWslUncPath(target.worktree.path) &&
    isDeepStrictEqual(target.localGitOptions, {}) &&
    request.executionHostId === LOCAL_EXECUTION_HOST_ID &&
    request.repositoryId === repo.id &&
    request.worktreeId === target.worktree.id &&
    request.instanceId === target.worktree.instanceId &&
    request.identityKey === target.worktree.identity?.key &&
    areWorktreePathsEqual(target.worktree.path, target.worktree.git.path) &&
    areWorktreePathsEqual(target.worktree.path, registrationIdentity.worktreeRoot) &&
    token.registrationFingerprint === registrationIdentity.fingerprint
  )
}
