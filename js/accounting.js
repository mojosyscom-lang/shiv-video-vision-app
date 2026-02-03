document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role") || "";
  const content = document.getElementById("content");

  function showDashboard() {
    content.innerHTML = `
      <div class="card">
        <h2>Dashboard</h2>
        <p>Logged in as: <strong>${escapeHtml(localStorage.getItem("username") || "")}</strong> (${escapeHtml(role)})</p>
        <p>Company: <strong>${escapeHtml(localStorage.getItem("company") || "")}</strong></p>
        <p>Select a menu on the left.</p>
      </div>
    `;
  }

  async function loadSection(type) {
    if (type === "invoice") {
      location.href = "invoice.html";
      return;
    }

    if (type === "upad") {
      content.innerHTML = `
        <div class="card">
          <h2>Upad</h2>
          <input id="upad_worker" placeholder="Worker name"><br><br>
          <input id="upad_amount" type="number" placeholder="Amount"><br><br>
          <input id="upad_month" placeholder="Month (e.g. Feb-2026)"><br><br>
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
              <button class="primary"
                data-user="${escapeAttr(u.username)}"
                data-status="${escapeAttr(u.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}">
                ${u.status === "ACTIVE" ? "Disable" : "Enable"}
              </button>
            </div>
          `).join("")}
        </div>
      `;

      content.querySelectorAll("button[data-user]").forEach(btn => {
        btn.addEventListener("click", async () => {
          await toggleUser(btn.dataset.user, btn.dataset.status);
        });
      });
      return;
    }

    // fallback
    content.innerHTML = `<div class="card">Section not found: ${escapeHtml(type)}</div>`;
  }

  async function addUpad() {
    const worker = document.getElementById("upad_worker").value.trim();
    const amount = Number(document.getElementById("upad_amount").value || 0);
    const month = document.getElementById("upad_month").value.trim() || "Current";

    if (!worker || !amount) {
      alert("Please enter worker and amount");
      return;
    }

    await api({
      action: "addUpad",
      date: new Date().toISOString().slice(0, 10),
      worker,
      amount,
      month
    });

    alert("Upad added");
    document.getElementById("upad_worker").value = "";
    document.getElementById("upad_amount").value = "";
  }

  async function addExpense() {
    const category = document.getElementById("exp_category").value;
    const desc = document.getElementById("exp_desc").value.trim();
    const amount = Number(document.getElementById("exp_amount").value || 0);

    if (!desc || !amount) {
      alert("Please enter description and amount");
      return;
    }

    await api({
      action: "addExpense",
      date: new Date().toISOString().slice(0, 10),
      category,
      desc,
      amount
    });

    alert("Expense added");
    document.getElementById("exp_desc").value = "";
    document.getElementById("exp_amount").value = "";
  }

  async function toggleUser(username, status) {
    await api({
      action: "updateUserStatus",
      username,
      status
    });
    alert(`Updated: ${username} → ${status}`);
    loadSection("userMgmt");
  }

  // Hide superadmin menu items if not superadmin
  if (role !== "superadmin") {
    document.querySelectorAll(".superadminOnly").forEach(el => el.style.display = "none");
  }

  // Expose functions for onclick handlers in app.html
  window.showDashboard = showDashboard;
  window.loadSection = loadSection;

  showDashboard();
});

// basic escaping helpers
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }
