document.addEventListener("DOMContentLoaded", async() => {

  const role = localStorage.getItem("role") || "";
  const content = document.getElementById("content");
  if (!content) {
  console.error("❌ #content not found. Check HTML has <div id='content'></div>");
  return;
}


/*  try different dashboards starts here
// --- Role-Based Entry Logic ---
  try {
    if (role === "owner" || role === "superadmin") {
      console.log("👑 Access granted: Initializing Dashboard...");
      // Ensure showDashboard() is called (which is your async function name in the file)
      await showDashboard(); 
    } 
    else if (role === "staff") {
      console.log("🛠️ Staff Access: Loading Inventory Transactions...");
      // Calls your existing section loader
      loadSection("inventoryTxn"); 
    } 
    else {
      content.innerHTML = `
        <div style="text-align:center; padding: 40px;">
          <h2>Access Restricted</h2>
          <p>Please log in with an authorized account.</p>
        </div>`;
    }
  } catch (error) {
    console.error("❌ Error loading role-based section:", error);
    content.innerHTML = "<p>Critical error loading workspace. Please refresh.</p>";
  }
  // --- End Role Logic ---

  // try different dashboards ends here */
  
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

  // If already ISO date text, return as-is (no timezone shift)
  const s = String(v).trim().replace(/^'/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // If Sheets returns a Date-like object or other string, try to format safely
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);

  // Convert using local date parts (not toISOString)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
        box.innerHTML = rows.map((r, i) => `
  <div class="dashActRow" data-act-index="${i}" style="cursor:pointer;">
            <div class="dashActMain">
              <div><b>${escapeHtml(r.action || "")}</b> — ${escapeHtml(r.ref || "")}</div>
              <div class="dashSmall">By ${escapeHtml(r.user || "")}</div>
            </div>
            <div class="dashActTime">${escapeHtml(prettyISODate(r.time || ""))}</div>
          </div>
        `).join("");
      
     // starts here check here for syntax error   
        box.querySelectorAll(".dashActRow").forEach((el, idx) => {
  el.addEventListener("click", () => {
    const row = rows[idx];
    showActivityModal(row);
  });
});
 // ends here       
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


  
// new function

  function showActivityModal(row) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.4)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  overlay.innerHTML = `
    <div style="background:#fff; width:90%; max-width:420px; padding:16px; border-radius:10px;">
      <h3 style="margin-top:0;">Activity Details</h3>
      <div style="font-size:14px; line-height:1.5;">
        <div><b>Action:</b> ${escapeHtml(row.action || "")}</div>
        <div><b>Reference:</b> ${escapeHtml(row.ref || "")}</div>
        <div><b>User:</b> ${escapeHtml(row.user || "")}</div>
        <div><b>Date:</b> ${escapeHtml(prettyISODate(row.time || ""))}</div>
      </div>
      <div style="margin-top:14px; display:flex; gap:10px;">
        <button id="act_open_btn" class="primary" style="flex:1;">Open Related</button>
        <button id="act_close_btn" class="secondary" style="flex:1;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("act_close_btn").onclick = () => overlay.remove();

  document.getElementById("act_open_btn").onclick = () => {
    overlay.remove();
    openRelatedFromActivity(row);
  };
}




  
  function openRelatedFromActivity(row) {
  const action = String(row.action || "").toLowerCase();
  const ref = String(row.ref || "").trim();

  // WORKER STATUS
  if (action.includes("worker")) {
    sessionStorage.setItem("activity_jump", JSON.stringify({
      type: "worker",
      name: ref.split("→")[0].trim()
    }));
    loadSection("workers");
    return;
  }
  // SALARY
  if (action.includes("salary")) {
    // ref examples could be:
    // "Vipul Feb-2026"  OR  "Vipul"  OR  "Vipul → Paid" etc.
    const workerName =
      ref.split("→")[0].trim().split(/\s+/)[0].trim(); // safest: first word before arrow

    sessionStorage.setItem("activity_jump", JSON.stringify({
      type: "salary",
      name: workerName
    }));

    loadSection("salary");
    return;
  }

  // UPAD
  if (action.includes("upad")) {
    const name = ref.split(" ")[0].trim();
    sessionStorage.setItem("activity_jump", JSON.stringify({
      type: "upad",
      name
    }));
    loadSection("upad");
    return;
  }

  // EXPENSE
  if (action.includes("expense")) {
    sessionStorage.setItem("activity_jump", JSON.stringify({
      type: "expense",
      name: ref
    }));
    loadSection("expenses");
    return;
  }

  // INVENTORY
  if (action.includes("inventory")) {
    sessionStorage.setItem("activity_jump", JSON.stringify({
      type: "inventory",
      name: ref.split("(")[0].trim()
    }));
    loadSection("inventory");
    return;
  }

  // PASSWORD
  if (action.includes("password")) {
    loadSection("settings");
    return;
  }

  // fallback
 // fallback
showDashboard();

}


  
/* Dashboard Ends Here */


  
  async function loadSection(type) {
    /* if (type === "invoice") {
      location.href = "invoice.html";
      return;
    } */


// Company details section starts here

    
    // Company details section ends here




    
    // Bank details section starts here

    
   // Bank details section ends here


    
   
// GST bills section starts here

    /* ==========================================================
   ✅ GST BILLS (PURCHASE BILLS) (NEW)
   - Save purchase/vendor GST bills
   - Upload file/photo to Drive folder "gst bills" (per company)
   - OCR on upload (Option 1 Drive OCR)
   - Detect buttons near fields (Option 3) to fill/confirm
   - Line items optional
   - Sheet: gst_bills
   ========================================================== */
/* ==========================================================
   ✅ GST BILLS (UI)
   - Upload -> Option 1 Drive OCR (backend)
   - Detect buttons (Option 3) to fill fields before save
   - Line items optional (stored as JSON)
   ========================================================== */
if (type === "gstbills") {
  content.innerHTML = `<div class="card"><h2>GST Bills</h2><p>Loading…</p></div>`;

  const canEdit = (role === "owner" || role === "superadmin");

  // ----- UI state
  let editingBillId = "";
  let lastUpload = null; // new upload {file_id,file_url,ocr_text,parsed,ocr_ok}
let existingFile = { file_id:"", file_url:"", ocr_text:"" }; // ✅ for Edit: keep old file if no new upload
let lineItems = [];    // optional [{name, amount}]


  // ----- helpers 
  

  function num0(v){ const n = Number(v); return isFinite(n) ? n : 0; }
  function jstr(x){ try { return JSON.stringify(x || []); } catch(e){ return "[]"; } }
function money(n){ return Number(n||0).toFixed(2); }

  function readFileAsBase64(file){
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> {
        const s = String(fr.result || "");
        // data:<mime>;base64,XXXX
        const parts = s.split(",");
        resolve({
          base64: parts[1] || "",
          mimeType: file.type || "application/octet-stream",
          filename: file.name || "bill"
        });
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function refreshGSTSplitUI(){
    const gstType = String(document.getElementById("gb_gst_type")?.value || "CGST_SGST").toUpperCase();
    const rowSplit = document.getElementById("gb_split_row");
    const rowGstAmt = document.getElementById("gb_gst_amount_row");
    if (rowSplit) rowSplit.style.display = (gstType === "NONE") ? "none" : "";
    if (rowGstAmt) rowGstAmt.style.display = (gstType === "NONE") ? "none" : "";
  }

  function renderLineItems(){
    const box = document.getElementById("gb_line_items_box");
    if (!box) return;

    if (!lineItems.length){
      box.innerHTML = `<p class="dashSmall">No line items (optional).</p>`;
      return;
    }

    box.innerHTML = `
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Item</th>
            <th align="right">Amount</th>
            <th></th>
          </tr>
          ${lineItems.map((li, i)=>`
            <tr style="border-top:1px solid #eee;">
              <td><input data-li-name="${i}" value="${escapeAttr(li.name || "")}" placeholder="Goods/Service"></td>
              <td align="right"><input data-li-amt="${i}" type="number" inputmode="decimal" style="width:140px;" value="${escapeAttr(String(li.amount ?? 0))}"></td>
              <td align="right"><button class="userToggleBtn" data-li-del="${i}">✖</button></td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;

    box.querySelectorAll("input[data-li-name]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i = Number(inp.getAttribute("data-li-name"));
        if (!lineItems[i]) return;
        lineItems[i].name = String(inp.value || "");
      });
    });
    box.querySelectorAll("input[data-li-amt]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i = Number(inp.getAttribute("data-li-amt"));
        if (!lineItems[i]) return;
        lineItems[i].amount = num0(inp.value);
      });
    });
    box.querySelectorAll("button[data-li-del]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = Number(btn.getAttribute("data-li-del"));
        lineItems.splice(i,1);
        renderLineItems();
      });
    });
  }

function toISODateSafe(str){
  if (!str) return "";

  str = String(str).trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const m1 = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m1) {
    return m1[3] + "-" + m1[2] + "-" + m1[1];
  }

  // YYYY-MM-DD
  const m2 = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m2) {
    return m2[1] + "-" + m2[2] + "-" + m2[3];
  }

  return "";
}

 function toISODateMaybe(v){
  const s = String(v||"").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // dd-mm-yyyy
  if (m){
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/); // yyyy-mm-dd
  if (m2){
    const yyyy = m2[1];
    const mm = String(m2[2]).padStart(2,"0");
    const dd = String(m2[3]).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function applyParsedToFields(parsed, mode){
  const p = parsed || {};
if (mode === "gst_split") mode = "split";


  if (mode === "bill_no" && p.bill_no) {
    document.getElementById("gb_bill_no").value = String(p.bill_no || "");
  }

  if (mode === "bill_date" && p.bill_date) {
    // p.bill_date MUST be YYYY-MM-DD now (backend fix)
    document.getElementById("gb_bill_date").value = String(p.bill_date || "");
  }

  if (mode === "vendor" && p.vendor) {
    document.getElementById("gb_vendor").value = String(p.vendor || "");
  }

  if (mode === "total" && (p.total_amount !== "" && p.total_amount != null)) {
    document.getElementById("gb_total_amount").value = String(p.total_amount);
  }

  if (mode === "gst_type" && p.gst_type) {
    document.getElementById("gb_gst_type").value = String(p.gst_type || "CGST_SGST").toUpperCase();
    refreshGSTSplitUI();
  }

  if (mode === "gst" && (p.gst_amount !== "" && p.gst_amount != null)) {
    document.getElementById("gb_gst_amount").value = String(p.gst_amount);
  }

  if (mode === "split") {
    if (p.cgst !== "" && p.cgst != null) document.getElementById("gb_cgst").value = String(p.cgst);
    if (p.sgst !== "" && p.sgst != null) document.getElementById("gb_sgst").value = String(p.sgst);
    if (p.igst !== "" && p.igst != null) document.getElementById("gb_igst").value = String(p.igst);
  }
}




  async function refreshList(){
    const listBox = document.getElementById("gb_list");
    if (!listBox) return;

    const rows = await api({ action: "listGSTBills" });
    const list = Array.isArray(rows) ? rows : [];

    if (!list.length){
      listBox.innerHTML = `<p>No GST bills found.</p>`;
      return;
    }

    listBox.innerHTML = `
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Bill No</th>
            <th align="left">Vendor</th>
            <th align="left">Date</th>
            <th align="right">Total</th>
            <th align="right">GST</th>
            <th align="right">Actions</th>
          </tr>
          ${list.map(b=>`
            <tr style="border-top:1px solid #eee;vertical-align:top;">
              <td><b>${escapeHtml(b.bill_no || "")}</b><br><span class="dashSmall">${escapeHtml(b.bill_id || "")}</span></td>
              <td>${escapeHtml(b.vendor || "")}</td>
              <td>${escapeHtml(prettyISODate(b.bill_date || ""))}</td>
              <td align="right">₹ ${money(b.total_amount || 0)}</td>
              <td align="right">₹ ${money(b.gst_amount || 0)}</td>
              <td align="right" style="white-space:nowrap;">
                ${b.file_url ? `<a class="userToggleBtn" href="${escapeAttr(b.file_url)}" target="_blank">File</a>` : ``}
                ${canEdit ? `<button class="userToggleBtn" data-gb-edit="${escapeAttr(b.bill_id || "")}">Edit</button>` : ``}
              </td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;

    listBox.querySelectorAll("button[data-gb-edit]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
  const bill_id = btn.getAttribute("data-gb-edit");
  if (!bill_id) return;

  const full = await api({ action: "getGSTBillFull", bill_id });
  if (full && full.error) return alert(String(full.error));

  const h = full.bill || full.header || {};
editingBillId = bill_id;

// ✅ store existing file separately (keep old if no new upload)
existingFile = {
  file_id: String(h.file_id || ""),
  file_url: String(h.file_url || ""),
  ocr_text: String(h.ocr_text || "")
};

// ✅ reset lastUpload for this edit (so Detect requires a new upload)
lastUpload = null;


  document.getElementById("gb_bill_no").value = h.bill_no || "";
  document.getElementById("gb_bill_date").value = String(h.bill_date || "");
  document.getElementById("gb_vendor").value = h.vendor || "";
  document.getElementById("gb_total_amount").value = String(h.total_amount ?? "0");
  document.getElementById("gb_gst_type").value = String(h.gst_type || "CGST_SGST").toUpperCase();
  document.getElementById("gb_gst_amount").value = String(h.gst_amount ?? "0");
  document.getElementById("gb_cgst").value = String(h.cgst ?? "0");
  document.getElementById("gb_sgst").value = String(h.sgst ?? "0");
  document.getElementById("gb_igst").value = String(h.igst ?? "0");
  refreshGSTSplitUI();

  // ✅ keep old file if user doesn't upload new
  // ✅ show existing file + OCR text (do not treat as new upload)
const up = document.getElementById("gb_upload_status");
if (up) up.textContent = existingFile.file_url ? `Existing file: ${existingFile.file_url}` : "No file";

const pre = document.getElementById("gb_ocr_text");
if (pre) pre.textContent = String(existingFile.ocr_text || "");


/*  const up = document.getElementById("gb_upload_status");
  if (up) up.textContent = lastUpload.file_url ? `Existing file: ${lastUpload.file_url}` : "No file";

  const pre = document.getElementById("gb_ocr_text");
  if (pre) pre.textContent = String(h.ocr_text || "");
*/
  // ✅ load saved line items
  try { lineItems = JSON.parse(h.line_items_json || "[]") || []; }
  catch(e){ lineItems = []; }
  renderLineItems();

  const st = document.getElementById("gb_status");
  if (st) st.textContent = `Editing: ${bill_id}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
});


    });
  }

  // ---- UI
  content.innerHTML = `
    <div class="card">
      <h2>GST Bills</h2>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Create / Update</h3>

        <label>Bill No</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="gb_bill_no" placeholder="e.g. INV-123">
          <button class="userToggleBtn" id="gb_detect_billno">Detect</button>
        </div>

        <label style="margin-top:10px;">Bill Date</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="gb_bill_date" type="date">
          <button class="userToggleBtn" id="gb_detect_date">Detect</button>
        </div>

        <label style="margin-top:10px;">Vendor</label>
<div style="display:flex;gap:8px;align-items:center;">
  <input id="gb_vendor" placeholder="Vendor name">
  <button class="userToggleBtn" id="gb_detect_vendor">Detect</button>
</div>


        <label style="margin-top:10px;">Total Amount (₹)</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="gb_total_amount" type="number" inputmode="decimal" value="0">
          <button class="userToggleBtn" id="gb_detect_total">Detect</button>
        </div>

      <label style="margin-top:10px;">GST Type</label>
<div style="display:flex;gap:8px;align-items:center;">
  <select id="gb_gst_type" style="flex:1;">
    <option value="CGST_SGST">CGST + SGST</option>
    <option value="IGST">IGST</option>
    <option value="NONE">No GST</option>
  </select>
  <button class="userToggleBtn" id="gb_detect_gst_type">Detect</button>
</div>


        <div id="gb_gst_amount_row" style="margin-top:10px;">
          <label>GST Amount (₹)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="gb_gst_amount" type="number" inputmode="decimal" value="0">
            <button class="userToggleBtn" id="gb_detect_gst">Detect</button>
          </div>
        </div>
<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;">
  <b>GST Split</b>
  <button class="userToggleBtn" id="gb_detect_gst_split">Detect</button>
</div>


       <div id="gb_split_row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
  <div style="flex:1;min-width:120px;">
    <label>CGST</label>
    <div style="display:flex;gap:6px;">
      <input id="gb_cgst" type="number" inputmode="decimal" value="0">
      <button class="userToggleBtn" id="gb_detect_cgst">Detect</button>
    </div>
  </div>
  <div style="flex:1;min-width:120px;">
    <label>SGST</label>
    <div style="display:flex;gap:6px;">
      <input id="gb_sgst" type="number" inputmode="decimal" value="0">
      <button class="userToggleBtn" id="gb_detect_sgst">Detect</button>
    </div>
  </div>
  <div style="flex:1;min-width:120px;">
    <label>IGST</label>
    <div style="display:flex;gap:6px;">
      <input id="gb_igst" type="number" inputmode="decimal" value="0">
      <button class="userToggleBtn" id="gb_detect_igst">Detect</button>
    </div>
  </div>
</div>


        <div class="card" style="margin-top:12px;">
          <b>Upload Bill File/Photo</b>
          <input id="gb_file" type="file" accept="image/*,application/pdf" style="margin-top:8px;">
          <p class="dashSmall" id="gb_upload_status" style="margin-top:8px;color:#777;"></p>

          <details style="margin-top:10px;">
            <summary class="dashSmall">Show OCR Text</summary>
            <pre id="gb_ocr_text" style="white-space:pre-wrap;font-size:12px;background:#f7f7f7;padding:10px;border-radius:10px;"></pre>
          </details>
        </div>

        <div class="card" style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <b>Line Items (optional)</b>
            ${canEdit ? `<button class="userToggleBtn" id="gb_add_lineitem">➕ Add line item</button>` : ``}
          </div>
          <div id="gb_line_items_box" style="margin-top:10px;"></div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          ${canEdit ? `<button class="primary" id="gb_save">💾 Save</button>` : ``}
          ${canEdit ? `<button class="primary" id="gb_reset" style="background:#111;">Reset</button>` : ``}
        </div>

        <p class="dashSmall" id="gb_status" style="margin-top:10px;color:#777;"></p>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Bills List</h3>
        <div style="margin-top:10px;">
          <button class="primary" id="gb_refresh">Refresh</button>
        </div>
        <div id="gb_list" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  // ---- bind
  document.getElementById("gb_gst_type")?.addEventListener("change", refreshGSTSplitUI);

  document.getElementById("gb_add_lineitem")?.addEventListener("click", ()=>{
    lineItems.push({ name: "", amount: 0 });
    renderLineItems();
  });

  document.getElementById("gb_file")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;

    const st = document.getElementById("gb_upload_status");
    if (st) st.textContent = "Uploading + OCR…";

    try {
      const up = await readFileAsBase64(f);
      const r = await api({
  action: "uploadGSTBillFile",
  filename: up.filename,
  mimeType: up.mimeType,
  base64: up.base64,
  bill_date: String(document.getElementById("gb_bill_date")?.value || "").trim()
});

      if (r && r.error) return alert(String(r.error));

      lastUpload = r;
      if (st) st.textContent = `Uploaded: ${r.file_url || ""} (OCR: ${r.ocr_ok ? "OK" : "Not available"})`;

      const pre = document.getElementById("gb_ocr_text");
      if (pre) pre.textContent = String(r.ocr_text || "");
if (!String(r.ocr_text || "").trim()) {
  const msg = r.ocr_error ? `OCR failed: ${r.ocr_error}` : "OCR text is empty (not detected). Try a clearer photo or PDF.";
  if (pre) pre.textContent = msg;
}

      // OPTIONAL: lightly prefill (do not force; Detect buttons are the “final”)
      // You can comment these 2 lines if you want zero autofill:
      if (r.parsed?.bill_no) document.getElementById("gb_bill_no").value = r.parsed.bill_no;
      if (r.parsed?.total_amount !== "" && r.parsed?.total_amount != null) document.getElementById("gb_total_amount").value = String(r.parsed.total_amount);

    } catch (err){
      if (st) st.textContent = "";
      alert("Upload failed");
    }
  });

  // Detect buttons (Option 3)
// Detect buttons (Option 3)
document.getElementById("gb_detect_billno")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "bill_no");
});

document.getElementById("gb_detect_date")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "bill_date");
});

document.getElementById("gb_detect_vendor")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "vendor");
});

document.getElementById("gb_detect_total")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "total");
});

document.getElementById("gb_detect_gst_type")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "gst_type");
});

document.getElementById("gb_detect_gst")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "gst");
});

// Split detect (fills cgst/sgst/igst)
document.getElementById("gb_detect_gst_split")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");

  // Preferred: use parsed split numbers directly
  const p = lastUpload.parsed || {};
  const hasSplit = (p.cgst != null && p.cgst !== "") || (p.sgst != null && p.sgst !== "") || (p.igst != null && p.igst !== "");

  if (hasSplit) {
    // IMPORTANT: make sure your applyParsedToFields supports either "split" OR "gst_split"
    applyParsedToFields(p, "split");
    return;
  }

  // Fallback: split gst_amount/2 only if no cgst/sgst/igst available
  const gst = Number(p.gst_amount || 0);
  if (gst > 0) {
    const half = Math.round((gst / 2) * 100) / 100;
    document.getElementById("gb_cgst").value = String(half);
    document.getElementById("gb_sgst").value = String(half);
    document.getElementById("gb_igst").value = "0";
  }
});

// Optional: individual buttons just call split detect
document.getElementById("gb_detect_cgst")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "split");
});
document.getElementById("gb_detect_sgst")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "split");
});
document.getElementById("gb_detect_igst")?.addEventListener("click", ()=>{
  if (!lastUpload?.parsed) return alert("Upload bill first.");
  applyParsedToFields(lastUpload.parsed, "split");
});





  // Save
  document.getElementById("gb_save")?.addEventListener("click", async ()=>{
    if (!canEdit) return;

    const btn = document.getElementById("gb_save");
    const unlock = lockButton(btn, "Saving…");

    try {
      const payload = {
        bill_id: editingBillId,
        bill_no: String(document.getElementById("gb_bill_no")?.value || "").trim(),
        bill_date: String(document.getElementById("gb_bill_date")?.value || "").trim(),
        vendor: String(document.getElementById("gb_vendor")?.value || "").trim(),
        total_amount: num0(document.getElementById("gb_total_amount")?.value),
        gst_type: String(document.getElementById("gb_gst_type")?.value || "CGST_SGST").toUpperCase(),
        gst_amount: num0(document.getElementById("gb_gst_amount")?.value),
        cgst: num0(document.getElementById("gb_cgst")?.value),
        sgst: num0(document.getElementById("gb_sgst")?.value),
        igst: num0(document.getElementById("gb_igst")?.value),
        file_id: String((lastUpload?.file_id || existingFile.file_id || "")),
file_url: String((lastUpload?.file_url || existingFile.file_url || "")),
ocr_text: String((lastUpload?.ocr_text || existingFile.ocr_text || "")),

        line_items_json: jstr(lineItems.filter(x => String(x.name||"").trim() || num0(x.amount) > 0))
      };

      // allow very flexible saving like backend: at least bill_no OR vendor OR file
      if (!payload.bill_no && !payload.vendor && !payload.file_id) {
        return alert("Add at least Bill No OR Vendor OR Upload file.");
      }

      const r = editingBillId
        ? await api({ action: "updateGSTBill", ...payload })
        : await api({ action: "addGSTBill", ...payload });

      if (r && r.error) return alert(String(r.error));

      alert(editingBillId ? "Updated" : "Saved");
      // reset for next entry
      editingBillId = "";
      lastUpload = null;
      existingFile = { file_id:"", file_url:"", ocr_text:"" };
const fi = document.getElementById("gb_file");
if (fi) fi.value = "";

      lineItems = [];
      document.getElementById("gb_status").textContent = "";
      document.getElementById("gb_upload_status").textContent = "";
      document.getElementById("gb_ocr_text").textContent = "";
      document.getElementById("gb_bill_no").value = "";
      document.getElementById("gb_bill_date").value = "";
      document.getElementById("gb_vendor").value = "";
      document.getElementById("gb_total_amount").value = "0";
      document.getElementById("gb_gst_type").value = "CGST_SGST";
      document.getElementById("gb_gst_amount").value = "0";
      document.getElementById("gb_cgst").value = "0";
      document.getElementById("gb_sgst").value = "0";
      document.getElementById("gb_igst").value = "0";
      renderLineItems();
      refreshGSTSplitUI();
      refreshList();

    } finally {
      setTimeout(unlock, 350);
    }
  });

  document.getElementById("gb_reset")?.addEventListener("click", ()=>{
    editingBillId = "";
    lastUpload = null;
    existingFile = { file_id:"", file_url:"", ocr_text:"" };
const fi = document.getElementById("gb_file");
if (fi) fi.value = "";

    lineItems = [];
    document.getElementById("gb_status").textContent = "";
    document.getElementById("gb_upload_status").textContent = "";
    document.getElementById("gb_ocr_text").textContent = "";
    document.getElementById("gb_bill_no").value = "";
    document.getElementById("gb_bill_date").value = "";
    document.getElementById("gb_vendor").value = "";
    document.getElementById("gb_total_amount").value = "0";
    document.getElementById("gb_gst_type").value = "CGST_SGST";
    document.getElementById("gb_gst_amount").value = "0";
    document.getElementById("gb_cgst").value = "0";
    document.getElementById("gb_sgst").value = "0";
    document.getElementById("gb_igst").value = "0";
    renderLineItems();
    refreshGSTSplitUI();
  });

  document.getElementById("gb_refresh")?.addEventListener("click", refreshList);

  // initial
  renderLineItems();
  refreshGSTSplitUI();
  refreshList();

  return;
}



    
    // gst bills section ends here




    


    
/* change my password section Add this inside the loadSection(type) function in accounting.js */

if (type === "myAccount") {
  const userRole = localStorage.getItem("role");
  const userName = localStorage.getItem("username");

  if (!(userRole === "owner" || userRole === "superadmin")) {
    content.innerHTML = `<div class="card"><h2>Access Denied</h2></div>`;
    return;
  }

  content.innerHTML = `
    <div class="card">
      <h2>My Account</h2>
      <p class="dashSmall">Manage your personal security settings.</p>
      
      <div class="card" style="margin-top:15px; background:#f9f9f9;">
        <label>Username</label>
        <input type="text" value="${userName}" disabled style="background:#eee;">
        
        <label style="margin-top:15px;">New Password</label>
        <input id="my_new_pw" type="password" placeholder="Enter new password">
        
        <button class="primary" id="btn_update_my_pw" style="margin-top:20px;">
          🔐 Update My Password
        </button>
      </div>
    </div>
  `;

  document.getElementById("btn_update_my_pw").addEventListener("click", async () => {
    const newPw = document.getElementById("my_new_pw").value.trim();
    if (!newPw) return alert("Please enter a new password");

    const btn = document.getElementById("btn_update_my_pw");
    const unlock = lockButton(btn, "Updating...");

    try {
      const r = await api({
        action: "changeMyPassword",
        new_password: newPw
      });

      if (r && r.ok) {
        alert("Password updated successfully!");
        document.getElementById("my_new_pw").value = "";
      } else {
        alert(r.error || "Failed to update password");
      }
    } finally {
      unlock();
    }
  });
  return;
}



    
    
/* ==========================================================
   📊 GST SETTINGS SECTION
   - Access: Superadmin / Owner
   - Upsert GST rates and set defaults
   ========================================================== */
if (type === "gst") {

  // 🔒 Gate
  if (!(role === "owner" || role === "superadmin")) {
    content.innerHTML = `<div class="card" style="text-align:center; padding:40px;">
      <h2 style="color:#d93025;">🚫 Access Denied</h2>
      <p class="dashSmall">Only Owner / Superadmin can access GST Settings.</p>
    </div>`;
    return;
  }

  content.innerHTML = `<div class="card"><h2>GST Settings</h2><p>Loading...</p></div>`;

  // Fetch current GST settings
  const gstRes = await api({ action: "listGST" });
  const gstList = Array.isArray(gstRes) ? gstRes : (Array.isArray(gstRes?.rows) ? gstRes.rows : []);

  // small helper
  const safe = (x) => escapeHtml(String(x ?? ""));

  content.innerHTML = `
    <div class="card">
      <h2>GST Master</h2>

      <div class="card" style="background:#f9f9f9;border:1px solid #ddd;margin-top:12px;">
        <h3 style="margin-top:0;">Add / Update GST Rate</h3>

        <label>GST Type</label>
        <select id="gst_type">
          <option value="CGST_SGST">CGST + SGST (Local)</option>
          <option value="IGST">IGST (Inter-state)</option>
          <option value="NONE">None (Exempt)</option>
        </select>

        <div style="display:flex;gap:10px;margin-top:10px;">
          <div style="flex:1;">
            <label>CGST %</label>
            <input id="gst_cgst" type="number" step="0.01" inputmode="decimal" value="9">
          </div>
          <div style="flex:1;">
            <label>SGST %</label>
            <input id="gst_sgst" type="number" step="0.01" inputmode="decimal" value="9">
          </div>
        </div>

        <label style="margin-top:10px;">IGST %</label>
        <input id="gst_igst" type="number" step="0.01" inputmode="decimal" value="0">

        <div style="margin-top:15px;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="gst_default" style="width:20px;height:20px;">
          <label for="gst_default" style="margin:0;">Set as Default for New Invoices</label>
        </div>

        <label style="margin-top:10px;">Status</label>
        <select id="gst_status">
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>

        <button class="primary" id="btn_save_gst" style="margin-top:16px;">💾 Save GST Rate</button>

        <p class="dashSmall" style="margin-top:10px;color:#777;">
          Tip: If GST Type is <b>IGST</b>, CGST/SGST can be 0. If Type is <b>NONE</b>, all rates should be 0.
        </p>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Existing Rates</h3>

        <div id="gst_list_container">
          ${gstList.length === 0 ? `<p class="dashSmall">No rates defined yet.</p>` : `
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="text-align:left;font-size:12px;color:#666;">
                  <th>TYPE</th>
                  <th>RATES</th>
                  <th>DEFAULT</th>
                  <th>STATUS</th>
                  <th align="right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                ${gstList.map(g => {
                  const rates = (String(g.gst_type||"") === "IGST")
                    ? `IGST: ${Number(g.igst_rate||0)}%`
                    : (String(g.gst_type||"") === "NONE")
                      ? `GST Exempt`
                      : `CGST: ${Number(g.cgst_rate||0)}% • SGST: ${Number(g.sgst_rate||0)}%`;

                  const payload = encodeURIComponent(JSON.stringify(g));
                  return `
                    <tr style="border-top:1px solid #eee;">
                      <td style="padding:10px 0;"><b>${safe(g.gst_type)}</b></td>
                      <td>${safe(rates)}</td>
                      <td>${String(g.is_default||"") === "YES" ? "✅" : ""}</td>
                      <td>${safe(g.status || "ACTIVE")}</td>
                      <td align="right">
                        <button class="userToggleBtn" data-gst-edit="1" data-g="${payload}">Edit</button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>
  `;

  // disable fields depending on type
  function applyTypeUI(){
    const t = document.getElementById("gst_type")?.value || "CGST_SGST";
    const cg = document.getElementById("gst_cgst");
    const sg = document.getElementById("gst_sgst");
    const ig = document.getElementById("gst_igst");

    if (!cg || !sg || !ig) return;

    if (t === "IGST") {
      cg.value = "0"; sg.value = "0";
      cg.disabled = true; sg.disabled = true;
      ig.disabled = false;
    } else if (t === "NONE") {
      cg.value = "0"; sg.value = "0"; ig.value = "0";
      cg.disabled = true; sg.disabled = true; ig.disabled = true;
    } else {
      cg.disabled = false; sg.disabled = false;
      ig.value = "0";
      ig.disabled = true;
    }
  }

  document.getElementById("gst_type")?.addEventListener("change", applyTypeUI);
  applyTypeUI();

  // Edit button bind (no global function needed)
  document.querySelectorAll("button[data-gst-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      try {
        const g = JSON.parse(decodeURIComponent(btn.getAttribute("data-g") || ""));
        document.getElementById("gst_type").value = g.gst_type || "CGST_SGST";
        document.getElementById("gst_cgst").value = Number(g.cgst_rate || 0);
        document.getElementById("gst_sgst").value = Number(g.sgst_rate || 0);
        document.getElementById("gst_igst").value = Number(g.igst_rate || 0);
        document.getElementById("gst_default").checked = (String(g.is_default) === "YES");
        document.getElementById("gst_status").value = String(g.status || "ACTIVE");
        applyTypeUI();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        alert("Failed to load GST for edit");
      }
    });
  });

  document.getElementById("btn_save_gst")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn_save_gst");
    const unlock = lockButton(btn, "Saving...");

    try {
      const gst_type = document.getElementById("gst_type").value;
      const cgst_rate = Number(document.getElementById("gst_cgst").value || 0);
      const sgst_rate = Number(document.getElementById("gst_sgst").value || 0);
      const igst_rate = Number(document.getElementById("gst_igst").value || 0);

      // basic safety
      if (gst_type === "CGST_SGST" && (cgst_rate <= 0 || sgst_rate <= 0)) {
        return alert("CGST/SGST must be > 0 for CGST_SGST type");
      }
      if (gst_type === "IGST" && igst_rate <= 0) {
        return alert("IGST must be > 0 for IGST type");
      }

      const payload = {
        action: "upsertGST",
        gst_type,
        cgst_rate,
        sgst_rate,
        igst_rate,
        is_default: document.getElementById("gst_default").checked ? "YES" : "NO",
        status: document.getElementById("gst_status").value
      };

      const r = await api(payload);
      if (r && r.error) return alert(r.error);

      alert("GST Rate Saved Successfully");
      loadSection("gst"); // refresh
    } finally {
      unlock();
    }
  });

  return;
}

/* ==========================================================
   ✅ SUPERADMIN REPORTS SECTION
   - Access: STRICTLY Superadmin only
   - Features: Monthly/Yearly GST Summary, PDF Export, WhatsApp
   ========================================================== */
if (type === "reports") {

  // 🔒 Security Gate
  if (role !== "superadmin") {
    content.innerHTML = `<div class="card" style="text-align:center; padding:40px;">
      <h2 style="color:#d93025;">🚫 Access Denied</h2>
    </div>`;
    return;
  }

  // ✅ Wrap whole section to avoid loader falling back to "Section not found"
  try {

    // ---- SAFE FALLBACKS (prevents crash if helpers missing) ----
    const _escapeHtml = (typeof escapeHtml === "function") ? escapeHtml : function (s){
      return String(s ?? "").replace(/[&<>"']/g, m => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
      }[m]));
    };

    const _escapeAttr = (typeof escapeAttr === "function") ? escapeAttr : function (s){
      return _escapeHtml(s).replace(/"/g, "&quot;");
    };

    const _money = (typeof money === "function") ? money : function (n){
      const x = Number(n || 0);
      return isFinite(x) ? x.toFixed(2) : "0.00";
    };

    const _monthKey = (typeof monthKey === "function") ? monthKey : function (m){
      // accepts "Feb-2026" / "February-2026"
      const s = String(m || "").trim();
      const parts = s.split("-");
      if (parts.length !== 2) return 0;

      const mon = parts[0].slice(0,3).toLowerCase();
      const yr = Number(parts[1]) || 0;

      const map = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
      return (yr * 100) + (map[mon] || 0);
    };

    const _prettyMonth = (typeof prettyMonth === "function") ? prettyMonth : function (v){
      // fallback: try to produce "Feb-2026" from ISO date
      const s = String(v || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const y = s.slice(0,4);
        const m = Number(s.slice(5,7));
        const mons = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${mons[(m-1) || 0]}-${y}`;
      }
      return s;
    };

    const _normMonthLabel = (typeof normMonthLabel === "function") ? normMonthLabel : function (s){
      return String(s || "").trim();
    };

    // UI loading
    content.innerHTML = `<div class="card"><h2>Financial Intelligence</h2><p>Loading Data...</p></div>`;

    // Fetch invoices to build month list
    const invRes = await api({ action: "listInvoices", month: "", q: "" });
    const invListAll = Array.isArray(invRes)
      ? invRes
      : Array.isArray(invRes?.rows) ? invRes.rows
      : Array.isArray(invRes?.data) ? invRes.data
      : [];

    // Build month list from invoice_date
    const monthSet = new Set(
      invListAll.map(x => _normMonthLabel(_prettyMonth(x.invoice_date || ""))).filter(Boolean)
    );
    const monthList = [...monthSet].sort((a,b)=>(_monthKey(b)||0)-(_monthKey(a)||0));

    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2];

    // --- RENDER UI ---
    content.innerHTML = `
      <div class="card">
        <h2>Financial Intelligence</h2>

        <div class="card" style="background:#fdf7e3; border:1px solid #f1d3a1; margin-top:12px;">
          <h3>GST & Sales Summary</h3>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
            <div>
              <label>Monthly View</label>
              <select id="rep_month">
                <option value="">-- Choose Month --</option>
                ${monthList.map(m => `<option value="${_escapeAttr(m)}">${_escapeHtml(m)}</option>`).join("")}
              </select>
            </div>

            <div>
              <label>Yearly View</label>
              <select id="rep_year">
                <option value="">-- Choose Year --</option>
                ${years.map(y => `<option value="${y}">${y}</option>`).join("")}
              </select>
            </div>
          </div>

          <button class="primary" id="btn_gen_report">Generate Report</button>

          <div id="tax_rep_result"
               style="margin-top:20px; display:none; background:#fff; padding:15px; border-radius:8px; border:1px solid #eee;">
            <div id="pdf_export_area">
              <h4 id="rep_title"
                  style="margin-top:0; color:#111; border-bottom:2px solid #333; padding-bottom:5px;">Summary</h4>

              <div style="display:flex; justify-content:space-between; padding:5px 0;">
                <span>Active Invoices:</span><b id="rep_count">0</b>
              </div>

              <div style="display:flex; justify-content:space-between; padding:5px 0;">
                <span>Taxable Value:</span><b>₹ <span id="rep_sub">0.00</span></b>
              </div>

              <hr>

              <div style="display:flex; justify-content:space-between; padding:3px 0; color:#555;">
                <span>CGST:</span><span>₹ <span id="rep_cgst">0.00</span></span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:3px 0; color:#555;">
                <span>SGST:</span><span>₹ <span id="rep_sgst">0.00</span></span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:3px 0; color:#555;">
                <span>IGST:</span><span>₹ <span id="rep_igst">0.00</span></span>
              </div>

              <div style="display:flex; justify-content:space-between; font-weight:bold; color:#d93025; padding:5px 0; border-top:1px solid #eee;">
                <span>Total GST:</span><span>₹ <span id="rep_total_gst">0.00</span></span>
              </div>

              <hr>

              <div style="display:flex; justify-content:space-between; font-size:1.2em; font-weight:bold; color:#188038; background:#e6f4ea; padding:8px; border-radius:4px;">
                <span>Grand Total:</span><span>₹ <span id="rep_grand">0.00</span></span>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
              <button class="primary" id="btn_pdf_rep" style="flex:1; background:#111;">🖨 PDF</button>
              <button class="primary" id="btn_wa_rep" style="flex:1; background:#25D366;">📱 WhatsApp</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // --- REPORT GENERATION ---
    document.getElementById("btn_gen_report")?.addEventListener("click", async () => {
      const month = String(document.getElementById("rep_month")?.value || "");
      const year  = String(document.getElementById("rep_year")?.value || "");

      if (month && year) return alert("Please select either a Month OR a Year, not both.");
      if (!month && !year) return alert("Please select a period to generate report.");

      const btn = document.getElementById("btn_gen_report");
      const unlock = lockButton(btn, "Processing...");

      try {
        const r = await api({ action: "getTaxSummaryReport", month, year });
        if (r?.error) return alert(r.error);

        document.getElementById("tax_rep_result").style.display = "block";
        document.getElementById("rep_title").textContent = `Summary: ${r.period}`;
        document.getElementById("rep_count").textContent = r.invoice_count;

        document.getElementById("rep_sub").textContent = _money(r.subtotal);
        document.getElementById("rep_cgst").textContent = _money(r.cgst);
        document.getElementById("rep_sgst").textContent = _money(r.sgst);
        document.getElementById("rep_igst").textContent = _money(r.igst);
        document.getElementById("rep_total_gst").textContent = _money(r.total_tax);
        document.getElementById("rep_grand").textContent = _money(r.grand_total);

        window.latestReport = r;
      } catch (e) {
        console.error("REPORT API ERROR:", e);
        alert("Report generation failed. Check console.");
      } finally {
        unlock?.();
      }
    });

    // --- WHATSAPP SHARING ---
    document.getElementById("btn_wa_rep")?.addEventListener("click", () => {
      const r = window.latestReport;
      if (!r) return alert("Generate a report first.");

      const msg =
        `📊 *Financial Summary: ${r.period}*\n` +
        `Total Invoices: ${r.invoice_count}\n` +
        `Taxable Value: ₹${_money(r.subtotal)}\n` +
        `--------------------------\n` +
        `CGST: ₹${_money(r.cgst)}\n` +
        `SGST: ₹${_money(r.sgst)}\n` +
        `IGST: ₹${_money(r.igst)}\n` +
        `Total GST: ₹${_money(r.total_tax)}\n` +
        `--------------------------\n` +
        `*Grand Total: ₹${_money(r.grand_total)}*`;

      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    });

    // --- PDF PRINT ---
    document.getElementById("btn_pdf_rep")?.addEventListener("click", () => {
      const r = window.latestReport;
      if (!r) return alert("Generate a report first.");

      const company = localStorage.getItem("company") || "Shiv Video Vision";
      const win = window.open("", "_blank");

      win.document.write(
        `<html><head><title>Financial Report</title>
          <style>
            body{font-family:sans-serif;padding:30px;}
            .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;}
          </style>
        </head><body>` +
        `<h2 style="margin-bottom:0;">${_escapeHtml(company)}</h2>` +
        `<p style="margin-top:0; color:#666;">Tax Summary Report</p>` +
        `<h3>Period: ${_escapeHtml(r.period)}</h3>` +
        document.getElementById("pdf_export_area").innerHTML +
        `<div style="margin-top:30px; font-size:12px; color:#999; text-align:center;">
          Generated on ${_escapeHtml(new Date().toLocaleString())}
        </div>` +
        `<script>window.print();</script></body></html>`
      );

      win.document.close();
    });

    return;

  } catch (err) {
    console.error("REPORTS SECTION CRASH:", err);
    content.innerHTML = `
      <div class="card">
        <h2 style="color:#d93025;">Reports crashed</h2>
        <p class="dashSmall">${String(err?.message || err)}</p>
        <p class="dashSmall">Open DevTools Console and look for: <b>REPORTS SECTION CRASH</b></p>
      </div>
    `;
    return;
  }
}



    
/* ==========================================================
   ✅ INVOICE (UPDATED)
   - Create from Order: auto-fill client + venue + dates + planned items
   - Pull FULL client: name, company_name, address, phone1, phone2, gstin
   - Save as INVOICE or QUOTATION (SVV-INV / SVV-QTN)
   - WhatsApp: generates PDF via server + opens wa.me with link
   - Print/PDF: same-window print (iPhone safe)
   - GST: loads defaults from GST sheet
   ========================================================== */
if (type === "invoice") {
  content.innerHTML = `<div class="card"><h2>Invoice</h2><p>Loading…</p></div>`;

  const isSuper = (role === "superadmin");
  const canEdit = (role === "owner" || role === "superadmin");

  // Prefetch
  const [companyRes, clientsRes, ordersRes, invRes, invMasterRes, gstListRes, gstDefRes] = await Promise.all([
    api({ action: "getCompanyProfile" }),
    api({ action: "listClients" }),
    api({ action: "listOrders", month: "" }),
    api({ action: "listInvoices", month: "", q: "" }),
    api({ action: "listInventoryMaster" }),
    api({ action: "listGST" }).catch(() => []),
    api({ action: "getDefaultGST" }).catch(() => null)
  ]);

  const company = (companyRes && !companyRes.error) ? companyRes : {
    company_name: (localStorage.getItem("company") || ""),
    address: "",
    phone: "",
    gstin: "",
    place_of_supply: "",
    terms: ""
  };

  const allClients = Array.isArray(clientsRes) ? clientsRes : [];
  const activeClients = allClients.filter(c => String(c.status || "ACTIVE").toUpperCase() === "ACTIVE");

  const allOrders = Array.isArray(ordersRes) ? ordersRes : [];
  const activeOrders = allOrders.filter(o => String(o.status || "ACTIVE").toUpperCase() === "ACTIVE");

  const invListAll = Array.isArray(invRes) ? invRes : [];
  const invMasterAll = Array.isArray(invMasterRes) ? invMasterRes : [];

  const gstList = Array.isArray(gstListRes) ? gstListRes : [];
  const gstDef = (gstDefRes && !gstDefRes.error) ? gstDefRes : null;

  // months for invoice list
  const monthSet = new Set(invListAll.map(x => normMonthLabel(prettyMonth(x.invoice_date || ""))).filter(Boolean));
  const monthList = Array.from(monthSet).sort((a,b)=>(monthKey(b)||0)-(monthKey(a)||0));

  // UI state
  let editingInvoiceId = "";     // if set -> updateInvoice else addInvoice
  let lastSavedInvoiceId = "";   // for WhatsApp/PDF generation after save
  let lastSavedInvoiceNo = "";
  // ✅ Restore last saved invoice info (if exists)
lastSavedInvoiceId = sessionStorage.getItem("lastSavedInvoiceId") || "";
lastSavedInvoiceNo = sessionStorage.getItem("lastSavedInvoiceNo") || "";

  let currentItems = [];         // [{item_id,item_name,qty,unit,rate,amount}]
  let currentDocType = "INVOICE"; // "INVOICE" or "QUOTATION"
  let currentHeaderCache = null; // last loaded/saved header for print/wa

  function norm(s){ return String(s||"").trim().toLowerCase(); }
  function money(n){ return Number(n||0).toFixed(2); }
  function round2(n){ return Math.round((Number(n||0)+Number.EPSILON)*100)/100; }
// ✅ custom rounding: fraction >= 0.2 rounds up (no decimals)
function roundQtyNoDecimals(n){
  const x = Number(n || 0);
  if (!isFinite(x)) return 0;
  const base = Math.floor(x);
  const frac = x - base;
  return base + (frac >= 0.2 ? 1 : 0);
}

  // helpers starts here
const INVOICE_BG_URL = "https://mojosyscom-lang.github.io/shiv-video-vision-app/assets/print-bg.png";
  // ✅ LED Wall conversion: cabinets -> sq ft
const LED_WALL_SQFT_PER_CABINET = 2.691;

// ✅ Detect which planned item needs conversion
// Option A: by name (recommended for you right now)
function isLedWallLine(name){
  return String(name || "").trim().toLowerCase() === "led wall on rent";
}


// ✅ safe number
function numOr(v, fallback){
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

const BANK_QR_URL = "https://mojosyscom-lang.github.io/shiv-video-vision-app/assets/bank-qr.png"; // ✅ change filename if needed

const BANK_DETAILS = {
  title: "Bank Details",
  bank: "Kotak Mahindra Bank",
  branch: "Vaisnodevi Branch",
  name: "Shiv Video Vision",
  ac: "6053510619",
  ifsc: "KKBK0003083"
};

// ----- led calculation for invoice section starts here
// ===============================
// ✅ LED size -> cabinets -> SQFT (Invoice)
// ===============================
const CABINET_FT = 1.64042;
const CABINETS_PER_PETI = 6;

// same as Orders
function roundCabinets(raw) {
  const base = Math.floor(raw);
  const frac = raw - base;
  return base + (frac >= 0.5 ? 1 : 0);
}

// same as Orders
function calcLedWall(widthFt, heightFt) {
  const Wraw = widthFt / CABINET_FT;
  const Hraw = heightFt / CABINET_FT;
  const W = roundCabinets(Wraw);
  const H = roundCabinets(Hraw);
  const neededCabinets = W * H;

  const petiExact = neededCabinets / CABINETS_PER_PETI;
  const petiBase = Math.ceil(petiExact);
  const frac = petiExact - Math.floor(petiExact);
  const addExtra = (frac === 0) || (frac >= 0.5);
  const petiCarry = petiBase + (addExtra ? 1 : 0);
  const carryCabinets = petiCarry * CABINETS_PER_PETI;

  return { W, H, neededCabinets, petiBase, petiCarry, carryCabinets };
}

function isLedAnyName(name){
  return String(name || "").toLowerCase().includes("led");
}

// supports: 16x10, 16 x 10, 16’ x 10’, 16 * 10, 16ft x 10ft
function parseLedSizeToFeet(raw){
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return null;

  // normalize: replace quotes/feet symbols and separators
  s = s.replace(/[’']/g, "");     // remove apostrophes
  s = s.replace(/ft|feet/g, "");  // remove ft words
  s = s.replace(/×/g, "x");
  s = s.replace(/\*/g, "x");

  // keep only digits, dot, x, space
  s = s.replace(/[^0-9x.\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // now split around x
  const parts = s.split("x").map(p => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;

  return { widthFt: w, heightFt: h };
}

function formatLedSizeLabel(raw){
  const p = parseLedSizeToFeet(raw);
  if (!p) return "";
  return `Size: ${p.widthFt}’ x ${p.heightFt}’`;
}


function ledQtySqftFromSize(raw){
  const p = parseLedSizeToFeet(raw);
  if (!p) return null;

  const r = calcLedWall(p.widthFt, p.heightFt);

  // ✅ use ONLY needed cabinets (no extra peti / no carry cabinets)
  const sqftRaw = (r.neededCabinets * LED_WALL_SQFT_PER_CABINET);

  // ✅ integer qty with your rounding rule
  const sqft = roundQtyNoDecimals(sqftRaw);

  return {
    sqft,
    neededCabinets: r.neededCabinets,
    layoutW: r.W,
    layoutH: r.H
  };
}


  // ----- led calculator for invoice section ends here


  
function parseISODate(d){
  const s = String(d || "").trim();
  if (!s) return null;
  // expects YYYY-MM-DD
  const dt = new Date(s + "T00:00:00");
  return isNaN(dt.getTime()) ? null : dt;
}

function diffDaysInclusive(startISO, endISO){
  const a = parseISODate(startISO);
  const b = parseISODate(endISO);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1; // inclusive
  return days > 0 ? days : 0;
}

// ✅ setup = 0.5 + (start..end full days)
function calcEventDays(setupISO, startISO, endISO){
  const full = diffDaysInclusive(startISO, endISO);
  const half = String(setupISO || "").trim() ? 0.5 : 0;
  const total = half + full;
  return total > 0 ? total : 0;
}

  // helpers ends here

  // Build quick lookup for clients
  const clientById = {};
  activeClients.forEach(c => {
    const id = String(c.client_id || "").trim();
    if (!id) return;
    clientById[id] = c;
  });

  function pickClientFull(client_id){
    const c = clientById[String(client_id||"").trim()];
    if (!c) return {
      client_id: String(client_id||""),
      client_name: "",
      client_company: "",
      phone1: "",
      phone2: "",
      address: "",
      gstin: ""
    };

    return {
      client_id: String(c.client_id||""),
      client_name: String(c.client_name||""),
      client_company: String(c.company_name || c.client_company || ""),
      phone1: String(c.phone1 || c.client_phone || ""),
      phone2: String(c.phone2 || ""),
      address: String(c.address || ""),
      gstin: String(c.gstin || c.gst_number || c.gst || "")
    };
  }

  function selectedClientFromPick(){
    const sel = document.getElementById("inv_client_pick");
    const opt = sel?.selectedOptions?.[0];
    if (!opt) return null;

    const client_id = String(opt.value||"").trim();
    return pickClientFull(client_id);
  }

  function setClientFields(cf){
    document.getElementById("inv_client_id").textContent = cf?.client_id || "";
    document.getElementById("inv_client_name").textContent = cf?.client_name || "";
    document.getElementById("inv_client_company").textContent = cf?.client_company || "";
    document.getElementById("inv_client_phone1").textContent = cf?.phone1 || "";
    document.getElementById("inv_client_phone2").textContent = cf?.phone2 || "";
    document.getElementById("inv_client_address").textContent = cf?.address || "";
    document.getElementById("inv_client_gstin").textContent = cf?.gstin || "";
  }

  function setOrderFields(o){
    document.getElementById("inv_order_id").textContent = o?.order_id || "";
    document.getElementById("inv_venue").value = o?.venue || "";
    document.getElementById("inv_setup").value = prettyISODate(o?.setup_date || "");
    document.getElementById("inv_start").value = prettyISODate(o?.start_date || "");
    document.getElementById("inv_end").value = prettyISODate(o?.end_date || "");
  }

  // Indian number words (simple)
  function amountInWordsIN(num){
    const n = Math.floor(Number(num||0));
    if (!isFinite(n)) return "";
    if (n === 0) return "Zero";

    const a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
      "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
    const b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

    function two(x){
      x = Number(x);
      if (x < 20) return a[x];
      return b[Math.floor(x/10)] + (x%10 ? " " + a[x%10] : "");
    }
    function three(x){
      x = Number(x);
      const h = Math.floor(x/100);
      const r = x%100;
      return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
    }

    let x = n;
    const crore = Math.floor(x / 10000000); x %= 10000000;
    const lakh  = Math.floor(x / 100000);   x %= 100000;
    const thou  = Math.floor(x / 1000);     x %= 1000;
    const hund  = x;

    const parts = [];
    if (crore) parts.push(three(crore) + " Crore");
    if (lakh)  parts.push(three(lakh) + " Lakh");
    if (thou)  parts.push(three(thou) + " Thousand");
    if (hund)  parts.push(three(hund));

    return parts.join(" ").replace(/\s+/g," ").trim();
  }

  function getGSTRowByType(type){
    const t = String(type||"").toUpperCase();
    return gstList.find(x => String(x.gst_type||"").toUpperCase() === t) || null;
  }

  function applyGSTDefaultsToUI(){
    const sel = document.getElementById("inv_gst_type");
    const rateInp = document.getElementById("inv_gst_rate");
    if (!sel || !rateInp) return;

    const gstType = String(sel.value || "CGST_SGST").toUpperCase();

    // Use GST sheet values if present
    const row = getGSTRowByType(gstType);
    if (gstType === "NONE") {
      rateInp.value = 0;
    } else if (row) {
      if (gstType === "IGST") {
        rateInp.value = Number(row.igst_rate || row.igst || 18);
      } else {
        // CGST+SGST => total percent
        const c = Number(row.cgst_rate || row.cgst || 9);
        const s = Number(row.sgst_rate || row.sgst || 9);
        rateInp.value = Number(c + s);
      }
    } else {
      // fallback
      rateInp.value = (gstType === "IGST") ? 18 : 18;
    }
  }

  function recalc(){
    currentItems = currentItems.map(it => {
  const qty = Number(it.qty||0);
  const rate = Number(it.rate||0);
  const days = Number(it.days ?? 1);
  return { ...it, qty, rate, days, amount: round2(qty * rate * days) };
});


    const gstType = String(document.getElementById("inv_gst_type")?.value || "CGST_SGST").toUpperCase();
    const gstRate = Number(document.getElementById("inv_gst_rate")?.value || 0);

    const subtotal = round2(currentItems.reduce((a,it)=>a+Number(it.amount||0),0));

    let cgst=0, sgst=0, igst=0;
    const totalTax = round2(subtotal * gstRate / 100);
    if (gstType === "CGST_SGST"){
      cgst = round2(totalTax / 2);
      sgst = round2(totalTax - cgst);
    } else if (gstType === "IGST"){
      igst = totalTax;
    }

    const grand = round2(subtotal + cgst + sgst + igst);

    const elSub = document.getElementById("inv_subtotal");
    const elCgst = document.getElementById("inv_cgst");
    const elSgst = document.getElementById("inv_sgst");
    const elIgst = document.getElementById("inv_igst");
    const elGrand = document.getElementById("inv_grand");

    if (elSub) elSub.textContent = money(subtotal);
    if (elCgst) elCgst.textContent = money(cgst);
    if (elSgst) elSgst.textContent = money(sgst);
    if (elIgst) elIgst.textContent = money(igst);
    if (elGrand) elGrand.textContent = money(grand);

    // live words update
    const wordsInp = document.getElementById("inv_words");
    if (wordsInp) wordsInp.value = amountInWordsIN(grand) + (grand > 0 ? " Only" : "");

    // show/hide gst rows
    const rowC = document.getElementById("row_cgst");
    const rowS = document.getElementById("row_sgst");
    const rowI = document.getElementById("row_igst");
   if (rowC) rowC.style.display = (gstType==="CGST_SGST") ? "" : "none";
   if (rowS) rowS.style.display = (gstType==="CGST_SGST") ? "" : "none";
   if (rowI) rowI.style.display = (gstType==="IGST") ? "" : "none";
   // NONE => hide all tax rows
   if (gstType === "NONE") {
   if (rowC) rowC.style.display = "none";
   if (rowS) rowS.style.display = "none";
   if (rowI) rowI.style.display = "none";
}

    // update line amounts
    document.querySelectorAll("tr[data-inv-line]").forEach(tr => {
      const idx = Number(tr.getAttribute("data-inv-line")||0);
      const it = currentItems[idx];
      const amt = tr.querySelector("[data-amt]");
      if (amt) amt.textContent = money(it?.amount||0);
    });
  }

  function renderItemsTable(){
    const box = document.getElementById("inv_items_box");
    if (!box) return;

   if (!currentItems.length){
  box.innerHTML = `
    <div style="overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th>Item</th>
          <th>HSN/SAC</th>
          <th>Unit</th>
          <th>Qty</th>
          <th>Days</th>
          <th>Rate (₹)</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </table>
    </div>
    <p class="dashSmall">No items yet. Use ➕ Add Item to insert manually.</p>
  `;
  recalc();
  return;
}


    box.innerHTML = `
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Item</th>
            <th align="right">HSN/SAC</th>
            <th align="right">Unit</th>
            <th align="right">Qty</th>
