import"./nav-B2g3d2SO.js";import{t as e}from"./database-BGZyZyq9.js";var t=await e,n=document.querySelector(`#output`),r=document.querySelector(`#update`);r.onclick=i,i();async function i(){n.replaceChildren();let e={},r=t.transaction([`treeOverview`,`treeDetails`]);for(let t of await r.objectStore(`treeOverview`).getAll())e[t.key]={overview:t};for(let t of await r.objectStore(`treeDetails`).getAll())e[t.key]={...e[t.key]??{},details:t};n.replaceChildren(Object.entries(e).map(([e,{overview:t,details:n}])=>`${t?`O`:`-`} ${n?`D`:`-`} ${e}\n`).join(``)+`----------------------------------------
`+JSON.stringify(e,a,2)+`
----------------------------------------
`+JSON.stringify(await t.getAll(`accessTokens`)??null,null,2)+`
----------------------------------------
`+JSON.stringify(await t.getAll(`config`)??null,null,2))}var a=(e,t)=>t instanceof Date?{Date:t.toISOString()}:t instanceof Set?{Set:[...t.values()]}:t instanceof Map?{Map:[...t.entries()]}:t;