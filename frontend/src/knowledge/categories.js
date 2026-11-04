export const CATEGORIES = [
  ['', 'All categories'],
  ['ACCOUNT_ACCESS', 'Account access'],
  ['SOFTWARE', 'Software'],
  ['HARDWARE', 'Hardware'],
  ['NETWORK', 'Network'],
  ['OTHER', 'Other'],
]

export function categoryLabel(value) {
  return CATEGORIES.find(([key]) => key === value)?.[1] ?? value
}
