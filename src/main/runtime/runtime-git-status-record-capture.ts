import { isDeepStrictEqual } from 'node:util'
import { nativeGitSubjectMatchesRegistration } from '../git/native-worktree-subject-attestation'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeSubject } from '../git/worktree-catalog-registration-identity'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import type { ExactLocalNativeGitSubjectAttestation } from './runtime-git-subject-attestation'

export type ExactLocalNativeGitStatusRecordCapture = {
  binding: ExactLocalNativeGitWorktreeBinding
  effectiveSubject: NativeGitWorktreeSubject
  status: NativeGitWorktreeStatusRecordCapture
  operationMarkers: NativeGitOperationMarkerCapture
}

export type RuntimeGitStatusRecordCaptureHost = {
  attestSubject(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitSubjectAttestation>
  readStatusRecords(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<NativeGitWorktreeStatusRecordCapture | null>
  readOperationMarkers(
    subject: NativeGitWorktreeSubject,
    signal?: AbortSignal
  ): Promise<NativeGitOperationMarkerCapture | null>
}

export class RuntimeGitStatusRecordCaptureUnavailableError extends Error {
  readonly code = 'runtime_git_status_record_capture_unavailable'

  constructor() {
    super('The exact local native Git status record capture is unavailable.')
    this.name = 'RuntimeGitStatusRecordCaptureUnavailableError'
  }
}

export class RuntimeGitStatusRecordCaptureCommands {
  constructor(private readonly host: RuntimeGitStatusRecordCaptureHost) {}

  async captureExactLocalNativeGitStatusRecords(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitStatusRecordCapture> {
    if (signal?.aborted) {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }
    const before = await this.host.attestSubject(binding, signal)
    if (signal?.aborted || !isDeepStrictEqual(before.binding, binding)) {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }

    const status = await this.host.readStatusRecords(binding, signal)
    if (signal?.aborted || !status || status.executionRoute !== 'native') {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }
    const operationMarkers = await this.host.readOperationMarkers(before.effectiveSubject, signal)
    if (signal?.aborted || !operationMarkers || operationMarkers.filesystemRoute !== 'native') {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }

    const after = await this.host.attestSubject(binding, signal)
    if (
      signal?.aborted ||
      !isDeepStrictEqual(after.binding, binding) ||
      !nativeGitSubjectMatchesRegistration(after.effectiveSubject, before.effectiveSubject)
    ) {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }
    return { binding, effectiveSubject: before.effectiveSubject, status, operationMarkers }
  }
}
