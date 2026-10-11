// Building elements with text and attributes, and nothing else: the extension never sets
// `innerHTML`, so nothing a scanned page says (a message that quotes it, a selector) can become
// markup in the popup.

type Attributes = Readonly<Record<string, string | boolean | undefined>>
export type Child = Node | string | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    node.setAttribute(name, value === true ? '' : value)
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(child)
  }
  return node
}

/** Replaces everything in `parent` with `children`. */
export function fill(parent: Element, ...children: Child[]): void {
  parent.replaceChildren(
    ...children.filter(
      (child): child is Node | string => child !== null && child !== undefined && child !== false,
    ),
  )
}
