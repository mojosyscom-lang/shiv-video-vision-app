// ---------- INITIAL SETUP ----------
document.addEventListener("DOMContentLoaded", initInvoice);

async function initInvoice() {
  // Auto date (ISO -> Sheets formats it as "02 Feb 2026")
  const d = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById("invDate");
  if (dateEl) dateEl.value = d;

  // Get next invoice number (READ = api)
  try {
    const r = await api({ action: "getNextInvoiceNo" });
    const noEl = document.getElementById("invNo");
    if (r && r.invoice_no && noEl) {
      noEl.value = r.invoice_no;
    }
  } catch (e) {
    console.error("Invoice number error", e);
  }

  // Start with one row
  addItemRow();
}

// ---------- CALCULATIONS ----------
function calculateTotal() {
  let totalAmt = 0;
  document.querySelectorAll(".itemAmount").forEach(el => {
    totalAmt += Number(el.innerText || 0);
  });

  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.value = totalAmt;
}

// ---------- ADD ITEM ROW ----------
function addItemRow() {
  const table = document.getElementById("itemsTable");
  if (!table) return;

  const row = table.insertRow();
  row.innerHTML = `
    <td><input class="itemDesc" placeholder="Item description"></td>
    <td><input type="number" class="itemQty" value="1"></td>
    <td><input type="number" class="itemRate" value="0"></td>
    <td class="itemAmount">0</td>
  `;

  row.querySelector(".itemQty").addEventListener("input", () => rowCalc(row));
  row.querySelector(".itemRate").addEventListener("input", () => rowCalc(row));
}

// ---------- ROW CALC ----------
function rowCalc(row) {
  const qty = Number(row.querySelector(".itemQty").value || 0);
  const rate = Number(row.querySelector(".itemRate").value || 0);
  const amt = qty * rate;

  row.querySelector(".itemAmount").innerText = amt;
  calculateTotal();
}

// ---------- SAVE INVOICE (HEADER + ITEMS) ----------
async function saveInvoice() {
  const invNo = document.getElementById("invNo").value;
  const invDate = document.getElementById("invDate").value;
  const client = document.getElementById("client").value;
  const totalAmt = Number(document.getElementById("total").value || 0);

  if (!client || !totalAmt) {
    alert("Please enter client name and items");
    return;
  }

  const subtotal = totalAmt;
  const gst = Math.round(subtotal * 0.18);
  const grandTotal = subtotal + gst;

  // 1️⃣ Save invoice header (WRITE = apiSafe)
  const headerRes = await apiSafe({
    action: "addInvoice",
    invoice_no: invNo,
    date: invDate,
    client,
    subtotal,
    gst,
    total: grandTotal
  });

  if (headerRes && headerRes.queued) {
    alert("Offline: Invoice saved locally. Will sync when online.");
  }

  // 2️⃣ Save invoice items
  const rows = document.querySelectorAll("#itemsTable tr");
  for (const row of rows) {
    const desc = row.querySelector(".itemDesc")?.value?.trim();
    const qty = Number(row.querySelector(".itemQty")?.value || 0);
    const rate = Number(row.querySelector(".itemRate")?.value || 0);
    const amt = qty * rate;

    if (!desc || !qty) continue;

    await apiSafe({
      action: "addInvoiceItem",
      invoice_no: invNo,
      date: invDate,
      description: desc,
      qty,
      rate,
      amount: amt
    });
  }

  alert("Invoice saved successfully");
}

// ---------- EXPORT PDF ----------
function exportInvoice() {
  window.print();
}

// ---------- SEND WHATSAPP ----------
function sendWhatsApp() {
  const msg = `
Shiv Video Vision
Invoice No: ${document.getElementById("invNo").value}
Client: ${document.getElementById("client").value}
Total Amount: ₹${document.getElementById("total").value}

Thank you.
`;

  const url = "https://wa.me/?text=" + encodeURIComponent(msg);
  window.open(url, "_blank");
}
