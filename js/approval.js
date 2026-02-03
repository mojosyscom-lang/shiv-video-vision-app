// ---------- LOAD PENDING EXPENSES ----------
async function loadApprovals() {
  const role = localStorage.getItem("role");
  if (role !== "owner") {
    content.innerHTML = `<div class="card">Access denied</div>`;
    return;
  }

  const rows = await api({ action: "getPendingExpenses" });

  if (!rows || rows.length === 0) {
    content.innerHTML = `<div class="card">No pending approvals</div>`;
    return;
  }

  content.innerHTML = `
    <div class="card">
      <h2>Pending Expense Approvals</h2>
      ${rows.map(r => `
        <div class="card">
          <strong>${r[3]}</strong><br>
          Amount: ₹${r[4]}<br>
          Date: ${r[1]}<br>
          Added by: ${r[6]}<br><br>
          <button class="primary"
            onclick="approveExpense('${r[0]}','${r[1]}','${r[4]}')">
            Approve
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------- APPROVE EXPENSE ----------
async function approveExpense(company, date, amount) {
  await api({
    action: "approveExpense",
    company,
    date,
    amount
  });

  alert("Expense approved");
  loadApprovals();
}
