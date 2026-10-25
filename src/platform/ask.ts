/**
 * Yes/no questions (26.51 hand check). In the browser `window.confirm` blocks and returns a boolean; in the desktop
 * app the Tauri dialog plugin replaces it with a native dialog that returns a Promise, so code that tested
 * `confirm(...)` directly saw a truthy Promise and went ahead before the user answered (Cancel did nothing). Every
 * question goes through `ask`, which waits for the answer in both cases.
 */
export async function ask(message: string): Promise<boolean> {
  const answer = (window.confirm as (m: string) => boolean | Promise<boolean>)(message)
  return (await answer) === true
}
