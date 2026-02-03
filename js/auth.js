// ---------- LOGIN ----------
function login() {
  const userEl = document.getElementById("user");
  const passEl = document.getElementById("pass");

  if (!userEl || !passEl) {
    alert("Login form not found");
    return;
  }

  const user = userEl.value.trim();
  const pass = passEl.value.trim();

  if (!user || !pass) {
    alert("Enter username and password");
    return;
  }

  api({
    action: "login",
    user,
    pass
  })
    .then(r => {
      if (!r || !r.success) {
        if (r && r.reason === "disabled") {
          alert("Your access is disabled. Contact admin.");
        } else {
          alert("Invalid login");
        }
        return;
      }

      // Save session
      localStorage.setItem("role", r.role);
      localStorage.setItem("company", r.company);
      localStorage.setItem("username", r.username);
      localStorage.setItem("last_login", r.last_login);

      // Go to app
      location.href = "app.html";
    })
    .catch(err => {
      console.error("Login error:", err);
      alert("Login error. Check console.");
    });
}

// ---------- LOGOUT ----------
function logout() {
  localStorage.clear();
  location.href = "login.html";
}
