// 🔔 Firebase Service Worker (Compat version)

// IMPORTANT: Use compat versions to avoid ES module errors
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

// Your Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyCCZaY4sCNz1bEp3RXs5d8y_fl5hPXzehc",
  authDomain: "shiv-video-vision-app.firebaseapp.com",
  projectId: "shiv-video-vision-app",
  storageBucket: "shiv-video-vision-app.firebasestorage.app",
  messagingSenderId: "504336545235",
  appId: "1:504336545235:web:09ae89753a170fd3f1eb26",
  measurementId: "G-CG2T5ZWNLS"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage(function(payload) {
  console.log("🔔 Background message:", payload);

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "Notification";

  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";

  const notificationOptions = {
    body,
    // IMPORTANT: add icon/badge so Windows shows a proper toast
    icon: "./assets/logo.png",     // <-- put your real path
    badge: "./assets/logo.png",    // <-- put your real path
    data: payload?.data || {},
    requireInteraction: true,      // keeps it visible until user clicks (useful for testing)
    renotify: true,
    tag: "svv-push"
  };

  self.registration.showNotification(title, notificationOptions)
    .then(() => console.log("✅ showNotification fired"))
    .catch(err => console.error("❌ showNotification failed:", err));
});

// When user clicks push notification
self.addEventListener("notificationclick", function(event) {
  event.notification.close();

  // Open the app and open ONLY notification center
  const data = event.notification.data || {};
  const urlToOpen = "./app.html"; // no extra navigation

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });

    // 1) If tab already open → focus it and tell it to open notification center
    for (const client of clientList) {
      if (client.url.includes("/shiv-video-vision-app/") && "focus" in client) {
        await client.focus();
        try {
          client.postMessage({ action: "OPEN_NOTIF_CENTER", data });
        } catch (e) {}
        return;
      }
    }

    // 2) Otherwise open new tab → then tell it to open notification center
    const newClient = await clients.openWindow(urlToOpen);
    try {
      newClient?.postMessage?.({ action: "OPEN_NOTIF_CENTER", data });
    } catch (e) {}

    // 3) Backup: set a flag so the app can open the panel even if postMessage arrives too early
    // (We can't write localStorage/sessionStorage from SW; so app will also auto-open if it sees this in URL later if needed.)
  })());
});
