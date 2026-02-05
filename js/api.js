const API = "https://script.google.com/macros/s/AKfycby0ZSwK4Hn4V7iPs82Yyiy3sis0LtkAr3Og4Y9eAz3_A_gRNyqmUui5GPmpFXDMyhUz/exec";

let _redirectingToLogin = false;

async function api(data) {
  // Attach session without overwriting business fields
  if (data.action !== "login") {
    data.session_username = localStorage.getItem("username") || "";
    data.session_last_login = localStorage.getItem("last_login") || "";
  }

  let res;
  try {
    // IMPORTANT: No Content-Type header → avoids CORS preflight on Apps Script
    res = await fetch(API, {
      method: "POST",
      body: JSON.stringify(data)
    });
  } catch (err) {
    // Network/offline error: let sync.js decide what to do
    throw err;
  }

  // Apps Script sometimes returns text/HTML on errors; parse safely
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { error: "Invalid server response", detail: text.slice(0, 200) };
  }

  // If session invalid/expired/disabled → force login
  if (json && json.error) {
    const msg = String(json.error).toLowerCase();
    if (
      msg.includes("login") ||
      msg.includes("session") ||
      msg.includes("disabled") ||
      msg.includes("revoked")
    ) {
      if (!_redirectingToLogin) {
        _redirectingToLogin = true;
        alert(json.error);
        localStorage.clear();
        location.href = "login.html";
      }
      return json;
    }
  }

  return json;
}
