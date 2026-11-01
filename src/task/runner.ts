/**
 * Requests of a task and their answers (26.57, D113; manual §7.1, §10.3, §12.1 item 7, VP-05, T14). Every solve
 * gets a ticket with the task id, revision and content hash it was asked for; an answer is accepted only while its
 * ticket is the current one and the task has not changed since. A newer request supersedes the older one (no queue
 * of stale work), and cancel drops the current one. The solver itself is synchronous in the core; the ticket guards
 * the interface against answers that arrive after the question changed (an asynchronous step, a slow machine).
 */
import type { ResultEnvelope, TaskSpec } from './types'

/** A request in flight. */
export interface Ticket { id: number; taskId: string; revision: number; hash: string; started: number }

export class TaskRunner {
  private seq = 0
  private current: Ticket | null = null
  /** Answers dropped because their question had changed (shown in the diagnostics; tests read it). */
  dropped = 0

  /** Start a request for a task revision; any request before it is superseded. */
  begin(task: TaskSpec, hash: string): Ticket {
    this.current = { id: ++this.seq, taskId: task.taskId, revision: task.revision, hash, started: Date.now() }
    return this.current
  }

  /** Drop the current request (the user's cancel, or the task changed). */
  cancel() { this.current = null }

  /** The request in flight, if any. */
  get pending(): Ticket | null { return this.current }

  /** Whether an answer to `ticket` may still be shown for `task` with content hash `hash`. */
  accepts(ticket: Ticket, task: TaskSpec | null, hash: string): boolean {
    const ok = !!this.current && this.current.id === ticket.id && !!task && task.taskId === ticket.taskId && task.revision === ticket.revision && hash === ticket.hash
    if (!ok) this.dropped++
    return ok
  }

  /** Finish the request (its answer was shown). */
  finish(ticket: Ticket) { if (this.current?.id === ticket.id) this.current = null }
}

/** Whether a result belongs to this revision of the task and this content (manual §10.3: checked before display). */
export function isCurrent(r: ResultEnvelope, task: TaskSpec | null, hash: string): boolean {
  return !!task && r.taskId === task.taskId && r.taskRevision === task.revision && r.sceneHash === hash
}

/**
 * Run a solve through the runner: start a ticket, yield once (so the interface can show “求解中” and accept a cancel
 * or a newer edit), solve, and hand the outcome over only if the ticket is still current.
 */
export async function runGuarded<T>(runner: TaskRunner, task: TaskSpec, hash: string, read: () => { task: TaskSpec | null; hash: string }, solve: () => T, yieldOnce: () => Promise<void> = () => new Promise(r => setTimeout(r, 0))): Promise<{ accepted: boolean; value: T | null }> {
  const ticket = runner.begin(task, hash)
  await yieldOnce()
  if (runner.pending?.id !== ticket.id) { runner.dropped++; return { accepted: false, value: null } }
  const value = solve()
  await yieldOnce()
  const now = read()
  if (!runner.accepts(ticket, now.task, now.hash)) return { accepted: false, value: null }
  runner.finish(ticket)
  return { accepted: true, value }
}
