const API="https://script.google.com/macros/s/AKfycbwaWc2LJ2vzCRzJlbpYRiQ58b555JR7-s2TscDD9pSz6P7SyVzpz5t2MOmtf7u62pia/exec";

async function api(data){
  const r=await fetch(API,{method:"POST",body:JSON.stringify(data)});
  return r.json();
}
