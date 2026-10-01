/**
 * Ticket workspace M0 item 3: does a coordinator folder project's root agent resume?
 *
 * The coordinator is a non-Git folder inside WSL, registered from the Windows host, so its
 * terminal runs through wsl.exe. Each scenario answers one question: after the app goes away,
 * does the same root agent come back exactly once?
 *
 * Run: ORCA_BACKGROUND_LAUNCH=1 npx playwright test tests/e2e/ticket-coordinator-root-agent-resume.spec.ts \
 *   --config tests/playwright.config.ts --project electron-headless --workers=1
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { z } from 'zod'
import { test, expect } from './helpers/orca-app'
import {
  execInTerminal,
  waitForActivePaneHookDescriptor,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForPaneCount,
  waitForTerminalOutput
} from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { createRestartSession } from './helpers/orca-restart'
import {
  activateWorkspaceByClick,
  readHostLiveTerminalCount,
  sleepWorkspaceViaSidebar
} from './helpers/slept-workspace-probe'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'
import { DEFAULT_LOCAL_ORCA_PROFILE_ID } from '../../src/shared/orca-profiles'

const DISTRO = process.env.ORCA_E2E_WSL_DISTRO ?? 'Ubuntu-24.04'
const PROVIDER_SESSION_ID = 'e2e-coordinator-root-agent'
const PROVIDER_RESUME_MARKER = `PROVIDER_RESUME_ACCEPTED_${PROVIDER_SESSION_ID}`
const REPEATS = Number(process.env.ORCA_E2E_RESUME_REPEATS ?? '3')

const PersistedDataSchema = z.object({
  workspaceSession: z
    .object({
      tabsByWorktree: z
        .record(
          z.string(),
          z.array(z.object({ id: z.unknown().optional(), ptyId: z.unknown().optional() }))
        )
        .optional(),
      terminalLayoutsByTabId: z.record(z.string(), z.unknown()).optional(),
      activeWorktreeIdsOnShutdown: z.unknown().optional(),
      sleepingAgentSessionsByPaneKey: z
        .record(
          z.string(),
          z.object({
            providerSession: z.object({ id: z.unknown().optional() }).optional(),
            launchConfig: z
              .object({
                agentCommand: z.string().optional(),
                agentArgs: z.string().optional(),
                agentEnv: z.record(z.string(), z.string()).optional()
              })
              .optional()
          })
        )
        .optional()
    })
    .optional()
})

type PersistedData = z.infer<typeof PersistedDataSchema>

function dataFilePath(userDataDir: string): string {
  return path.join(userDataDir, 'profiles', DEFAULT_LOCAL_ORCA_PROFILE_ID, 'orca-data.json')
}

function readPersistedData(userDataDir: string): PersistedData {
  return PersistedDataSchema.parse(JSON.parse(readFileSync(dataFilePath(userDataDir), 'utf8')))
}

function daemonPid(userDataDir: string): number {
  const raw = readFileSync(
    path.join(userDataDir, 'daemon', `daemon-v${PROTOCOL_VERSION}.pid`),
    'utf8'
  )
  const parsed = z.object({ pid: z.number() }).safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(`Daemon pid file has no pid: ${raw}`)
  }
  return parsed.data.pid
}

function killPid(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    process.kill(pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

function hasExited(proc: ChildProcess): boolean {
  return proc.exitCode !== null || proc.signalCode !== null
}

async function forceKillApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  if (!proc.pid || hasExited(proc)) {
    return
  }
  killPid(proc.pid)
  await new Promise<void>((resolve) => {
    if (hasExited(proc)) {
      resolve()
      return
    }
    const timeout = setTimeout(resolve, 5000)
    timeout.unref?.()
    proc.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

function wsl(...args: string[]): string {
  return execFileSync('wsl.exe', ['-d', DISTRO, '--exec', ...args], { encoding: 'utf8' })
}

/** Registers the WSL coordinator folder as a non-Git project and activates its workspace. */
async function attachCoordinatorFolder(page: Page, folderPath: string): Promise<string> {
  const repoId = await page.evaluate(async (folderPath) => {
    const result = await window.api.repos.add({ path: folderPath, kind: 'folder' })
    if ('error' in result) {
      throw new Error(result.error)
    }
    return result.repo.id
  }, folderPath)

  await page.waitForFunction(
    () => window.__store?.getState().workspaceSessionReady === true,
    null,
    {
      timeout: 30_000
    }
  )
  await expect
    .poll(
      async () =>
        page.evaluate(async (repoId) => {
          const store = window.__store
          if (!store) {
            return 0
          }
          await store.getState().fetchWorktrees(repoId)
          return store.getState().worktreesByRepo[repoId]?.length ?? 0
        }, repoId),
      { timeout: 30_000, message: 'coordinator folder never surfaced a workspace' }
    )
    .toBeGreaterThan(0)

  const worktreeId = await page.evaluate((repoId: string) => {
    const state = window.__store?.getState()
    const workspaces = state?.worktreesByRepo[repoId] ?? []
    const primary = workspaces.find((workspace) => workspace.isMainWorktree) ?? workspaces[0]
    if (!primary || !state) {
      return null
    }
    state.setActiveWorktree(primary.id)
    return primary.id
  }, repoId)
  if (!worktreeId) {
    throw new Error('coordinator workspace did not surface in the store')
  }
  return worktreeId
}

