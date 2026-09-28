import fs from "node:fs";
const p="C:\\Users\\user\\Desktop\\System Commander\\relay\\src\\server.ts";
let s=fs.readFileSync(p,"utf8");
const lines=s.split(/\\r?\\n/);
const i=lines.findIndex(x=>x.includes("main.innerHTML=`"));
if(i<0)throw new Error("main.innerHTML template line not found.");
lines[i]=lines[i].replace(/`/g,"\\\\`");
fs.writeFileSync(p,lines.join("\\n"));
console.log("Escaped inner auth template literal for server template.");