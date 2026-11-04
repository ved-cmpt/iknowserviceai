// A real table on wide screens and stacked cards under 640px (see components.css).
// CSS `display` changes can strip table semantics, so the roles are stated explicitly.
//
// columns: [{ key, header, render(row), primary }]. `primary` marks the column shown as the card
// heading on small screens.
export default function Table({ caption, columns, rows, rowKey = (row) => row.id }) {
  return (
    <div className="table-wrap">
      <table className="data-table" role="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.key} scope="col" role="columnheader">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={rowKey(row)} role="row">
              {columns.map((column) => (
                <td
                  key={column.key}
                  role="cell"
                  data-label={column.header}
                  data-primary={column.primary ? 'true' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
