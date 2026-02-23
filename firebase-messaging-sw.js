importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// TODO: paste your firebaseConfig here:
firebase.initializeApp({
  apiKey: "AIzaSyCCZaY4sCNz1bEp3RXs5d8y_fl5hPXzehc",
  authDomain: "shiv-video-vision-app.firebaseapp.com",
  projectId: "shiv-video-vision-app",
  messagingSenderId: "504336545235",
  appId: "1:504336545235:web:09ae89753a170fd3f1eb26"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) ? payload.notification.title : "Notification";
  const options = {
    body: (payload.notification && payload.notification.body) ? payload.notification.body : "",
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const orderId = data.order_id || "";

  // Open app + deep-link
  const url = orderId ? (`./?section=orders&order_id=${encodeURIComponent(orderId)}&mode=open`) : "./";
  event.waitUntil(clients.openWindow(url));
});
