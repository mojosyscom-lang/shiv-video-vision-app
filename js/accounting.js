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
     Helpers (UPDATED)
  ========================== */

  // ✅ IMPORTANT: Local date ISO (prevents month shift in India time)
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function monthLabelFromISO(iso) {
    // "2026-02-05" => "Feb-2026" (LOCAL, no UTC shift)
    const d = new Date(iso + "T00:00:00");
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${m}-${d.getFullYear()}`;
  }

  // ✅ NEW: normalize ANY month coming from backend:
  // - "2026-01-31T18:30:00.000Z"  (Date serialized)
  // - Date object
  // - "'Feb-2026"
  // - "Feb-2026"
  function monthLabelFromAny(v) {
    if (v === null || v === undefined || v === "") return "";

    // If backend returns ISO date string
    if (typeof v === "string") {
      let s = String(v).trim();

      // remove leading apostrophe (Sheets text forcing)
      if (s.startsWith("'")) s = s.slice(1);

      // if ISO like 2026-01-31T18:30:00.000Z => convert to local month label
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
          return `${m}-${d.getFullYear()}`;
        }
      }

      // if YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return monthLabelFromISO(s);
      }

      // already label
      return s;
    }

    // if Date object
    if (Object.prototype.toString.call(v) === "[object Date]") {
      const d = v;
      const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
      return `${m}-${d.getFullYear()}`;
    }

    return String(v);
  }

  function monthLabelNow() {
    return monthLabelFromISO(todayISO());
  }

  function normMonthLabel(s) {
    return String(s || "").trim().replace(/\s+/g, "");
  }

  function monthKey(label) {
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

  function prettyISODate(v){
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toISOString().slice(0,10);
  }

  function prettyMonth(v){
    return monthLabelFromAny(v);
  }

  // ✅ NEW: Dashboard Upad total fallback (handles different backend response shapes)
  function getUpadTotalFromDash(dash) {
    if (!dash) return 0;

    const direct =
      Number(dash.upad_total) ||
      Number(dash.monthly_upad_total) ||
      Number(dash.total_upad) ||
      Number(dash.upadTotal) ||
      0;

    if (direct) return direct;

    const map =
      dash.upad_by_worker ||
      dash.upadByWorker ||
      dash.upad_map ||
      null;

    if (map && typeof map === "object") {
      return Object.values(map).reduce((a,b)=>a + Number(b || 0), 0);
    }

    return 0;
  }

  async function getActiveWorkers() {
    const rows = await cachedApi("workersRaw", 60000, () => api({ action: "listWorkers" }));
    const list = (rows || [])
      .filter(w => String(w.status || "ACTIVE").toUpperCase() === "ACTIVE")
      .map(w => String(w.worker || "").trim())
      .filter(Boolean)
      .sort((a,b) => a.localeCompare(b));
    CACHE.workersActive.data = list;
    CACHE.workersActive.at = Date.now();
    return list;
  }

  async function getSalaryMonthsFromUpad() {
    const meta = await cachedApi("upadMeta", 60000, () => api({ action: "getUpadMeta" }));
    return (meta.months || []).map(monthLabelFromAny);
  }

  async function getMonthsFromHolidays() {
    const rows = await cachedApi("holidaysAll", 60000, () => api({ action: "listHolidays", month: "" }));
    const months = (rows || []).map(r => normMonthLabel(monthLabelFromAny(r.month)));
    return months.filter(Boolean);
  }

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
        if (nowKey && k > nowKey) return false;
        return true;
      });

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

    const [dash, activity] = await Promise.all([
      api({ action: "getDashboard", month }),
      api({ action: "getRecentActivity", limit: 10 })
    ]);

    console.log("DASH RESPONSE:", dash);

    const upadTotal = getUpadTotalFromDash(dash);

    content.innerHTML = `
      <div class="dashHeader">
        <div>
          <h2 style="margin:0;">Dashboard</h2>
          <div class="dashSub">
            Logged in as: <b>${escapeHtml(localStorage.getItem("username") || "")}</b> (${escapeHtml(role)}) • 
            Company: <b>${escapeHtml(localStorage.getItem("company") || "")}</b> • 
            Month: <b>${escapeHtml((dash && dash.month) || month)}</b>
          </div>
        </div>
      </div>

      <div class="dashGrid">
        <div class="dashStat dashBlue">
          <div class="dashStatLabel">Total Workers</div>
          <div class="dashStatValue">${Number(dash?.total_workers || 0)}</div>
        </div>

        <div class="dashStat dashGreen">
          <div class="dashStatLabel">Monthly Salary</div>
          <div class="dashStatValue">₹${Number(dash?.monthly_salary_total || 0).toFixed(0)}</div>
        </div>

        <div class="dashStat dashOrange">
          <div class="dashStatLabel">Monthly Expense</div>
          <div class="dashStatValue">₹${Number(dash?.monthly_expense_total || 0).toFixed(0)}</div>
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

  // ✅ NEW: Upad row-id resolver (fixes "Invalid row")
  function getUpadRowId(r) {
    const v =
      r?.row ??
      r?.rowIndex ??
      r?._row ??
      r?.id ??
      r?.rid ??
      "";
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function loadSection(type) {
    if (type === "invoice") {
      location.href = "invoice.html";
      return;
    }

    if (type === "workers") {
      if (!(role === "superadmin" || role === "owner")) {
        content.innerHTML = `<div class="card">Unauthorized</div>`;
        return;
      }

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

    if (type === "holidays") {
      content.innerHTML = `<div class="card"><h2>Holidays</h2><p>Loading…</p></div>`;

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
              Month will auto-save as <b>${escapeHtml(monthLabelNow())}</b> format.
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

      const cur = monthLabelNow();
      const holSel = document.getElementById("hol_month");
      if (holSel && months.map(normMonthLabel).includes(normMonthLabel(cur))) {
        holSel.value = months.find(m => normMonthLabel(m) === normMonthLabel(cur)) || "";
      }

      const box = document.getElementById("hol_list");
      const totalBox = document.getElementById("hol_total");
      if (box) box.innerHTML = "";
      if (totalBox) totalBox.textContent = "";

      function maybeLoadHolidays() {
        const month = (document.getElementById("hol_month")?.value || "").trim();
        const workerFilter = (document.getElementById("hol_worker_filter")?.value || "").trim();

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
      document.getElementById("btn_hol_load").addEventListener("click", maybeLoadHolidays);
      document.getElementById("hol_month")?.addEventListener("change", maybeLoadHolidays);
      document.getElementById("hol_worker_filter")?.addEventListener("change", maybeLoadHolidays);
      return;
    }

    /* ==========================================================
       ✅ UPDATED: Upad Section
       ========================================================== */
    if (type === "upad") {
      content.innerHTML = `<div class="card"><h2>Upad</h2><p>Loading…</p></div>`;

      const [meta, workers, monthsMerged] = await Promise.all([
        cachedApi("upadMeta", 60000, () => api({ action: "getUpadMeta" })),
        getActiveWorkers(),
        getMonthOptionsMerged()
      ]);

      const current = monthLabelNow();
      const monthOptionsRaw = (monthsMerged && monthsMerged.length) ? monthsMerged : (meta.months || []);
      const monthOptions = monthOptionsRaw.map(m => monthLabelFromAny(m)).filter(Boolean);

      const hasCurrent = monthOptions.map(normMonthLabel).includes(normMonthLabel(current));

      content.innerHTML = `
        <div class="card">
          <h2>Upad</h2>

          <div class="card" style="margin-top:12px;">
            <h3 style="margin-top:0;">Add Upad</h3>

            <label>Worker</label>
            <select id="upad_worker">
              ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
            </select>

            <label style="margin-top:10px;">Amount</label>
            <input id="upad_amount" type="number" placeholder="Amount">

            <label style="margin-top:10px;">Month</label>
            <input id="upad_month" list="monthList" placeholder="Month (e.g. Feb-2026)" value="${escapeAttr(current)}">
            <datalist id="monthList">
              ${(meta.months || [])
                .map(m => monthLabelFromAny(m))
                .filter(Boolean)
                .map(m => `<option value="${escapeAttr(m)}"></option>`)
                .join("")}
            </datalist>

            <button class="primary" id="btn_upad" style="margin-top:14px;">Add Upad</button>
          </div>

          <div class="card" style="margin-top:12px;">
            <h3 style="margin-top:0;">Upad Summary</h3>

            <label>Month</label>
            <select id="upad_filter_month">
              <option value="">All</option>
              ${monthOptions
                .map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`)
                .join("")}
            </select>

            <label style="margin-top:10px;">Worker</label>
            <select id="upad_filter_worker">
              <option value="">All</option>
              ${(workers || []).map(w => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
            </select>

            <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
              <button class="primary" id="btn_upad_load">Show</button>
              <button class="primary" id="btn_upad_clear" style="background:#111;">Clear</button>
              ${
                role === "superadmin"
                  ? `<button class="primary" id="btn_upad_export" style="background:#1fa971;">Export CSV</button>`
                  : ``
              }
            </div>

            <p id="upad_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
            <div id="upad_list" style="margin-top:12px;"></div>

            <p class="dashSmall" style="margin-top:10px;">
              (Nothing will show until you click <b>Show</b> or change Month/Worker.)
            </p>
          </div>
        </div>
      `;

      const mSel = document.getElementById("upad_filter_month");
      if (mSel && hasCurrent) {
        mSel.value = monthOptions.find(m => normMonthLabel(m) === normMonthLabel(current)) || "";
      }

      let upadSummaryEnabled = false;
      let lastUpadRows = [];

      const listBox = document.getElementById("upad_list");
      const totalBox = document.getElementById("upad_total");
      if (listBox) listBox.innerHTML = "";
      if (totalBox) totalBox.textContent = "";

      document.getElementById("btn_upad").addEventListener("click", addUpad);

      const loadBtn = document.getElementById("btn_upad_load");
      const clearBtn = document.getElementById("btn_upad_clear");
      const exportBtn = document.getElementById("btn_upad_export");

      async function loadUpadSummary() {
        const btn = loadBtn;
        const unlock = lockButton(btn, "Loading...");

        try {
          const month = (document.getElementById("upad_filter_month")?.value || "").trim();
          const worker = (document.getElementById("upad_filter_worker")?.value || "").trim();

          const rows = await api({ action: "listUpad", month, worker });
          lastUpadRows = Array.isArray(rows) ? rows : [];

          if (!listBox) return;

          if (!lastUpadRows.length) {
            listBox.innerHTML = `<p>No upad entries found.</p>`;
            if (totalBox) totalBox.textContent = "";
            return;
          }

          const total = lastUpadRows.reduce((s, r) => s + Number(r.amount || r[3] || 0), 0);

          if (totalBox) {
            totalBox.textContent =
              `Total upad: ₹${Math.round(total)}`
              + (month ? ` • Month: ${month}` : "")
              + (worker ? ` • Worker: ${worker}` : "");
          }

          const showActions = (role === "superadmin");

          listBox.innerHTML = `
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <th align="left">Date</th>
                <th align="left">Worker</th>
                <th align="right">Amount</th>
                <th align="left">Month</th>
                <th align="left">Added By</th>
                ${showActions ? `<th align="right">Actions</th>` : ``}
              </tr>
              ${lastUpadRows.map(r => {
                const rowId = getUpadRowId(r);
                const date = prettyISODate(r.date || r[1] || "");
                const wk = String(r.worker || r[2] || "");
                const amt = Number(r.amount || r[3] || 0);
                const mon = monthLabelFromAny(r.month ?? r[4] ?? "");
                const by = String(r.added_by || r[5] || "");

                return `
                  <tr style="border-top:1px solid #eee;">
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(wk)}</td>
                    <td align="right">₹${amt.toFixed(0)}</td>
                    <td>${escapeHtml(mon)}</td>
                    <td>${escapeHtml(by)}</td>
                    ${
                      showActions
                        ? `<td align="right" style="white-space:nowrap;">
                             <button class="userToggleBtn" data-upad-edit="1" data-row="${escapeAttr(rowId ?? "")}">Edit</button>
                             <button class="userToggleBtn" data-upad-del="1" data-row="${escapeAttr(rowId ?? "")}">Delete</button>
                           </td>`
                        : ``
                    }
                  </tr>
                `;
              }).join("")}
            </table>
          `;

          if (role === "superadmin") {
            listBox.querySelectorAll("button[data-upad-edit]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const row = Number(btn.getAttribute("data-row") || 0);
                if (!row) return alert("Invalid row");

                const cur = lastUpadRows.find(x => getUpadRowId(x) === row);
                const curWorker = String(cur?.worker || "");
                const curMonth = monthLabelFromAny(cur?.month || "");
                const curAmt = Number(cur?.amount || 0);

                const newWorker = prompt("Worker:", curWorker);
                if (newWorker === null) return;

                const newMonth = prompt("Month (e.g. Feb-2026):", curMonth);
                if (newMonth === null) return;

                const newAmountStr = prompt("Amount:", String(curAmt || 0));
                if (newAmountStr === null) return;
                const newAmount = Number(newAmountStr || 0);

                if (!String(newWorker).trim() || !newAmount) return alert("Worker and Amount required");

                const unlock2 = lockButton(btn, "Saving...");
                try {
                 const keepDate = prettyISODate(cur?.date || todayISO());

const r = await api({
  action: "updateUpad",
  rowIndex: Number(row),
  date: keepDate, // ✅ REQUIRED by backend
  worker: String(newWorker).trim(),
  month: String(newMonth).trim(),
  amount: newAmount
});

                  if (r && r.error) return alert(String(r.error));
                  alert("Upad updated");
                  invalidateCache(["upadMeta", "monthsMerged"]);
                  await loadUpadSummary();
                } finally {
                  setTimeout(unlock2, 500);
                }
              });
            });

            listBox.querySelectorAll("button[data-upad-del]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const row = Number(btn.getAttribute("data-row") || 0);
                if (!row) return alert("Invalid row");
                if (!confirm("Delete this upad entry?")) return;

                const unlock2 = lockButton(btn, "Deleting...");
                try {
                  const r = await api({
                    action: "deleteUpad",
                    rowIndex: Number(row)
                  });
                  if (r && r.error) return alert(String(r.error));
                  alert("Upad deleted");
                  invalidateCache(["upadMeta", "monthsMerged"]);
                  await loadUpadSummary();
                } finally {
                  setTimeout(unlock2, 500);
                }
              });
            });
          }

        } finally {
          setTimeout(unlock, 350);
        }
      }

      function enableAndLoad() {
        upadSummaryEnabled = true;
        loadUpadSummary();
      }

      loadBtn?.addEventListener("click", enableAndLoad);

      document.getElementById("upad_filter_month")?.addEventListener("change", () => {
        upadSummaryEnabled = true;
        loadUpadSummary();
      });
      document.getElementById("upad_filter_worker")?.addEventListener("change", () => {
        upadSummaryEnabled = true;
        loadUpadSummary();
      });

      clearBtn?.addEventListener("click", () => {
        upadSummaryEnabled = false;
        lastUpadRows = [];
        if (listBox) listBox.innerHTML = "";
        if (totalBox) totalBox.textContent = "";
        const m = document.getElementById("upad_filter_month");
        const w = document.getElementById("upad_filter_worker");
        if (m) m.value = hasCurrent ? (monthOptions.find(x => normMonthLabel(x) === normMonthLabel(current)) || "") : "";
        if (w) w.value = "";
      });

      exportBtn?.addEventListener("click", () => {
        if (role !== "superadmin") return;

        if (!upadSummaryEnabled || !Array.isArray(lastUpadRows) || !lastUpadRows.length) {
          alert("Please click Show first.");
          return;
        }

        const month = (document.getElementById("upad_filter_month")?.value || "").trim();
        const worker = (document.getElementById("upad_filter_worker")?.value || "").trim();

        const header = ["date","worker","amount","month","added_by","row"];
        const lines = [header.join(",")];

        lastUpadRows.forEach(r => {
          const rowId = getUpadRowId(r) ?? "";
          const cols = [
            prettyISODate(r.date || ""),
            String(r.worker || ""),
            String(Number(r.amount || 0)),
            monthLabelFromAny(r.month || ""),
            String(r.added_by || ""),
            String(rowId)
          ].map(v => csvEscape(v));
          lines.push(cols.join(","));
        });

        const csv = lines.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

        const a = document.createElement("a");
        const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
        const file = `upad_${company}_${(month || "All")}_${(worker || "All")}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");
        a.href = URL.createObjectURL(blob);
        a.download = file;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 200);
      });

      return;
    }

    // ---- rest of your file unchanged below ----

    // ------ clients module loadsection starts here 
if (type === "clients") {
  content.innerHTML = `<div class="card"><h2>Clients</h2><p>Loading…</p></div>`;

  // We will NOT auto-render list. Only fetch once, then filter on UI.
  const rows = await api({ action: "listClients" });
  const allClients = Array.isArray(rows) ? rows : [];

  const canAdd = (role === "owner" || role === "superadmin");
  const isSuper = (role === "superadmin");

  // UI state
  let viewMode = ""; // "ACTIVE" | "ALL"
  let lastShown = []; // rows currently shown (after mode + search)

  content.innerHTML = `
    <div class="card">
      <h2>Clients</h2>

      ${
        canAdd ? `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin-top:0;">Add Client</h3>

          <label>Name</label>
          <input id="cl_name" placeholder="Client name">

          <label style="margin-top:10px;">Company (optional)</label>
          <input id="cl_company" placeholder="Company name">

          <label style="margin-top:10px;">Phone 1</label>
          <input id="cl_phone1" inputmode="numeric" placeholder="Mobile number">

          <label style="margin-top:10px;">Phone 2 (optional)</label>
          <input id="cl_phone2" inputmode="numeric" placeholder="Alternate number">

          <label style="margin-top:10px;">Address (optional)</label>
          <input id="cl_address" placeholder="Address">

          <label style="margin-top:10px;">GST (optional)</label>
          <input id="cl_gst" placeholder="GST number">

          <button class="primary" id="btn_cl_add" style="margin-top:14px;">➕ Add Client</button>
          <p class="dashSmall" style="margin-top:10px;">Owner & Superadmin can add. Only Superadmin can edit/status/export.</p>
        </div>
        ` : `
        <p class="dashSmall" style="margin-top:8px;">You can view clients. Only Owner/Superadmin can add.</p>
        `
      }

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Client List</h3>

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="primary" id="btn_cl_show_active">Show Active Summary</button>
          <button class="primary" id="btn_cl_show_all" style="background:#111;">Show Full List</button>
          ${
            isSuper
              ? `<button class="primary" id="btn_cl_export" style="background:#1fa971;">Export CSV</button>`
              : ``
          }
        </div>

        <div style="margin-top:12px;">
          <label>Search (name / phone / company)</label>
          <input id="cl_search" placeholder="Type to search..." autocomplete="off">
          <p class="dashSmall" id="cl_hint" style="margin-top:8px;">
            Click <b>Show Active Summary</b> or <b>Show Full List</b> to load list.
          </p>
        </div>

        <p id="cl_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
        <div id="cl_list" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  const listBox = document.getElementById("cl_list");
  const totalBox = document.getElementById("cl_total");
  const searchInput = document.getElementById("cl_search");
  const hint = document.getElementById("cl_hint");

  function norm(s){ return String(s || "").trim().toLowerCase(); }

  function applySearchAndRender() {
    if (!listBox) return;

    const q = norm(searchInput?.value || "");

    let base = [];
    if (viewMode === "ACTIVE") {
      base = allClients.filter(c => String(c.status || "ACTIVE").toUpperCase() === "ACTIVE");
    } else if (viewMode === "ALL") {
      base = allClients.slice();
    } else {
      // not loaded yet
      listBox.innerHTML = "";
      if (totalBox) totalBox.textContent = "";
      return;
    }

    const filtered = !q ? base : base.filter(c => {
      const hay = [
        c.client_name,
        c.client_company,
        c.phone1,
        c.phone2,
        c.address,
        c.gst,
        c.client_id
      ].map(norm).join(" ");
      return hay.includes(q);
    });

    lastShown = filtered;

    if (totalBox) {
      totalBox.textContent =
        `Showing ${filtered.length} client(s)` +
        (viewMode === "ACTIVE" ? " • Active only" : " • Active + Inactive") +
        (q ? ` • Search: "${q}"` : "");
    }

    if (!filtered.length) {
      listBox.innerHTML = `<p>No clients found.</p>`;
      return;
    }

    const showActions = isSuper;

    listBox.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left">Name</th>
          <th align="left">Phone 1</th>
          <th align="left">Company</th>
          <th align="left">GST</th>
          <th align="left">Status</th>
          ${showActions ? `<th align="right">Actions</th>` : ``}
        </tr>
        ${filtered.map(c => {
          const rowId = c.rowIndex ?? "";
          const status = String(c.status || "ACTIVE").toUpperCase();

          return `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(c.client_name || "")}</td>
              <td>${escapeHtml(c.phone1 || "")}</td>
              <td>${escapeHtml(c.client_company || "")}</td>
              <td>${escapeHtml(c.gst || "")}</td>
              <td><b>${escapeHtml(status)}</b></td>
              ${
                showActions ? `
                  <td align="right" style="white-space:nowrap;">
                    <button class="userToggleBtn" data-cl-edit="1" data-row="${escapeAttr(rowId)}">Edit</button>
                    <button class="userToggleBtn"
                      data-cl-status="1"
                      data-row="${escapeAttr(rowId)}"
                      data-next="${escapeAttr(status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}">
                      ${status === "ACTIVE" ? "Set Inactive" : "Set Active"}
                    </button>
                  </td>
                ` : ``
              }
            </tr>
          `;
        }).join("")}
      </table>
    `;

    // Bind superadmin actions
    if (isSuper) {
      listBox.querySelectorAll("button[data-cl-edit]").forEach(b => {
        b.addEventListener("click", async () => {
          const row = b.getAttribute("data-row");
          if (!row) return alert("Row id missing");

          const cur = allClients.find(x => String(x.rowIndex) === String(row));
          if (!cur) return alert("Client not found");

          const newName = prompt("Name:", String(cur.client_name || ""));
          if (newName === null) return;

          const newCompany = prompt("Company:", String(cur.client_company || ""));
          if (newCompany === null) return;

          const newPhone1 = prompt("Phone 1:", String(cur.phone1 || ""));
          if (newPhone1 === null) return;

          const newPhone2 = prompt("Phone 2:", String(cur.phone2 || ""));
          if (newPhone2 === null) return;

          const newAddress = prompt("Address:", String(cur.address || ""));
          if (newAddress === null) return;

          const newGst = prompt("GST:", String(cur.gst || ""));
          if (newGst === null) return;

          if (!String(newName).trim() || !String(newPhone1).trim()) {
            return alert("Name and phone1 required");
          }

          const unlock = lockButton(b, "Saving...");
          try {
            const r = await api({
              action: "updateClient",
              rowIndex: Number(row),
              client_name: String(newName).trim(),
              client_company: String(newCompany || "").trim(),
              phone1: String(newPhone1).trim(),
              phone2: String(newPhone2 || "").trim(),
              address: String(newAddress || "").trim(),
              gst: String(newGst || "").trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Client updated");
            loadSection("clients");
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });

      listBox.querySelectorAll("button[data-cl-status]").forEach(b => {
        b.addEventListener("click", async () => {
          const row = b.getAttribute("data-row");
          const next = b.getAttribute("data-next");
          if (!row || !next) return alert("Row/status missing");

          const unlock = lockButton(b, "Updating...");
          try {
            const r = await api({
              action: "updateClientStatus",
              rowIndex: Number(row),
              status: String(next).trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Status updated");
            loadSection("clients");
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });
    }
  }

  // Buttons: load lists (no auto load)
  document.getElementById("btn_cl_show_active")?.addEventListener("click", () => {
    viewMode = "ACTIVE";
    if (hint) hint.textContent = "Active clients loaded. Use search to filter.";
    applySearchAndRender();
  });

  document.getElementById("btn_cl_show_all")?.addEventListener("click", () => {
    viewMode = "ALL";
    if (hint) hint.textContent = "All clients loaded (Active + Inactive). Use search to filter.";
    applySearchAndRender();
  });

  // Search live filtering (only after user loaded some view)
  searchInput?.addEventListener("input", () => {
    applySearchAndRender();
  });

  // Export CSV (superadmin) — exports what is currently shown
  document.getElementById("btn_cl_export")?.addEventListener("click", () => {
    if (!isSuper) return;

    if (!viewMode) return alert("Please click Show Active Summary or Show Full List first.");
    if (!Array.isArray(lastShown) || !lastShown.length) return alert("No clients to export.");

    const header = [
      "client_id","client_name","client_company","phone1","phone2","address","gst","status","added_by","created_at","updated_at","rowIndex"
    ];
    const lines = [header.join(",")];

    lastShown.forEach(c => {
      const cols = [
        String(c.client_id || ""),
        String(c.client_name || ""),
        String(c.client_company || ""),
        String(c.phone1 || ""),
        String(c.phone2 || ""),
        String(c.address || ""),
        String(c.gst || ""),
        String(c.status || ""),
        String(c.added_by || ""),
        String(c.created_at || ""),
        String(c.updated_at || ""),
        String(c.rowIndex || "")
      ].map(v => csvEscape(v));
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const a = document.createElement("a");
    const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
    const mode = (viewMode === "ACTIVE" ? "ACTIVE" : "ALL");
    const file = `clients_${company}_${mode}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  });

  // Add client (owner + superadmin)
  if (canAdd) {
    document.getElementById("btn_cl_add")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn_cl_add");
      const unlock = lockButton(btn, "Saving...");

      try {
        const client_name = (document.getElementById("cl_name")?.value || "").trim();
        const client_company = (document.getElementById("cl_company")?.value || "").trim();
        const phone1 = (document.getElementById("cl_phone1")?.value || "").trim();
        const phone2 = (document.getElementById("cl_phone2")?.value || "").trim();
        const address = (document.getElementById("cl_address")?.value || "").trim();
        const gst = (document.getElementById("cl_gst")?.value || "").trim();

        if (!client_name || !phone1) return alert("Name and phone1 required");

        const r = await api({
          action: "addClient",
          client_name,
          client_company,
          phone1,
          phone2,
          address,
          gst
        });
        if (r && r.error) return alert(String(r.error));

        alert("Client added");
        loadSection("clients");
      } finally {
        setTimeout(unlock, 500);
      }
    });
  }

  return;
}


    // ----- clients module loadsection ends here
    // ----- inventory master starts here
     if (type === "inventory") {
  content.innerHTML = `<div class="card"><h2>Inventory</h2><p>Loading…</p></div>`;

  const isSuper = (role === "superadmin");

  // Load inventory list (all statuses for superadmin; only active for others)
  const rows = await api({
    action: "listInventoryMaster",
    onlyActive: isSuper ? false : true
  });

  const items = Array.isArray(rows) ? rows : [];
  const activeItems = items.filter(x => String(x.status || "ACTIVE").toUpperCase() === "ACTIVE");

  content.innerHTML = `
    <div class="card">
      <h2>Inventory</h2>

      ${
        isSuper ? `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin-top:0;">Add Item</h3>

          <label>Item Name</label>
          <input id="inv_name" placeholder="e.g. Power cable">

          <label style="margin-top:10px;">Total Qty</label>
          <input id="inv_qty" type="number" inputmode="numeric" placeholder="e.g. 334">

          <label style="margin-top:10px;">Unit (optional)</label>
          <input id="inv_unit" placeholder="e.g. pcs, box, set">

          <button class="primary" id="btn_inv_add" style="margin-top:14px;">➕ Add Item</button>

          <p class="dashSmall" style="margin-top:10px;">
            Only <b>Superadmin</b> can add/edit inventory master.
          </p>
        </div>
        ` : `
          <p class="dashSmall" style="margin-top:8px;">
            You can view inventory. Only <b>Superadmin</b> can change inventory master.
          </p>
        `
      }

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Inventory List</h3>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:10px 0;">
          <input id="inv_search" placeholder="Search item name" style="flex:1; min-width:200px;">
          ${
            isSuper
              ? `
                <button class="primary" id="btn_inv_export" style="background:#1fa971;">Export CSV</button>
                <button class="primary" id="btn_inv_show_active" style="background:#111;">Show Active</button>
                <button class="primary" id="btn_inv_show_all" style="background:#111;">Show All</button>
              `
              : `
                <button class="primary" id="btn_inv_show_active" style="background:#111;">Show</button>
              `
          }
        </div>

        <p id="inv_meta" class="dashSmall" style="margin-top:6px;"></p>
        <div id="inv_list" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  const listBox = document.getElementById("inv_list");
  const metaBox = document.getElementById("inv_meta");
  const searchInp = document.getElementById("inv_search");

  let mode = isSuper ? "ALL" : "ACTIVE"; // ALL or ACTIVE
  let shown = []; // current shown array for export/search

  function norm(s){ return String(s || "").toLowerCase().trim(); }

  function renderList() {
    const q = norm(searchInp?.value || "");
    const base = (mode === "ALL") ? items : activeItems;
    const filtered = base.filter(it => {
      if (!q) return true;
      return norm(it.item_name).includes(q) || norm(it.item_id).includes(q);
    });

    shown = filtered;

    if (metaBox) {
      metaBox.textContent =
        (mode === "ALL" ? `Showing all items: ${filtered.length}` : `Showing active items: ${filtered.length}`) +
        (q ? ` • Search: "${q}"` : "");
    }

    if (!listBox) return;

    if (!filtered.length) {
      listBox.innerHTML = `<p>No inventory items found.</p>`;
      return;
    }

    listBox.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left">Item</th>
          <th align="right">Total</th>
          <th align="left">Unit</th>
          ${isSuper ? `<th align="left">Status</th>` : ``}
          ${isSuper ? `<th align="right">Actions</th>` : ``}
        </tr>
        ${filtered.map(it => {
          const rowId = it.rowIndex ?? "";
          const status = String(it.status || "ACTIVE").toUpperCase();
          return `
            <tr style="border-top:1px solid #eee;">
              <td>
                <b>${escapeHtml(it.item_name || "")}</b><br>
                <span class="dashSmall">${escapeHtml(it.item_id || "")}</span>
              </td>
              <td align="right">${Number(it.total_qty || 0).toFixed(0)}</td>
              <td>${escapeHtml(it.unit || "")}</td>
              ${isSuper ? `<td><b>${escapeHtml(status)}</b></td>` : ``}
              ${
                isSuper
                  ? `<td align="right" style="white-space:nowrap;">
                       <button class="userToggleBtn" data-inv-edit="1" data-row="${escapeAttr(rowId)}">Edit</button>
                       <button class="userToggleBtn"
                         data-inv-status="1"
                         data-row="${escapeAttr(rowId)}"
                         data-next="${escapeAttr(status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}">
                         ${status === "ACTIVE" ? "Set Inactive" : "Set Active"}
                       </button>
                     </td>`
                  : ``
              }
            </tr>
          `;
        }).join("")}
      </table>
    `;

    // Bind superadmin actions
    if (isSuper) {
      listBox.querySelectorAll("button[data-inv-edit]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const row = btn.getAttribute("data-row");
          if (!row) return alert("Row id missing");

          const cur = items.find(x => String(x.rowIndex) === String(row));
          if (!cur) return alert("Item not found");

          const newName = prompt("Item Name:", String(cur.item_name || ""));
          if (newName === null) return;

          const newQtyStr = prompt("Total Qty:", String(Number(cur.total_qty || 0)));
          if (newQtyStr === null) return;
          const newQty = Number(newQtyStr || 0);

          const newUnit = prompt("Unit (optional):", String(cur.unit || ""));
          if (newUnit === null) return;

          if (!String(newName).trim() || !(newQty >= 0)) {
            return alert("Item name required and qty must be >= 0");
          }

          const unlock = lockButton(btn, "Saving...");
          try {
            const r = await api({
              action: "updateInventoryItem",
              rowIndex: Number(row),
              item_name: String(newName).trim(),
              total_qty: newQty,
              unit: String(newUnit || "").trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Item updated");
            loadSection("inventory");
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });

      listBox.querySelectorAll("button[data-inv-status]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const row = btn.getAttribute("data-row");
          const next = btn.getAttribute("data-next");
          if (!row || !next) return alert("Row/status missing");

          const unlock = lockButton(btn, "Updating...");
          try {
            const r = await api({
              action: "updateInventoryItemStatus",
              rowIndex: Number(row),
              status: String(next).trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Status updated");
            loadSection("inventory");
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });
    }
  }

  // Initial render: do NOT auto-load summary concept not needed here; but render list is instant from fetched data
  renderList();

  // Search
  searchInp?.addEventListener("input", () => renderList());

  // Show buttons
  document.getElementById("btn_inv_show_active")?.addEventListener("click", () => {
    mode = "ACTIVE";
    renderList();
  });

  document.getElementById("btn_inv_show_all")?.addEventListener("click", () => {
    mode = "ALL";
    renderList();
  });

  // Add item (superadmin)
  document.getElementById("btn_inv_add")?.addEventListener("click", async () => {
    if (!isSuper) return;

    const btn = document.getElementById("btn_inv_add");
    const unlock = lockButton(btn, "Saving...");

    try {
      const name = (document.getElementById("inv_name")?.value || "").trim();
      const qty = Number(document.getElementById("inv_qty")?.value || 0);
      const unit = (document.getElementById("inv_unit")?.value || "").trim();

      if (!name) return alert("Item name required");
      if (!(qty >= 0)) return alert("Qty must be >= 0");

      const r = await api({
        action: "addInventoryItem",
        item_name: name,
        total_qty: qty,
        unit
      });
      if (r && r.error) return alert(String(r.error));

      alert("Item added");
      loadSection("inventory");
    } finally {
      setTimeout(unlock, 500);
    }
  });

  // Export CSV (superadmin)
  document.getElementById("btn_inv_export")?.addEventListener("click", () => {
    if (!isSuper) return;

    const header = ["item_id","item_name","total_qty","unit","status","added_by","created_at","updated_at","rowIndex"];
    const lines = [header.join(",")];

    (shown || []).forEach(it => {
      const cols = [
        String(it.item_id || ""),
        String(it.item_name || ""),
        String(Number(it.total_qty || 0)),
        String(it.unit || ""),
        String(it.status || ""),
        String(it.added_by || ""),
        String(it.created_at || ""),
        String(it.updated_at || ""),
        String(it.rowIndex || "")
      ].map(v => csvEscape(v));
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const a = document.createElement("a");
    const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
    const file = `inventory_master_${company}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  });

  return;
}

    // ----- inventory masters end here 
// ---- expenses section updates starts here 
 if (type === "expenses") {
  content.innerHTML = `<div class="card"><h2>Expenses</h2><p>Loading…</p></div>`;

  const [months, typesRes] = await Promise.all([
    getMonthOptionsMerged(),
    api({ action: "listExpenseTypes" })
  ]);

  /* =========================
     NORMALIZE TYPES RESPONSE
     Supports:
     1) ["fuel","hotel"]
     2) { types: ["fuel"] }
     3) { types: [{type:"fuel", status:"ACTIVE"}] }
  ========================== */
  function normalizeTypes(resp) {
    const raw =
      Array.isArray(resp) ? resp
      : Array.isArray(resp?.types) ? resp.types
      : Array.isArray(resp?.data) ? resp.data
      : [];

    // Convert to [{type, status}]
    const arr = raw.map(x => {
      if (typeof x === "string") return { type: x, status: "ACTIVE" }; // old backend
      if (x && typeof x === "object") {
        const t = String(x.type ?? x.name ?? x.category ?? "").trim();
        const st = String(x.status ?? "ACTIVE").trim().toUpperCase();
        return { type: t, status: (st === "INACTIVE" ? "INACTIVE" : "ACTIVE") };
      }
      return { type: "", status: "ACTIVE" };
    }).filter(x => x.type);

    // Unique by type (keep first)
    const seen = new Set();
    const uniq = [];
    arr.forEach(x => {
      const k = x.type.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      uniq.push(x);
    });

    return uniq;
  }

  const typesAll = normalizeTypes(typesRes);                       // ✅ includes inactive (for summary)
  const typesActive = typesAll.filter(t => t.status === "ACTIVE"); // ✅ only active (for add)

  const current = monthLabelNow();
  const hasCurrent = months.map(normMonthLabel).includes(normMonthLabel(current));

  content.innerHTML = `
    <div class="card">
      <h2>Expenses</h2>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Add Expense</h3>

        <label>Type</label>
        <select id="exp_category">
          ${typesActive.map(t => `<option value="${escapeAttr(t.type)}">${escapeHtml(t.type)}</option>`).join("")}
        </select>
        ${typesActive.length ? `` : `<p class="dashSmall">No ACTIVE types. Superadmin must add/activate a type.</p>`}

        <label style="margin-top:10px;">Description</label>
        <input id="exp_desc" placeholder="Description">

        <label style="margin-top:10px;">Amount</label>
        <input id="exp_amount" type="number" placeholder="Amount">

        <button class="primary" id="btn_exp" style="margin-top:14px;">Add Expense</button>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Expense Summary</h3>

        <label>Month</label>
        <select id="exp_filter_month">
          <option value="">All</option>
          ${months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
        </select>

        <label style="margin-top:10px;">Type</label>
        <select id="exp_filter_type">
          <option value="">All</option>
          ${typesAll.map(t => `
            <option value="${escapeAttr(t.type)}">
              ${escapeHtml(t.type)}${t.status === "INACTIVE" ? " (Inactive)" : ""}
            </option>
          `).join("")}
        </select>

        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="primary" id="btn_exp_load">Show</button>
          <button class="primary" id="btn_exp_clear" style="background:#111;">Clear</button>
          ${
            role === "superadmin"
              ? `<button class="primary" id="btn_exp_export" style="background:#1fa971;">Export CSV</button>`
              : ``
          }
        </div>

        <p id="exp_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
        <div id="exp_list" style="margin-top:12px;"></div>

        <p class="dashSmall" style="margin-top:10px;">
          (Nothing will show until you click <b>Show</b> or change Month/Type.)
        </p>
      </div>

      ${
        role === "superadmin"
          ? `
            <div class="card" style="margin-top:12px;">
              <h3 style="margin-top:0;">Manage Expense Types</h3>

              <label>New type</label>
              <input id="exp_type_new" placeholder="e.g. fuel">

              <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
                <button class="primary" id="btn_exp_type_add">Add Type</button>
              </div>

              <div id="exp_type_list" style="margin-top:12px;"></div>
              <p class="dashSmall" style="margin-top:10px;">
                Tip: Don’t delete types. Use <b>Inactive</b> so old expenses stay correct.
              </p>
            </div>
          `
          : ``
      }
    </div>
  `;

  // default selection (no auto-load)
  const mSel = document.getElementById("exp_filter_month");
  if (mSel && hasCurrent) mSel.value = months.find(m => normMonthLabel(m) === normMonthLabel(current)) || "";

  document.getElementById("btn_exp").addEventListener("click", addExpense);

  const listBox = document.getElementById("exp_list");
  const totalBox = document.getElementById("exp_total");

  let expSummaryEnabled = false;
  let lastExpenseRows = [];

  async function loadExpenseSummary() {
    const btn = document.getElementById("btn_exp_load");
    const unlock = lockButton(btn, "Loading...");

    try {
      const month = (document.getElementById("exp_filter_month")?.value || "").trim();
      const category = (document.getElementById("exp_filter_type")?.value || "").trim();

      const rows = await api({ action: "listExpenses", month, category });
      lastExpenseRows = Array.isArray(rows) ? rows : [];

      if (!listBox) return;

      if (!lastExpenseRows.length) {
        listBox.innerHTML = `<p>No expenses found.</p>`;
        if (totalBox) totalBox.textContent = "";
        return;
      }

      const total = lastExpenseRows.reduce((s, r) => s + Number(r.amount || 0), 0);

      if (totalBox) {
        totalBox.textContent =
          `Total expenses: ₹${Math.round(total)}`
          + (month ? ` • Month: ${month}` : "")
          + (category ? ` • Type: ${category}` : "");
      }

      const showActions = (role === "superadmin");

      listBox.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Date</th>
            <th align="left">Type</th>
            <th align="left">Description</th>
            <th align="right">Amount</th>
            <th align="left">Month</th>
            <th align="left">Added By</th>
            ${showActions ? `<th align="right">Actions</th>` : ``}
          </tr>
          ${lastExpenseRows.map(r => {
            const rowId = r.rowIndex ?? "";
            const date = prettyISODate(r.date || "");
            const cat = String(r.category || "");
            const desc = String(r.description ?? r.desc ?? "");
            const amt = Number(r.amount || 0);
            const mon = prettyMonth(r.month || "");
            const by = String(r.added_by || "");

            return `
              <tr style="border-top:1px solid #eee;">
                <td>${escapeHtml(date)}</td>
                <td>${escapeHtml(cat)}</td>
                <td>${escapeHtml(desc)}</td>
                <td align="right">₹${amt.toFixed(0)}</td>
                <td>${escapeHtml(mon)}</td>
                <td>${escapeHtml(by)}</td>
                ${
                  showActions
                    ? `<td align="right" style="white-space:nowrap;">
                         <button class="userToggleBtn" data-exp-edit="1" data-row="${escapeAttr(rowId)}">Edit</button>
                         <button class="userToggleBtn" data-exp-del="1" data-row="${escapeAttr(rowId)}">Delete</button>
                       </td>`
                    : ``
                }
              </tr>
            `;
          }).join("")}
        </table>
      `;

      if (role === "superadmin") {
        listBox.querySelectorAll("button[data-exp-edit]").forEach(btn2 => {
          btn2.addEventListener("click", async () => {
            const row = btn2.getAttribute("data-row");
            if (!row) return alert("Row id missing");

            const cur = lastExpenseRows.find(x => String(x.rowIndex) === String(row));
            if (!cur) return alert("Row not found");

            const keepDate = prettyISODate(cur.date || todayISO());

            const newCat = prompt("Type:", String(cur.category || ""));
            if (newCat === null) return;

            const newDesc = prompt("Description:", String(cur.description ?? cur.desc ?? ""));
            if (newDesc === null) return;

            const newAmountStr = prompt("Amount:", String(Number(cur.amount || 0)));
            if (newAmountStr === null) return;
            const newAmount = Number(newAmountStr || 0);

            const newMonth = prompt("Month (e.g. Feb-2026):", String(prettyMonth(cur.month || "")));
            if (newMonth === null) return;

            if (!String(newCat).trim() || !(newAmount > 0) || !String(newMonth).trim()) {
              return alert("Type, Month and Amount (>0) required");
            }

            const unlock2 = lockButton(btn2, "Saving...");
            try {
              const r = await api({
                action: "updateExpense",
                rowIndex: Number(row),
                date: keepDate,
                category: String(newCat).trim(),
                description: String(newDesc || "").trim(), // ✅ match your sheet header
                desc: String(newDesc || "").trim(),        // ✅ keep compatibility
                amount: newAmount,
                month: String(newMonth).trim()
              });
              if (r && r.error) return alert(String(r.error));
              alert("Expense updated");
              await loadExpenseSummary();
            } finally {
              setTimeout(unlock2, 500);
            }
          });
        });

        listBox.querySelectorAll("button[data-exp-del]").forEach(btn2 => {
          btn2.addEventListener("click", async () => {
            const row = btn2.getAttribute("data-row");
            if (!row) return alert("Row id missing");
            if (!confirm("Delete this expense entry?")) return;

            const unlock2 = lockButton(btn2, "Deleting...");
            try {
              const r = await api({ action: "deleteExpense", rowIndex: Number(row) });
              if (r && r.error) return alert(String(r.error));
              alert("Expense deleted");
              await loadExpenseSummary();
            } finally {
              setTimeout(unlock2, 500);
            }
          });
        });
      }

    } finally {
      setTimeout(unlock, 350);
    }
  }

  function enableAndLoad() {
    expSummaryEnabled = true;
    loadExpenseSummary();
  }

  document.getElementById("btn_exp_load")?.addEventListener("click", enableAndLoad);

  // change filters => enable + reload
  document.getElementById("exp_filter_month")?.addEventListener("change", () => {
    expSummaryEnabled = true;
    loadExpenseSummary();
  });
  document.getElementById("exp_filter_type")?.addEventListener("change", () => {
    expSummaryEnabled = true;
    loadExpenseSummary();
  });

  document.getElementById("btn_exp_clear")?.addEventListener("click", () => {
    expSummaryEnabled = false;
    lastExpenseRows = [];
    if (listBox) listBox.innerHTML = "";
    if (totalBox) totalBox.textContent = "";
    if (mSel) mSel.value = hasCurrent ? (months.find(x => normMonthLabel(x) === normMonthLabel(current)) || "") : "";
    const tSel = document.getElementById("exp_filter_type");
    if (tSel) tSel.value = "";
  });

  // export CSV (superadmin)
  document.getElementById("btn_exp_export")?.addEventListener("click", () => {
    if (role !== "superadmin") return;
    if (!expSummaryEnabled || !lastExpenseRows.length) return alert("Please click Show first.");

    const month = (document.getElementById("exp_filter_month")?.value || "").trim();
    const category = (document.getElementById("exp_filter_type")?.value || "").trim();

    const header = ["date","category","description","amount","month","added_by","rowIndex"];
    const lines = [header.join(",")];

    lastExpenseRows.forEach(r => {
      const cols = [
        prettyISODate(r.date || ""),
        String(r.category || ""),
        String(r.description ?? r.desc ?? ""),
        String(Number(r.amount || 0)),
        String(prettyMonth(r.month || "")),
        String(r.added_by || ""),
        String(r.rowIndex || "")
      ].map(v => csvEscape(v));
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const a = document.createElement("a");
    const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
    const file = `expenses_${company}_${(month || "All")}_${(category || "All")}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  });

  /* =========================
     MANAGE TYPES (SUPERADMIN)
     ✅ Toggle status instead of delete
  ========================== */
  if (role === "superadmin") {
    async function renderTypes() {
      const res = await api({ action: "listExpenseTypes" });
      const list = normalizeTypes(res); // [{type,status}]

      const box = document.getElementById("exp_type_list");
      if (!box) return;

      box.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Type</th>
            <th align="left">Status</th>
            <th align="right">Action</th>
          </tr>
          ${list.map(t => `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(t.type)}</td>
              <td><b>${escapeHtml(t.status)}</b></td>
              <td align="right">
                <button class="userToggleBtn"
                  data-type="${escapeAttr(t.type)}"
                  data-next="${escapeAttr(t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}">
                  ${t.status === "ACTIVE" ? "Set Inactive" : "Set Active"}
                </button>
              </td>
            </tr>
          `).join("")}
        </table>
        <p class="dashSmall" style="margin-top:10px;">
          Inactive types remain visible in Summary and old data stays correct.
        </p>
      `;

      box.querySelectorAll("button[data-type]").forEach(b => {
        b.addEventListener("click", async () => {
          const t = b.getAttribute("data-type");
          const next = b.getAttribute("data-next");
          if (!t || !next) return;

          const unlock = lockButton(b, "Updating...");
          try {
            const r = await api({ action: "updateExpenseTypeStatus", type: t, status: next });
            if (r && r.error) return alert(String(r.error));
            await renderTypes();
            loadSection("expenses"); // refresh dropdowns (active/inactive)
          } finally {
            setTimeout(unlock, 400);
          }
        });
      });
    }

    document.getElementById("btn_exp_type_add")?.addEventListener("click", async () => {
      const inp = document.getElementById("exp_type_new");
      const t = (inp?.value || "").trim();
      if (!t) return alert("Enter type");

      const r = await api({ action: "addExpenseType", type: t });
      if (r && r.error) return alert(String(r.error));

      inp.value = "";
      await renderTypes();
      loadSection("expenses");
    });

    renderTypes();
  }

  return;
}

// ---- expenses updates end here 
    if (type === "salary") {
      content.innerHTML = `<div class="card"><h2>Salary</h2><p>Loading…</p></div>`;

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

          
<div style="display:flex;gap:10px;flex-wrap:wrap;">
  <button class="primary" id="btn_sal_load">Load Summary</button>
  ${
    role === "superadmin"
      ? `<button class="primary" id="btn_sal_export" style="background:#1fa971;">Export CSV</button>`
      : ``
  }
        </div>  
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
      // --- new export salary function

document.getElementById("btn_sal_export")?.addEventListener("click", () => {
  if (role !== "superadmin") return;

  const rows = window.__lastSalaryRows || [];
  const month = window.__lastSalaryMonth || "";

  if (!Array.isArray(rows) || !rows.length) {
    alert("Please click Load Summary first.");
    return;
  }

  const header = [
    "worker",
    "monthly_salary",
    "prorated_salary",
    "upad",
    "holiday_count",
    "holiday_deduction",
    "paid",
    "balance"
  ];

  const lines = [header.join(",")];

  rows.forEach(r => {
    const upadVal = Number(
      r.upad_total ??
      r.upadTotal ??
      r.upad ??
      r.advance_total ??
      0
    );

    const cols = [
      String(r.worker || ""),
      String(Number(r.monthly_salary || 0)),
      String(Number(r.prorated_salary || 0)),
      String(upadVal),
      String(Number(r.holiday_count || 0)),
      String(Number(r.holiday_deduction || 0)),
      String(Number(r.paid_total || 0)),
      String(Number(r.balance || 0))
    ].map(v => csvEscape(v));

    lines.push(cols.join(","));
  });

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const a = document.createElement("a");
  const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
  const file = `salary_${company}_${(month || "All")}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");

  a.href = URL.createObjectURL(blob);
  a.download = file;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 200);
});

      
      // --- here it ends
      return;
    }

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
        </div>
      `;

      document.getElementById("btn_add_user").addEventListener("click", addNewUser);
      return;
    }

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
     Actions
  ========================== */

  async function addUpad() {
    const btn = document.getElementById("btn_upad");
    const unlock = lockButton(btn, "Saving...");

    try {
      const worker = document.getElementById("upad_worker").value.trim();
      const amount = Number(document.getElementById("upad_amount").value || 0);
      const month = document.getElementById("upad_month").value.trim() || monthLabelNow();

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
  description: desc, // ✅ new correct key
  desc,              // ✅ keep old key so nothing breaks
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
window.__lastSalaryRows = Array.isArray(rows) ? rows : [];
window.__lastSalaryMonth = month || "";

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
          ${rows.map(r => {
            const upadVal = Number(
              r.upad_total ??
              r.upadTotal ??
              r.upad ??
              r.advance_total ??
              0
            );

            return `
              <tr style="border-top:1px solid #eee;">
                <td>${escapeHtml(r.worker)}</td>
                <td align="right">₹${Number(r.monthly_salary || 0).toFixed(0)}</td>
                <td align="right">₹${Number(r.prorated_salary || 0).toFixed(0)}</td>
                <td align="right">₹${upadVal.toFixed(0)}</td>
                <td align="right">${Number(r.holiday_count || 0).toFixed(0)}</td>
                <td align="right">₹${Number(r.holiday_deduction || 0).toFixed(0)}</td>
                <td align="right">₹${Number(r.paid_total || 0).toFixed(0)}</td>
                <td align="right"><strong>₹${Number(r.balance || 0).toFixed(0)}</strong></td>
              </tr>
            `;
          }).join("")}
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
      const month = document.getElementById("sal_pay_month").value.trim() || monthLabelNow();

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

    const filtered = (rows || []).filter(r => {
      if (!workerFilter) return true;
      return String(r.worker || "").trim() === workerFilter;
    });

    if (!filtered.length) {
      box.innerHTML = `<p>No holidays found.</p>`;
      if (totalBox) totalBox.textContent = "";
      return;
    }

    if (totalBox) {
      totalBox.textContent =
        `Total holidays: ${filtered.length} day(s)` +
        (month ? ` • Month: ${month}` : "") +
        (workerFilter ? ` • Worker: ${workerFilter}` : "");
    }

    const showActions = (role === "superadmin");

    // ✅ FIX: use ONE consistent row id resolver everywhere (table + find + api calls)
    function holRowId(r) {
      const id = (r && (r.rowIndex ?? r.row ?? r._row)) ? (r.rowIndex ?? r.row ?? r._row) : "";
      return String(id || "").trim();
    }

    box.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left">Date</th>
          <th align="left">Worker</th>
          <th align="left">Month</th>
          <th align="left">Reason</th>
          ${showActions ? `<th align="right">Actions</th>` : ``}
        </tr>
        ${filtered.map(r => {
          const rowId = holRowId(r); // ✅ FIX
          return `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(prettyISODate(r.date || ""))}</td>
              <td>${escapeHtml(r.worker || "")}</td>
              <td>${escapeHtml(prettyMonth(r.month || ""))}</td>
              <td>${escapeHtml(r.reason || "")}</td>
              ${
                showActions
                  ? `<td align="right" style="white-space:nowrap;">
                       <button class="userToggleBtn" data-hol-edit="1" data-row="${escapeAttr(rowId)}">Edit</button>
                       <button class="userToggleBtn" data-hol-del="1" data-row="${escapeAttr(rowId)}">Delete</button>
                     </td>`
                  : ``
              }
            </tr>
          `;
        }).join("")}
      </table>
    `;

    if (role === "superadmin") {
      box.querySelectorAll("button[data-hol-edit]").forEach(btn2 => {
        btn2.addEventListener("click", async () => {
          const row = String(btn2.getAttribute("data-row") || "").trim();
          if (!row) return alert("Row id missing");

          // ✅ FIX: find using the SAME resolver used for rendering
          const cur = filtered.find(x => holRowId(x) === row);
          if (!cur) return alert("Row not found");

          const newWorker = prompt("Worker:", String(cur.worker || ""));
          if (newWorker === null) return;

          const newDate = prompt(
            "Date (YYYY-MM-DD):",
            String(prettyISODate(cur.date || todayISO()))
          );
          if (newDate === null) return;

          const newReason = prompt("Reason:", String(cur.reason || ""));
          if (newReason === null) return;

          if (!String(newWorker).trim() || !String(newDate).trim()) {
            return alert("Worker and Date required");
          }

          const unlock2 = lockButton(btn2, "Saving...");
          try {
            const r = await api({
              action: "updateHoliday",
              rowIndex: Number(row), // backend expects rowIndex
              worker: String(newWorker).trim(),
              date: String(newDate).trim(),
              reason: String(newReason || "").trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Holiday updated");
            invalidateCache(["holidaysAll", "monthsMerged"]);
            loadHolidays();
          } finally {
            setTimeout(unlock2, 500);
          }
        });
      });

      box.querySelectorAll("button[data-hol-del]").forEach(btn2 => {
        btn2.addEventListener("click", async () => {
          const row = String(btn2.getAttribute("data-row") || "").trim();
          if (!row) return alert("Row id missing");
          if (!confirm("Delete this holiday entry?")) return;

          const unlock2 = lockButton(btn2, "Deleting...");
          try {
            const r = await api({ action: "deleteHoliday", rowIndex: Number(row) });
            if (r && r.error) return alert(String(r.error));
            alert("Holiday deleted");
            invalidateCache(["holidaysAll", "monthsMerged"]);
            loadHolidays();
          } finally {
            setTimeout(unlock2, 500);
          }
        });
      });
    }
  } finally {
    setTimeout(unlock, 400);
  }
}

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

  // CSV helpers
  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

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

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }
