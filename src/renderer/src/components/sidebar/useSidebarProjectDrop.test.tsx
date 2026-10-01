// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_FILE_DROP_TARGET,
  type NativeFileDropPayload
} from '../../../../shared/native-file-drop'
import { useSidebarProjectDrop } from './useSidebarProjectDrop'

const mocks = vi.hoisted(() => ({ openModal: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (
    selector: (state: { settings: null; openModal: typeof mocks.openModal }) => unknown
  ) => selector({ settings: null, openModal: mocks.openModal })
}))

type FileDropHandler = (data: NativeFileDropPayload) => void

const authorizeExternalPath = vi.fn()
const stat = vi.fn()
let dropHandler: FileDropHandler | null = null
const onFileDrop = vi.fn((callback: FileDropHandler) => {
  dropHandler = callback
  return () => {
    dropHandler = null
  }
})
let originalApiDescriptor: PropertyDescriptor | undefined

function emitProjectDrop(): void {
  const handler = dropHandler
  if (!handler) {
    throw new Error('file drop listener is not mounted')
  }
  act(() => {
    handler({
      target: NATIVE_FILE_DROP_TARGET.projectSidebar,
      paths: ['C:\\projects\\sample']
    })
  })
}

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  dropHandler = null
  authorizeExternalPath.mockReset().mockResolvedValue(undefined)
  stat.mockReset().mockResolvedValue({ isDirectory: true })
  onFileDrop.mockClear()
  mocks.openModal.mockClear()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { onFileDrop },
      fs: { authorizeExternalPath, stat }
    }
  })
})

afterEach(() => {
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('useSidebarProjectDrop', () => {
  it('ignores late drops and stops an in-flight add after Tickets becomes active', async () => {
    let resolveAuthorization: () => void = () => undefined
    authorizeExternalPath.mockImplementation(
      () => new Promise<void>((resolve) => (resolveAuthorization = resolve))
    )
    const { rerender, unmount } = renderHook(({ enabled }) => useSidebarProjectDrop(enabled), {
      initialProps: { enabled: true }
    })

    emitProjectDrop()
    expect(authorizeExternalPath).toHaveBeenCalledOnce()
    rerender({ enabled: false })
    await act(async () => resolveAuthorization())

    expect(stat).not.toHaveBeenCalled()
    expect(mocks.openModal).not.toHaveBeenCalled()
    emitProjectDrop()
    expect(authorizeExternalPath).toHaveBeenCalledOnce()
    unmount()
  })

  it('does not open Add Project when a stat finishes after Tickets becomes active', async () => {
    let resolveStat: (result: { isDirectory: boolean }) => void = () => undefined
    authorizeExternalPath.mockResolvedValue(undefined)
    stat.mockImplementation(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (resolveStat = resolve))
    )
    const { rerender, unmount } = renderHook(({ enabled }) => useSidebarProjectDrop(enabled), {
      initialProps: { enabled: true }
    })

    emitProjectDrop()
    await waitFor(() => expect(stat).toHaveBeenCalledOnce())
    rerender({ enabled: false })
    await act(async () => resolveStat({ isDirectory: true }))

    expect(mocks.openModal).not.toHaveBeenCalled()
    unmount()
  })

  it('invalidates delayed authorization across a Tickets round-trip and accepts a new Projects drop', async () => {
    let resolveAuthorization: () => void = () => undefined
    authorizeExternalPath
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveAuthorization = resolve))
      )
      .mockResolvedValue(undefined)
    const { rerender, unmount } = renderHook(({ enabled }) => useSidebarProjectDrop(enabled), {
      initialProps: { enabled: true }
    })

    emitProjectDrop()
    expect(authorizeExternalPath).toHaveBeenCalledOnce()
    rerender({ enabled: false })
    rerender({ enabled: true })
    await act(async () => resolveAuthorization())

    expect(stat).not.toHaveBeenCalled()
    expect(mocks.openModal).not.toHaveBeenCalled()

    emitProjectDrop()
    await waitFor(() => expect(mocks.openModal).toHaveBeenCalledOnce())
    expect(mocks.openModal).toHaveBeenCalledWith('add-repo', {
      droppedLocalPath: 'C:\\projects\\sample'
    })
    unmount()
  })
})
