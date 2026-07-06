# Perq — app shell

Perq is a credit-card benefits tracker: it values every card benefit honestly
(offset vs. induced vs. per-use) against the card's annual fee.

This repository holds only the installable web-app shell, published to GitHub
Pages. It contains the app code and the public card-benefit catalog — no user
data. Tracking data lives in the browser (localStorage) and, if the user opts
in, in their own cloud-sync account (row-level security; only their login can
read it).

Install on a phone: open this repo's GitHub Pages URL in the browser, then
"Add to Home Screen".
