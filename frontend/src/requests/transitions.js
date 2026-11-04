// Mirrors STAFF_TRANSITIONS in backend/app/services/state_machine.py, so staff are only offered
// moves the API allows. The server still decides. ANALYZING and CLOSED have no manual exits.
export const STAFF_TRANSITIONS = {
  NEW: ['TRIAGED', 'NEEDS_HUMAN_REVIEW'],
  ANALYZING: [],
  TRIAGED: ['IN_PROGRESS', 'NEEDS_HUMAN_REVIEW'],
  NEEDS_HUMAN_REVIEW: ['TRIAGED', 'IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED', 'NEEDS_HUMAN_REVIEW'],
  RESOLVED: ['CLOSED', 'NEEDS_HUMAN_REVIEW'],
  CLOSED: [],
}

export function allowedTransitions(status) {
  return STAFF_TRANSITIONS[status] ?? []
}