/** Opens the root agent terminal and records the live agent session the way a quit would. */
async function startRootAgent(
  page: Page,
  session: ReturnType<typeof createRestartSession>,
  folderPath: string,
  captureQuitRecord = true,
  agent: 'claude' | 'codex' = 'codex'
): Promise<{ ptyId: string; marker: string; paneKey: string }> {
  await waitForSessionReady(page)
  await expect
    .poll(() => page.evaluate(() => window.__store?.getState().hydrationSucceeded === true), {
      timeout: 30_000,
      message: 'hydration did not complete before persisting the root agent record'
    })
    .toBe(true)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page, 30_000)
  await waitForPaneCount(page, 1, 30_000)

  const descriptor = await waitForActivePaneHookDescriptor(page)
  const ptyId = await waitForActivePanePtyId(page)
  const marker = `COORDINATOR_ROOT_AGENT_${Date.now()}`
  await execInTerminal(page, ptyId, `echo ${marker}`)
  await waitForTerminalOutput(page, marker)

  const transcriptPath =
    agent === 'codex' ? session.seedCodexResumeRollout(PROVIDER_SESSION_ID, folderPath) : undefined
  await page.evaluate(
    ({ paneKey, worktreeId, providerSessionId, transcriptPath, agent }) => {
      window.__store
        ?.getState()
        .setAgentStatus(
          paneKey,
          { state: 'working', prompt: 'coordinate the ticket', agentType: agent },
          agent === 'claude' ? 'Claude' : 'Codex',
          undefined,
          { worktreeId },
          { providerSession: { key: 'session_id', id: providerSessionId, transcriptPath } }
        )
    },
    {
      paneKey: descriptor.paneKey,
      worktreeId: descriptor.worktreeId,
      providerSessionId: PROVIDER_SESSION_ID,
      transcriptPath,
      agent
    }
  )
  if (captureQuitRecord) {
    await page.evaluate(() => window.__store?.getState().captureAllSleepingAgentSessions('quit'))
    await expect
      .poll(
        () =>
          Object.values(
            readPersistedData(session.userDataDir).workspaceSession
              ?.sleepingAgentSessionsByPaneKey ?? {}
          ).some((record) => record.providerSession?.id === PROVIDER_SESSION_ID),
        { timeout: 30_000, message: 'root agent record was not persisted' }
      )
      .toBe(true)
  }
  return { ptyId, marker, paneKey: descriptor.paneKey }
}

/**
 * Models what a daemon loss leaves behind: the UI tab and the live record survive, but no pane
 * still owns a daemon session. The resumed command is stubbed so the proof does not depend on a
 * real Codex CLI or its auth.
 */
