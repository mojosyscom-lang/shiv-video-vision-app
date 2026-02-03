const API = "https://script.google.com/macros/s/AKfycbwaWc2LJ2vzCRzJlbpYRiQ58b555JR7-s2TscDD9pSz6P7SyVzpz5t2MOmtf7u62pia/exec";

async function api(data) {
  // Attach session without overwriting business fields
  if (data.action !== "login") {
    data.session_username = localStorage.getItem("username") || "";
    data.session_last_login = localStorage.getItem("last_login") || "";
  }

  const res = await fetch(API, {
    method: "POST",
    body: JSON.stringify(data)
  });

  const json = await res.json();

  // If session invalid/expired/disabled → force login
  if (json && json.error && (
    json.error.toLowerCase().includes("login") ||
    json.error.toLowerCase().includes("session") ||
    json.error.toLowerCase().includes("disabled") ||
    json.error.toLowerCase().includes("revoked")
  )) {
    alert(json.error);
    localStorage.clear();
    location.href = "login.html";
  }

  return json;
}
