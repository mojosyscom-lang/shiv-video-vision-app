const API="https://script.google.com/macros/s/AKfycbxaSy-VKLITAJQnKC1GHjPTJV3agav3XFs5uKLP-Btw360jm5C6AZs0FRpa9P3XL_iMsg/exec";

async function api(data){
  const r=await fetch(API,{method:"POST",body:JSON.stringify(data)});
  return r.json();
}
