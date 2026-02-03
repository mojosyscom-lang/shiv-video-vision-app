// ---------- EXPORT TO CSV ----------
function exportCSV(tableId, filename = "export.csv") {
  const rows = document.querySelectorAll(`#${tableId} tr`);
  let csv = [];

  rows.forEach(row => {
    const cols = row.querySelectorAll("td, th");
    let rowData = [];
    cols.forEach(col => {
      let text = col.innerText.replace(/"/g, '""');
      rowData.push(`"${text}"`);
    });
    csv.push(rowData.join(","));
  });

  downloadCSV(csv.join("\n"), filename);
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
