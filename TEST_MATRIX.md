# MySex Public Calculator — Test Matrix

Date: 2026-09-28

## Scope

- Public `index.html`, `vercel.json`, `.gitignore`, and self-hosted html2canvas.
- Production Apps Script was blocked for every automated browser run.
- No test log or test image was intentionally sent.

## Results

| Area | Case | Expected | Result |
| --- | --- | --- | --- |
| Initial state | No measurements entered | Main fields stay empty; results remain unavailable until valid input | Pass |
| Synthetic baseline | 100/100/150/120/10 mm | Condom 52 mm, BFPI 1.80, delta +92.3 cc | Pass |
| Units | cm → inch → cm | Canonical mm values unchanged | Pass |
| Units with partial form | Fill Step 1 only, then cm → inch → cm | Filled values convert; Step 2 remains empty; no validation error | Pass |
| Report units | Passport/export card, Deep Analysis, BPEL detail | Canonical values render as labeled cm/mm; Tfat includes mm | Pass |
| Local test persistence | Enter values on `localhost`, switch unit, refresh | Values and canonical mm return; Production host does not use local test storage | Pass |
| Validation | 0.09, 0.1, 50, 50.01 cm | Reject, accept, accept, reject | Pass |
| Warning | Erect length lower than flaccid | Non-blocking warning shown | Pass |
| Condom range | Below 47; nominal 47/72; girth 165.7/171/172/172.1 mm | Out; in; size 72 as largest available through 172; out above 172 | Pass |
| Condom products | Main sizes 47/49/52/54/56/58/60/64/69/72 mm | Show no more than three Thai-market products and keep each product's actual width | Pass |
| Position matcher copy | Grower / large / compact / standard branches | Keep existing grouping; avoid guaranteed fit/pleasure claims; include brief comfort guidance | Pass |
| BFPI boundary | Exactly 1.8 / 2.5 | Hybrid / Grower | Pass |
| Regions | Global / China / Thai BETA | Matching labels and export icons | Pass |
| Modals | Passport / Deep Analysis | Open and close successfully | Pass |
| Passport crop | Upload, drag, zoom, reset state, 400×420 crop | Preview and PNG share crop state | Pass |
| Passport mobile save | iPhone over LAN HTTP | In-page preview; long-press save | Pass — user confirmed |
| Mobile HTTPS save flow | iPhone Chrome/LINE after editing | Prepare PNG before tap; open native Share immediately; fall back to image preview if unavailable | Pass — user confirmed on iPhone |
| Desktop save flow | Passport and Deep Analysis | Download PNG immediately without opening save preview | Pass |
| Deep mobile save | iPhone over LAN HTTP | Same in-page preview flow | Pass — user confirmed |
| Deep condom status | Synthetic baseline 52 mm | `condomInRange === true` | Pass |
| Export | Passport canvas | 800 px wide 2× render | Pass |
| Responsive | 320, 390, 768, 1024, 1634 px | No horizontal overflow | Pass |
| Accessibility static | IDs and ARIA references | No duplicate IDs or missing references | Pass |
| JavaScript | Inline script parse/runtime smoke | No parse error or captured exception | Pass |
| Dependency | Local html2canvas + MIT license | Local file and license present | Pass |
| Config | `vercel.json` and `.gitignore` | Valid JSON; private/secrets ignored | Pass |

## Security/config snapshot

- `Cache-Control: no-store` for `/` and `/index.html`.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy` disables camera, microphone, and geolocation.
- CSP remains deliberately deferred because the page still contains extensive inline CSS/JavaScript.
- Google Fonts remains an external runtime dependency.

## Known pending work

- Checklist items 14–20 cover mobile share wording, canonical export URL, Passport labels/units, region wording, CTA, crop safe area, and final Passport export regression.
- Native file Share Sheet must be verified again on deployed HTTPS; LAN HTTP correctly uses the long-press-save fallback.
- Production headers, route behavior, and Apps Script logging must be verified after deployment.

## Release gate

Before release:

1. Review the complete diff and stage explicit public paths only.
2. Confirm no private path, personal image, Admin file, secret, backup, or log is included.
3. Run this matrix again against the final working tree.
4. Deploy only after explicit user approval.
5. Verify Production UI, headers, exports, redirects, and Apps Script log ingestion.
