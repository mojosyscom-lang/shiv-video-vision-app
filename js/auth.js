function login(){
  api({action:"login",user:user.value,pass:pass.value})
  .then(r=>{
    if(!r.success) return alert("Invalid login");
    localStorage.setItem("role",r.role);
    location.href="app.html";
  });
}

function toggleTheme(){
  document.body.classList.toggle("dark");
  localStorage.setItem("theme",document.body.classList.contains("dark"));
}

if(localStorage.getItem("theme")==="true"){
  document.body.classList.add("dark");
}
