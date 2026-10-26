/**
 * Opening reveal (manual 26.52, D54). index.html paints the opening screen before any script runs and keeps the
 * interface clipped to nothing (`html.booting`). Once the interface has mounted and two frames have been painted,
 * the circle grows from the centre of the screen (`html.revealing`, 420 ms; a 150 ms fade under reduced motion);
 * at the end the classes and the opening layer are removed. A timer finishes the reveal should the animation
 * event never arrive (hidden page, animations disabled).
 */
export function revealInterface(): Promise<void> {
  const html = document.documentElement
  const app = document.getElementById('app')
  if (!html.classList.contains('booting') || !app) return Promise.resolve()
  return new Promise(resolve => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      html.classList.remove('booting', 'revealing')
      document.getElementById('vp-splash')?.remove()
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.addEventListener('animationend', e => { if (e.target === app) finish() })
      html.classList.add('revealing')
      setTimeout(finish, 900)
    }))
  })
}
