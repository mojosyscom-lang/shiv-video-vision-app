function login() {
  api({
    action: "login",
    user: document.getElementById("user").value.trim(),
    pass: document.getElementById("pass").value.trim()
  }).then(r => {
    if (r.success) {
      localStorage.setItem("role", r.role);
      localStorage.setItem("company", r.company);
      location.href = "app.html";
    } else {
      alert("Invalid login");
    }
  }).catch(err => {
    console.error(err);
    alert("API error. Check console.");
  });
}
