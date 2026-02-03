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
    if (r && r.invoice_no && noEl) noEl.value = r.invoice_no;
  } catch (e) {
    console.error("Invoice number error", e);
  }

  // Start with one row
  addItemRow();
  calculateTotal();
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
  rowCalc(row); // compute immediately
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
  const btn = document.getElementById("btn_save_invoice");
  const unlock = lockButton(btn, "Saving...");

  try {
    const invNo = (document.getElementById("invNo")?.value || "").trim();
    const invDate = (document.getElementById("invDate")?.value || "").trim();
    const client = (document.getElementById("client")?.value || "").trim();
    const totalAmt = Number(document.getElementById("total")?.value || 0);

    if (!invNo) {
      alert("Invoice number missing. Reload page.");
      return;
    }
    if (!client) {
      alert("Please enter client name");
      return;
    }
    if (!totalAmt) {
      alert("Please add at least one item with amount");
      return;
    }

    const subtotal = totalAmt;
    const gst = Math.round(subtotal * 0.18);
    const grandTotal = subtotal + gst;

    // 1) Save invoice header (WRITE = apiSafe)
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

    // 2) Save invoice items
    // Skip header row by selecting rows that have .itemDesc
    const rows = document.querySelectorAll("#itemsTable tr");
    for (const row of rows) {
      const descEl = row.querySelector(".itemDesc");
      if (!descEl) continue; // header row or unexpected row

      const desc = descEl.value.trim();
      const qty = Number(row.querySelector(".itemQty")?.value || 0);
      const rate = Number(row.querySelector(".itemRate")?.value || 0);
      const amt = qty * rate;

      if (!desc || qty <= 0) continue;

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
  } catch (e) {
    console.error("Save invoice error:", e);
    alert("Error saving invoice. Check console.");
  } finally {
    // small delay prevents fast double-click spam
    setTimeout(unlock, 600);
  }
}

// ---------- EXPORT PDF ----------
function exportInvoice() {
  window.print();
}

// ---------- SEND WHATSAPP ----------
function sendWhatsApp() {
  const msg = `
Shiv Video Vision
Invoice No: ${(document.getElementById("invNo")?.value || "").trim()}
Client: ${(document.getElementById("client")?.value || "").trim()}
Total Amount: ₹${(document.getElementById("total")?.value || "").trim()}

Thank you.
`.trim();

  const url = "https://wa.me/?text=" + encodeURIComponent(msg);
  window.open(url, "_blank");
}

// ---------- Button Lock Helper ----------
function lockButton(btn, savingText = "Saving...") {
  if (!btn) return () => {};

  const original = {
    disabled: btn.disabled,
    text: btn.innerText,
    opacity: btn.style.opacity,
    cursor: btn.style.cursor
  };

  btn.disabled = true;
  btn.innerText = savingText;
  btn.style.opacity = "0.6";
  btn.style.cursor = "not-allowed";
  btn.classList.add("btn-saving");

  return () => {
    btn.disabled = original.disabled;
    btn.innerText = original.text;
    btn.style.opacity = original.opacity;
    btn.style.cursor = original.cursor;
    btn.classList.remove("btn-saving");
  };
}
