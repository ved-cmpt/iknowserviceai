import { diffCounts, wordDiff } from '../lib/wordDiff'

// What staff changed in the AI draft. Inserted and deleted words are marked with <ins> and <del>,
// which screen readers can announce, and the counts are written out, so color is never the signal.
export default function ReplyDiff({ draft, reply }) {
  if (reply.trim() === draft.trim()) {
    return (
      <div className="diff" data-testid="reply-diff">
        <p className="diff-head">
          Changes from the AI draft
          <span className="meta">None yet. The reply is the draft, word for word.</span>
        </p>
      </div>
    )
  }
  const parts = wordDiff(draft, reply)
  const { added, removed } = diffCounts(parts)
  return (
    <div className="diff" data-testid="reply-diff">
      <p className="diff-head">
        Changes from the AI draft
        <span className="diff-stats">
          <span className="diff-stat-added">+{added} {added === 1 ? 'word' : 'words'}</span>
          <span className="diff-stat-removed">−{removed} {removed === 1 ? 'word' : 'words'}</span>
        </span>
      </p>
      <p className="diff-text">
        {parts.map((part, index) =>
          part.type === 'added' ? (
            <ins key={index}>{part.text}</ins>
          ) : part.type === 'removed' ? (
            <del key={index}>{part.text}</del>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
    </div>
  )
}