<th align="right">Days</th>
<th align="right">Rate (₹)</th>
<th align="right">Amount</th>

            <th></th>
          </tr>
          ${currentItems.map((it, idx)=>`
            <tr data-inv-line="${idx}" style="border-top:1px solid #eee;vertical-align:top;">
              <td>
                <b>${escapeHtml(it.item_name||"").replace(/\n/g,"<br>")}</b><br>
                <span class="dashSmall">${escapeHtml(it.item_id||"")} ${it.unit ? "• "+escapeHtml(it.unit) : ""}</span>
              </td>
              <td align="right">${escapeHtml(it.hsn_sac || "")}</td>
              <td align="right">${escapeHtml(it.unit || "")}</td>
              <td align="right">
  <input data-qty="${idx}" type="number" inputmode="numeric" style="width:90px;" value="${escapeAttr(String(it.qty||0))}">
</td>

<td align="right">
  <input data-days="${idx}"
         type="number"
         inputmode="decimal"
         step="0.5"
         min="0"
         style="width:80px;"
         value="${escapeAttr(String(it.days ?? 1))}">
</td>

<td align="right">
  <input data-rate="${idx}" type="number" inputmode="numeric" style="width:110px;" value="${escapeAttr(String(it.rate||0))}">
</td>

              <td align="right"><span data-amt>${money(it.amount||0)}</span></td>
              <td align="right">
                ${canEdit ? `<button class="userToggleBtn" data-del="${idx}">✖</button>` : ``}
              </td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;

    box.querySelectorAll("input[data-qty]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i = Number(inp.getAttribute("data-qty"));
        currentItems[i].qty = Number(inp.value||0);
        recalc();
      });
    });

    box.querySelectorAll("input[data-days]").forEach(inp=>{
  inp.addEventListener("input", ()=>{
    const i = Number(inp.getAttribute("data-days"));
    currentItems[i].days = Number(inp.value || 0);
    currentItems[i].manual_days = true; // ✅ user edited
    recalc();
  });
});

    box.querySelectorAll("input[data-rate]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i = Number(inp.getAttribute("data-rate"));
        currentItems[i].rate = Number(inp.value||0);
        recalc();
      });
    });

    box.querySelectorAll("button[data-del]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const i = Number(btn.getAttribute("data-del"));
        currentItems.splice(i,1);
        renderItemsTable();
      });
    });

    recalc();
  }

  async function loadPlannedItemsFromOrder(order_id){
    const itemsRes = await api({ action: "listOrderItems", order_id: String(order_id) });
    const planned = Array.isArray(itemsRes) ? itemsRes : [];

    const unitMap = {};
    invMasterAll.forEach(x=>{
      const id = String(x.item_id||"").trim();
      if (id) unitMap[id] = String(x.unit||"").trim();
    });

    const hsnMap = {};
    invMasterAll.forEach(x=>{
      const id = String(x.item_id||"").trim();
      if (id) hsnMap[id] = String(x.hsn_sac||x.hsnSac||"").trim();
    });


    const dSetup = document.getElementById("inv_setup")?.value || "";
const dStart = document.getElementById("inv_start")?.value || "";
const dEnd   = document.getElementById("inv_end")?.value || "";
const defDays = calcEventDays(dSetup, dStart, dEnd) || 1;

currentItems = planned
  .filter(p => String(p.status||"ACTIVE").toUpperCase() === "ACTIVE")
  .map(p => {
    const item_id = String(p.item_id||"");
    const item_name = String(p.item_name||p.item_id||"");

    let qty = Number(p.planned_qty||0);
    let unit = unitMap[item_id] || "";
    let hsn_sac = hsnMap[item_id] || "";

    // ✅ Convert LED Wall cabinets -> sq ft
    if (isLedWallLine(item_name)) {
      qty = Math.round((qty * LED_WALL_SQFT_PER_CABINET) * 100) / 100; // 2 decimals
      unit = unit || "sq ft"; // force unit for clarity
    }

    return {
      item_id,
      item_name,
      qty,
      unit,
      hsn_sac,
      days: defDays,
      manual_days: false,
      rate: 0,
      amount: 0
    };
  });



    renderItemsTable();
  }

  function setDocTypeUI(t){
    currentDocType = String(t||"INVOICE").toUpperCase();
    const label = document.getElementById("inv_doc_label");
    if (label) label.textContent = (currentDocType === "QUOTATION") ? "Quotation" : "Invoice";
  }
  
  function applyDocTypeRules(){
  const gstCard = document.getElementById("gst_card");
  const gstTypeSel = document.getElementById("inv_gst_type");
  const gstRateInp = document.getElementById("inv_gst_rate");

  if (currentDocType === "QUOTATION") {
    if (gstCard) gstCard.style.display = "none";
    if (gstTypeSel) gstTypeSel.value = "NONE";
    if (gstRateInp) gstRateInp.value = 0;
  } else {
    if (gstCard) gstCard.style.display = "";
    // restore default GST when back to invoice
    applyGSTDefaultsToUI();
  }
  recalc();
}


  // --- UI
  const defaultGSTType = (gstDef && gstDef.gst_type) ? String(gstDef.gst_type).toUpperCase() : "CGST_SGST";
  const defaultRate = (() => {
    if (!gstDef) return 18;
    const t = String(gstDef.gst_type||"").toUpperCase();
    if (t === "NONE") return 0;
    if (t === "IGST") return Number(gstDef.igst_rate || 18);
    const c = Number(gstDef.cgst_rate || 9);
    const s = Number(gstDef.sgst_rate || 9);
    return Number(c + s);
  })();

  content.innerHTML = `
    <div class="card">
      <h2><span id="inv_doc_label">Invoice</span></h2>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Create</h3>

        <div class="dashSmall">
          <b>${escapeHtml(company.company_name || "")}</b><br>
          ${escapeHtml(company.address || "")}<br>
          ${company.phone ? ("Phone: " + escapeHtml(company.phone) + "<br>") : ""}
          ${company.gstin ? ("GSTIN: " + escapeHtml(company.gstin)) : ""}
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button class="primary" id="btn_doc_invoice">Invoice</button>
          <button class="primary" id="btn_doc_quote" style="background:#111;">Quotation</button>
        </div>

        <label style="margin-top:12px;">Date</label>
        <input id="inv_date" type="date" value="${todayISO()}">

        <label style="margin-top:10px;">Order Link</label>
        <select id="inv_order_pick">
          <option value="">-- Select Order --</option>
          ${activeOrders.map(o=>{
            const label = `${o.order_id} • ${o.client_name} • ${prettyISODate(o.start_date)}→${prettyISODate(o.end_date)}`;
            return `<option value="${escapeAttr(String(o.order_id||""))}"
              data-client_id="${escapeAttr(String(o.client_id||""))}"
              data-venue="${escapeAttr(String(o.venue||""))}"
              data-setup="${escapeAttr(String(prettyISODate(o.setup_date||"")))}"
              data-start="${escapeAttr(String(prettyISODate(o.start_date||"")))}"
              data-end="${escapeAttr(String(prettyISODate(o.end_date||"")))}"
            >${escapeHtml(label)}</option>`;
          }).join("")}
        </select>

        <label style="margin-top:10px;">Client</label>
        <select id="inv_client_pick">
          <option value="">-- Select client --</option>
          ${activeClients.map(c=>`
            <option value="${escapeAttr(String(c.client_id||""))}">
              ${escapeHtml(c.client_name||"")} • ${escapeHtml(String(c.phone1||c.client_phone||""))}
            </option>
          `).join("")}
        </select>

        <div class="card" style="margin-top:12px;">
          <div class="dashSmall"><b>Client Details</b></div>
          <div class="dashSmall">ID: <span id="inv_client_id"></span></div>
          <div class="dashSmall">Name: <span id="inv_client_name"></span></div>
          <div class="dashSmall">Company: <span id="inv_client_company"></span></div>
          <div class="dashSmall">Phone1: <span id="inv_client_phone1"></span></div>
          <div class="dashSmall">Phone2: <span id="inv_client_phone2"></span></div>
          <div class="dashSmall">GSTIN: <span id="inv_client_gstin"></span></div>
          <div class="dashSmall">Address: <span id="inv_client_address"></span></div>
        </div>

        <div class="card" style="margin-top:12px;">
          <div class="dashSmall"><b>Order Details</b></div>
          <div class="dashSmall">Order: <span id="inv_order_id"></span></div>

          <label style="margin-top:8px;">Venue</label>
          <input id="inv_venue" placeholder="Venue">

          <label style="margin-top:8px;">Setup Date</label>
          <input id="inv_setup" type="date">

          <label style="margin-top:8px;">Start Date</label>
          <input id="inv_start" type="date">

          <label style="margin-top:8px;">End Date</label>
          <input id="inv_end" type="date">
        </div>

        <div class="card" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
  <b>Line Items</b>
  ${
    canEdit
      ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="userToggleBtn" id="btn_inv_add_row">➕ Add Item</button>
          <button class="userToggleBtn" id="btn_inv_add_line">➕ Add Line</button>
        </div>
      `
      : ``
  }
</div>


          <div id="inv_items_box" style="margin-top:10px;"></div>

          <div id="inv_add_row_box" style="display:none;margin-top:12px;">
            <label>Select Inventory Item</label>
            <select id="inv_item_pick">
              <option value="">-- Select --</option>
              ${invMasterAll.map(it=>`
                <option value="${escapeAttr(String(it.item_id||""))}"
                  data-name="${escapeAttr(String(it.item_name||""))}"
                  data-unit="${escapeAttr(String(it.unit||""))}"
                  data-hsn="${escapeAttr(String(it.hsn_sac || it.hsnSac || ""))}">
                  ${escapeHtml(it.item_name||"")} • ${escapeHtml(String(it.item_id||""))}
                </option>
              `).join("")}
            </select>

            <div id="inv_led_size_row" style="display:none;margin-top:10px;">
  <label>LED Size (optional)</label>
  <input id="inv_led_size" placeholder="e.g. 16 x 10 or 16x10 or 10*5 etc ">
  <p class="dashSmall" id="inv_led_hint_pick" style="margin-top:6px;color:#777;"></p>

</div>


            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
              <div style="flex:1;min-width:120px;">
                <label>Qty</label>
                <input id="inv_new_qty" type="number" inputmode="numeric" value="1">
              </div>
              <div style="flex:1;min-width:120px;">
                <label>Rate (₹)</label>
                <input id="inv_new_rate" type="number" inputmode="numeric" value="0">
              </div>
            </div>

            <button class="primary" id="btn_inv_add_confirm" style="margin-top:10px;">Add</button>
          </div>
          
<div id="inv_add_line_box" style="display:none;margin-top:12px;">
  <label>Manual Line (Type anything)</label>

  <label style="margin-top:8px;">Item Name *</label>
  <input id="inv_line_name" placeholder="e.g. Transport / Labour / Installation">

 <div id="inv_line_led_size_row" style="display:none;margin-top:10px;">
  <label>LED Size (optional)</label>
  <input id="inv_line_led_size" placeholder="e.g. 16 x 10 or 16x10 or 10*5 etc ">
  <p class="dashSmall" id="inv_line_led_hint" style="margin-top:6px;color:#777;"></p>
</div>

  <!-- ✅ Only Name / Note line toggle -->
 <label style="margin-top:10px;display:flex;align-items:center;justify-content:flex-start;gap:8px;width:fit-content;">
    <input id="inv_line_onlyname" type="checkbox">
    Only Name (Note line)
  </label>

  <!-- ✅ Optional fields wrapper (we will hide/show this) -->
  <div id="inv_line_optional_fields">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
      <div style="flex:1;min-width:120px;">
        <label>Qty</label>
        <input id="inv_line_qty" type="number" inputmode="decimal" value="1">
      </div>
      <div style="flex:1;min-width:120px;">
        <label>Unit</label>
        <input id="inv_line_unit" placeholder="e.g. trip / day / sq ft">
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
      <div style="flex:1;min-width:140px;">
        <label>HSN/SAC</label>
        <input id="inv_line_hsn" placeholder="optional">
      </div>
      <div style="flex:1;min-width:120px;">
        <label>Rate (₹)</label>
        <input id="inv_line_rate" type="number" inputmode="decimal" value="0">
      </div>
    </div>
  </div>

  <button class="primary" id="btn_inv_line_confirm" style="margin-top:10px;">Add Line</button>

  <p class="dashSmall" style="margin-top:8px;">
    Tip: Tick <b>Only Name</b> for Transport / Notes so users don’t fill numbers.
  </p>
</div>



</div>




          
        

        <div class="card" id="gst_card"  style="margin-top:12px;">
          <b>GST</b>

          <label style="margin-top:8px;">GST Type</label>
          <select id="inv_gst_type">
            <option value="CGST_SGST">CGST + SGST</option>
            <option value="IGST">IGST</option>
            <option value="NONE">No GST</option>
          </select>

          <label style="margin-top:8px;">GST Rate (%)</label>
          <input id="inv_gst_rate" type="number" inputmode="numeric" value="${escapeAttr(String(defaultRate))}">

          <div style="margin-top:12px;">
            <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><b>₹ <span id="inv_subtotal">0.00</span></b></div>
            <div id="row_cgst" style="display:flex;justify-content:space-between;"><span>CGST</span><b>₹ <span id="inv_cgst">0.00</span></b></div>
            <div id="row_sgst" style="display:flex;justify-content:space-between;"><span>SGST</span><b>₹ <span id="inv_sgst">0.00</span></b></div>
            <div id="row_igst" style="display:none;justify-content:space-between;"><span>IGST</span><b>₹ <span id="inv_igst">0.00</span></b></div>
            <hr>
            <div style="display:flex;justify-content:space-between;"><span><b>Grand Total</b></span><b>₹ <span id="inv_grand">0.00</span></b></div>
          </div>

          <label style="margin-top:10px;">Amount in words</label>
          <input id="inv_words" placeholder="Auto" readonly>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          ${canEdit ? `<button class="primary" id="btn_inv_save">💾 Save</button>` : ``}
          ${isSuper ? `<button class="primary" id="btn_inv_export_csv" style="background:#1fa971;">Export CSV (List)</button>` : ``}
        </div>

        <p class="dashSmall" id="inv_status" style="margin-top:10px;color:#777;"></p>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Invoices List</h3>

        <label>Month</label>
        <select id="inv_month">
          <option value="">All</option>
          ${monthList.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
        </select>

        <label style="margin-top:10px;">Search (invoice no / client / phone / venue / order)</label>
        <input id="inv_search" placeholder="Type to search...">

        <div style="margin-top:12px;">
          <button class="primary" id="btn_inv_refresh">Refresh List</button>
        </div>

        <p id="inv_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
        <div id="inv_list" style="margin-top:12px;"></div>
      </div>

      
    </div>
  `;


  // ===============================
// ✅ LED Size UI live behavior (Invoice)
// ===============================
(function initInvoiceLedSizeUI(){
  const nameInp = document.getElementById("inv_line_name");
  const sizeRowLine = document.getElementById("inv_line_led_size_row");
  const sizeInpLine = document.getElementById("inv_line_led_size");
  const hintLine = document.getElementById("inv_line_led_hint");
  const qtyInpLine = document.getElementById("inv_line_qty");
  const unitInpLine = document.getElementById("inv_line_unit");

  // Add Item box
  const itemPick = document.getElementById("inv_item_pick");
  const sizeRowPick = document.getElementById("inv_led_size_row");
  const sizeInpPick = document.getElementById("inv_led_size");
 const hintPick = document.getElementById("inv_led_hint_pick");
  const qtyInpPick = document.getElementById("inv_new_qty");
  const unitPick = () => (itemPick?.selectedOptions?.[0]?.getAttribute("data-unit") || "");

  function updateLineUI(){
    if (!nameInp || !sizeRowLine) return;
    const isLed = isLedAnyName(nameInp.value);
    sizeRowLine.style.display = isLed ? "block" : "none";
    if (!isLed && sizeInpLine) sizeInpLine.value = "";
    if (hintLine) hintLine.textContent = "";
  }

  function computeLineQty(){
    if (!sizeInpLine || !qtyInpLine) return;
    const r = ledQtySqftFromSize(sizeInpLine.value);
    if (!r) {
      if (hintLine) hintLine.textContent = "";
      return;
    }
    qtyInpLine.value = String(r.sqft);
    if (unitInpLine && !unitInpLine.value.trim()) unitInpLine.value = "sq ft";
    if (hintLine) hintLine.textContent = `Auto: ${r.neededCabinets} cabinets → ${r.sqft} sq ft`;

  }

  function updatePickUI(){
    if (!itemPick || !sizeRowPick) return;
    const opt = itemPick.selectedOptions?.[0];
    const nm = opt?.getAttribute("data-name") || "";
    const isLed = isLedAnyName(nm);
    sizeRowPick.style.display = isLed ? "block" : "none";
    if (!isLed && sizeInpPick) sizeInpPick.value = "";
    if (hintPick) hintPick.textContent = "";
  }

  function computePickQty(){
    if (!sizeInpPick || !qtyInpPick) return;
    const r = ledQtySqftFromSize(sizeInpPick.value);
    if (!r) {
      if (hintPick) hintPick.textContent = "";
      return;
    }
    qtyInpPick.value = String(r.sqft);
    // for Add Item we don't have unit input in box; we will set unit when pushing line
    if (hintPick) hintPick.textContent = `Auto: ${r.neededCabinets} cabinets → ${r.sqft} sq ft`;
  }

  nameInp?.addEventListener("input", () => {
    updateLineUI();
    // if LED and size already filled, recompute
    if (sizeInpLine?.value) computeLineQty();
  });
  sizeInpLine?.addEventListener("input", computeLineQty);

  itemPick?.addEventListener("change", () => {
    updatePickUI();
    // if LED and size already filled, recompute
    if (sizeInpPick?.value) computePickQty();
  });
  sizeInpPick?.addEventListener("input", computePickQty);

  updateLineUI();
  updatePickUI();
})();

  // init doc type + gst defaults
  setDocTypeUI("INVOICE");
  const gstTypeSel = document.getElementById("inv_gst_type");
  if (gstTypeSel) gstTypeSel.value = defaultGSTType;
  applyGSTDefaultsToUI();

  document.getElementById("btn_doc_invoice")?.addEventListener("click", ()=>{
    setDocTypeUI("INVOICE");
    applyDocTypeRules();
    document.getElementById("inv_status").textContent = "";
  });
  
  document.getElementById("btn_doc_quote")?.addEventListener("click", ()=>{
    setDocTypeUI("QUOTATION");
    applyDocTypeRules();
    document.getElementById("inv_status").textContent = "";
  });

  // client change
  document.getElementById("inv_client_pick")?.addEventListener("change", ()=>{
    const c = selectedClientFromPick();
    if (c) setClientFields(c);
  });

  // order link change => load client fully + order fields + planned items
  document.getElementById("inv_order_pick")?.addEventListener("change", async (e)=>{
    const sel = e.target;
    const opt = sel?.selectedOptions?.[0];
    if (!opt) return;

    const order_id = String(opt.value||"").trim();
    document.getElementById("inv_order_id").textContent = order_id;

    const client_id = opt.getAttribute("data-client_id") || "";

    // set client dropdown to this client
    const clientPick = document.getElementById("inv_client_pick");
    if (clientPick && client_id) clientPick.value = client_id;

    // ✅ FULL client autofill instantly
    const cf = pickClientFull(client_id);
    setClientFields(cf);

    setOrderFields({
      order_id,
      venue: opt.getAttribute("data-venue") || "",
      setup_date: opt.getAttribute("data-setup") || "",
      start_date: opt.getAttribute("data-start") || "",
      end_date: opt.getAttribute("data-end") || ""
    });

    if (order_id) await loadPlannedItemsFromOrder(order_id);


// apply default days (not manual)
/* if errors in items check here culprit


currentItems = currentItems.map(p => ({
  item_id: String(p.item_id||""),
  item_name: String(p.item_name||p.item_id||""),
  qty: Number(p.planned_qty||0),
  unit: unitMap[String(p.item_id||"")] || "",
  hsn_sac: hsnMap[String(p.item_id||"")] || "",
  days: defDays,
  manual_days: false,
  rate: 0,
  amount: 0
}));
*/
// apply default days (not manual)
   const dSetup = document.getElementById("inv_setup")?.value || "";
const dStart = document.getElementById("inv_start")?.value || "";
const dEnd   = document.getElementById("inv_end")?.value || "";
const defDays = calcEventDays(dSetup, dStart, dEnd) || 1;
currentItems = currentItems.map(it => ({
  ...it,
  days: it.manual_days ? Number(it.days ?? defDays) : defDays,
  manual_days: it.manual_days || false
}));
renderItemsTable();


    
  });

  // GST change => rate from sheet + recalc
  document.getElementById("inv_gst_type")?.addEventListener("change", ()=>{
    applyGSTDefaultsToUI();
    recalc();
  });
  document.getElementById("inv_gst_rate")?.addEventListener("input", recalc);
  document.getElementById("inv_gst_rate")?.addEventListener("change", recalc);



  // ✅ Only Name toggle for Manual Line (hide optional inputs + auto-clear)
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t || t.id !== "inv_line_onlyname") return;

  const box = document.getElementById("inv_line_optional_fields");
  if (!box) return;

  const on = !!t.checked;
  box.style.display = on ? "none" : "block";

  // when OnlyName ON → force empty/zero values to avoid confusion
  if (on) {
    const q = document.getElementById("inv_line_qty");
    const u = document.getElementById("inv_line_unit");
    const h = document.getElementById("inv_line_hsn");
    const r = document.getElementById("inv_line_rate");
    if (q) q.value = "0";
    if (u) u.value = "";
    if (h) h.value = "";
    if (r) r.value = "0";
  } else {
    // when turning back ON→OFF, keep reasonable defaults
    const q = document.getElementById("inv_line_qty");
    if (q && (String(q.value||"").trim()==="" || Number(q.value||0)===0)) q.value = "1";
  }
});

  // add row flow
  // ✅ Always works even if UI re-renders
