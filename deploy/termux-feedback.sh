#!/data/data/com.termux/files/usr/bin/bash
# Prints the latest feedback straight in Termux (works even if email is not set up).  Usage: bash termux-feedback.sh [how-many]
F="${LIVE:-$HOME/safegate-live}/data/feedback.jsonl"
[ -s "$F" ] || { echo "No feedback yet."; exit 0; }
node -e '
const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(x=>JSON.parse(x)).reverse().slice(0,+process.argv[2]||15);
const K={love:"LOVE",fix:"FIX",idea:"IDEA",broke:"BROKEN",other:"OTHER"};
console.log(l.length+" latest messages (newest first)\n");
for(const f of l){console.log("["+K[f.kind]+(f.rating?" "+f.rating+"/5":"")+"] "+f.id+"  "+new Date(f.t+36e5).toISOString().slice(0,16).replace("T"," ")+"  "+f.role+(f.who?" "+f.who.name+" "+f.who.matric:" (anonymous)")+(f.area?"  · "+f.area:""));console.log(f.message);if(f.contact)console.log("Contact: "+f.contact);console.log("--------")}
' "$F" "$1"
