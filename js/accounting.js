function showDashboard(){
  content.innerHTML=`
  <div class="card">
    <h2>Dashboard</h2>
    <canvas id="chart"></canvas>
  </div>`;
}

function loadSection(type){
  if(type==="invoice") location.href="invoice.html";
  if(type==="gst"){
    content.innerHTML=`<div class="card"><h2>GST Summary</h2></div>`;
  }
}

showDashboard();