document.addEventListener("click", (e)=>{
  const t = e.target;

  // Toggle add row box
  if (t && t.id === "btn_inv_add_row") {
    const box = document.getElementById("inv_add_row_box");
    if (!box) return;
    const isHidden = window.getComputedStyle(box).display === "none";
    box.style.display = isHidden ? "block" : "none";
    return;
  }
// Toggle manual add line box
if (t && t.id === "btn_inv_add_line") {
  const box = document.getElementById("inv_add_line_box");
  if (!box) return;
  const isHidden = window.getComputedStyle(box).display === "none";
  box.style.display = isHidden ? "block" : "none";
  return;
}

// Confirm manual line
if (t && t.id === "btn_inv_line_confirm") {
  const rawName = String(document.getElementById("inv_line_name")?.value || "").trim();
  if (!rawName) return alert("Item Name is required");

// if LED and size given, append size on next line
const sizeRaw = String(document.getElementById("inv_line_led_size")?.value || "").trim();
let name = rawName;
if (isLedAnyName(rawName) && sizeRaw) {
  const lbl = formatLedSizeLabel(sizeRaw);
  if (lbl) name = `${rawName}\n${lbl}`;
}

  
const onlyName = !!document.getElementById("inv_line_onlyname")?.checked;

  const qty = onlyName ? 0 : numOr(document.getElementById("inv_line_qty")?.value, 1);
  const rate = onlyName ? 0 : numOr(document.getElementById("inv_line_rate")?.value, 0);
  const unit = onlyName ? "" : String(document.getElementById("inv_line_unit")?.value || "").trim();
  const hsn_sac = onlyName ? "" : String(document.getElementById("inv_line_hsn")?.value || "").trim();

  // default days from current dates
  const dSetup = document.getElementById("inv_setup")?.value || "";
  const dStart = document.getElementById("inv_start")?.value || "";
  const dEnd   = document.getElementById("inv_end")?.value || "";
  const defDays = calcEventDays(dSetup, dStart, dEnd) || 1;

  currentItems.push({
    item_id: "",              // manual line (no inventory id)
    item_name: name,
    hsn_sac,
    qty: qty, // ✅ allow 0 while adding (we will validate on Save)
    unit,
    days: defDays,
    manual_days: false,
    rate,
    amount: 0
  });

  // clear inputs
  document.getElementById("inv_line_name").value = "";
  document.getElementById("inv_line_qty").value = "1";
  document.getElementById("inv_line_unit").value = "";
  document.getElementById("inv_line_hsn").value = "";
  document.getElementById("inv_line_rate").value = "0";
  const onlyEl = document.getElementById("inv_line_onlyname");
if (onlyEl) onlyEl.checked = false;
const optBox = document.getElementById("inv_line_optional_fields");
if (optBox) optBox.style.display = "block";

const ls = document.getElementById("inv_line_led_size");
if (ls) ls.value = "";

  renderItemsTable();
  return;
}

  // Confirm add item
  if (t && t.id === "btn_inv_add_confirm") {
    const sel = document.getElementById("inv_item_pick");
    const opt = sel?.selectedOptions?.[0];
    if (!opt || !opt.value) return alert("Select inventory item");

    const item_id = String(opt.value||"");
   let item_name = opt.getAttribute("data-name") || item_id;
let unit = opt.getAttribute("data-unit") || "";
const hsn_sac = opt.getAttribute("data-hsn") || "";

let qty = Number(document.getElementById("inv_new_qty")?.value || 0);
let rate = Number(document.getElementById("inv_new_rate")?.value || 0);

// ✅ LED size override (optional)
const sizeRaw = String(document.getElementById("inv_led_size")?.value || "").trim();
if (isLedAnyName(item_name) && sizeRaw) {
  const r = ledQtySqftFromSize(sizeRaw);
  if (r) {
    qty = r.sqft;
    unit = unit || "sq ft";
    const lbl = formatLedSizeLabel(sizeRaw);
    if (lbl) item_name = `${item_name}\n${lbl}`;
  }
}

// ✅ allow 0 while adding; will validate on Save


    const dSetup = document.getElementById("inv_setup")?.value || "";
const dStart = document.getElementById("inv_start")?.value || "";
const dEnd   = document.getElementById("inv_end")?.value || "";
const defDays = calcEventDays(dSetup, dStart, dEnd) || 1;

currentItems.push({
  item_id, item_name, hsn_sac, qty, unit,
  days: defDays,
  manual_days: false,
  rate,
  amount: 0
});
renderItemsTable();

    return;
  }
});




  // check this if errors found starts here

  function refreshDefaultDaysIfNeeded(){
  const dSetup = document.getElementById("inv_setup")?.value || "";
  const dStart = document.getElementById("inv_start")?.value || "";
  const dEnd   = document.getElementById("inv_end")?.value || "";
  const defDays = calcEventDays(dSetup, dStart, dEnd) || 1;

  currentItems = currentItems.map(it => ({
    ...it,
    days: it.manual_days ? Number(it.days ?? defDays) : defDays
  }));
  renderItemsTable();
}

