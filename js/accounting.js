const role = localStorage.getItem("role");
const company = localStorage.getItem("company");

/* ---------------- DASHBOARD ---------------- */
function showDashboard() {
  document.getElementById("content").innerHTML = `
    <div class="card">
      <h2>Welcome, ${role.toUpperCase()}</h2>
      <p>Select a section from the left menu.</p>
    </div>
  `;
}

/* ---------------- MAIN ROUTER ---------------- */
async function loadSection(type) {

  /* -------- UPAD -------- */
  if (type === "upad") {
    content.innerHTML = `
      <div class="card">
        <h2>Upad Entry</h2>
        <input id="worker" placeholder="Worker name"><br><br>
        <input id="amount" type="number" placeholder="Amount"><br><br>
        <button class="primary" onclick="addUpad()">Add</button>
      </div>
    `;
  }

  /* -------- EXPENSES -------- */
  if (type === "expenses") {
    content.innerHTML = `
      <div class="card">
        <h2>Add Expense</h2>
        <select id="category">
          <option>food</option>
          <option>hotel</option>
          <option>transport</option>
          <option>rapido</option>
          <option>purchase</option>
          <option>other</option>
        </select><br><br>
        <input id="desc" placeholder="Description"><br><br>
        <input id="amount" type="number" placeholder="Amount"><br><br>
        <button class="primary" onclick="addExpense()">Submit</button>
      </div>
    `;
  }

  /* -------- SALARY -------- */
  if (type === "salary") {
    content.innerHTML = `
      <div class="card">
        <h2>Salary (Summary)</h2>
        <p>Salary = Upad − Paid</p>
        <p>(Advanced salary logic can be added next)</p>
      </div>
    `;
  }

  /* -------- INVOICE -------- */
  if (type === "invoice") {
    location.href = "invoice.html";
  }

  /* -------- EXPORT -------- */
  if (type === "export") {
    content.innerHTML = `
      <div class="card">
        <h2>Export</h2>
        <p>Use browser export or GST sheet for CA.</p>
      </div>
    `;
  }

  /* -------- APPROVALS -------- */
  if (type === "approval") {
    const rows = await api({ action: "getPendingExpenses" });

    if (!rows.length) {
      content.innerHTML = `<div class="card">No pending approvals</div>`;
      return;
    }

    content.innerHTML = `
      <div class="card">
        <h2>Pending Expenses</h2>
        ${rows.map(r => `
          <div class="card">
            <strong>${r[3]}</strong><br>
            ₹${r[4]} | ${r[1]}<br>
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

  /* -------- GST -------- */
  if (type === "gst") {
    content.innerHTML = `
      <div class="card">
        <h2>GST Summary</h2>
        <p>Use invoice sheet totals for CA filing.</p>
      </div>
    `;
  }
}

/* ---------------- ACTIONS ---------------- */

async function addUpad() {
  await api({
    action: "addUpad",
    company,
    user: localStorage.getItem("user") || "admin",
    worker: worker.value,
    amount: amount.value,
    date: new Date().toISOString().slice(0,10),
    month: "Current"
  });
  alert("Upad added");
}

async function addExpense() {
  await api({
    action: "addExpense",
    company,
    user: localStorage.getItem("user") || "staff",
    category: category.value,
    desc: desc.value,
    amount: amount.value,
    date: new Date().toISOString().slice(0,10)
  });
  alert("Expense submitted (Pending approval)");
}

async function approveExpense(company, date, amount) {
  await api({
    action: "approveExpense",
    company,
    date,
    amount,
    user: "admin"
  });
  loadSection("approval");
}

/* ---------------- INIT ---------------- */
showDashboard();

/* Hide owner-only buttons if staff */
if (role !== "owner") {
  document.querySelectorAll(".ownerOnly")
    .forEach(el => el.style.display = "none");
}
