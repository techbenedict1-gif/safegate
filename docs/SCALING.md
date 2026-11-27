# How big can SafeGate go? (measured, not guessed)

SafeGate runs **one server per school**. A school's data stays on that school's server, which is good for privacy. "Millions of users" therefore means many schools, each with its own server, not one giant server.

## Measured on one ordinary CPU core (this sandbox)
| Test | Result |
|---|---|
| Registering students + first scan, 20,000 students | ~40,000 students/second (it was 700/second before v13.4: a hidden slowdown made it slower with every student) |
| Phone pings once students exist | ~200,000 per second inside the server |
| Over real HTTP, 200 phones at once, 5,000 students | ~9,700 requests/second, 99% under 0.1 s, 0 errors |
| Desk live board, 20,000 students | ~50 ms to compute, then shared for 2 s between all officers |
| Memory | ~125 MB for 20,000 students (~6 KB each) |
| Saving the database | 20,000 students = 22 MB, 0.19 s. The server now waits longer between saves as the school grows (never more than ~1/5 of the time) |

What that means: a school of **50,000 students** each sending a location every minute is about 830 requests a second. That is under a tenth of what one small server handled here. The hard limit per school is 100,000 registered students, and the database is held in memory (about 0.6 GB at that size).

Run the check on your own machine: `npm run loadtest`.

## What is NOT tested
Real phones on real mobile networks, a real VPS, thousands of officers, and anything past about 20,000 students in memory. Numbers will differ on a cheap server. Re-run `npm run loadtest` there.

## Recommended setup
1. **Now (pilot):** your phone with the Termux script. Fine to prove the idea with a few hundred students. The address changes, and the phone must stay on.
2. **School launch:** a small VPS (2 GB memory is enough for ~20,000 students) with your own domain: `sudo bash deploy/vps-install.sh your.domain.com you@email.com`. It gives HTTPS, automatic restart, a firewall, daily backups, and `--update` for new versions.
3. **Many schools:** one VPS (or one container) per school, each with its own domain like `schoolname.safegate.app`. A small control panel to create and update them can be built later. Do not put two schools in one database.

## When a single server is not enough
If one school ever needs more than ~100,000 students or failover with zero downtime, the data layer has to move from an in-memory file to a database server (PostgreSQL) with several app servers. That is a large change that should be designed with a real school's numbers, not guessed now.