document.getElementById("inv_setup")?.addEventListener("change", refreshDefaultDaysIfNeeded);
document.getElementById("inv_start")?.addEventListener("change", refreshDefaultDaysIfNeeded);
document.getElementById("inv_end")?.addEventListener("change", refreshDefaultDaysIfNeeded);


  // check this is errors end here
  async function saveDoc(){
    if (!canEdit) return;

    const btn = document.getElementById("btn_inv_save");
    const unlock = lockButton(btn, "Saving...");

    try {
      const doc_type = currentDocType; // "INVOICE" | "QUOTATION"
      const invoice_date = String(document.getElementById("inv_date")?.value || "").trim();

      const clientFull = selectedClientFromPick();
      if (!clientFull || !clientFull.client_id) return alert("Select client");

      const order_id = String(document.getElementById("inv_order_id")?.textContent || "").trim();
      const venue = String(document.getElementById("inv_venue")?.value || "").trim();
      const setup_date = String(document.getElementById("inv_setup")?.value || "").trim();
      const start_date = String(document.getElementById("inv_start")?.value || "").trim();
      const end_date = String(document.getElementById("inv_end")?.value || "").trim();

      if (!venue) return alert("Venue required");
      if (!setup_date || !start_date || !end_date) return alert("Setup/Start/End dates required");

      const gst_type = String(document.getElementById("inv_gst_type")?.value || "CGST_SGST").toUpperCase();
      const gst_rate = Number(document.getElementById("inv_gst_rate")?.value || 0);

      if (!currentItems.length) return alert("No items");
      const bad = currentItems.find(it => {
  // only name is required
  if (!String(it.item_name || "").trim()) return true;

  // allow empty/0 qty/rate/days/unit/hsn
  // but still block negative numbers (optional safety)
  const qty = Number(it.qty || 0);
  const rate = Number(it.rate || 0);
  const days = Number(it.days ?? 1);

  if (qty < 0 || rate < 0 || days < 0) return true;

  return false;
});
if (bad) return alert("Item Name required (and no negative qty/rate/days).");


      const payload = {
        invoice_id: editingInvoiceId,
        doc_type,
        invoice_date,
        order_id,
        client_id: clientFull.client_id,
        client_name: clientFull.client_name,
        client_phone: clientFull.phone1,
        client_phone2: clientFull.phone2,
        client_company: clientFull.client_company,
        client_address: clientFull.address || "",
        client_gstin: clientFull.gstin || "",
        venue,
        setup_date,
        start_date,
        end_date,
        gst_type,
        gst_rate,
       items: currentItems.map(it => ({
  item_id: it.item_id,
  item_name: it.item_name,
  qty: Number(it.qty||0),
  unit: it.unit || "",
  hsn_sac: it.hsn_sac || "",
  days: Number(it.days ?? 1),
  rate: Number(it.rate||0)
}))

      };

      const r = editingInvoiceId
        ? await api({ action: "updateInvoice", ...payload })
        : await api({ action: "addInvoice", ...payload });

      if (r && r.error) return alert(String(r.error));
/* if check for this if something goes wrong
      lastSavedInvoiceId = r.invoice_id || editingInvoiceId || "";
      const no = r.invoice_no || "";
      lastSavedInvoiceNo = no || lastSavedInvoiceNo;
      alert(editingInvoiceId ? "Saved" : (doc_type === "QUOTATION" ? ("Quotation saved: " + no) : ("Invoice saved: " + no)));
      loadSection("invoice");
*/
     
lastSavedInvoiceId = r.invoice_id || editingInvoiceId || "";
lastSavedInvoiceNo = r.invoice_no || "";
currentHeaderCache = {
  ...payload,
  invoice_id: lastSavedInvoiceId,
  invoice_no: lastSavedInvoiceNo,
  doc_type,
  invoice_date
};

const no = lastSavedInvoiceNo;
alert(editingInvoiceId ? "Saved" : (doc_type === "QUOTATION" ? ("Quotation saved: " + no) : ("Invoice saved: " + no)));
// ✅ Persist last saved invoice info across reload
sessionStorage.setItem("lastSavedInvoiceId", lastSavedInvoiceId || "");
sessionStorage.setItem("lastSavedInvoiceNo", lastSavedInvoiceNo || "");

// ✅ reload invoice section (after reload, DOM is rebuilt)
loadSection("invoice");
return; // ✅ IMPORTANT: stop here, don't touch old DOM after reload



      
    } finally {
      setTimeout(unlock, 450);
    }
  }

  document.getElementById("btn_inv_save")?.addEventListener("click", saveDoc);

  function buildPrintHtml(header, items){
    const showHSN = String(header.gst_type || "").toUpperCase() !== "NONE";
    const title = (header.doc_type === "QUOTATION") ? "QUOTATION" : "INVOICE";
    const terms = company.terms || "Terms: 1. Please pay within 7 days. 2. Goods once rented are the responsibility of the client.";
function isBlankOrZero(v){
  const n = Number(v);
  return !isFinite(n) || n === 0;
}

    return `
      <br><br><br><br>
        <div class="hdr">
          <div class="hdrLeft">
            <div class="brand">${escapeHtml(company.company_name || "")}</div>
            <div class="sub">${escapeHtml(company.short_desc || "")}</div>
            <div class="small">${escapeHtml(company.address || "")}</div>
            <div class="small">${company.phone ? ("Phone: " + escapeHtml(company.phone)) : ""}${company.gstin ? (" • GSTIN: " + escapeHtml(company.gstin)) : ""}</div>
          </div>
          <div class="hdrRight">
            <div class="docTitle">${title}</div>
            <div class="meta"><b>No:</b> ${escapeHtml(header.invoice_no || "(DRAFT)")}</div>
            <div class="meta"><b>Date:</b> ${escapeHtml(header.invoice_date || "")}</div>
            <div class="meta"><b>Order:</b> ${escapeHtml(header.order_id || "")}</div>
            <div class="meta"><b>Place:</b> ${escapeHtml(company.place_of_supply || company.address || "")}</div>
          </div>
        </div>

        <div class="grid2">
          <div class="box">
            <div class="boxT">Bill To</div>
            <div><b>${escapeHtml(header.client_name||"")}</b></div>
            ${header.client_company ? `<div>${escapeHtml(header.client_company)}</div>` : ``}
            <div>${escapeHtml(header.client_phone||"")}${header.client_phone2 ? (" , " + escapeHtml(header.client_phone2)) : ""}</div>
            ${header.client_gstin ? `<div>GSTIN: ${escapeHtml(header.client_gstin)}</div>` : ``}
            <div>${escapeHtml(header.client_address||"")}</div>
          </div>
          <div class="box">
            <div class="boxT">Event Details</div>
            <div><b>Venue:</b> ${escapeHtml(header.venue||"")}</div>
            <div><b>Setup:</b> ${escapeHtml(header.setup_date||"")}</div>
            <div><b>Start:</b> ${escapeHtml(header.start_date||"")}</div>
            <div><b>End:</b> ${escapeHtml(header.end_date||"")}</div>
          </div>
        </div>

        <table class="t">
          <thead>
            <tr>
              <th style="width:5%;">#</th>
              <th>Description</th>
              ${showHSN ? `<th style="width:12%;text-align:center;">HSN/SAC</th>` : ``}
              <th style="width:12%;text-align:right;">Qty</th>
              <th style="width:10%;text-align:right;">Days</th>
              <th style="width:16%;text-align:right;">Rate</th>
              <th style="width:16%;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
           ${items.map((it,i)=>{
  const name = String(it.item_name || "");
  const unit = String(it.unit || "");
  const hsn  = String(it.hsn_sac || "");

  const qty  = Number(it.qty || 0);
  const days = Number(it.days ?? 1);
  const rate = Number(it.rate || 0);
  const amt  = Number(it.amount || 0);

  // ✅ If line is "only name" (everything else empty/0), print blanks
 const onlyName =
  isBlankOrZero(qty) &&
  isBlankOrZero(rate) &&
  isBlankOrZero(amt) &&   // ✅ check amount also
  !unit.trim() &&
  !hsn.trim();


  const qtyTxt  = onlyName ? "" : (isFinite(qty) ? String(qty) : "");
 const daysTxt =
  onlyName ? "" :
  (!isFinite(days) || days === 0 || days === 1) ? "" :
  String(days);

  const rateTxt = onlyName ? "" : (isFinite(rate) && rate !== 0 ? `₹${money(rate)}` : "");
  const amtTxt  = onlyName ? "" : (isFinite(amt)  && amt  !== 0 ? `₹${money(amt)}`  : "");

  // unit shown only if not onlyName and unit exists
  const unitPart = (!onlyName && unit) ? ` <span class="u">(${escapeHtml(unit)})</span>` : "";

  return `
    <tr>
      <td>${i+1}</td>
      <td>${escapeHtml(name).replace(/\n/g,"<br>")}${unitPart}</td>
      ${showHSN ? `<td style="text-align:center;">${onlyName ? "" : escapeHtml(hsn)}</td>` : ``}
      <td style="text-align:right;">${qtyTxt}</td>
      <td style="text-align:right;">${daysTxt}</td>
      <td style="text-align:right;">${rateTxt}</td>
      <td style="text-align:right;">${amtTxt}</td>
    </tr>
  `;
}).join("")}

          </tbody>
        </table>

        <div class="totals">
          <div class="totBox">
            <div class="r"><span>Subtotal</span><b>₹${escapeHtml(header.subtotal||"0.00")}</b></div>
            ${header.gst_type === "CGST_SGST" ? `
              <div class="r"><span>CGST</span><span>₹${escapeHtml(header.cgst||"0.00")}</span></div>
              <div class="r"><span>SGST</span><span>₹${escapeHtml(header.sgst||"0.00")}</span></div>
            ` : ``}
            ${header.gst_type === "IGST" ? `
              <div class="r"><span>IGST</span><span>₹${escapeHtml(header.igst||"0.00")}</span></div>
            ` : ``}
            <div class="r gt"><span>Total</span><b>₹${escapeHtml(header.grand||"0.00")}</b></div>
          </div>
        </div>

                <div class="foot">
          <div class="footGrid">

            <div class="footLeft">
  <div><b>Amount in Words:</b> ${escapeHtml(header.words||"")}</div>
  <div style="margin-top:8px;"><b>Terms:</b> ${escapeHtml(terms)}</div>

  ${
    String(header.doc_type || "").toUpperCase() === "QUOTATION"
      ? ``
      : `
        <div class="payRow" style="margin-top:10px;">
          <div class="qrMini">
            <img class="qrImg" src="${BANK_QR_URL}" alt="QR">
          </div>

          <div class="bankMini">
            <div class="bankTitle">${escapeHtml(BANK_DETAILS.title)}</div>
            <div>${escapeHtml(BANK_DETAILS.bank)}</div>
            <div>${escapeHtml(BANK_DETAILS.branch)}</div>
            <div><b>Name:</b> ${escapeHtml(BANK_DETAILS.name)}</div>
            <div><b>A/c. No:</b> ${escapeHtml(BANK_DETAILS.ac)}</div>
            <div><b>IFSC:</b> ${escapeHtml(BANK_DETAILS.ifsc)}</div>
          </div>
        </div>
      `
  }
</div>

            <div class="footRight">
  <div class="sig">
    <div>For ${escapeHtml(company.company_name||"")}</div>
    <div class="line"></div>
    <div>Authorized Signatory</div>
  </div>
</div>


          </div>
        </div>


        <div class="footerBar">
          Generated on ${escapeHtml(new Date().toLocaleString())}
        </div>
      
    `;
  }

  async function printSameWindow(){
   const source = currentHeaderCache || {};

const header = {
  doc_type: source.doc_type || currentDocType,
  invoice_no: source.invoice_no || lastSavedInvoiceNo || "",
  invoice_date: source.invoice_date || document.getElementById("inv_date")?.value || "",
  order_id: source.order_id || document.getElementById("inv_order_id")?.textContent || "",
  venue: source.venue || document.getElementById("inv_venue")?.value || "",
  setup_date: source.setup_date || document.getElementById("inv_setup")?.value || "",
  start_date: source.start_date || document.getElementById("inv_start")?.value || "",
  end_date: source.end_date || document.getElementById("inv_end")?.value || "",
  client_name: source.client_name || document.getElementById("inv_client_name")?.textContent || "",
  client_company: source.client_company || document.getElementById("inv_client_company")?.textContent || "",
  client_phone: source.client_phone || document.getElementById("inv_client_phone1")?.textContent || "",
  client_phone2: source.client_phone2 || document.getElementById("inv_client_phone2")?.textContent || "",
  client_address: source.client_address || document.getElementById("inv_client_address")?.textContent || "",
  client_gstin: source.client_gstin || document.getElementById("inv_client_gstin")?.textContent || "",
  gst_type: source.gst_type || document.getElementById("inv_gst_type")?.value || "",
  subtotal: source.subtotal || document.getElementById("inv_subtotal")?.textContent || "0.00",
  cgst: source.cgst || document.getElementById("inv_cgst")?.textContent || "0.00",
  sgst: source.sgst || document.getElementById("inv_sgst")?.textContent || "0.00",
  igst: source.igst || document.getElementById("inv_igst")?.textContent || "0.00",
  grand: source.grand || document.getElementById("inv_grand")?.textContent || "0.00",
  words: source.words || document.getElementById("inv_words")?.value || ""
};


    const printArea = document.getElementById("global_print_area");

    if (!printArea) return alert("Print area missing");

    const css = `
<style>
  @page { size: A4; margin: 0; }

  html, body { height:100%; }
  body.printing { margin:0; background: transparent !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .printBg{
    position: fixed;
    inset: 0;
    width: 210mm;
    height: 297mm;
    object-fit: cover;
    z-index: 0;          /* ✅ not negative */
     -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  }

  .page{
    position: relative;  /* ✅ creates stacking context above bg */
    z-index: 1;
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 18mm 14mm;

  }

  .hdr { display:flex; justify-content:space-between; gap:14px; border-bottom:2px solid #111; padding-bottom:12px; }
  .brand { font-size:22px; font-weight:800; letter-spacing:.3px; }
  .sub { font-size:12px; color:#444; margin-top:2px; }
  .small { font-size:12px; color:#444; margin-top:2px; }
  .hdrRight { text-align:right; }
  .docTitle { font-size:18px; font-weight:800; }
  .meta { font-size:12px; color:#333; margin-top:2px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
  .box { border:1px solid #eee; border-radius:10px; padding:10px; background: rgba(255,255,255,0.85); }
  .boxT { font-size:12px; font-weight:800; color:#333; border-bottom:1px solid #eee; padding-bottom:6px; margin-bottom:6px; text-transform:uppercase; }
  .t { width:100%; border-collapse:collapse; margin-top:12px; background: rgba(255,255,255,0.85); }
  .t th { background:rgba(248,250,252,0.95); font-size:12px; text-transform:uppercase; border-bottom:2px solid #eee; padding:10px 8px; text-align:left; }
  .t td { border-bottom:1px solid #eee; padding:10px 8px; font-size:13px; }
  .u { color:#777; font-size:12px; }
  .totals { display:flex; justify-content:flex-end; margin-top:12px; }
  .totBox { width:320px; border:1px solid #eee; border-radius:10px; padding:10px; background: rgba(255,255,255,0.85); }
  .r { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
  .gt { border-top:2px solid #111; margin-top:6px; padding-top:8px; font-size:16px; }
  .foot { margin-top:14px; border-top:1px solid #eee; padding-top:8px; font-size:12px; color:#444; background: rgba(255,255,255,0.85); border-radius:10px; padding:10px; }
  .footGrid{
  display:grid;
  grid-template-columns: 1.4fr 0.6fr;
  gap:12px;
  align-items:start;
}

.payRow{
  display:flex;
  gap:10px;
  align-items:flex-start;
}

.qrMini{
  border:1px solid #eee;
  border-radius:10px;
  padding:5px;
  background: rgba(255,255,255,0.9);
  text-align:center;
  flex:0 0 auto;
}

.bankMini{
  border:1px solid #eee;
  border-radius:10px;
  padding:8px 10px;
  background: rgba(255,255,255,0.9);
  font-size:12px;
  line-height:1.35; /* ✅ tighter */
  flex:1 1 auto;
}

.bankTitle{
  font-weight:800;
  margin-bottom:4px;
  text-transform:uppercase;
  font-size:12px;
  color:#333;
}



.qrBox{
  border:1px solid #eee;
  border-radius:10px;
  padding:10px;
  background: rgba(255,255,255,0.9);
  text-align:center;
}
.qrTitle{
  font-weight:800;
  font-size:12px;
  margin-bottom:8px;
  text-transform:uppercase;
  color:#333;
}
.qrImg{
  width:110px;   /* ✅ smaller */
  height:110px;  /* ✅ smaller */
  object-fit:contain;
  display:inline-block;
}


  .sig { margin-top:16px; text-align:right; }
  .line { margin-top:36px; border-top:1px solid #111; width:220px; display:inline-block; }
  .footerBar { margin-top:10px; font-size:11px; color:#777; text-align:center; }

 @media print {

  body * {
    visibility: hidden !important;
  }

  #global_print_area,
  #global_print_area * {
    visibility: visible !important;
  }

  #global_print_area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

}

</style>
`;


    printArea.innerHTML =
  css +
  `<img class="printBg" src="${INVOICE_BG_URL}" alt="">` +
  `<div class="page">` +
  buildPrintHtml(header, currentItems) +
  `</div>`;


    // show only print area
  const scrollY = window.scrollY;
const appContent = document.getElementById("content");

// hide app
if (appContent) appContent.style.display = "none";
printArea.style.display = "block";

const restore = () => {
  printArea.style.display = "none";
  if (appContent) appContent.style.display = "";

  // ✅ STEP 3: clear persisted last-saved after using it
  sessionStorage.removeItem("lastSavedInvoiceId");
  sessionStorage.removeItem("lastSavedInvoiceNo");

  window.scrollTo(0, scrollY);
  window.removeEventListener("afterprint", restore);
};

window.addEventListener("afterprint", restore);



// ✅ preload bg image before printing (iPhone fix)
await new Promise((resolve) => {
  let done = 0;
  const finish = () => { done++; if (done >= 2) resolve(); };

  const img1 = new Image();
  img1.onload = finish; img1.onerror = finish;
  img1.src = INVOICE_BG_URL;

  const img2 = new Image();
  img2.onload = finish; img2.onerror = finish;
  img2.src = BANK_QR_URL;
});


setTimeout(() => {
  try { window.print(); } catch(e) {}
}, 150);

  }
  // --- helpers for list actions (Print/WhatsApp)
  async function getInvoiceFullById(invoice_id){
    const r = await api({ action: "getInvoiceFull", invoice_id: String(invoice_id) });
    if (r && r.error) throw new Error(r.error);
    return r; // {header, items}
  }

  function formatWhatsAppNumber(raw){
    let s = String(raw || "").trim();
    s = s.replace(/[^\d+]/g, "");      // keep digits and +
    if (s.startsWith("00")) s = s.slice(2);
    if (!s.startsWith("+")) s = "+" + s.replace(/[^\d]/g, "");
    return s;
  }

  async function printFromInvoiceId(invoice_id){
    const full = await getInvoiceFullById(invoice_id);
    currentHeaderCache = full.header || null;
    if (full.header) {
  currentHeaderCache = {
    ...full.header,
    subtotal: full.header.subtotal,
    cgst: full.header.cgst,
    sgst: full.header.sgst,
    igst: full.header.igst,
    grand: full.header.grand_total,
    words: amountInWordsIN(full.header.grand_total) + " Only"
  };
}

    currentItems = Array.isArray(full.items) ? full.items : [];
    renderItemsTable(); // keeps UI consistent
    printSameWindow();  // will now print with real invoice_no
  }

  async function whatsappFromInvoiceId(invoice_id){
    const full = await getInvoiceFullById(invoice_id);
    currentHeaderCache = full.header || null;
    currentItems = Array.isArray(full.items) ? full.items : [];

    const pdf = await api({ action: "generateInvoicePdf", invoice_id: String(invoice_id) });
    if (pdf && pdf.error) return alert(String(pdf.error));

    const phonePlus = formatWhatsAppNumber(full.header?.client_phone || "");
    const waDigits = phonePlus.replace("+",""); // wa.me needs digits only

    const docLabel = (String(full.header?.doc_type || "INVOICE").toUpperCase() === "QUOTATION") ? "Quotation" : "Invoice";
    const docNo = full.header?.invoice_no || "";
    const link = pdf.public_url || pdf.file_url || "";
    const msg = `Please find attached ${docLabel} ${docNo}\n${link}`;

    window.open(`https://wa.me/${encodeURIComponent(waDigits)}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  
   document.getElementById("btn_inv_print")?.addEventListener("click", async ()=>{
  // If we have a saved invoice id, print using server data so invoice_no is correct
  const id = editingInvoiceId || lastSavedInvoiceId;
  if (id) return await printFromInvoiceId(id);

  // Otherwise print draft preview
  return await printSameWindow();
});


  // WhatsApp PDF
  document.getElementById("btn_inv_wa")?.addEventListener("click", async ()=>{
    const clientFull = selectedClientFromPick();
    if (!clientFull || !clientFull.phone1) return alert("Client phone missing");

    // must be saved to generate PDF properly
    if (!editingInvoiceId && !lastSavedInvoiceId) {
      return alert("Please Save first, then WhatsApp PDF.");
    }

    const invoice_id = editingInvoiceId || lastSavedInvoiceId;

    const btn = document.getElementById("btn_inv_wa");
    const unlock = lockButton(btn, "Generating PDF...");

    try {
      const r = await api({ action: "generateInvoicePdf", invoice_id });
      if (r && r.error) return alert(String(r.error));

      const url = r.file_url || r.url || "";
      if (!url) return alert("PDF URL missing");

      const docLabel = (r.doc_type === "QUOTATION") ? "Quotation" : "Invoice";
      const msg =
        `*${docLabel}* ${r.invoice_no || ""}\n` +
        `Client: ${r.client_name || ""}\n` +
        `Venue: ${r.venue || ""}\n` +
        `Total: ₹${money(r.grand_total || 0)}\n\n` +
        `PDF: ${url}`;

      const phone = String(clientFull.phone1 || "").replace(/\D+/g,"");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    } finally {
      unlock();
    }
  });

 

  // List render
  async function renderInvoiceList(){
    const listBox = document.getElementById("inv_list");
    const totalBox = document.getElementById("inv_total");
    if (!listBox) return;

    const month = String(document.getElementById("inv_month")?.value || "").trim();
    const q = String(document.getElementById("inv_search")?.value || "").trim();

    const rows = await api({ action: "listInvoices", month, q });
    const list = Array.isArray(rows) ? rows : [];

    if (totalBox) totalBox.textContent = `Showing ${list.length} invoice(s)` + (month ? ` • ${month}` : "") + (q ? ` • "${q}"` : "");

    if (!list.length){
      listBox.innerHTML = `<p>No invoices found.</p>`;
      return;
    }

    listBox.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left">No</th>
          <th align="left">Client</th>
          <th align="left">Date</th>
          <th align="right">Total</th>
          <th align="right">Actions</th>
        </tr>
        ${list.map(inv=>{
          const badge = (String(inv.doc_type||"INVOICE").toUpperCase()==="QUOTATION")
            ? `<span style="font-size:11px;background:#111;color:#fff;padding:2px 6px;border-radius:6px;">QTN</span>`
            : `<span style="font-size:11px;background:#1fa971;color:#fff;padding:2px 6px;border-radius:6px;">INV</span>`;
          const st = String(inv.status||"ACTIVE").toUpperCase();
          const stBadge = (st === "CANCELLED")
            ? `<span style="font-size:11px;background:#d93025;color:#fff;padding:2px 6px;border-radius:6px;">CANCELLED</span>`
            : ``;

          return `
          <tr style="border-top:1px solid #eee;vertical-align:top;">
            <td><b>${escapeHtml(inv.invoice_no||"")}</b> ${badge} ${stBadge}<br><span class="dashSmall">${escapeHtml(inv.order_id||"")}</span></td>
            <td>${escapeHtml(inv.client_name||"")}<br><span class="dashSmall">${escapeHtml(inv.client_phone||"")}</span></td>
            <td>${escapeHtml(prettyISODate(inv.invoice_date||""))}</td>
            <td align="right"><b>₹ ${money(inv.grand_total||0)}</b></td>
            <td align="right" style="white-space:nowrap;">
<button class="userToggleBtn" data-inv-print="${escapeAttr(inv.invoice_id||"")}">Print</button>
<button class="userToggleBtn" data-inv-wa="${escapeAttr(inv.invoice_id||"")}">WhatsApp</button>
     
              <button class="userToggleBtn" data-view="${escapeAttr(inv.invoice_id||"")}">View</button>
              ${canEdit ? `<button class="userToggleBtn" data-edit="${escapeAttr(inv.invoice_id||"")}">Edit</button>` : ``}
           ${(isSuper && inv.status !== "CANCELLED") ? `<button class="userToggleBtn" data-cancel="${escapeAttr(inv.invoice_id||"")}">Cancel</button>` : ``}
 </td>

            
          </tr>`;
           

        
        }).join("")}
      </table>
    `;
    // ✅ bind Print + WhatsApp buttons (Invoice List)
listBox.querySelectorAll("[data-inv-print]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-inv-print");
    await printFromInvoiceId(id);
  });
});

