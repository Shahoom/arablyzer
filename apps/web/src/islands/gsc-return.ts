/**
 * What `?gsc=` holds when the visitor comes back from Google: a one-time result's id, or a word.
 * It is taken out of the address at once, so a reload, a copied link or the history never has it.
 */
export function takeReturn(): string | null {
  try {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('gsc')
    if (value === null) return null
    url.searchParams.delete('gsc')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    return value
  } catch {
    return null
  }
}
