function updateNet(){
  netStatus.innerText=navigator.onLine?"🟢 Online":"🔴 Offline";
}
window.addEventListener("online",updateNet);
window.addEventListener("offline",updateNet);
updateNet();
