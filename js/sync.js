function updateNet() {
  const el = document.getElementById("netStatus");
  if (!el) return;
  el.innerText = navigator.onLine ? "🟢 Online" : "🔴 Offline";
}
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);
updateNet();

/*
  sync.js
  Handles offline-safe API calls for Shiv Video Vision
*/

const SYNC_QUEUE_KEY = "svv_sync_queue";

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
}

function enqueue(data) {
  const q = getQueue();
  q.push({ time: new Date().toISOString(), data });
  saveQueue(q);
}

async function apiSafe(data) {
  try {
    const res = await api(data);

    if (res && res.error) {
      const msg = String(res.error).toLowerCase();
      if (msg.includes("session") || msg.includes("login") || msg.includes("disabled") || msg.includes("revoked")) {
        return res; // don't queue
      }
      console.warn("API error (not queued):", res.error);
      return res;
    }

    return res;

  } catch (err) {
    console.warn("Offline or network error, queued:", data);
    enqueue(data);
    return { queued: true };
  }
}

async function processQueue() {
  const q = getQueue();
  if (!q.length) return;

  console.log("Syncing queued items:", q.length);

  const remaining = [];

  for (const item of q) {
    try {
      const res = await api(item.data);

      if (res && res.error) {
        console.warn("Sync failed:", res.error);
        remaining.push(item);
        break;
      }
    } catch (err) {
      remaining.push(item);
      break;
    }
  }

  saveQueue(remaining);
}

window.addEventListener("load", () => processQueue());
window.addEventListener("online", () => processQueue());
window.syncNow = processQueue;