function stripPtyOwnershipAndStubResume(userDataDir: string): void {
  const data = readPersistedData(userDataDir)
  const session = data.workspaceSession
  if (!session) {
    throw new Error('Expected a persisted workspace session')
  }
  for (const tabs of Object.values(session.tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      tab.ptyId = null
    }
  }
  session.terminalLayoutsByTabId = {}
  session.activeWorktreeIdsOnShutdown = []
  for (const record of Object.values(session.sleepingAgentSessionsByPaneKey ?? {})) {
    if (record.providerSession?.id === PROVIDER_SESSION_ID) {
      record.launchConfig = { agentCommand: 'echo', agentArgs: '', agentEnv: {} }
    }
  }
  writeFileSync(dataFilePath(userDataDir), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function agentStatusState(page: Page, paneKey: string): Promise<string | undefined> {
  // The hook server's store is the only agent-status producer; read it, never a local cache.
  return page.evaluate((key) => window.__store?.getState().agentStatuses?.[key]?.state, paneKey)
}

test.describe.configure({ mode: 'serial' })

const scenarios = [
  { name: 'a graceful quit', killDaemon: false, graceful: true },
  { name: 'a force-killed app', killDaemon: false, graceful: false },
  { name: 'a force-killed app and daemon', killDaemon: true, graceful: false }
] as const

for (const scenario of scenarios) {
  test(`resumes the coordinator root agent after ${scenario.name}`, async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
  {}, testInfo) => {
    test.skip(process.platform !== 'win32', 'The coordinator route is Windows host to WSL guest')
    test.setTimeout(REPEATS * 180_000)

    for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
      const folderName = `E2E-COORDINATOR-${Date.now()}-${attempt}`
      const posixFolder = `/home/${wsl('sh', '-c', 'printf %s "$USER"').trim()}/.local/share/ticket-workspace/coordinators/${folderName}`
      wsl('mkdir', '-p', posixFolder)
      const uncFolder = `\\\\wsl.localhost\\${DISTRO}${posixFolder.replaceAll('/', '\\')}`
      expect(
        existsSync(uncFolder),
        `coordinator folder is not visible from Windows: ${uncFolder}`
      ).toBe(true)

      const session = createRestartSession(testInfo)
      let firstApp: ElectronApplication | null = null
      let secondApp: ElectronApplication | null = null
      try {
        const firstLaunch = await session.launch()
        firstApp = firstLaunch.app
        const worktreeId = await attachCoordinatorFolder(firstLaunch.page, uncFolder)
        const started = await startRootAgent(firstLaunch.page, session, posixFolder)
        const pidBefore = daemonPid(session.userDataDir)

        await (scenario.graceful ? session.close(firstApp) : forceKillApp(firstApp))
        firstApp = null
        if (scenario.killDaemon) {
          killPid(pidBefore)
          stripPtyOwnershipAndStubResume(session.userDataDir)
        }

        const secondLaunch = await session.launch()
        secondApp = secondLaunch.app
        await waitForSessionReady(secondLaunch.page)
        await expect
          .poll(
            async () =>
              secondLaunch.page.evaluate(() => window.__store?.getState().activeWorktreeId),
            {
              timeout: 30_000
            }
          )
          .toBe(worktreeId)
        await ensureTerminalVisible(secondLaunch.page)
        await waitForActiveTerminalManager(secondLaunch.page, 30_000)

        if (scenario.killDaemon) {
          // The live PTY died with the daemon, so the persisted record must resume the agent.
          await waitForTerminalOutput(secondLaunch.page, PROVIDER_SESSION_ID, 60_000)
        } else {
          // The daemon kept the PTY, so the same session reattaches with its scrollback.
          await waitForTerminalOutput(secondLaunch.page, started.marker, 60_000)
          expect(await waitForActivePanePtyId(secondLaunch.page)).toBe(started.ptyId)
          expect(daemonPid(session.userDataDir)).toBe(pidBefore)
        }

        // No duplicate root agent: a reattach keeps the one tab, and a resume adds exactly one.
        const tabCount = await secondLaunch.page.evaluate(
          (id) => (window.__store?.getState().tabsByWorktree[id] ?? []).length,
          worktreeId
        )
        expect(tabCount, `attempt ${attempt} spawned a duplicate root agent`).toBe(
          scenario.killDaemon ? 2 : 1
        )
        expect(await agentStatusState(secondLaunch.page, started.paneKey)).not.toBe('exited')
      } finally {
        if (secondApp) {
          await session.close(secondApp)
        }
        if (firstApp) {
          await forceKillApp(firstApp)
        }
        await session.dispose()
        wsl('rm', '-rf', posixFolder)
      }
    }
  })
}

