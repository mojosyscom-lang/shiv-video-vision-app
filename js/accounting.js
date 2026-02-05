document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role") || "";
  const content = document.getElementById("content");

  /* =========================
     SPEED CACHE (NEW)
  ========================== */
  const CACHE = {
    workersRaw: { data: null, at: 0 },
    upadMeta: { data: null, at: 0 },
    holidaysAll: { data: null, at: 0 },
    monthsMerged: { data: null, at: 0 },
    workersActive: { data: null, at: 0 }
  };

  function fresh(cacheKey, ttlMs) {
    return CACHE[cacheKey]?.data && (Date.now() - CACHE[cacheKey].at) < ttlMs;
  }

  async function cachedApi(cacheKey, ttlMs, fn) {
    if (fresh(cacheKey, ttlMs)) return CACHE[cacheKey].data;
    const data = await fn();
    CACHE[cacheKey].data = data;
    CACHE[cacheKey].at = Date.now();
    return data;
  }

  function invalidateCache(keys) {
    (keys || []).forEach(k => {
      if (CACHE[k]) {
        CACHE[k].data = null;
        CACHE[k].at = 0;
      }
    });
  }

  /* =========================
     Helpers (NEW)
  ========================== */

  function monthLabelFromISO(iso) {
    // "2026-02-05" => "Feb-2026"
    const d = new Date(iso + "T00:00:00Z");
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
    return `${m}-${d.getUTCFullYear()}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function monthLabelNow() {
    return monthLabelFromISO(todayISO());
  }

  function normMonthLabel(s) {
    // normalize spaces + casing format safety
    return String(s || "").trim().replace(/\s+/g, "");
  }

  function monthKey(label) {
    // "Feb-2026" => 202602 (for sorting/filtering)
    const x = normMonthLabel(label);
    const parts = x.split("-");
    if (parts.length !== 2) return null;
    const monStr = parts[0];
    const year = Number(parts[1]);
    const idxMap = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
    const mm = idxMap[monStr];
    if (!mm || !year) return null;
    return year * 100 + mm;
  }

  // ✅ NEW: show date clean (fixes "T18:30:00.000Z" in table)
  function prettyISODate(v){
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toISOString().slice(0,10);
  }

  // ✅ NEW: show month clean (fixes month column becoming date in Sheets)
  function prettyMonth(v){
    if (!v) return "";
    const s = String(v);
    if (s.includes("T") && s.includes("Z")) {
      return monthLabelFromISO(prettyISODate(s));
    }
    return String(v);
  }

  async function getActiveWorkers() {
    // ✅ cached: workers list is reused in Upad/Salary/Holidays
    const rows = await cachedApi("workersRaw", 60000, () => api({ action: "listWorkers" }));
    const list = (rows || [])
      .filter(w => String(w.status || "ACTIVE").toUpperCase() === "ACTIVE")
      .map(w => String(w.worker || "").trim())
      .filter(Boolean)
      .sort((a,b) => a.localeCompare(b));
    // also cache computed list
    CACHE.workersActive.data = list;
    CACHE.workersActive.at = Date.now();
    return list;
  }

  async function getSalaryMonthsFromUpad() {
    // ✅ cached
    const meta = await cachedApi("upadMeta", 60000, () => api({ action: "getUpadMeta" }));
    return (meta.months || []).slice();
  }

  // ✅ cached: get all holidays once (used for month options)
  async function getMonthsFromHolidays() {
    const rows = await cachedApi("holidaysAll", 60000, () => api({ action: "listHolidays", month: "" })); // fetch all
    const months = (rows || []).map(r => normMonthLabel(prettyMonth(r.month)));
    return months.filter(Boolean);
  }

  // ✅ cached + parallel: merge + filter future + sort newest first
  async function getMonthOptionsMerged() {
    return cachedApi("monthsMerged", 60000, async () => {
      const [upadMonthsRaw, holMonths] = await Promise.all([
        getSalaryMonthsFromUpad(),
        getMonthsFromHolidays()
      ]);

      const upadMonths = (upadMonthsRaw || []).map(normMonthLabel);
      const set = new Set([...upadMonths, ...holMonths].filter(Boolean));

      const nowKey = monthKey(monthLabelNow());

      const list = [...set].filter(m => {
        const k = monthKey(m);
        if (!k) return false;
        // remove future months (no March if current is Feb)
        if (nowKey && k > nowKey) return false;
        return true;
      });

      // newest first
      list.sort((a,b) => (monthKey(b) || 0) - (monthKey(a) || 0));
      return list;
    });
  }

  /* =========================
     UI
  ========================== */

  
    async function showDashboard() {
    content.innerHTML = `
      <div class="card">
        <h2>Dashboard</h2>
        <p>Loading dashboard…</p>
      </div>
    `;

    const month = monthLabelNow();

    // ✅ parallel calls
    const [dash, activity] = await Promise.all([
      api({ action: "getDashboard", month }),
      api({ action: "getRecentActivity", limit: 10 })
    ]);

    const upadMap = (dash && dash.upad_by_worker) ? dash.upad_by_worker : {};
    const upadTotal = Object.values(upadMap).reduce((a,b)=>a+Number(b||0),0);

    content.innerHTML = `
      <div class="dashHeader">
        <div>
          <h2 style="margin:0;">Dashboard</h2>
          <div class="dashSub">
            Logged in as: <b>${escapeHtml(localStorage.getItem("username") || "")}</b> (${escapeHtml(role)}) • 
            Company: <b>${escapeHtml(localStorage.getItem("company") || "")}</b> • 
            Month: <b>${escapeHtml(dash.month || month)}</b>
          </div>
        </div>
      </div>

      <div class="dashGrid">
        <div class="dashStat dashBlue">
          <div class="dashStatLabel">Total Workers</div>
          <div class="dashStatValue">${Number(dash.total_workers || 0)}</div>
        </div>

        <div class="dashStat dashGreen">
          <div class="dashStatLabel">Monthly Salary</div>
          <div class="dashStatValue">₹${Number(dash.monthly_salary_total || 0).toFixed(0)}</div>
        </div>

        <div class="dashStat dashOrange">
          <div class="dashStatLabel">Monthly Expense</div>
          <div class="dashStatValue">₹${Number(dash.monthly_expense_total || 0).toFixed(0)}</div>
        </div>

        <div class="dashStat dashPurple">
          <div class="dashStatLabel">Total Upad (Month)</div>
          <div class="dashStatValue">₹${Number(upadTotal || 0).toFixed(0)}</div>
        </div>
      </div>

      <div class="dashCard" style="margin-top:12px;">
        <div class="dashCardTitle">Recent Activity</div>
        <div class="dashActivity" id="dashActivity"></div>
      </div>
    `;

    // ✅ Activity list
    const box = document.getElementById("dashActivity");
    if (box) {
      const rows = Array.isArray(activity) ? activity : [];
      if (!rows.length) {
        box.innerHTML = `<div class="dashSmall">No activity found.</div>`;
      } else {
        box.innerHTML = rows.map(r => `
          <div class="dashActRow">
            <div class="dashActMain">
              <div><b>${escapeHtml(r.action || "")}</b> — ${escapeHtml(r.ref || "")}</div>
              <div class="dashSmall">By ${escapeHtml(r.user || "")}</div>
            </div>
            <div class="dashActTime">${escapeHtml(prettyISODate(r.time || ""))}</div>
          </div>
        `).join("");
      }
    }
}






  async function loadSection(type) {
    if (type === "invoice") {
      location.href = "invoice.html";
      return;
    }

    /* ==========================================================
       ✅ NEW: Workers (Option A)
       ========================================================== */
    if (type === "workers") {
      if (!(role === "superadmin" || role === "owner")) {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

      // ✅ fast paint
      content.innerHTML = `<div class="card"><h2>Workers</h2><p>Loading…</p></div>`;

      const workers = await cachedApi("workersRaw", 60000, () => api({ action: "listWorkers" }));

      content.innerHTML = `
        <div class="card">
          <h2>Workers</h2>

          <div class="card" style="margin-top:12px;">
            <h3 style="margin-top:0;">Add / Edit Worker</h3>

            <label>Worker Name</label>
            <input id="wk_name" placeholder="e.g. Raju">

            <label style="margin-top:10px;">Monthly Salary</label>
            <input id="wk_salary" type="number" placeholder="e.g. 15000">

            <label style="margin-top:10px;">Start Date</label>
            <input id="wk_start" type="date" value="${todayISO()}">

            <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
              <button class="primary" id="btn_wk_add">➕ Save Worker</button>
              <button class="primary" id="btn_wk_update">✏️ Update Worker</button>
            </div>

            <p style="font-size:12px;color:#777;margin-top:10px;">
              Tip: To edit, type the same worker name and press Update Worker.
            </p>
          </div>

          <div class="card" style="margin-top:12px;">
            <h3 style="margin-top:0;">Worker List</h3>

            ${(workers || []).length ? `
              ${(workers || []).map(w => `
                <div style="padding:10px 0;border-top:1px solid #eee;">
                  <strong>${escapeHtml(w.worker)}</strong><br>
                  Salary: ₹${Number(w.monthly_salary || 0).toFixed(0)}<br>
                  Start: ${escapeHtml(w.start_date || "")}<br>
                  Status: <strong>${escapeHtml(w.status || "ACTIVE")}</strong><br>
                  <span style="font-size:12px;color:#777;">Added by: ${escapeHtml(w.added_by || "")}</span><br><br>

                  <button class="userToggleBtn"
                    data-worker="${escapeAttr(w.worker)}"
                    data-next="${escapeAttr(String(w.status || "ACTIVE").toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE")}">
                    ${String(w.status || "ACTIVE").toUpperCase() === "ACTIVE" ? "Set Inactive" : "Set Active"}
                  </button>
                </div>
              `).join("")}
            ` : `<p>No workers found. Add your first worker above.</p>`}
          </div>
        </div>
      `;

      document.getElementById("btn_wk_add").addEventListener("click", addWorker);
      document.getElementById("btn_wk_update").addEventListener("click", updateWorker);

      content.querySelectorAll("button[data-worker]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const unlock = lockButton(btn, "Updating...");
          try {
            await updateWorkerStatus(btn.dataset.worker, btn.dataset.next);
          } finally {
            setTimeout(unlock, 600);
          }
        });
      });

      return;
    }

   /* ==========================================================
   ✅ NEW: Holidays (Option A)  ✅ UPDATED: month dropdown + worker filter + total
   ✅ CHANGE: Stop auto-load until user selects month/worker or clicks Load
   ========================================================== */
if (type === "holidays") {
  // ✅ fast paint
  content.innerHTML = `<div class="card"><h2>Holidays</h2><p>Loading…</p></div>`;

  // ✅ parallel
  const [workers, months] = await Promise.all([
    getActiveWorkers(),
    getMonthOptionsMerged()
  ]);

  content.innerHTML = `
    <div class="card">
      <h2>Holidays</h2>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Add Holiday</h3>

        <label>Worker</label>
        <select id="hol_worker">
          ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
        </select>

        <label style="margin-top:10px;">Holiday Date</label>
        <input id="hol_date" type="date" value="${todayISO()}">

        <label style="margin-top:10px;">Reason (optional)</label>
        <input id="hol_reason" placeholder="Optional">

        <button class="primary" id="btn_hol_add" style="margin-top:14px;">➕ Save Holiday</button>
        <p style="font-size:12px;color:#777;margin-top:10px;">
          Month will auto-save as <b>Feb-2026</b> format.
        </p>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">View Holidays</h3>

        <label>Month</label>
        <select id="hol_month">
          <option value="">All</option>
          ${months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
        </select>

        <label style="margin-top:10px;">Worker</label>
        <select id="hol_worker_filter">
          <option value="">All</option>
          ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
        </select>

        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="primary" id="btn_hol_load">Load</button>
        </div>

        <p id="hol_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
        <div id="hol_list" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  // default current month if available (selection only, NO auto-load)
  const cur = monthLabelNow();
  const holSel = document.getElementById("hol_month");
  if (holSel && months.map(normMonthLabel).includes(normMonthLabel(cur))) {
    holSel.value = months.find(m => normMonthLabel(m) === normMonthLabel(cur)) || "";
  }

  // ✅ start empty for faster page load
  const box = document.getElementById("hol_list");
  const totalBox = document.getElementById("hol_total");
  if (box) box.innerHTML = "";
  if (totalBox) totalBox.textContent = "";

  // ✅ helper: only load when month OR worker filter selected
  function maybeLoadHolidays() {
    const month = (document.getElementById("hol_month")?.value || "").trim();
    const workerFilter = (document.getElementById("hol_worker_filter")?.value || "").trim();

    // If both are All => keep empty (no API call)
    if (!month && !workerFilter) {
      const b = document.getElementById("hol_list");
      const t = document.getElementById("hol_total");
      if (b) b.innerHTML = "";
      if (t) t.textContent = "";
      return;
    }

    loadHolidays();
  }

  document.getElementById("btn_hol_add").addEventListener("click", addHoliday);

  // Load button triggers maybeLoad (not direct)
  document.getElementById("btn_hol_load").addEventListener("click", maybeLoadHolidays);

  // Change triggers maybeLoad (not direct)
  document.getElementById("hol_month")?.addEventListener("change", maybeLoadHolidays);
  document.getElementById("hol_worker_filter")?.addEventListener("change", maybeLoadHolidays);

  // ❌ removed: loadHolidays();  (no auto-load)
  return;
}

    /* ==========================================================
       Existing: Upad (UPDATED to use Workers master list)
       ========================================================== */
    if (type === "upad") {
      // ✅ fast paint
      content.innerHTML = `<div class="card"><h2>Upad</h2><p>Loading…</p></div>`;

      // ✅ parallel + cached meta/workers
      const [meta, workers] = await Promise.all([
        cachedApi("upadMeta", 60000, () => api({ action: "getUpadMeta" })),
        getActiveWorkers()
      ]);

      content.innerHTML = `
        <div class="card">
          <h2>Upad</h2>

          <label>Worker</label>
          <select id="upad_worker">
            ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
          </select>
          <br><br>

          <input id="upad_amount" type="number" placeholder="Amount"><br><br>

          <input id="upad_month" list="monthList" placeholder="Month (e.g. Feb-2026)" value="${monthLabelFromISO(todayISO())}">
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

    /* ==========================================================
       Existing: Expenses (unchanged)
       ========================================================== */
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

    /* ==========================================================
       Existing: Salary (UPDATED month list + current month default)
       ========================================================== */
    if (type === "salary") {
      // ✅ fast paint
      content.innerHTML = `<div class="card"><h2>Salary</h2><p>Loading…</p></div>`;

      // ✅ parallel + cached
      const [months, workers] = await Promise.all([
        getMonthOptionsMerged(),
        getActiveWorkers()
      ]);

      const current = monthLabelNow();
      const hasCurrent = months.map(normMonthLabel).includes(normMonthLabel(current));

      content.innerHTML = `
        <div class="card">
          <h2>Salary</h2>

          <label>Month</label>
          <select id="sal_month">
            <option value="">All</option>
            ${months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
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
            ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
          </select>
          <br><br>

          <label>Amount</label>
          <input id="sal_amount" type="number" placeholder="Amount"><br><br>

          <label>Month</label>
          <select id="sal_pay_month">
            ${
              months.length
                ? months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")
                : `<option value="${escapeAttr(current)}">${escapeHtml(current)}</option>`
            }
          </select>
          <br><br>

          <button class="primary" id="btn_sal_pay">Add Payment</button>
          <p style="color:#777;font-size:12px;margin-top:10px;">
            Payments are saved in <b>salary_payments</b> and deducted from payable salary.
          </p>
        </div>
      `;

      const salMonth = document.getElementById("sal_month");
      if (salMonth && hasCurrent) salMonth.value = months.find(m => normMonthLabel(m) === normMonthLabel(current)) || "";

      const payMonth = document.getElementById("sal_pay_month");
      if (payMonth && hasCurrent) payMonth.value = months.find(m => normMonthLabel(m) === normMonthLabel(current)) || payMonth.value;

      document.getElementById("btn_sal_load").addEventListener("click", loadSalarySummary);
      document.getElementById("btn_sal_pay").addEventListener("click", addSalaryPayment);
      return;
    }

    /* ==========================================================
       Existing: User Management (unchanged)
       ========================================================== */
    if (type === "userMgmt") {
      if (role !== "superadmin") {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

      content.innerHTML = `<div class="card"><h2>User Management</h2><p>Loading…</p></div>`;

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

    /* ==========================================================
       ✅ ADDED: Superadmin - Add New User section
       ========================================================== */
    if (type === "userAdd") {
      if (role !== "superadmin") {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

      content.innerHTML = `
        <div class="card">
          <h2>Add New User</h2>

          <label>Username</label>
          <input id="new_username" placeholder="e.g. staff1">

          <label style="margin-top:10px;">Password</label>
          <input id="new_password" type="password" placeholder="Set password">

          <label style="margin-top:10px;">Role</label>
          <select id="new_role">
            <option value="staff">staff</option>
            <option value="owner">owner</option>
            <option value="superadmin">superadmin</option>
          </select>

          <label style="margin-top:10px;">Company</label>
          <input id="new_company" placeholder="e.g. Shiv Video Vision">

          <button class="primary" id="btn_add_user" style="margin-top:14px;">➕ Create User</button>

          <p style="font-size:12px;color:#777;margin-top:10px;">
            Username must be unique.
          </p>
        </div>
      `;

      document.getElementById("btn_add_user").addEventListener("click", addNewUser);
      return;
    }

    /* ==========================================================
       ✅ ADDED: Superadmin - Edit Password section
       ========================================================== */
    if (type === "userPw") {
      if (role !== "superadmin") {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

      content.innerHTML = `<div class="card"><h2>Edit Password</h2><p>Loading…</p></div>`;

      const users = await api({ action: "getUsers" });

      content.innerHTML = `
        <div class="card">
          <h2>Edit Password</h2>

          <label>Select User</label>
          <select id="pw_user">
            ${(users || []).map(u => `
              <option value="${escapeAttr(u.username)}">${escapeHtml(u.username)} (${escapeHtml(u.role)})</option>
            `).join("")}
          </select>

          <label style="margin-top:10px;">New Password</label>
          <input id="pw_new" type="password" placeholder="Enter new password">

          <button class="primary" id="btn_pw_update" style="margin-top:14px;">🔑 Update Password</button>
        </div>
      `;

      document.getElementById("btn_pw_update").addEventListener("click", updateUserPassword);
      return;
    }

    content.innerHTML = `<div class="card">Section not found: ${escapeHtml(type)}</div>`;
  }

  /* =========================
     Existing actions
  ========================== */

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
        date: todayISO(),
        worker,
        amount,
        month
      });

      if (r && r.queued) alert("Saved offline. Will sync when online.");
      else alert("Upad added");

      document.getElementById("upad_amount").value = "";

      // ✅ refresh cached months
      invalidateCache(["upadMeta", "monthsMerged"]);
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
        date: todayISO(),
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
            <th align="right">Salary</th>
            <th align="right">Prorated</th>
            <th align="right">Upad</th>
            <th align="right">Holidays</th>
            <th align="right">Deduction</th>
            <th align="right">Paid</th>
            <th align="right">Balance</th>
          </tr>
          ${rows.map(r => `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(r.worker)}</td>
              <td align="right">₹${Number(r.monthly_salary || 0).toFixed(0)}</td>
              <td align="right">₹${Number(r.prorated_salary || 0).toFixed(0)}</td>
              <td align="right">₹${Number(r.upad_total || 0).toFixed(0)}</td>
              <td align="right">${Number(r.holiday_count || 0).toFixed(0)}</td>
              <td align="right">₹${Number(r.holiday_deduction || 0).toFixed(0)}</td>
              <td align="right">₹${Number(r.paid_total || 0).toFixed(0)}</td>
              <td align="right"><strong>₹${Number(r.balance || 0).toFixed(0)}</strong></td>
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
        date: todayISO(),
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

  /* ==========================================================
     ✅ ADDED: Workers + Holidays functions (Option A)
     ========================================================== */

  async function addWorker() {
    const btn = document.getElementById("btn_wk_add");
    const unlock = lockButton(btn, "Saving...");

    try {
      const worker = document.getElementById("wk_name").value.trim();
      const monthly_salary = Number(document.getElementById("wk_salary").value || 0);
      const start_date = document.getElementById("wk_start").value;

      if (!worker || !monthly_salary || !start_date) {
        alert("Please fill worker name, salary and start date");
        return;
      }

      const r = await api({
        action: "addWorker",
        worker,
        monthly_salary,
        start_date
      });

      if (r && r.error) return;

      alert("Worker saved");

      // ✅ refresh cached workers
      invalidateCache(["workersRaw", "workersActive"]);

      loadSection("workers");
    } finally {
      setTimeout(unlock, 700);
    }
  }

  async function updateWorker() {
    const btn = document.getElementById("btn_wk_update");
    const unlock = lockButton(btn, "Updating...");

    try {
      const worker = document.getElementById("wk_name").value.trim();
      const monthly_salary = Number(document.getElementById("wk_salary").value || 0);
      const start_date = document.getElementById("wk_start").value;

      if (!worker || !monthly_salary || !start_date) {
        alert("Please fill worker name, salary and start date");
        return;
      }

      const r = await api({
        action: "updateWorker",
        worker,
        monthly_salary,
        start_date
      });

      if (r && r.error) return;

      alert("Worker updated");

      // ✅ refresh cached workers
      invalidateCache(["workersRaw", "workersActive"]);

      loadSection("workers");
    } finally {
      setTimeout(unlock, 700);
    }
  }

  async function updateWorkerStatus(worker, status) {
    const r = await api({
      action: "updateWorkerStatus",
      worker,
      status
    });

    if (r && r.error) return;
    alert(`Updated: ${worker} → ${status}`);

    // ✅ refresh cached workers
    invalidateCache(["workersRaw", "workersActive"]);

    loadSection("workers");
  }

  async function addHoliday() {
    const btn = document.getElementById("btn_hol_add");
    const unlock = lockButton(btn, "Saving...");

    try {
      const worker = document.getElementById("hol_worker").value.trim();
      const date = document.getElementById("hol_date").value;
      const reason = document.getElementById("hol_reason").value.trim();

      if (!worker || !date) {
        alert("Select worker and date");
        return;
      }

      const r = await api({
        action: "addHoliday",
        worker,
        date,
        reason
      });

      if (r && r.error) return;

      alert("Holiday saved");
      document.getElementById("hol_reason").value = "";

      // ✅ refresh cached holidays + month options
      invalidateCache(["holidaysAll", "monthsMerged"]);

      loadHolidays();
    } finally {
      setTimeout(unlock, 700);
    }
  }

  async function loadHolidays() {
    const btn = document.getElementById("btn_hol_load");
    const unlock = lockButton(btn, "Loading...");

    try {
      const month = (document.getElementById("hol_month")?.value || "").trim();
      const workerFilter = (document.getElementById("hol_worker_filter")?.value || "").trim();

      const rows = await api({ action: "listHolidays", month });

      const box = document.getElementById("hol_list");
      const totalBox = document.getElementById("hol_total");
      if (!box) return;

      // Filter on client-side by worker
      const filtered = (rows || []).filter(r => {
        if (!workerFilter) return true;
        return String(r.worker || "").trim() === workerFilter;
      });

      if (!filtered.length) {
        box.innerHTML = `<p>No holidays found.</p>`;
        if (totalBox) totalBox.textContent = "";
        return;
      }

      // Total days = number of rows
      if (totalBox) {
        totalBox.textContent = `Total holidays: ${filtered.length} day(s)` +
          (month ? ` • Month: ${month}` : "") +
          (workerFilter ? ` • Worker: ${workerFilter}` : "");
      }

      box.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Date</th>
            <th align="left">Worker</th>
            <th align="left">Month</th>
            <th align="left">Reason</th>
          </tr>
          ${filtered.map(r => `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(prettyISODate(r.date || ""))}</td>
              <td>${escapeHtml(r.worker || "")}</td>
              <td>${escapeHtml(prettyMonth(r.month || ""))}</td>
              <td>${escapeHtml(r.reason || "")}</td>
            </tr>
          `).join("")}
        </table>
      `;
    } finally {
      setTimeout(unlock, 400);
    }
  }

  /* ==========================================================
     ✅ ADDED: Superadmin functions (no changes to existing logic)
     ========================================================== */

  async function addNewUser() {
    const btn = document.getElementById("btn_add_user");
    const unlock = lockButton(btn, "Creating...");

    try {
      const username = document.getElementById("new_username").value.trim();
      const password = document.getElementById("new_password").value.trim();
      const roleVal  = document.getElementById("new_role").value.trim();
      const company  = document.getElementById("new_company").value.trim();

      if (!username || !password || !roleVal || !company) {
        alert("Please fill all fields");
        return;
      }

      const r = await api({
        action: "addUser",
        username,
        password,
        role: roleVal,
        company
      });

      if (r && r.error) return;

      alert("User created");
      loadSection("userMgmt");
    } finally {
      setTimeout(unlock, 700);
    }
  }

  async function updateUserPassword() {
    const btn = document.getElementById("btn_pw_update");
    const unlock = lockButton(btn, "Updating...");

    try {
      const target_username = document.getElementById("pw_user").value.trim();
      const new_password = document.getElementById("pw_new").value.trim();

      if (!target_username || !new_password) {
        alert("Select user and enter new password");
        return;
      }

      const r = await api({
        action: "updateUserPassword",
        target_username,
        new_password
      });

      if (r && r.error) return;

      alert("Password updated");
      document.getElementById("pw_new").value = "";
    } finally {
      setTimeout(unlock, 700);
    }
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