listBox.querySelectorAll("[data-inv-wa]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-inv-wa");
    await whatsappFromInvoiceId(id);
  });
});


    // view
    listBox.querySelectorAll("button[data-view]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const id = b.getAttribute("data-view");
        const unlock = lockButton(b, "Loading...");
        try {
          const full = await api({ action: "getInvoiceFull", invoice_id: id });
          if (full && full.error) return alert(String(full.error));
          const h = full.header;
          alert(
            `${h.invoice_no} (${prettyISODate(h.invoice_date)})\n` +
            `${(h.doc_type||"INVOICE")==="QUOTATION" ? "Quotation" : "Invoice"}\n` +
            `Client: ${h.client_name} ${h.client_phone}\n` +
            `Venue: ${h.venue}\n` +
            `Total: ₹ ${money(h.grand_total)}`
          );
        } finally { setTimeout(unlock, 350); }
      });
    });

    // edit
    listBox.querySelectorAll("button[data-edit]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const id = b.getAttribute("data-edit");
        const full = await api({ action: "getInvoiceFull", invoice_id: id });
        if (full && full.error) return alert(String(full.error));

        editingInvoiceId = id;
        lastSavedInvoiceId = id;

        const h = full.header;
        lastSavedInvoiceNo = String(h.invoice_no || "");
        setDocTypeUI(String(h.doc_type||"INVOICE"));

        currentItems = (full.items || []).map(it=>({
  item_id: it.item_id || "",
  item_name: it.item_name || "",
  qty: Number(it.qty||0),
  unit: it.unit || "",
  hsn_sac: it.hsn_sac || "",
  days: Number(it.days ?? 1),
  manual_days: true, // since it came from saved invoice
  rate: Number(it.rate||0),
  amount: 0
}));
/*
renderItemsTable(); // recalc will compute amount

*/
/*check for this if smthing goes wrong */
        
applyDocTypeRules();
        /*check for this if smthing goes wrong */
        
        
        document.getElementById("inv_date").value = prettyISODate(h.invoice_date||todayISO());

        // ✅ Fix: set order dropdown selected (not showing "optional")
        const op = document.getElementById("inv_order_pick");
        if (op) op.value = String(h.order_id||"");

        // set client dropdown + full details
        const cp = document.getElementById("inv_client_pick");
        if (cp) cp.value = String(h.client_id||"");
        setClientFields({
          client_id: h.client_id,
          client_name: h.client_name,
          client_company: h.client_company || "",
          phone1: h.client_phone,
          phone2: h.client_phone2 || "",
          address: h.client_address,
          gstin: h.client_gstin || ""
        });

        document.getElementById("inv_order_id").textContent = String(h.order_id||"");
        document.getElementById("inv_venue").value = String(h.venue||"");
        document.getElementById("inv_setup").value = prettyISODate(h.setup_date||"");
        document.getElementById("inv_start").value = prettyISODate(h.start_date||"");
        document.getElementById("inv_end").value = prettyISODate(h.end_date||"");

        document.getElementById("inv_gst_type").value = String(h.gst_type||"CGST_SGST").toUpperCase();
        document.getElementById("inv_gst_rate").value = Number(h.gst_rate||0);

        renderItemsTable();

        document.getElementById("inv_status").textContent = `Editing: ${h.invoice_no}`;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    // cancel
    listBox.querySelectorAll("button[data-cancel]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        if (!isSuper) return;
        const id = b.getAttribute("data-cancel");
        if (!confirm("Cancel this invoice?")) return;

        const unlock = lockButton(b, "Cancelling...");
        try {
          const r = await api({ action: "cancelInvoice", invoice_id: id });
          if (r && r.error) return alert(String(r.error));
          alert("Cancelled");
          renderInvoiceList();
        } finally { setTimeout(unlock, 350); }
      });
    });
  }

  document.getElementById("btn_inv_refresh")?.addEventListener("click", renderInvoiceList);
  document.getElementById("inv_month")?.addEventListener("change", renderInvoiceList);
  // document.getElementById("inv_search")?.addEventListener("input", ()=>renderInvoiceList());
  // Optional: keep search but only when user presses Enter
document.getElementById("inv_search")?.addEventListener("keydown", (e)=>{
  if (e.key === "Enter") renderInvoiceList();
});

  // export CSV of list (superadmin)
  document.getElementById("btn_inv_export_csv")?.addEventListener("click", async ()=>{
    if (!isSuper) return;

    const month = String(document.getElementById("inv_month")?.value || "").trim();
    const q = String(document.getElementById("inv_search")?.value || "").trim();
    const rows = await api({ action: "listInvoices", month, q });
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return alert("No invoices to export.");

    const header = [
      "doc_type","invoice_no","invoice_date","order_id","client_name","client_phone","venue",
      "gst_type","gst_rate","subtotal","cgst","sgst","igst","grand_total","status"
    ];
    const lines = [header.join(",")];

    list.forEach(x=>{
      const cols = [
        x.doc_type, x.invoice_no, prettyISODate(x.invoice_date),
        x.order_id, x.client_name, x.client_phone, x.venue,
        x.gst_type, x.gst_rate, x.subtotal, x.cgst, x.sgst, x.igst, x.grand_total, x.status
      ].map(v => csvEscape(String(v ?? "")));
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoices_${(localStorage.getItem("company")||"company").replace(/\s+/g,"_")}_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
  });

  // initial renders
  renderItemsTable();
  recalc();
  renderInvoiceList();

  return;
}


    // invoice section ends here 





    
//Workers section starts here
    
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
                <div class="wkRow" data-worker-row="${escapeAttr(String(w.worker || ""))}" style="padding:10px 0;border-top:1px solid #eee;">
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


      /* === STEP 5: Activity Jump Auto Highlight (Workers) === */
(function applyActivityJump_Workers() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (!jump || jump.type !== "worker" || !jump.name) return;

    const target = String(jump.name).trim().toLowerCase();

    const rows = Array.from(document.querySelectorAll(".wkRow"));
    const el = rows.find(x =>
      String(x.getAttribute("data-worker-row") || "").trim().toLowerCase() === target
    );

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #1fa971";
      el.style.borderRadius = "8px";
      el.style.background = "#e6f4ea";

      setTimeout(() => {
        el.style.outline = "";
        el.style.borderRadius = "";
        el.style.background = "";
      }, 1600);
    }

    sessionStorage.removeItem("activity_jump");
  } catch (e) {}
})();


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


    // workers section ends here



    

    // holidays section here
    
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
           <input id="upad_amount" type="number" inputmode="decimal" pattern="[0-9]*" placeholder="Amount">

            <label style="margin-top:10px;">Date</label>
