import { navItemsFor } from '../auth/roles'
import Button from './Button'
import Modal from './Modal'

export const PALETTE_KEYS = 'Ctrl K'

// Every shortcut this person can use, from the same list the sidebar is built from.
export default function ShortcutsHelp({ user, onClose }) {
  const groups = [
    [
      'Anywhere',
      [
        [[PALETTE_KEYS], 'Search pages, requests and articles'],
        [['?'], 'Show this list'],
        [['['], 'Collapse or expand the sidebar'],
      ],
    ],
    ['Go to', navItemsFor(user).map((item) => [['g', item.key], item.label])],
    [
      'In a list',
      [
        [['j'], 'Next row'],
        [['k'], 'Previous row'],
        [['Enter'], 'Open the row'],
      ],
    ],
  ]

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} className="dialog-wide">
      <div className="shortcut-groups">
        {groups.map(([heading, rows]) => (
          <section key={heading} aria-label={heading}>
            <h3>{heading}</h3>
            <dl className="shortcut-list">
              {rows.map(([keys, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="shortcut-then">then</span>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="meta">On a Mac, use ⌘ K for search. Shortcuts are off while you type in a field.</p>
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
