const API="PASTE_APPS_SCRIPT_URL_HERE";

async function api(data){
  const r=await fetch(API,{method:"POST",body:JSON.stringify(data)});
  return r.json();
}
