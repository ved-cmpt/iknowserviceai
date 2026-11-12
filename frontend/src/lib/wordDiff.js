// A word-level diff, for showing staff what they changed in the AI draft. Whitespace is kept with
// the word before it, so the result reads like the text. Replies are at most a few hundred words,
// so the simple longest-common-subsequence table is fast enough.
const MAX_TOKENS = 600

function tokens(text) {
  return text.match(/\S+\s*|\s+/g) ?? []
}

// Returns [{ type: 'same' | 'added' | 'removed', text }], merged into runs.
export function wordDiff(before, after) {
  const a = tokens(before)
  const b = tokens(after)
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ]
  }
  const key = (token) => token.trim()
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = key(a[i]) === key(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const parts = []
  const push = (type, text) => {
    const last = parts[parts.length - 1]
    if (last?.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      push('same', b[j])
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push('removed', a[i])
      i += 1
    } else {
      push('added', b[j])
      j += 1
    }
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

export function diffCounts(parts) {
  const words = (text) => text.trim().split(/\s+/).filter(Boolean).length
  return parts.reduce(
    (total, part) => {
      if (part.type === 'added') total.added += words(part.text)
      if (part.type === 'removed') total.removed += words(part.text)
      return total
    },
    { added: 0, removed: 0 },
  )
}
