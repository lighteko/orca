export type WindowsPathEntryEvidence =
  | { status: 'entry'; attributes: number; reparseTag: number }
  | { status: 'missing' }
  | { status: 'unavailable' }

/** Returns only QueryDosDeviceW's current target, or null when the query is inconclusive. */
export declare function queryDosDeviceTarget(drive: string): Promise<string | null>

/** Opens one path entry without following its final reparse point. */
export declare function inspectPathEntry(path: string): Promise<WindowsPathEntryEvidence>
