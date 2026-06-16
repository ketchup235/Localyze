import type { Business } from "@/lib/types"

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  )

const ratingOf = (b: Business): number => b.rating ?? b.base_rating ?? 0

// Mirror the on-screen sort so the report matches what the user is looking at.
const sortRows = (saved: Business[], sort: string): Business[] =>
  [...saved].sort((a, b) => {
    if (sort === "reviews") return (b.review_count || 0) - (a.review_count || 0)
    if (sort === "name") return (a.name || "").localeCompare(b.name || "")
    return ratingOf(b) - ratingOf(a) // default + "rating" → best rated first
  })

// Builds the report HTML: a metrics summary, a category breakdown, and a
// per-business table. No side effects, so it's easy to test.
export function buildSavedBusinessesReportHtml(
  saved: Business[],
  sort: string,
  currentZip: string,
): string {
  const rows = sortRows(saved, sort)
  const total = rows.length
  const avgRating = total ? rows.reduce((sum, b) => sum + ratingOf(b), 0) / total : 0
  const totalReviews = rows.reduce((sum, b) => sum + (b.review_count || 0), 0)
  const totalDeals = rows.reduce((sum, b) => sum + (b.deals?.length || 0), 0)
  const byCategory = rows.reduce<Record<string, number>>((acc, b) => {
    const key = (b.category || "local").toLowerCase()
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const generatedAt = new Date().toLocaleString()

  const summaryCells = [
    ["Saved businesses", String(total)],
    ["Average rating", `${avgRating.toFixed(1)} / 5`],
    ["Total reviews", String(totalReviews)],
    ["Active deals", String(totalDeals)],
  ]
    .map(
      ([label, value]) =>
        `<div style="flex:1;min-width:120px;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;">
           <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${label}</div>
           <div style="font-size:22px;font-weight:700;color:#0f172a;">${value}</div>
         </div>`,
    )
    .join("")

  const categoryRows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `<li><strong>${escapeHtml(cat)}</strong>: ${count}</li>`)
    .join("")

  const tableRows = rows
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.category || "local")}</td>
        <td>${ratingOf(b).toFixed(1)}</td>
        <td>${b.review_count || 0}</td>
        <td>${
          b.deals && b.deals.length
            ? b.deals.map((d) => `${escapeHtml(d.code)} (${escapeHtml(d.discount)})`).join("<br/>")
            : "-"
        }</td>
        <td>${escapeHtml(b.address || currentZip)}</td>
      </tr>`,
    )
    .join("")

  return `
    <html>
      <head>
        <title>Localyze Saved Businesses Report</title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; color:#0f172a; padding:32px; }
          h1 { margin:0 0 4px; font-size:24px; }
          .meta { color:#64748b; font-size:12px; margin-bottom:20px; }
          .summary { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
          h2 { font-size:14px; text-transform:uppercase; letter-spacing:.08em; color:#475569; margin:24px 0 8px; }
          ul { margin:0 0 8px 18px; padding:0; }
          table { width:100%; border-collapse:collapse; font-size:13px; }
          th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
          th { background:#f8fafc; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#475569; }
        </style>
      </head>
      <body>
        <h1>Localyze - Saved Businesses Report</h1>
        <div class="meta">
          Generated ${generatedAt}${currentZip ? ` · area ${escapeHtml(currentZip)}` : ""} · sorted by ${escapeHtml(sort)}
        </div>
        <div class="summary">${summaryCells}</div>
        <h2>Category breakdown</h2>
        <ul>${categoryRows}</ul>
        <h2>Businesses</h2>
        <table>
          <thead>
            <tr><th>Name</th><th>Category</th><th>Rating</th><th>Reviews</th><th>Deals</th><th>Location</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `
}

// Render the report to a print window (→ PDF) with no extra dependencies.
export function printSavedBusinessesReport(
  saved: Business[],
  sort: string,
  currentZip: string,
): void {
  if (!saved.length) return
  const win = window.open("", "_blank")
  if (!win) return
  win.document.write(buildSavedBusinessesReportHtml(saved, sort, currentZip))
  win.document.close()
  win.focus()
  win.print()
}