test('full Workspace Sleep passes the provider session to resume and rebinds the root Run once', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform !== 'win32', 'The coordinator route is Windows host to WSL guest')
  test.setTimeout(180_000)

  const folderName = `E2E-COORDINATOR-SLEEP-${Date.now()}`
  const posixFolder = `/home/${wsl('sh', '-c', 'printf %s "$USER"').trim()}/.local/share/ticket-workspace/coordinators/${folderName}`
  wsl('mkdir', '-p', posixFolder)
  const uncFolder = `\\\\wsl.localhost\\${DISTRO}${posixFolder.replaceAll('/', '\\')}`
  expect(
    existsSync(uncFolder),
    `coordinator folder is not visible from Windows: ${uncFolder}`
  ).toBe(true)
  const providerScriptPath = `${posixFolder}/e2e-provider-resume`
  writeFileSync(
    path.join(uncFolder, 'e2e-provider-resume'),
    [
      '#!/bin/sh',
      `if [ "$1" != "--resume" ] || [ "$2" != "${PROVIDER_SESSION_ID}" ]; then exit 42; fi`,
      `printf '%s\\n' '${PROVIDER_RESUME_MARKER}'`,
      'exec sleep 300'
    ].join('\n'),
    'utf8'
  )
  wsl('chmod', '0755', providerScriptPath)

  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null
  try {
    const launch = await session.launch()
    app = launch.app
    const worktreeId = await attachCoordinatorFolder(launch.page, uncFolder)
    const started = await startRootAgent(launch.page, session, posixFolder, false, 'claude')
    const client = new RuntimeClient(session.userDataDir, 30_000, null, null)
    const originalTerminal = await client.call<{ terminal: { handle: string } }>(
      'terminal.resolvePane',
      { paneKey: started.paneKey }
    )
    const run = await client.call<{ run: { id: string; consumer_generation: number } }>(
      'orchestration.runCreate',
      {
        objective: 'Ticket coordinator full Workspace Sleep',
        from: originalTerminal.result.terminal.handle
      }
    )

    await sleepWorkspaceViaSidebar(launch.page, worktreeId)
    await expect
      .poll(() => readHostLiveTerminalCount(launch.page, worktreeId), {
        timeout: 30_000,
        message: 'Workspace Sleep did not produce a verified host-side PTY stop'
      })
      .toBe(0)
    await expect
      .poll(
        () =>
          launch.page.evaluate(
            ({ paneKey }) => {
              const record = window.__store?.getState().sleepingAgentSessionsByPaneKey[paneKey]
              return {
                origin: record?.origin,
                providerSessionId: record?.providerSession?.id
              }
            },
            { paneKey: started.paneKey }
          ),
        { timeout: 30_000, message: 'Workspace Sleep did not retain the provider resume record' }
      )
      .toEqual({ origin: 'worktree-sleep', providerSessionId: PROVIDER_SESSION_ID })
    await expect
      .poll(
        () =>
          Object.values(
            readPersistedData(session.userDataDir).workspaceSession
              ?.sleepingAgentSessionsByPaneKey ?? {}
          ).some((record) => record.providerSession?.id === PROVIDER_SESSION_ID),
        { timeout: 30_000, message: 'Workspace Sleep resume record did not reach disk' }
      )
      .toBe(true)

    await launch.page.evaluate(
      ({ paneKey, providerScriptPath }) => {
        const store = window.__store
        const record = store?.getState().sleepingAgentSessionsByPaneKey[paneKey]
        if (!store || !record) {
          throw new Error('Workspace Sleep resume record disappeared')
        }
        store.setState({
          sleepingAgentSessionsByPaneKey: {
            ...store.getState().sleepingAgentSessionsByPaneKey,
            [paneKey]: {
              ...record,
              launchConfig: { agentCommand: providerScriptPath, agentArgs: '', agentEnv: {} }
            }
          }
        })
      },
      { paneKey: started.paneKey, providerScriptPath }
    )
    await activateWorkspaceByClick(launch.page, worktreeId)
    await ensureTerminalVisible(launch.page)
    await waitForActiveTerminalManager(launch.page, 30_000)
    await waitForTerminalOutput(launch.page, PROVIDER_RESUME_MARKER, 60_000)
    await expect.poll(() => readHostLiveTerminalCount(launch.page, worktreeId)).toBe(1)

    const resumedDescriptor = await waitForActivePaneHookDescriptor(launch.page)
    const resumedTerminal = await client.call<{ terminal: { handle: string } }>(
      'terminal.resolvePane',
      { paneKey: resumedDescriptor.paneKey }
    )
    const rebound = await client.call<{ run: { id: string; consumer_generation: number } }>(
      'orchestration.runUse',
      { id: run.result.run.id, from: resumedTerminal.result.terminal.handle }
    )
    const current = await client.call<{ run: { id: string; consumer_generation: number } }>(
      'orchestration.runCurrent',
      { from: resumedTerminal.result.terminal.handle }
    )
    expect(rebound.result.run.id).toBe(run.result.run.id)
    expect(rebound.result.run.consumer_generation).toBe(run.result.run.consumer_generation + 1)
    expect(current.result.run.id).toBe(run.result.run.id)

    const finalState = await launch.page.evaluate(
      ({ worktreeId, providerSessionId }) => {
        const state = window.__store?.getState()
        return {
          tabs: state?.tabsByWorktree[worktreeId]?.length ?? 0,
          remainingProviderRecords: Object.values(
            state?.sleepingAgentSessionsByPaneKey ?? {}
          ).filter((record) => record.providerSession?.id === providerSessionId).length
        }
      },
      { worktreeId, providerSessionId: PROVIDER_SESSION_ID }
    )
    expect(finalState).toEqual({ tabs: 1, remainingProviderRecords: 0 })
    await session.close(app)
    app = null
    expect(
      Object.values(
        readPersistedData(session.userDataDir).workspaceSession?.sleepingAgentSessionsByPaneKey ??
          {}
      ).filter((record) => record.providerSession?.id === PROVIDER_SESSION_ID)
    ).toHaveLength(0)
  } finally {
    try {
      if (app) {
        await session.close(app)
      }
    } finally {
      try {
        await session.dispose()
      } finally {
        wsl('rm', '-rf', posixFolder)
      }
    }
  }
})
