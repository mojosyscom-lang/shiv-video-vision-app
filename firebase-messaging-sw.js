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

  const notificationTitle = payload.notification?.title || "Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// When user clicks push notification
self.addEventListener("notificationclick", function(event) {
  event.notification.close();

  const url = "/shiv-video-vision-app/?open_notif=1";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function(clientList) {
        for (const client of clientList) {
          if (client.url.includes("/shiv-video-vision-app/") && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