<input id="upad_date" type="date" value="${todayISO()}" max="${todayISO()}">
<label style="margin-top:10px;">Description (Optional)</label>
<input id="upad_desc" type="text" placeholder="Reason / Notes (optional)">

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
                <th align="left">Description</th>
                <th align="left">Month</th>
                <th align="left">Added By</th>
                ${showActions ? `<th align="right">Actions</th>` : ``}
              </tr>
              ${lastUpadRows.map(r => {
                const rowId = getUpadRowId(r);
                const date = prettyISODate(r.date || r[1] || "");
                const wk = String(r.worker || r[2] || "");
                const amt = Number(r.amount || r[3] || 0);
                const desc = String(r.description || r[6] || "");
                const mon = monthLabelFromAny(r.month ?? r[4] ?? "");
                const by = String(r.added_by || r[5] || "");

                return `
                  <tr style="border-top:1px solid #eee;">
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(wk)}</td>
                    <td align="right">₹${amt.toFixed(0)}</td>
                    <td align="right">${escapeHtml(desc)}</td>
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
          /* === STEP 5: Activity Jump Auto Highlight (Upad) === */
(function applyActivityJump_Upad() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (!jump || jump.type !== "upad" || !jump.name) return;

    const target = String(jump.name).trim().toLowerCase();

    // find first row containing worker name
    const trs = listBox.querySelectorAll("tr");
    for (const tr of trs) {
      if (String(tr.textContent || "").toLowerCase().includes(target)) {
        tr.scrollIntoView({ behavior: "smooth", block: "center" });
        tr.style.outline = "2px solid #1fa971";
        tr.style.borderRadius = "6px";
        setTimeout(() => {
          tr.style.outline = "";
          tr.style.borderRadius = "";
        }, 1500);
        break;
      }
    }

    sessionStorage.removeItem("activity_jump");
  } catch (e) {}
})();


          if (role === "superadmin") {
            listBox.querySelectorAll("button[data-upad-edit]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const row = Number(btn.getAttribute("data-row") || 0);
                if (!row) return alert("Invalid row");

                const cur = lastUpadRows.find(x => getUpadRowId(x) === row);
                const curWorker = String(cur?.worker || "");
                // 1. Get the current date (as YYYY-MM-DD) for the prompt default
const curDate = prettyISODate(cur?.date || todayISO());
                const curAmt = Number(cur?.amount || 0);
const curDesc = String(cur?.description || "");

                const newWorker = prompt("Worker:", curWorker);
                if (newWorker === null) return;

                // 2. Ask for the Date instead of the Month label
const newDate = prompt("Date (YYYY-MM-DD):", curDate);
if (newDate === null) return;
                // 3. Convert the user's input into the Month Label (e.g., Feb-2026)
const newMonth = monthLabelFromAny(newDate);

                const newDesc = prompt("Description:", curDesc);
if (newDesc === null) return;

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
  date: newDate, // ✅ REQUIRED by backend
  worker: String(newWorker).trim(),
  month: String(newMonth).trim(),
  amount: newAmount,
  description: String(newDesc || "")
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




      /* Auto-load Upad summary if coming from Dashboard activity jump */
(function autoLoadFromActivity_Upad() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (!jump || jump.type !== "upad" || !jump.name) return;

    // set filter worker to jumped name (if exists in dropdown)
    const wSel = document.getElementById("upad_filter_worker");
    if (wSel) {
      const target = String(jump.name).trim().toLowerCase();
      const opt = Array.from(wSel.options).find(o => String(o.value).trim().toLowerCase() === target);
      if (opt) wSel.value = opt.value;
    }

    upadSummaryEnabled = true;
    loadUpadSummary();
  } catch (e) {}
})();



      

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

        const header = ["date","worker","amount","description","month","added_by","row"];

        const lines = [header.join(",")];

        lastUpadRows.forEach(r => {
          const rowId = getUpadRowId(r) ?? "";
          const cols = [
            prettyISODate(r.date || ""),
            String(r.worker || ""),
            String(Number(r.amount || 0)),
            String(r.description || ""),
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

    // -------- upad section ends here

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

          <label style="margin-top:10px;">Unit</label>
          <input id="inv_unit" placeholder="e.g. pcs, box, set">

                  
<label style="margin-top:10px;">HSN/SAC Code <span style="color:#e33;">*</span></label>
<input id="inv_hsn" placeholder="e.g. 9987 or 8525">

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
          <th align="left">HSN/SAC</th>
          <th align="right">Total</th>
          <th align="left">Unit</th>
          ${isSuper ? `<th align="left">Status</th>` : ``}
          ${isSuper ? `<th align="right">Actions</th>` : ``}
        </tr>
        ${filtered.map(it => {
          const rowId = it.rowIndex ?? "";
          const status = String(it.status || "ACTIVE").toUpperCase();
          return `
            <tr class="invRow"
    data-inv-name="${escapeAttr(String(it.item_name || ""))}"
    data-inv-id="${escapeAttr(String(it.item_id || ""))}"
    style="border-top:1px solid #eee;">

              <td>
                <b>${escapeHtml(it.item_name || "")}</b><br>
                <span class="dashSmall">${escapeHtml(it.item_id || "")}</span>
              </td>
              <td>${escapeHtml(it.hsn_sac || "")}</td>
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



/* === STEP 5: Activity Jump Auto Highlight (Inventory) === */
(function applyActivityJump_Inventory() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (!jump || jump.type !== "inventory" || !jump.name) return;

    const target = String(jump.name).trim().toLowerCase();

    // Try match by item name first
    let el = Array.from(document.querySelectorAll(".invRow"))
      .find(r => String(r.getAttribute("data-inv-name") || "").trim().toLowerCase() === target);

    // Fallback: "contains" match (helps if ref is partial)
    if (!el) {
      el = Array.from(document.querySelectorAll(".invRow"))
        .find(r => String(r.getAttribute("data-inv-name") || "").toLowerCase().includes(target));
    }

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #1fa971";
      el.style.borderRadius = "8px";
      el.style.background = "#e6f4ea";

      setTimeout(() => {
        el.style.outline = "";
        el.style.borderRadius = "";
        el.style.background = "";
      }, 1600);
    }

    sessionStorage.removeItem("activity_jump");
  } catch (e) {}
})();


    
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
          const newHsn = prompt("HSN/SAC Code:", String(cur.hsn_sac || ""));
          if (newHsn === null) return;
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
              unit: String(newUnit || "").trim(),
              hsn_sac: String(newHsn || "").trim() // Pass the updated HSN
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
      const hsn_sac = (document.getElementById("inv_hsn")?.value || "").trim();
      if (!hsn_sac) return alert("HSN/SAC code is required for tax compliance");
      if (!name) return alert("Item name required");
      if (!(qty >= 0)) return alert("Qty must be >= 0");
const r = await api({
  action: "addInventoryItem",
  item_name: name,
  total_qty: qty,
  unit,
  hsn_sac // ✅ Pass it to the backend
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




       

  // ----- orders module starts here
/* ==========================================================
   ✅ ORDERS (PATCHED)
   - client selection REQUIRED (no manual inputs)
   - venue REQUIRED
   - setup_date REQUIRED
   - plan items: fixed dates payload + booked_qty field
   ========================================================== */
if (type === "orders") {

 
  // --- LED CALCULATOR LOGIC START ---
  // ⚠️ IMPORTANT: Replace "P3.9" with the EXACT Item ID of your cabinet in your Inventory Sheet
  const LED_CABINET_ITEM_ID = "IT-260213181906-687"; 
  const CABINET_FT = 1.64042;
  const CABINETS_PER_PETI = 6;

  function roundCabinets(raw) {
    const base = Math.floor(raw);
    const frac = raw - base;
    return base + (frac >= 0.5 ? 1 : 0);
  }

  function calcLedWall(widthFt, heightFt) {
    const Wraw = widthFt / CABINET_FT;
    const Hraw = heightFt / CABINET_FT;
    const W = roundCabinets(Wraw);
    const H = roundCabinets(Hraw);
    const neededCabinets = W * H;
    const petiExact = neededCabinets / CABINETS_PER_PETI;
    const petiBase = Math.ceil(petiExact);
    const frac = petiExact - Math.floor(petiExact);
    const addExtra = (frac === 0) || (frac >= 0.5);
    const petiCarry = petiBase + (addExtra ? 1 : 0);
    const carryCabinets = petiCarry * CABINETS_PER_PETI;
    return { W, H, neededCabinets, petiBase, petiCarry, carryCabinets, powerCable: carryCabinets, signalCable: carryCabinets };
  }
  // --- LED CALCULATOR LOGIC END ---

  

  content.innerHTML = `<div class="card"><h2>Orders</h2><p>Loading…</p></div>`;

  const isSuper = (role === "superadmin");
  const canAddEdit = (role === "owner" || role === "superadmin");

  const [clientRes, orderRes] = await Promise.all([
    api({ action: "listClients" }),
    api({ action: "listOrders", month: "" })
  ]);

  const allClients = Array.isArray(clientRes) ? clientRes : [];
  const activeClients = allClients.filter(c => String(c.status || "ACTIVE").toUpperCase() === "ACTIVE");
  const allOrders = Array.isArray(orderRes) ? orderRes : [];

  const monthSet = new Set(
    allOrders.map(o => normMonthLabel(prettyMonth(o.month || ""))).filter(Boolean)
  );
  const monthList = [...monthSet]
    .filter(Boolean)
    .sort((a,b) => (monthKey(b) || 0) - (monthKey(a) || 0));

  let viewMode = "";
  let lastShown = [];
  let expandedPlanFor = "";

  content.innerHTML = `
    <div class="card">
      <h2>Orders</h2>

      ${
        canAddEdit ? `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin-top:0;">Create Order</h3>

          <label>Client <span style="color:#e33;">*</span></label>
          <select id="ord_client_pick">
            <option value="">-- Select client --</option>
            ${(activeClients || []).map(c => `
              <option value="${escapeAttr(String(c.client_id || ""))}"
                data-name="${escapeAttr(String(c.client_name || ""))}"
                data-phone="${escapeAttr(String(c.phone1 || ""))}">
                ${escapeHtml(c.client_name || "")} • ${escapeHtml(c.phone1 || "")}
              </option>
            `).join("")}
          </select>

          <div class="card" style="margin-top:10px;padding:10px;">
            <div class="dashSmall">Client Name</div>
            <input id="ord_client_name" readonly style="opacity:.85;" placeholder="Auto-filled">
            <div class="dashSmall" style="margin-top:8px;">Client Phone</div>
            <input id="ord_client_phone" readonly style="opacity:.85;" placeholder="Auto-filled">
          </div>

          <label style="margin-top:10px;">Venue <span style="color:#e33;">*</span></label>
          <input id="ord_venue" placeholder="Venue">

          <label style="margin-top:10px;">Order Details (optional)</label>
          <input id="ord_details" placeholder="Details / notes">

          <label style="margin-top:10px;">Setup Date <span style="color:#e33;">*</span></label>
          <input id="ord_setup" type="date" value="${todayISO()}">

          <label style="margin-top:10px;">Start Date <span style="color:#e33;">*</span></label>
          <input id="ord_start" type="date" value="${todayISO()}">

          <label style="margin-top:10px;">End Date <span style="color:#e33;">*</span></label>
          <input id="ord_end" type="date" value="${todayISO()}">


          <div id="led_calc_block" style="margin-top:14px; border:1px solid #eee; border-radius:8px; padding:12px; background:#fafafa;">
             <div style="font-weight:700; margin-bottom:10px; font-size:14px; color:#333;">🖥️ LED Wall Size</div>
             <div style="display:flex; gap:10px;">
               <div style="flex:1;">
                 <label style="display:block; font-size:11px; opacity:0.7;">Width (ft)</label>
                 <input id="led_w_ft" type="number" step="0.01" placeholder="16" style="width:100%; margin-top:4px;">
               </div>
               <div style="flex:1;">
                 <label style="display:block; font-size:11px; opacity:0.7;">Height (ft)</label>
                 <input id="led_h_ft" type="number" step="0.01" placeholder="12" style="width:100%; margin-top:4px;">
               </div>
             </div>
             <div id="led_calc_out" style="margin-top:10px; font-size:13px; line-height:1.4; color:#333;"></div>
             <button id="btn_check_led_avail" class="secondary" style="margin-top:10px; width:100%; font-size:13px;">Check Availability</button>
             <div id="led_avail_out" style="margin-top:8px;"></div>
          </div>
         

          <button class="primary" id="btn_ord_add" style="margin-top:14px;">➕ Create Order</button>

          <p class="dashSmall" style="margin-top:10px;">
            Month auto-calculates from <b>Start Date</b>.
          </p>
        </div>
        ` : `
          <p class="dashSmall" style="margin-top:8px;">
            You can view orders. Only Owner/Superadmin can create/edit/plan.
          </p>
        `
      }

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Orders List</h3>

        <label>Month</label>
        <select id="ord_month">
          <option value="">All</option>
          ${monthList.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("")}
        </select>

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;">
          <button class="primary" id="btn_ord_show_active">Show Active Summary</button>
          <button class="primary" id="btn_ord_show_all" style="background:#111;">Show Full List</button>
          ${isSuper ? `<button class="primary" id="btn_ord_export" style="background:#1fa971;">Export CSV</button>` : ``}
        </div>

        <div style="margin-top:12px;">
          <label>Search (order id / client / phone / venue)</label>
          <input id="ord_search" placeholder="Type to search..." autocomplete="off">
          <p class="dashSmall" id="ord_hint" style="margin-top:8px;">
            Click <b>Show Active Summary</b> or <b>Show Full List</b> to load list.
          </p>
        </div>

        <p id="ord_total" style="margin-top:10px;font-size:12px;color:#777;"></p>
        <div id="ord_list" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  const listBox = document.getElementById("ord_list");
  const totalBox = document.getElementById("ord_total");
  const searchInp = document.getElementById("ord_search");
  const hint = document.getElementById("ord_hint");
  const monthSel = document.getElementById("ord_month");

  function norm(s){ return String(s || "").trim().toLowerCase(); }

  function filterOrdersBase() {
    const m = (monthSel?.value || "").trim();
    const baseByMode =
      viewMode === "ACTIVE"
        ? allOrders.filter(o => String(o.status || "ACTIVE").toUpperCase() === "ACTIVE")
        : viewMode === "ALL"
          ? allOrders.slice()
          : [];

    const baseByMonth = !m
      ? baseByMode
      : baseByMode.filter(o => normMonthLabel(prettyMonth(o.month || "")) === normMonthLabel(m));

    const q = norm(searchInp?.value || "");
    const finalList = !q ? baseByMonth : baseByMonth.filter(o => {
      const hay = [o.order_id, o.client_name, o.client_phone, o.venue, o.details].map(norm).join(" ");
      return hay.includes(q);
    });

    return finalList;
  }

  async function renderOrders() {
    if (!listBox) return;

    if (!viewMode) {
      listBox.innerHTML = "";
      if (totalBox) totalBox.textContent = "";
      return;
    }

    const filtered = filterOrdersBase();
    lastShown = filtered;

    const m = (monthSel?.value || "").trim();
    const q = norm(searchInp?.value || "");

    if (totalBox) {
      totalBox.textContent =
        `Showing ${filtered.length} order(s)` +
        (viewMode === "ACTIVE" ? " • Active only" : " • Active + Inactive") +
        (m ? ` • Month: ${m}` : "") +
        (q ? ` • Search: "${q}"` : "");
    }

    if (!filtered.length) {
      listBox.innerHTML = `<p>No orders found.</p>`;
      return;
    }

    listBox.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left">Order</th>
          <th align="left">Client</th>
          <th align="left">Dates</th>
          <th align="left">Venue</th>
          <th align="left">Status</th>
          <th align="right">Actions</th>
        </tr>
        ${filtered.map(o => {
          const rowId = o.rowIndex ?? "";
          const status = String(o.status || "ACTIVE").toUpperCase();
          const setup = prettyISODate(o.setup_date || "");
          const start = prettyISODate(o.start_date || "");
          const end   = prettyISODate(o.end_date || "");
          const dateLine = `Setup: ${setup} • ${start} → ${end}`;

          const canPlan = (role === "owner" || role === "superadmin");

          return `
            <tr style="border-top:1px solid #eee;vertical-align:top;">
              <td>
                <b>${escapeHtml(o.order_id || "")}</b><br>
                <span class="dashSmall">${escapeHtml(prettyMonth(o.month || ""))}</span>
              </td>
              <td>
                ${escapeHtml(o.client_name || "")}<br>
                <span class="dashSmall">${escapeHtml(o.client_phone || "")}</span>
              </td>
              <td>${escapeHtml(dateLine)}</td>
              <td>${escapeHtml(o.venue || "")}</td>
              <td><b>${escapeHtml(status)}</b></td>
              <td align="right" style="white-space:nowrap;">
                ${canAddEdit ? `<button class="userToggleBtn" data-ord-edit="1" data-row="${escapeAttr(rowId)}">Edit</button>` : ``}
                ${canPlan ? `<button class="userToggleBtn" data-ord-plan="1" data-id="${escapeAttr(o.order_id || "")}">Plan Items</button>` : ``}
                <button class="userToggleBtn" data-ord-items="1" data-id="${escapeAttr(o.order_id || "")}">View Items</button>
                ${
                  isSuper
                    ? `<button class="userToggleBtn"
                         data-ord-status="1"
                         data-row="${escapeAttr(rowId)}"
                         data-next="${escapeAttr(status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}">
                         ${status === "ACTIVE" ? "Set Inactive" : "Set Active"}
                       </button>`
                    : ``
                }
              </td>
            </tr>

            <tr id="ord_expand_${escapeAttr(o.order_id || "")}" style="display:${expandedPlanFor === o.order_id ? "table-row" : "none"};">
              <td colspan="6" style="padding:10px 0;">
                <div class="card" style="margin-top:8px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <b>Plan Items — ${escapeHtml(o.order_id || "")}</b>
                    <button class="userToggleBtn" data-ord-close="1" data-id="${escapeAttr(o.order_id || "")}">Close</button>
                  </div>
                  <div id="ord_plan_box_${escapeAttr(o.order_id || "")}" style="margin-top:10px;">
                    <p class="dashSmall">Click “Plan Items” to load availability.</p>
                  </div>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </table>
    `;

    // Edit order (PATCH: no client change here; only venue/details/dates)
    if (canAddEdit) {
      listBox.querySelectorAll("button[data-ord-edit]").forEach(b => {
        b.addEventListener("click", async () => {
          const row = b.getAttribute("data-row");
          if (!row) return alert("Row id missing");

          const cur = allOrders.find(x => String(x.rowIndex) === String(row));
          if (!cur) return alert("Order not found");

          const newVenue = prompt("Venue (required):", String(cur.venue || ""));
          if (newVenue === null) return;

          const newDetails = prompt("Details (optional):", String(cur.details || ""));
          if (newDetails === null) return;

          const newSetup = prompt("Setup Date (YYYY-MM-DD):", String(prettyISODate(cur.setup_date || todayISO())));
          if (newSetup === null) return;

          const newStart = prompt("Start Date (YYYY-MM-DD):", String(prettyISODate(cur.start_date || todayISO())));
          if (newStart === null) return;

          const newEnd = prompt("End Date (YYYY-MM-DD):", String(prettyISODate(cur.end_date || todayISO())));
          if (newEnd === null) return;

          if (!String(newVenue).trim()) return alert("Venue is required");
          if (!String(newSetup).trim() || !String(newStart).trim() || !String(newEnd).trim()) {
            return alert("Setup, start and end required");
          }
          if (String(newEnd) < String(newStart)) return alert("End date cannot be before start date");
          if (String(newSetup) > String(newStart)) return alert("Setup date cannot be after start date");

          const unlock = lockButton(b, "Saving...");
          try {
            const r = await api({
              action: "updateOrder",
              rowIndex: Number(row),
              client_id: String(cur.client_id || ""),
              client_name: String(cur.client_name || ""),
              client_phone: String(cur.client_phone || ""),
              venue: String(newVenue).trim(),
              details: String(newDetails || "").trim(),
              setup_date: String(newSetup).trim(),
              start_date: String(newStart).trim(),
              end_date: String(newEnd).trim()
            });
            if (r && r.error) return alert(String(r.error));
            alert("Order updated");
            loadSection("orders");
          } finally {
            setTimeout(unlock, 500);
          }
        });
      });
    }

    // Status toggle (superadmin)
    if (isSuper) {
      listBox.querySelectorAll("button[data-ord-status]").forEach(b => {
        b.addEventListener("click", async () => {
          const row = b.getAttribute("data-row");
          const next = b.getAttribute("data-next");
          if (!row || !next) return alert("Row/status missing");

          const unlock = lockButton(b, "Updating...");
          try {
            const r = await api({ action: "updateOrderStatus", rowIndex: Number(row), status: String(next).trim() });
            if (r && r.error) return alert(String(r.error));
            alert("Status updated");
            loadSection("orders");
          } finally {
            setTimeout(unlock, 450);
          }
        });
      });
    }

    // View items
    listBox.querySelectorAll("button[data-ord-items]").forEach(b => {
      b.addEventListener("click", async () => {
        const order_id = b.getAttribute("data-id");
        if (!order_id) return;

        const unlock = lockButton(b, "Loading...");
        try {
          const rows = await api({ action: "listOrderItems", order_id: String(order_id) });
          const items = (Array.isArray(rows) ? rows : []).filter(x => Number(x.planned_qty || 0) > 0 && String(x.status||"ACTIVE").toUpperCase() === "ACTIVE");
          if (!items.length) return alert("No planned items for this order.");

          const msg = items.map(it => `${it.item_name || it.item_id}: planned ${Number(it.planned_qty||0)}`).join("\n");
          alert(msg);
        } finally {
          setTimeout(unlock, 350);
        }
      });
    });

    // Plan items (owner + superadmin)
    if (role === "owner" || role === "superadmin") {
      listBox.querySelectorAll("button[data-ord-plan]").forEach(b => {
        b.addEventListener("click", async () => {
          const order_id = String(b.getAttribute("data-id") || "").trim();
          if (!order_id) return;

          expandedPlanFor = (expandedPlanFor === order_id) ? "" : order_id;
          await renderOrders();
          if (!expandedPlanFor) return;

          const order = allOrders.find(o => String(o.order_id) === order_id);
          if (!order) return;

          const box = document.getElementById(`ord_plan_box_${order_id}`);
          if (!box) return;

          const setup_date = String(order.setup_date || "").trim();
          const start_date = String(order.start_date || "").trim();
          const end_date   = String(order.end_date || "").trim();

          if (!setup_date || !start_date || !end_date) {
            box.innerHTML = `<p class="dashSmall">Missing dates for this order.</p>`;
            return;
          }

          box.innerHTML = `<p>Loading availability…</p>`;

          const [availRes, existingRes] = await Promise.all([
            api({
  action: "listAvailableInventory",
  order_id: order_id, // 👈 CRITICAL: Add this line here
  setup_date: setup_date,
  start_date: start_date,
  end_date: end_date
}),

            api({ action: "listOrderItems", order_id: String(order_id) })
          ]);

          console.log("AVAIL RAW:", availRes);

          if (availRes && availRes.error) {
            box.innerHTML = `<p class="dashSmall">Error: ${escapeHtml(String(availRes.error))}</p>`;
            return;
          }

          const avail = Array.isArray(availRes) ? availRes : [];
          const existing = Array.isArray(existingRes) ? existingRes : [];

          const existingMap = {};
          const existingRowMap = {};
          existing.forEach(it => {
            const id = String(it.item_id || "").trim();
            existingMap[id] = Number(it.planned_qty || 0);
            existingRowMap[id] = it.rowIndex; // for status updates if needed
          });

          if (!avail.length) {
            box.innerHTML = `<p class="dashSmall">No active inventory found.</p>`;
            return;
          }

          box.innerHTML = `
            <div class="dashSmall">
              Date range reserved: <b>${escapeHtml(prettyISODate(setup_date))}</b> → <b>${escapeHtml(prettyISODate(end_date))}</b><br>
              Max allowed = (Available now) + (Already planned in this order)
            </div>

            <div style="margin-top:10px;overflow:auto;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <th align="left">Item</th>
                  <th align="right">Total</th>
                  <th align="right">Booked</th>
                  <th align="right">Available</th>
                  <th align="right">Plan Qty</th>
                </tr>
                ${avail.map(it => {
                  const id = String(it.item_id || "");
                  const already = Number(existingMap[id] || 0);
                  const availableNow = Number(it.available_qty || 0);
                  const booked = Number(it.booked_qty || 0);
                  const max = availableNow;

                  return `
                    <tr style="border-top:1px solid #eee;">
                      <td>
                        <b>${escapeHtml(it.item_name || "")}</b><br>
                        <span class="dashSmall">${escapeHtml(id)} ${it.unit ? "• " + escapeHtml(it.unit) : ""}</span>
                      </td>
                      <td align="right">${Number(it.total_qty || 0).toFixed(0)}</td>
                      <td align="right">${Number(booked).toFixed(0)}</td>
                      <td align="right">${Number(availableNow).toFixed(0)}</td>
                      <td align="right">
                        <input
                          data-plan-item="1"
                          data-item="${escapeAttr(id)}"
                          data-name="${escapeAttr(String(it.item_name || ""))}"
                          data-max="${escapeAttr(String(max))}"
                          type="number"
                          inputmode="numeric"
                          style="width:92px;"
                          value="${escapeAttr(String(already || 0))}"
                          min="0"
                          max="${escapeAttr(String(max))}">
                        <div class="dashSmall">max ${escapeHtml(String(max))}</div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </table>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
              <button class="primary" id="btn_plan_save_${escapeAttr(order_id)}">Save Plan</button>
              <button class="primary" id="btn_plan_clear_${escapeAttr(order_id)}" style="background:#111;">Clear All</button>
            </div>
          `;

          document.getElementById(`btn_plan_clear_${order_id}`)?.addEventListener("click", () => {
            box.querySelectorAll("input[data-plan-item]").forEach(inp => inp.value = "0");
          });

          document.getElementById(`btn_plan_save_${order_id}`)?.addEventListener("click", async () => {
            const btnSave = document.getElementById(`btn_plan_save_${order_id}`);
            const unlock2 = lockButton(btnSave, "Saving...");

            try {
              let bad = "";

              const inputs = Array.from(box.querySelectorAll("input[data-plan-item]"));
              for (const inp of inputs) {
                const item_id = String(inp.getAttribute("data-item") || "").trim();
                const item_name = String(inp.getAttribute("data-name") || "").trim();
                const max = Number(inp.getAttribute("data-max") || 0);
                const planned_qty = Number(inp.value || 0);

                if (!item_id) continue;
                if (!(planned_qty >= 0)) continue;

                if (planned_qty > max) { bad = `${item_id} max ${max}`; break; }

                // If qty > 0 -> upsert ACTIVE
                if (planned_qty > 0) {
                  const r = await api({
                    action: "upsertOrderItem",
                    order_id,
                    item_id,
                    item_name,
                    planned_qty
                  });
                  if (r && r.error) { bad = String(r.error); break; }
                } else {
                  // qty == 0 -> if previously existed, set INACTIVE (keeps history clean)
                  const rowIndex = existingRowMap[item_id];
                  if (rowIndex) {
                    const r2 = await api({
                      action: "updateOrderItemStatus",
                      rowIndex: Number(rowIndex),
                      status: "INACTIVE"
                    });
                    if (r2 && r2.error) { bad = String(r2.error); break; }
                  }
                }
              }

              if (bad) return alert("Save failed: " + bad);

              alert("Plan saved");
              loadSection("orders");
            } finally {
              setTimeout(unlock2, 450);
            }
          });
        });
      });

      listBox.querySelectorAll("button[data-ord-close]").forEach(b => {
        b.addEventListener("click", async () => {
          expandedPlanFor = "";
          await renderOrders();
        });
      });
    }
  }

  document.getElementById("btn_ord_show_active")?.addEventListener("click", () => {
    viewMode = "ACTIVE";
    if (hint) hint.textContent = "Active orders loaded. Use search/month to filter.";
    renderOrders();
  });

  document.getElementById("btn_ord_show_all")?.addEventListener("click", () => {
    viewMode = "ALL";
    if (hint) hint.textContent = "All orders loaded (Active + Inactive). Use search/month to filter.";
    renderOrders();
  });

  searchInp?.addEventListener("input", () => renderOrders());
  monthSel?.addEventListener("change", () => renderOrders());

  // client dropdown autofill (readonly)
  document.getElementById("ord_client_pick")?.addEventListener("change", (e) => {
    const sel = e.target;
    const opt = sel?.selectedOptions?.[0];
    const name = opt?.getAttribute("data-name") || "";
    const phone = opt?.getAttribute("data-phone") || "";
    document.getElementById("ord_client_name").value = name || "";
    document.getElementById("ord_client_phone").value = phone || "";
  });

  // add order (enforce required fields)
  document.getElementById("btn_ord_add")?.addEventListener("click", async () => {
    if (!canAddEdit) return;

    const btn = document.getElementById("btn_ord_add");
    const unlock = lockButton(btn, "Saving...");

    try {
      const sel = document.getElementById("ord_client_pick");
      const client_id = String(sel?.value || "").trim();
      const opt = sel?.selectedOptions?.[0];

      const client_name = String(opt?.getAttribute("data-name") || "").trim();
      const client_phone = String(opt?.getAttribute("data-phone") || "").trim();

      const venue = (document.getElementById("ord_venue")?.value || "").trim();
      const details = (document.getElementById("ord_details")?.value || "").trim();

      const setup_date = (document.getElementById("ord_setup")?.value || "").trim();
      const start_date = (document.getElementById("ord_start")?.value || "").trim();
      const end_date = (document.getElementById("ord_end")?.value || "").trim();

      if (!client_id) return alert("Client is required");
      if (!client_name || !client_phone) return alert("Selected client data missing (check clients sheet)");
      if (!venue) return alert("Venue is required");
      if (!setup_date || !start_date || !end_date) return alert("Setup, start and end dates are required");
      if (end_date < start_date) return alert("End date cannot be before start date");
      if (setup_date > start_date) return alert("Setup date cannot be after start date");

      const r = await api({
        action: "addOrder",
        client_id,
        client_name,
        client_phone,
        venue,
        details,
        setup_date,
        start_date,
        end_date
      });
      if (r && r.error) return alert(String(r.error));

      alert("Order created");
      loadSection("orders");
    } finally {
      setTimeout(unlock, 450);
    }
  });

// --- LED CALCULATOR EVENTS START ---
(function initLedCalc() {
  const wEl = document.getElementById("led_w_ft");
  const hEl = document.getElementById("led_h_ft");
  const outEl = document.getElementById("led_calc_out");
  const availOut = document.getElementById("led_avail_out");
  const btnAvail = document.getElementById("btn_check_led_avail");
  const block = document.getElementById("led_calc_block");

  if (!wEl || !hEl) return;

  function computeLive() {
    availOut.innerHTML = "";
    const w = Number(wEl.value || 0);
    const h = Number(hEl.value || 0);
    if (!w || !h || w <= 0 || h <= 0) {
      outEl.innerHTML = "";
      return null;
    }
    const r = calcLedWall(w, h);
    outEl.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
          <div>Layout: <b>${r.W} × ${r.H}</b></div>
          <div>Cabinets: <b>${r.neededCabinets}</b></div>
          <div style="grid-column: span 2; border-top:1px solid #ddd; margin-top:4px; padding-top:4px;">
            Carry: <b>${r.petiCarry} Peti</b> (${r.carryCabinets} cabs)
          </div>
        </div>
      `;
    if (block) {
      block.dataset.carryCabinets = r.carryCabinets;
      block.dataset.petiCarry = r.petiCarry;
    }
    return r;
  }

  ["input", "change"].forEach(evt => {
    wEl.addEventListener(evt, computeLive);
    hEl.addEventListener(evt, computeLive);
  });

  btnAvail?.addEventListener("click", async (e) => {
    e.preventDefault();
    const r = computeLive();
    if (!r) return alert("Enter width and height first");

    // ✅ ROBUST ORDER ID CHECK
    // Looks in the "Plan Items" span first, then the "Invoice" span, then the "Order Picker"
    const order_id = (
      document.getElementById("inv_order_id")?.textContent || 
      document.getElementById("ord_order_id")?.textContent || 
      document.getElementById("inv_order_pick")?.value || 
      ""
    ).trim();

    const setupDate = document.getElementById("ord_setup")?.value || document.getElementById("inv_setup")?.value;
    const startDate = document.getElementById("ord_start")?.value || document.getElementById("inv_start")?.value;
    const endDate   = document.getElementById("ord_end")?.value || document.getElementById("inv_end")?.value;

    if (!setupDate || !endDate) return alert("Select Order Dates first.");

    btnAvail.disabled = true;
    const originalText = btnAvail.textContent;
    btnAvail.textContent = "Checking Inventory...";

    try {
      const resp = await api({
        action: "listAvailableInventory",
        order_id: order_id, 
        setup_date: setupDate,
        start_date: startDate,
        end_date: endDate
      });

      if (!Array.isArray(resp)) {
        availOut.innerHTML = `<div style="color:#b00; font-size:12px;">Error checking availability.</div>`;
        return;
      }

      // ⚠️ IMPORTANT: Ensure LED_CABINET_ITEM_ID is defined globally or at the top of accounting.js
      const cabinetItem = resp.find(x => String(x.item_id).trim() === LED_CABINET_ITEM_ID);

      if (cabinetItem) {
        const avail = Number(cabinetItem.available_qty || 0);
        const needed = r.carryCabinets;
        const isEnough = avail >= needed;

        availOut.innerHTML = `
          <div style="color:${isEnough ? 'green' : 'red'}; font-weight:bold; margin-top:5px;">
            ${isEnough ? '✅ Stock Available' : '❌ Shortage'} (${avail} free)
          </div>
          <div style="font-size:10px; color:#666;">Range: ${setupDate} to ${endDate}</div>
        `;

        if (isEnough) {
          // ✅ TARGETING THE RIGHT INPUT
          // We look for the input in the "Plan Items" table that matches our LED cabinet ID
          const rowInput = document.querySelector(`input[data-item="${LED_CABINET_ITEM_ID}"]`);
          if (rowInput) {
            rowInput.value = needed;
            rowInput.style.border = "2px solid green";
            rowInput.style.backgroundColor = "#e6f4ea";
            
            // Auto-trigger change event if you have other live listeners
            rowInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                rowInput.style.backgroundColor = "";
                rowInput.style.border = "";
            }, 2000);
          } else {
            availOut.innerHTML += `<div style="font-size:11px; color:#666;">⚠️ Note: Item available, but not found in the current planning table.</div>`;
          }
        }
      } else {
        availOut.innerHTML = `<div style="color:red; font-size:12px;">Item ${LED_CABINET_ITEM_ID} not found in Inventory.</div>`;
      }
    } catch (err) {
      console.error(err);
      availOut.innerHTML = `<div style="color:red;">Error: ${err.message}</div>`;
    } finally {
      btnAvail.disabled = false;
      btnAvail.textContent = originalText;
    }
  });
})();
// --- LED CALCULATOR EVENTS END ---
 

 
  
  // export CSV
  document.getElementById("btn_ord_export")?.addEventListener("click", () => {
    if (!isSuper) return;
    if (!viewMode) return alert("Click Show Active Summary or Show Full List first.");
    if (!Array.isArray(lastShown) || !lastShown.length) return alert("No orders to export.");

    const header = [
      "order_id","client_id","client_name","client_phone","venue","details",
      "setup_date","start_date","end_date","month","status","added_by","created_at","updated_at","rowIndex"
    ];
    const lines = [header.join(",")];

    lastShown.forEach(o => {
      const cols = [
        String(o.order_id || ""),
        String(o.client_id || ""),
        String(o.client_name || ""),
        String(o.client_phone || ""),
        String(o.venue || ""),
        String(o.details || ""),
        String(prettyISODate(o.setup_date || "")),
        String(prettyISODate(o.start_date || "")),
        String(prettyISODate(o.end_date || "")),
        String(prettyMonth(o.month || "")),
        String(o.status || ""),
        String(o.added_by || ""),
        String(o.created_at || ""),
        String(o.updated_at || ""),
        String(o.rowIndex || "")
      ].map(v => csvEscape(v));
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const a = document.createElement("a");
    const company = (localStorage.getItem("company") || "company").replace(/\s+/g, "_");
    const mode = (viewMode === "ACTIVE" ? "ACTIVE" : "ALL");
    const file = `orders_${company}_${mode}_${todayISO()}.csv`.replace(/[^\w\-\.]/g, "_");

    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  });

  return;
}
// ---- orders module ends here

    // ----- inventoryTxn starts here

/* ==========================================================
   ✅ INVENTORY OUT / RETURN / LOST / DAMAGED (NEW UI)
   - Staff: OUT/RETURN + can record LOST/DAMAGED (PENDING)
   - Owner/Superadmin: can ALLOW/REJECT pending LOST/DAMAGED
   - Print Planned Item List (Staff also)
   ========================================================== */
if (type === "inventoryTxn") {
  content.innerHTML = `<div class="card"><h2>Inventory OUT/RETURN</h2><p>Loading…</p></div>`;

  const isAdmin = (role === "owner" || role === "superadmin");

  // Load orders + for admin load pending adjustments
  const [ordersRes, pendingRes] = await Promise.all([
    api({ action: "listOrders", month: "" }),
    isAdmin ? api({ action: "listPendingInvAdjust" }) : Promise.resolve([])
  ]);

  const ordersAll = Array.isArray(ordersRes) ? ordersRes : [];
  const ordersActive = ordersAll.filter(o => String(o.status || "ACTIVE").toUpperCase() === "ACTIVE");

  const pending = Array.isArray(pendingRes) ? pendingRes : [];

  content.innerHTML = `
    <div class="card">
      <h2>Inventory OUT / RETURN</h2>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin-top:0;">Select Order</h3>

        <label>Order</label>
        <select id="inv_ord_pick">
          <option value="">-- Select order --</option>
          ${ordersActive.map(o => `
            <option value="${escapeAttr(String(o.order_id || ""))}"
              data-setup="${escapeAttr(String(o.setup_date || ""))}"
              data-start="${escapeAttr(String(o.start_date || ""))}"
              data-end="${escapeAttr(String(o.end_date || ""))}"
              data-client="${escapeAttr(String(o.client_name || ""))}"
              data-phone="${escapeAttr(String(o.client_phone || ""))}"
              data-venue="${escapeAttr(String(o.venue || ""))}">
              ${escapeHtml(o.order_id || "")} • ${escapeHtml(o.client_name || "")} • ${escapeHtml(prettyISODate(o.start_date || ""))}
            </option>
          `).join("")}
        </select>

        <div id="inv_ord_meta" class="dashSmall" style="margin-top:10px;"></div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          
          <button class="primary" id="btn_inv_print" style="background:#1fa971;">🖨 Print Planned List</button>
        </div>

        <div id="inv_items_box" style="margin-top:12px;"></div>
      </div>

      ${
        isAdmin ? `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin-top:0;">Pending LOST / DAMAGED (Approval Needed)</h3>
          <div id="inv_pending_box"></div>
        </div>
        ` : ``
      }
    </div>
  `;

  const sel = document.getElementById("inv_ord_pick");
  const meta = document.getElementById("inv_ord_meta");
  const box = document.getElementById("inv_items_box");

  function selectedOrderObj(){
    const opt = sel?.selectedOptions?.[0];
    if (!opt) return null;
    const order_id = String(opt.value || "").trim();
    if (!order_id) return null;

    const setup_date = String(opt.getAttribute("data-setup") || "").trim();
    const start_date = String(opt.getAttribute("data-start") || "").trim();
    const end_date = String(opt.getAttribute("data-end") || "").trim();

    return {
      order_id,
      setup_date,
      start_date,
      end_date,
      client_name: String(opt.getAttribute("data-client") || ""),
      client_phone: String(opt.getAttribute("data-phone") || ""),
      venue: String(opt.getAttribute("data-venue") || "")
    };
  }

  function renderMeta(o){
    if (!meta) return;
    if (!o) { meta.innerHTML = ""; return; }
    meta.innerHTML = `
      <div><b>Client:</b> ${escapeHtml(o.client_name)} • ${escapeHtml(o.client_phone)}</div>
      <div><b>Venue:</b> ${escapeHtml(o.venue)}</div>
      <div><b>Dates:</b> Setup ${escapeHtml(prettyISODate(o.setup_date))} • ${escapeHtml(prettyISODate(o.start_date))} → ${escapeHtml(prettyISODate(o.end_date))}</div>
      <div class="dashSmall" style="margin-top:6px;">Note: LOST/DAMAGED will be <b>PENDING</b> until Owner/Superadmin allows it.</div>
    `;
  }

  sel?.addEventListener("change", async () => {
  const o = selectedOrderObj();
  renderMeta(o);
  if (o) await loadOrderItemsUI();
});

  renderMeta(selectedOrderObj());

  async function loadOrderItemsUI(){
    const o = selectedOrderObj();
    if (!o) return alert("Select an order first.");
    if (!o.setup_date || !o.start_date || !o.end_date) return alert("Order dates missing.");

    if (box) box.innerHTML = `<p>Loading items…</p>`;

    // 1) planned list
    const plannedRes = await api({ action: "listOrderItems", order_id: o.order_id });
    const planned = Array.isArray(plannedRes) ? plannedRes : [];

    if (!planned.length) {
      if (box) box.innerHTML = `<p class="dashSmall">No planned items found in this order.</p>`;
      return;
    }

    // 2) availability for range (IMPORTANT: backend expects setup_date/start_date/end_date)
    const availRes = await api({
      action: "listAvailableInventory",
      setup_date: o.setup_date,
      start_date: o.start_date,
      end_date: o.end_date
    });

    console.log("AVAIL RAW:", availRes);

    if (availRes && availRes.error) {
      if (box) box.innerHTML = `<p class="dashSmall">Availability error: ${escapeHtml(String(availRes.error))}</p>`;
      return;
    }

    const availList = Array.isArray(availRes) ? availRes : [];

    // 3) order issue summary (OUT/RETURN/LOST/DAMAGED/outstanding)
    const sumRes = await api({ action: "getOrderIssueSummary", order_id: o.order_id });
    const sums = Array.isArray(sumRes) ? sumRes : [];
    const sumMap = {};
    sums.forEach(s => { sumMap[String(s.item_id||"").trim()] = s; });

    // Build rows ONLY from planned list (staff cannot change item list)
    const rows = planned
      .filter(p => String(p.status || "ACTIVE").toUpperCase() === "ACTIVE")
      .map(p => {
        const item_id = String(p.item_id || "").trim();
        const planned_qty = Number(p.planned_qty || 0);
        const item_name = String(p.item_name || "");
        const avail = availList.find(a => String(a.item_id||"").trim() === item_id);

        const total_qty = Number(avail?.total_qty || 0);
        const available_qty = Number(avail?.available_qty || 0);

        const s = sumMap[item_id] || { out:0, ret:0, lost:0, damaged:0, outstanding:0 };

        return {
          item_id, item_name, planned_qty,
          total_qty, available_qty,
          out: Number(s.out||0),
          ret: Number(s.ret||0),
          lost: Number(s.lost||0),
          damaged: Number(s.damaged||0),
          outstanding: Number(s.outstanding||0)
        };
      });

    const hasAnyOut = rows.some(r => r.out > 0);

if (!hasAnyOut) {

  // FIRST STATE — Only OUT
  box.innerHTML = `
    <div class="invTable">
  ${rows.map(r => `
    <div class="invRow">
      <div class="invTitle">${escapeHtml(r.item_name)}</div>

      <div class="invMeta">
        <span>Planned: <b>${r.planned_qty}</b></span>
        <span>Available: <b>${r.available_qty}</b></span>
      </div>

      <div class="invInput">
        <label>OUT</label>
        <input type="number"
               inputmode="numeric"
               min="0"
               max="${Math.min(r.available_qty, r.planned_qty + 10)}"
               data-out-item="${escapeAttr(r.item_id)}">
      </div>
    </div>
  `).join("")}
</div>

<button class="primary" id="btn_save_out" style="width:100%;margin-top:14px;">
  Save OUT
</button>

  `;

document.getElementById("btn_save_out")?.addEventListener("click", async (e) => {

  const btn = e.currentTarget;
  if (btn.dataset.loading === "1") return; // 🚫 prevent double click

  btn.dataset.loading = "1";
  const unlock = lockButton(btn, "Saving...");

  try {
    const inputs = box.querySelectorAll("input[data-out-item]");

    for (const inp of inputs) {
      const item_id = inp.getAttribute("data-out-item");
      const qty = Number(inp.value || 0);
      if (qty <= 0) continue;

      const row = rows.find(r => r.item_id === item_id);
      const maxAllowed = Math.min(row.available_qty, row.planned_qty + 10);

      if (qty > maxAllowed) {
        throw new Error(`Max allowed for ${row.item_name} is ${maxAllowed}`);
      }

      const rSave = await api({
        action: "addInventoryTxn",
        order_id: o.order_id,
        item_id,
        item_name: row.item_name,
        txn_type: "OUT",
        qty,
        start_date: o.setup_date,
        end_date: o.end_date
      });

      if (rSave && rSave.error) {
        throw new Error(`${row.item_name}: ${rSave.error}`);
      }
    }

    alert("OUT saved");
    await loadOrderItemsUI();

  } catch (err) {
    alert(String(err.message || err));
  } finally {
    btn.dataset.loading = "0";
    setTimeout(unlock, 300);
  }
});



  return;
}
// SECOND STATE — OUT already exists

box.innerHTML = `
  <div class="invTable">
  ${rows.map(r => `
    <div class="invRow">
      <div class="invTitle">${escapeHtml(r.item_name)}</div>

      <div class="invMeta">
        <span>Planned: <b>${r.planned_qty}</b></span>
        <span>OUT: <b>${r.out}</b></span>
      </div>

      <div class="invGrid">
        <div>
          <label>Return</label>
          <input type="number" inputmode="numeric"
            min="0"
            max="${r.outstanding}"
            data-ret-item="${escapeAttr(r.item_id)}">
        </div>

        <div>
          <label>Lost</label>
          <input type="number" inputmode="numeric"
            min="0"
            max="${r.outstanding}"
            data-lost-item="${escapeAttr(r.item_id)}">
        </div>

        <div>
          <label>Damaged</label>
          <input type="number" inputmode="numeric"
            min="0"
            max="${r.outstanding}"
            data-dam-item="${escapeAttr(r.item_id)}">
        </div>
      </div>
    </div>
  `).join("")}
</div>

<button class="primary" id="btn_save_all" style="width:100%;margin-top:14px;">
  Save Return / Lost / Damaged
</button>

  <div class="card" style="margin-top:12px;">
    <h3 style="margin-top:0;">Lost / Damaged Summary</h3>
    ${
      rows.filter(x => x.lost > 0 || x.damaged > 0).length
        ? `<ul style="margin:0;padding-left:18px;">
            ${rows.filter(x => x.lost>0 || x.damaged>0).map(x => `
              <li>
                ${escapeHtml(x.item_name)} —
                Lost: <b>${x.lost}</b>, Damaged: <b>${x.damaged}</b>
              </li>
            `).join("")}
          </ul>`
        : `<p class="dashSmall" style="margin:0;">No lost/damaged recorded for this order.</p>`
    }
  </div>
`;
document.getElementById("btn_save_all")?.addEventListener("click", async () => {
  const o = selectedOrderObj();
  if (!o) return alert("Select an order first.");

  const retInputs = box.querySelectorAll("input[data-ret-item]");
  const lostInputs = box.querySelectorAll("input[data-lost-item]");
  const damInputs = box.querySelectorAll("input[data-dam-item]");

  // helper to save one type
  async function saveType(inputs, txn_type) {
    for (const inp of inputs) {
      const attr =
  (txn_type === "RETURN") ? "data-ret-item" :
  (txn_type === "LOST") ? "data-lost-item" :
  "data-dam-item";

const item_id = String(inp.getAttribute(attr) || "").trim();

      const qty = Number(inp.value || 0);
      if (!(qty > 0)) continue;

      const row = rows.find(r => r.item_id === item_id);
      if (!row) continue;

      const maxAllowed = Number(row.outstanding || 0);
      if (qty > maxAllowed) {
        throw new Error(`Max allowed for ${row.item_name} is ${maxAllowed}`);
      }

      const rSave = await api({
        action: "addInventoryTxn",
        order_id: o.order_id,
        item_id,
        item_name: row.item_name,     // ✅ important
        txn_type: txn_type,           // RETURN / LOST / DAMAGED
        qty,
        start_date: o.setup_date,     // ✅ keep date range same as OUT
        end_date: o.end_date
      });

      if (rSave && rSave.error) {
        throw new Error(`${row.item_name}: ${rSave.error}`);
      }

      // clear input after successful save
      inp.value = "";
    }
  }

  const btn = document.getElementById("btn_save_all");
  const unlock = lockButton(btn, "Saving...");

  try {
    await saveType(retInputs, "RETURN");
    await saveType(lostInputs, "LOST");
    await saveType(damInputs, "DAMAGED");

    alert("Saved. (LOST/DAMAGED will be PENDING for approval)");
    await loadOrderItemsUI();
    if (isAdmin) await renderPendingBox();
  } catch (err) {
    alert(String(err.message || err));
  } finally {
    setTimeout(unlock, 350);
  }
});

    

    // bind mini action buttons
   
   /* box.querySelectorAll("button[data-inv-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const txn_type = btn.getAttribute("data-type");
        const item_id = btn.getAttribute("data-item");
        const item_name = btn.getAttribute("data-name");
        const max = Number(btn.getAttribute("data-max") || 0);
        const inpId = btn.getAttribute("data-inp");
        const inp = document.getElementById(inpId);

        const qty = Number(inp?.value || 0);
        if (!(qty > 0)) return alert("Enter qty > 0");
        if (qty > max) return alert(`Qty too high. Max allowed: ${max}`);

        const unlock = lockButton(btn, "Saving...");
        try {
          const r = await api({
            action: "addInventoryTxn",
            order_id: o.order_id,
            item_id,
            item_name,
            txn_type,
            qty
          });
          if (r && r.error) return alert(String(r.error));

          if (txn_type === "LOST" || txn_type === "DAMAGED") {
            alert(`${txn_type} recorded as PENDING for approval.`);
          } else {
            alert(`${txn_type} saved.`);
          }

          await loadOrderItemsUI();
          if (isAdmin) await renderPendingBox(); // refresh approvals
        } finally {
          setTimeout(unlock, 350);
        }
      });
    }); */

    
  }

  function actionMini(r, o, type, max){
    const safe = String(type).toUpperCase();
    const id = `inv_${safe}_${r.item_id}`;
    return `
      <div class="card" style="padding:8px 10px;display:flex;gap:8px;align-items:center;">
        <b style="min-width:70px;">${escapeHtml(safe)}</b>
        <input id="${escapeAttr(id)}"
               type="number"
               inputmode="numeric"
               style="width:90px;"
               min="0"
               placeholder="Qty"
               />
        <button class="userToggleBtn"
                data-inv-act="1"
                data-type="${escapeAttr(safe)}"
                data-item="${escapeAttr(r.item_id)}"
                data-name="${escapeAttr(r.item_name)}"
                data-max="${escapeAttr(String(max))}"
                data-inp="${escapeAttr(id)}">
          Save
        </button>
        <span class="dashSmall">max ${escapeHtml(String(max))}</span>
      </div>
    `;
  }

  // Print Planned List (staff allowed)
  document.getElementById("btn_inv_print")?.addEventListener("click", (e) => {
  e.preventDefault();
const BG_URL = "https://mojosyscom-lang.github.io/shiv-video-vision-app/assets/print-bg.png";
  const o = selectedOrderObj();
  if (!o) return alert("Select an order first.");

  // ✅ IMPORTANT (iPhone): open window immediately on click (before any await)
  const w = window.open("", "_blank");
  if (!w) return alert("Popup blocked. Please allow popups in Safari.");

  // show instant loading
  w.document.open();
  w.document.write(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial;padding:16px;">Loading…</body></html>`);
  w.document.close();

  (async () => {
    const plannedRes = await api({ action: "listOrderItems", order_id: o.order_id });
    const planned = Array.isArray(plannedRes) ? plannedRes : [];
    const rows = planned.filter(p => String(p.status || "ACTIVE").toUpperCase() === "ACTIVE");
     

    if (!rows.length) {
      w.document.body.innerHTML = `<p>No planned items found.</p>`;
      return;
    }

    // ✅ Better looking print design (you can edit styles here)
    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Planned Items - ${escapeHtml(o.order_id)}</title>
          <style>
  /* A4 page */
  @page { size: A4; margin: 0; }

  html, body { height: 100%; }
  body{
    margin:0;
    font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    color:#111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Background image as full page */
  .printBg{
    position: fixed;
    inset: 0;
    width: 210mm;
    height: 297mm;
    object-fit: cover;   /* fill full A4 */
    z-index: -1;
  }

  /* Page content area */
  .page{
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 18mm 14mm;  /* adjust spacing on top of background */
  }

  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
  h2{margin:0;font-size:18px;}
  .meta{margin-top:8px;font-size:12px;line-height:1.4;color:#333;}
  .pill{display:inline-block;padding:4px 8px;border:1px solid #ddd;border-radius:999px;font-size:12px;background:rgba(255,255,255,0.75);}
  table{width:100%;border-collapse:collapse;margin-top:14px;background:rgba(255,255,255,0.85);}
  th,td{border:1px solid #ddd;padding:10px;font-size:12px;}
  th{background:rgba(245,245,245,0.95);text-align:left;}
  td.qty, th.qty{text-align:right; width:90px;}
  .footer{margin-top:14px;font-size:11px;color:#666;}

  @media print{
    .noPrint{display:none;}
    .page{page-break-after: always;}
  }
</style>

        </head>
        <body>
  <img class="printBg" src="${BG_URL}" alt="">
  <div class="page">
    <div class="top">

            <div><br><br><br><br><br><br>
              <h2>Planned Item List</h2>
              <div class="meta">
                <div><b>Order:</b> ${escapeHtml(o.order_id)}</div>
                <div><b>Client:</b> ${escapeHtml(o.client_name)} • ${escapeHtml(o.client_phone)}</div>
                <div><b>Venue:</b> ${escapeHtml(o.venue)}</div>
                <div><b>Dates:</b> Setup ${escapeHtml(prettyISODate(o.setup_date))} • ${escapeHtml(prettyISODate(o.start_date))} → ${escapeHtml(prettyISODate(o.end_date))}</div>
              </div>
            </div>
            <div class="pill">Total Items: <b>${rows.length}</b></div>
          </div>

          <table>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="qty">Planned Qty</th>
            </tr>
            ${rows.map((p, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(p.item_name || p.item_id)}</td>
                <td class="qty">${Number(p.planned_qty || 0)}</td>
              </tr>
            `).join("")}
          </table>

          <div class="footer noPrint">
            If print dialog doesn’t open on iPhone: use Share → Print.
          </div>
</div>

          <script>
            // iOS is picky. Delay helps.
            setTimeout(() => {
              try { window.print(); } catch(e) {}
            }, 300);
          </script>
        </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
  })();
});


  /* 
  // Load Items
  document.getElementById("btn_inv_load")?.addEventListener("click", async () => {
    await loadOrderItemsUI();
  });
  */

  // --- Admin approvals UI
  async function renderPendingBox(){
    if (!isAdmin) return;
    const box2 = document.getElementById("inv_pending_box");
    if (!box2) return;

    const rows = await api({ action: "listPendingInvAdjust" });
    const pending = Array.isArray(rows) ? rows : [];
    if (!pending.length) {
      box2.innerHTML = `<p class="dashSmall">No pending LOST/DAMAGED.</p>`;
      return;
    }

    box2.innerHTML = `
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th align="left">Txn</th>
            <th align="left">Order</th>
            <th align="left">Item</th>
            <th align="right">Qty</th>
            <th align="left">Type</th>
            <th align="left">By</th>
            <th align="right">Actions</th>
          </tr>
          ${pending.map(p => `
            <tr style="border-top:1px solid #eee;">
              <td>${escapeHtml(p.txn_id || "")}</td>
              <td>${escapeHtml(p.order_id || "")}</td>
              <td>${escapeHtml(p.item_name || "")}<br><span class="dashSmall">${escapeHtml(p.item_id || "")}</span></td>
              <td align="right"><b>${Number(p.qty||0)}</b></td>
              <td>${escapeHtml(p.txn_type || "")}</td>
              <td>${escapeHtml(p.added_by || "")}</td>
              <td align="right" style="white-space:nowrap;">
                <button class="userToggleBtn" data-decide="1" data-id="${escapeAttr(p.txn_id)}" data-decision="ALLOW">ALLOW</button>
                <button class="userToggleBtn" data-decide="1" data-id="${escapeAttr(p.txn_id)}" data-decision="REJECT">REJECT</button>
              </td>
            </tr>
          `).join("")}
        </table>
      </div>
      <p class="dashSmall" style="margin-top:10px;">
        ALLOW will reduce inventory_master total_qty. REJECT will not.
      </p>
    `;

    box2.querySelectorAll("button[data-decide]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const txn_id = btn.getAttribute("data-id");
        const decision = btn.getAttribute("data-decision");
        if (!txn_id || !decision) return;

        if (!confirm(`${decision} this adjustment?`)) return;

        const unlock = lockButton(btn, "Saving...");
        try {
          const r = await api({ action: "decideInvAdjust", txn_id, decision });
          if (r && r.error) return alert(String(r.error));
          alert(`Saved: ${String(r.status || decision)}`);
          await renderPendingBox();
          // also refresh current order display if loaded
          if (selectedOrderObj()?.order_id) await loadOrderItemsUI();
        } finally {
          setTimeout(unlock, 350);
        }
      });
    });
  }

  if (isAdmin) renderPendingBox();

  return;
}



    
    // ----- inventoryTxn ends here

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
        <input id="exp_amount" type="number" inputmode="decimal" pattern="[0-9]*"  placeholder="Amount">
        <label>Date</label>
        <input id="exp_date" type="date" value="${todayISO()}" max="${todayISO()}">
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
              <tr class="expRow"
    data-exp-type="${escapeAttr(String(cat || ""))}"
    data-exp-desc="${escapeAttr(String(desc || ""))}"
    data-exp-row="${escapeAttr(String(rowId || ""))}"
    style="border-top:1px solid #eee;">

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

            const oldDate = prettyISODate(cur.date || todayISO());
            const newDate = prompt("Date (YYYY-MM-DD):", oldDate);
            if (newDate === null) return;
             if (newDate > todayISO()) return alert("Future dates are not allowed");

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
                date: newDate,
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



   /* === STEP 5: Activity Jump Auto Highlight (Expenses) === */
(function applyActivityJump_Expenses() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (!jump || jump.type !== "expense" || !jump.name) return;

    const target = String(jump.name).trim().toLowerCase();

    // Match by Type OR Description contains target
    const rows = Array.from(document.querySelectorAll(".expRow"));
    let el = rows.find(r =>
      String(r.getAttribute("data-exp-type") || "").toLowerCase() === target
    );

    if (!el) {
      el = rows.find(r =>
        String(r.getAttribute("data-exp-desc") || "").toLowerCase().includes(target) ||
        String(r.getAttribute("data-exp-type") || "").toLowerCase().includes(target)
      );
    }

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #1fa971";
      el.style.borderRadius = "8px";
      el.style.background = "#e6f4ea";
      setTimeout(() => {
        el.style.outline = "";
        el.style.borderRadius = "";
        el.style.background = "";
      }, 1600);
    }

    // ✅ IMPORTANT: clear after highlight so it doesn't repeat
    sessionStorage.removeItem("activity_jump");
  } catch (e) {}
})();



      
    } finally {
      setTimeout(unlock, 350);
    }
  }

  function enableAndLoad() {
    expSummaryEnabled = true;
    loadExpenseSummary();
  }

     /* Auto-load if coming from activity jump */
 (function autoLoadFromActivity() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (jump?.type === "expense") {
      expSummaryEnabled = true;
      loadExpenseSummary();
    }
  } catch (e) {}
})();



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
    /* if something goes wrong this is culprit remove the start and dash */

// ---- expenses updates end here 




// salary section starts here
    
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
      /* === STEP 5: Auto-load Salary summary if coming from dashboard activity === */
(function autoLoadFromActivity_Salary() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
    if (jump?.type === "salary" || jump?.type === "worker_salary") {
      // optional: if activity has month info later, we can set salMonth here
      loadSalarySummary();
    }
  } catch (e) {}
})();
      
//ends here
      
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


    // salary section ends here


    // user management starts here
    
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
     Actions Functions async functions
  ========================== */
async function isDuplicateUpad({ company, date, worker, amount, month }) {
  const rows = await api({ action: "listUpad", month, worker });
  if (!Array.isArray(rows)) return false;

  return rows.some(r => {
    const rCompany = String((r.company ?? r[0] ?? "")).trim();
    const rDate    = prettyISODate(r.date || r[1] || "");
    const rWorker  = String(r.worker || r[2] || "").trim();
    const rAmt     = Number(r.amount || r[3] || 0);
    const rMonth   = normMonthLabel(prettyMonth(r.month || r[4] || ""));

    return (
      rCompany === String(company || "").trim() &&
      rDate === prettyISODate(date) &&
      rWorker === String(worker || "").trim() &&
      rAmt === Number(amount) &&
      rMonth === normMonthLabel(month)
    );
  });
}


 async function addUpad() {
  const btn = document.getElementById("btn_upad");
  const unlock = lockButton(btn, "Saving...");

  try {
    const company = localStorage.getItem("company") || "";
    const worker = document.getElementById("upad_worker").value.trim();
    const amount = Number(document.getElementById("upad_amount").value || 0);

    if (!worker || !amount) {
      alert("Enter worker and amount");
      return;
    }

    const selectedDate = document.getElementById("upad_date").value || todayISO();
    if (selectedDate > todayISO()) {
      alert("Future dates are not allowed!");
      return;
    }

    const month = monthLabelFromAny(selectedDate);

    const duplicate = await isDuplicateUpad({
      company,
      date: selectedDate,
      worker,
      amount,
      month
    });

    if (duplicate) {
      const proceed = confirm("⚠ Same UPAD entry already exists.\nDo you want to add anyway?");
      if (!proceed) return;
    }
const description = String(document.getElementById("upad_desc")?.value || "").trim();
    const r = await apiSafe({
      action: "addUpad",
      company,               // keep if your backend stores company
      date: selectedDate,
      worker,
      amount,
      month,
      description
    });

    if (r && r.queued) alert("Saved offline. Will sync when online.");
    else alert("Upad added");

    document.getElementById("upad_amount").value = "";
    document.getElementById("upad_desc").value = "";

    invalidateCache(["upadMeta", "monthsMerged"]);
  } finally {
    setTimeout(unlock, 600);
  }
}

async function isDuplicateExpense({ company, date, category, description, amount, month }) {
  const rows = await api({ action: "listExpenses", month, category });
  if (!Array.isArray(rows)) return false;

  const descNorm = String(description || "").trim();

  return rows.some(r => {
    const rCompany = String(r.company || "").trim();
    const rDate    = prettyISODate(r.date || "");
    const rCat     = String(r.category || "").trim();
    const rDesc    = String((r.description ?? r.desc ?? "")).trim();
    const rAmt     = Number(r.amount || 0);
    const rMonth   = normMonthLabel(prettyMonth(r.month || ""));

    return (
      rCompany === String(company || "").trim() &&
      rDate === prettyISODate(date) &&
      rCat === String(category || "").trim() &&
      rDesc === descNorm &&
      rAmt === Number(amount) &&
      rMonth === normMonthLabel(month)
    );
  });
}





  
  async function addExpense() {
  const btn = document.getElementById("btn_exp");
  const unlock = lockButton(btn, "Saving...");

  try {
    const company = localStorage.getItem("company") || "";
    const category = document.getElementById("exp_category").value;
    const desc = document.getElementById("exp_desc").value.trim();
    const amount = Number(document.getElementById("exp_amount").value || 0);

    if (!desc || !amount) {
      alert("Enter description and amount");
      return;
    }

    const selectedDate = document.getElementById("exp_date").value || todayISO();
    if (selectedDate > todayISO()) {
      alert("Future dates are not allowed");
      return;
    }

    const month = monthLabelFromAny(selectedDate);

    const duplicate = await isDuplicateExpense({
      company,
      date: selectedDate,
      category,
      description: desc,
      amount,
      month
    });

    if (duplicate) {
      const proceed = confirm("⚠ Same EXPENSE entry already exists.\nDo you want to add anyway?");
      if (!proceed) return;
    }

    const r = await apiSafe({
      action: "addExpense",
      company,              // keep if your backend stores company
      date: selectedDate,
      month,                // include if your sheet expects it
      category,
      description: desc,    // new key
      desc,                 // old key (compat)
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
              <tr class="salRow" data-sal-worker="${escapeAttr(String(r.worker || ""))}">

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

/* === STEP 5: Activity Jump Auto Highlight (Salary) === */
(function applyActivityJump_Salary() {
  const raw = sessionStorage.getItem("activity_jump");
  if (!raw) return;

  try {
    const jump = JSON.parse(raw);
   if (!jump || !jump.name) return;
if (jump.type !== "salary" && jump.type !== "worker_salary") return;


    const target = String(jump.name).trim().toLowerCase();

    const rowEls = Array.from(document.querySelectorAll(".salRow"));
const el = rowEls.find(r =>

      String(r.getAttribute("data-sal-worker") || "").toLowerCase() === target
    );

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #1fa971";
      el.style.borderRadius = "8px";
      el.style.background = "#e6f4ea";
      setTimeout(() => {
        el.style.outline = "";
        el.style.borderRadius = "";
        el.style.background = "";
      }, 1600);
    }

    sessionStorage.removeItem("activity_jump");
  } catch (e) {}
})();

      
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

/**
 * Pattern: Submit handler with feedback logic
 */
/**
 * Updated to match the IDs in your Expenses Section:
 * exp_category, exp_desc, exp_amount, exp_date
 */
/* --- ATTACH TO WINDOW SO HTML BUTTON CAN SEE IT --- */
window.handleAddExpense = async function() {
  const btn = document.getElementById("btn_exp");
  
  // 1. Gather Data from the UI
  const category = document.getElementById("exp_category")?.value;
  const desc = document.getElementById("exp_desc")?.value.trim();
  const amount = document.getElementById("exp_amount")?.value;
  const dateInp = document.getElementById("exp_date")?.value;
  
  // Fallback to today if date input is missing
  const date = (dateInp && dateInp !== "") ? dateInp : todayISO();

  // 2. Initial Validation
  if (!desc || !amount) {
    alert("Please enter both Description and Amount.");
    return;
  }

  const payload = {
    action: "addExpenseWithCheckAction",
    date,
    category,
    description: desc,
    amount,
    forceSave: false // First attempt checks for duplicates
  };

  // 3. Trigger Async Flow
  const unlock = lockButton(btn, "Checking...");

  try {
    console.log("Checking for duplicates...");
    let r = await api(payload);

    // 🛡️ Duplicate Gatekeeper logic
    if (r && r.duplicate) {
      unlock(); // Release button so user can think
      
      const proceed = confirm("⚠️ Duplicate Found!\n\nAn entry with this Date, Type, and Amount already exists.\n\nDo you want to save it anyway?");
      
      if (!proceed) {
        console.log("User cancelled the duplicate save.");
        return; 
      }

      // Re-lock and send with forceSave: true
      lockButton(btn, "Saving anyway...");
      payload.forceSave = true;
      r = await api(payload);
    }

    // 4. Final Result Handling
    if (r && (r.success || r.ok)) {
      alert("Expense recorded successfully.");
      document.getElementById("exp_desc").value = "";
      document.getElementById("exp_amount").value = "";
      loadSection("expenses"); // Refresh the summary list
    } else if (r && r.error) {
      alert("Archive Error: " + r.error);
    }

  } catch (err) {
    console.error("Critical Failure in handleAddExpense:", err);
    alert("Connection Error: Check your internet and try again.");
  } finally {
    unlock();
  }
};

  /* ends here handle function*/

// print area for invoice section
// === GLOBAL PRINT AREA (OUTSIDE #content) ===
if (!document.getElementById("global_print_area")) {
  const gp = document.createElement("div");
  gp.id = "global_print_area";
  gp.style.display = "none";
  document.body.appendChild(gp);
}

// ===============================
// ✅ Upload helper (base64 → Apps Script)
// Usage: const res = await apiUploadBase64("uploadGSTBillFile", file);
// ===============================
async function apiUploadBase64(action, file, extraPayload = {}) {
  if (!file) throw new Error("Missing file");

  const file_b64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("File read failed"));
    r.onload = () => {
      const s = String(r.result || "");
      // r.result is like: data:image/png;base64,AAAA...
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.readAsDataURL(file);
  });

  const payload = {
    action,
    file_name: String(file.name || "upload"),
    mime_type: String(file.type || "application/octet-stream"),
    file_b64,
    ...extraPayload
  };

  return await api(payload);
}



