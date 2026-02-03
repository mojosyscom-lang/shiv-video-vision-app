function login() {
  api({
    action: "login",
    user: document.getElementById("user").value.trim(),
    pass: document.getElementById("pass").value.trim()
  }).then(r => {
    if (!r.success) {
      if (r.reason === "disabled") return alert("Access disabled. Contact admin.");
      return alert("Invalid login");
    }

    localStorage.setItem("role", r.role);
    localStorage.setItem("company", r.company);
    localStorage.setItem("username", r.username);
    localStorage.setItem("last_login", r.last_login);

    location.href = "app.html";
  }).catch(err => {
    console.error(err);
    alert("Login error. Check console.");
  });
}

function logout() {
  localStorage.clear();
  location.href = "login.html";
}
