/* ------------------ Network Status ------------------ */
function updateNet() {
  const el = document.getElementById("netStatus");
  if (!el) return;
  el.innerText = navigator.onLine ? "🟢 Online" : "🔴 Offline";
}

/* ------------------ Sync Queue ------------------ */
const SYNC_QUEUE_KEY = "svv_sync_queue";

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
}

function updateQueueBadge() {
  const el = document.getElementById("syncCount");
  if (!el) return;
  const n = getQueue().length;
  el.innerText = n ? `⏳ ${n}` : "";
}

function enqueue(data) {
  const q = getQueue();
  q.push({ time: new Date().toISOString(), data });
  saveQueue(q);
  updateQueueBadge();
}

/* ------------------ Safe API Wrapper ------------------ */
/**
 * Use apiSafe for "ADD" actions (writes), so offline gets queued.
 * Do NOT use apiSafe for login or read actions like getUsers/getUpadMeta/getSalarySummary.
 */
async function apiSafe(data) {
  try {
    const res = await api(data);

    // If API explicitly failed, do not queue it
    if (res && res.error) {
      const msg = String(res.error).toLowerCase();

      // Auth/session/disabled should not be queued
      if (
        msg.includes("session") ||
        msg.includes("login") ||
        msg.includes("disabled") ||
        msg.includes("revoked")
      ) {
        return res;
      }

      console.warn("API error (not queued):", res.error);
      return res;
    }

    return res;
  } catch (err) {
    console.warn("Offline/network error → queued:", data);
    enqueue(data);
    return { queued: true };
  }
}

/* ------------------ Sync Processing ------------------ */
async function processQueue() {
  const q = getQueue();
  if (!q.length) {
    updateQueueBadge();
    return;
  }

  console.log("Syncing queued items:", q.length);

  const remaining = [];

  for (const item of q) {
    try {
      // IMPORTANT: Use api() (not apiSafe) to avoid re-queuing same item during sync
      const res = await api(item.data);

      if (res && res.error) {
        console.warn("Sync stopped (server error):", res.error);
        remaining.push(item);
        break;
      }
    } catch (err) {
      console.warn("Sync stopped (network error):", err);
      remaining.push(item);
      break;
    }
  }

  saveQueue(remaining);
  updateQueueBadge();
}

/* ------------------ Auto Triggers ------------------ */
window.addEventListener("online", () => {
  updateNet();
  processQueue();
});

window.addEventListener("offline", () => {
  updateNet();
});

window.addEventListener("load", () => {
  updateNet();
  updateQueueBadge();
  processQueue();
});

// Optional manual trigger from console: syncNow()
window.syncNow = processQueue;
