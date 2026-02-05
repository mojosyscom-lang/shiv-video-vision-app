document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role") || "";
  const content = document.getElementById("content");

  function showDashboard() {
    content.innerHTML = `
      <div class="card">
        <h2>Dashboard</h2>
        <p>Logged in as: <strong>${escapeHtml(localStorage.getItem("username") || "")}</strong> (${escapeHtml(role)})</p>
        <p>Company: <strong>${escapeHtml(localStorage.getItem("company") || "")}</strong></p>
      </div>
    `;
  }

  async function loadSection(type) {
    if (type === "invoice") {
      location.href = "invoice.html";
      return;
    }

    if (type === "upad") {
      const meta = await api({ action: "getUpadMeta" });
      content.innerHTML = `
        <div class="card">
          <h2>Upad</h2>
          <input id="upad_worker" list="workerList" placeholder="Worker name">
          <datalist id="workerList">
            ${(meta.workers || []).map(w => `<option value="${escapeAttr(w)}"></option>`).join("")}
          </datalist>
          <br><br>

          <input id="upad_amount" type="number" placeholder="Amount"><br><br>

          <input id="upad_month" list="monthList" placeholder="Month (e.g. Feb-2026)">
          <datalist id="monthList">
            ${(meta.months || []).map(m => `<option value="${escapeAttr(m)}"></option>`).join("")}
          </datalist>
          <br><br>

          <button class="primary" id="btn_upad">Add Upad</button>
        </div>
      `;
      document.getElementById("btn_upad").addEventListener("click", addUpad);
      return;
    }

    if (type === "expenses") {
      content.innerHTML = `
        <div class="card">
          <h2>Expenses</h2>
          <select id="exp_category">
            <option value="food">food</option>
            <option value="hotel">hotel</option>
            <option value="transport">transport</option>
            <option value="rapido">rapido</option>
            <option value="purchase">purchase</option>
            <option value="other">other</option>
            <option value="freelancer">freelancer</option>
          </select><br><br>
          <input id="exp_desc" placeholder="Description"><br><br>
          <input id="exp_amount" type="number" placeholder="Amount"><br><br>
          <button class="primary" id="btn_exp">Add Expense</button>
        </div>
      `;
      document.getElementById("btn_exp").addEventListener("click", addExpense);
      return;
    }

    if (type === "salary") {
      const meta = await api({ action: "getUpadMeta" });

      content.innerHTML = `
        <div class="card">
          <h2>Salary</h2>

          <label>Month</label>
          <select id="sal_month">
            <option value="">All</option>
            ${(meta.months || []).map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
          </select>
          <br><br>

          <button class="primary" id="btn_sal_load">Load Summary</button>
        </div>

        <div class="card" id="sal_result">
          <p>Select a month and click Load Summary.</p>
        </div>

        <div class="card">
          <h3>Add Salary Payment</h3>

          <label>Worker</label>
          <select id="sal_worker">
            ${(meta.workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
          </select>
          <br><br>

          <label>Amount</label>
          <input id="sal_amount" type="number" placeholder="Amount"><br><br>

          <label>Month</label>
          <select id="sal_pay_month">
            ${(meta.months || []).map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
          </select>
          <br><br>

          <button class="primary" id="btn_sal_pay">Add Payment</button>
          <p style="color:#777;font-size:12px;margin-top:10px;">
            Payments are saved in <b>salary_payments</b> and deducted from Upad total.
          </p>
        </div>
      `;

      document.getElementById("btn_sal_load").addEventListener("click", loadSalarySummary);
      document.getElementById("btn_sal_pay").addEventListener("click", addSalaryPayment);
      return;
    }

    if (type === "userMgmt") {
      if (role !== "superadmin") {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

      const users = await api({ action: "getUsers" });

      content.innerHTML = `
        <div class="card">
          <h2>User Management</h2>
          ${(users || []).map(u => `
            <div class="card">
              <strong>${escapeHtml(u.username)}</strong> (${escapeHtml(u.role)})<br>
              Company: ${escapeHtml(u.company)}<br>
              Status: <strong>${escapeHtml(u.status)}</strong><br>
              Last login: ${u.last_login || "Never"}<br><br>

              <!-- ONLY CHANGE: button class for better look -->
              

              <button class="userToggleBtn"
  data-status="${escapeAttr(u.status)}"
  data-target="${escapeAttr(u.username)}"
  data-next="${escapeAttr(u.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}">
  ${u.status === "ACTIVE" ? "Disable" : "Enable"}
</button>

            </div>
          `).join("")}
        </div>
      `;

      content.querySelectorAll("button[data-target]").forEach(btn => {
        btn.addEventListener("click", async () => {
          // lock THIS specific button so they can’t spam clicks
          const unlock = lockButton(btn, "Updating...");
          try {
            await toggleUser(btn.dataset.target, btn.dataset.next);
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });
      return;
    }

    content.innerHTML = `<div class="card">Section not found: ${escapeHtml(type)}</div>`;
  }

  async function addUpad() {
    const btn = document.getElementById("btn_upad");
    const unlock = lockButton(btn, "Saving...");

    try {
      const worker = document.getElementById("upad_worker").value.trim();
      const amount = Number(document.getElementById("upad_amount").value || 0);
      const month = document.getElementById("upad_month").value.trim() || "Current";

      if (!worker || !amount) return alert("Enter worker and amount");

      const r = await apiSafe({
        action: "addUpad",
        date: new Date().toISOString().slice(0, 10),
        worker,
        amount,
        month
      });

      if (r && r.queued) alert("Saved offline. Will sync when online.");
      else alert("Upad added");

      document.getElementById("upad_worker").value = "";
      document.getElementById("upad_amount").value = "";
    } finally {
      setTimeout(unlock, 600);
    }
  }

  async function addExpense() {
    const btn = document.getElementById("btn_exp");
    const unlock = lockButton(btn, "Saving...");

    try {
      const category = document.getElementById("exp_category").value;
      const desc = document.getElementById("exp_desc").value.trim();
      const amount = Number(document.getElementById("exp_amount").value || 0);

      if (!desc || !amount) return alert("Enter description and amount");

      const r = await apiSafe({
        action: "addExpense",
        date: new Date().toISOString().slice(0, 10),
        category,
        desc,
        amount
      });

      if (r && r.queued) alert("Saved offline. Will sync when online.");
      else alert("Expense added");

      document.getElementById("exp_desc").value = "";
      document.getElementById("exp_amount").value = "";
    } finally {
      setTimeout(unlock, 600);
    }
  }

  async function loadSalarySummary() {
    const btn = document.getElementById("btn_sal_load");
    const unlock = lockButton(btn, "Loading...");

    try {
      const month = document.getElementById("sal_month").value.trim();
      const rows = await api({ action: "getSalarySummary", month });

      const box = document.getElementById("sal_result");
      if (!rows || rows.length === 0) {
        box.innerHTML = `<p>No salary data found.</p>`;
        return;
      }

      box.innerHTML = `
        <h3>Summary ${month ? "(" + escapeHtml(month) + ")" : ""}</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Worker</th>
            <th align="right">Upad</th>
            <th align="right">Paid</th>
            <th align="right">Balance</th>
          </tr>
          ${rows.map(r => `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(r.worker)}</td>
              <td align="right">₹${Number(r.upad_total).toFixed(0)}</td>
              <td align="right">₹${Number(r.paid_total).toFixed(0)}</td>
              <td align="right"><strong>₹${Number(r.balance).toFixed(0)}</strong></td>
            </tr>
          `).join("")}
        </table>
      `;
    } finally {
      setTimeout(unlock, 400);
    }
  }

  async function addSalaryPayment() {
    const btn = document.getElementById("btn_sal_pay");
    const unlock = lockButton(btn, "Saving...");

    try {
      const worker = document.getElementById("sal_worker").value.trim();
      const amount = Number(document.getElementById("sal_amount").value || 0);
      const month = document.getElementById("sal_pay_month").value.trim() || "Current";

      if (!worker || !amount) return alert("Enter worker and amount");

      const r = await apiSafe({
        action: "addSalaryPayment",
        date: new Date().toISOString().slice(0, 10),
        worker,
        amount,
        month
      });

      if (r && r.queued) alert("Payment saved offline. Will sync when online.");
      else alert("Payment added");

      document.getElementById("sal_amount").value = "";
    } finally {
      setTimeout(unlock, 600);
    }
  }

  async function toggleUser(targetUsername, status) {
    const r = await api({
      action: "updateUserStatus",
      target_username: targetUsername,
      status
    });

    if (r && r.error) return;
    alert(`Updated: ${targetUsername} → ${status}`);
    loadSection("userMgmt");
  }

  // Hide superadmin-only menu items
  if (role !== "superadmin") {
    document.querySelectorAll(".superadminOnly").forEach(el => el.style.display = "none");
  }

  window.showDashboard = showDashboard;
  window.loadSection = loadSection;

  showDashboard();
});

/* ---------- Button Lock Helper ---------- */
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

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }
