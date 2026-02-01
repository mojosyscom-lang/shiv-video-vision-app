// ---------- INITIAL SETUP ----------
document.addEventListener("DOMContentLoaded", initInvoice);

async function initInvoice() {
  // Auto date
  const d = new Date().toISOString().slice(0, 10);
  if (document.getElementById("invDate")) {
    invDate.value = d;
  }

  // Get next invoice number
  try {
    const r = await api({ action: "getNextInvoiceNo" });
    if (r && r.invoice_no && document.getElementById("invNo")) {
      invNo.value = r.invoice_no;
    }
  } catch (e) {
    console.error("Invoice number error", e);
  }
}

// ---------- CALCULATIONS ----------
function calculateTotal() {
  let total = 0;
  document.querySelectorAll(".itemAmount").forEach(el => {
    total += Number(el.innerText || 0);
  });
  if (document.getElementById("total")) {
    total.value = total;
  }
}

// ---------- ADD ITEM ROW ----------
function addItemRow() {
  const table = document.getElementById("itemsTable");
  const row = table.insertRow();

  row.innerHTML = `
    <td><input class="itemDesc" placeholder="Item description"></td>
    <td><input type="number" class="itemQty" value="1" oninput="rowCalc(this)"></td>
    <td><input type="number" class="itemRate" value="0" oninput="rowCalc(this)"></td>
    <td class="itemAmount">0</td>
  `;
}

// ---------- ROW CALC ----------
function rowCalc(el) {
  const row = el.closest("tr");
  const qty = Number(row.querySelector(".itemQty").value || 0);
  const rate = Number(row.querySelector(".itemRate").value || 0);
  const amt = qty * rate;

  row.querySelector(".itemAmount").innerText = amt;
  calculateTotal();
}

// ---------- SAVE INVOICE ----------
async function saveInvoice() {
  const data = {
    action: "addInvoice",
    invoice_no: invNo.value,
    date: invDate.value,
    client: client.value,
    subtotal: total.value,
    gst: Math.round(total.value * 0.18),
    total: Math.round(total.value * 1.18)
  };

  if (!navigator.onLine) {
    alert("Offline: invoice will sync later");
    saveOffline(data);
    return;
  }

  await api(data);
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
Invoice No: ${invNo.value}
Client: ${client.value}
Total Amount: ₹${total.value}

Please find invoice attached.
Thank you.
`;

  const url = "https://wa.me/?text=" + encodeURIComponent(msg);
  window.open(url, "_blank");
}
