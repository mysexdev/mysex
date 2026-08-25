# MySex Finalization Plan

อัปเดตล่าสุด: 2026-08-25

## 1. เป้าหมายสุดท้าย

เว็บ Production ต้องเปิดเข้าเครื่องคำนวณชายที่เสถียรโดยตรง ส่วนฟีเจอร์ที่ยังไม่พร้อม ข้อมูลส่วนตัว และระบบหลังบ้านต้องไม่ถูกเปิดเป็น static page สาธารณะ

```text
mysex.vercel.app/
├─ Male Calculator        Public · หน้าหลัก
├─ Pair Calculator        Development · ยังไม่เปิด Production
├─ Aye Infographic        Private/Selected audience · ยังไม่ตัดสินใจเปิดสาธารณะ
└─ Admin                  Admin only · ต้องยืนยันตัวตนฝั่งเซิร์ฟเวอร์
```

## 2. สถานะที่ตรวจพบจริง

ตรวจเมื่อ 2026-08-25:

- Vercel เชื่อมกับ GitHub และ deploy อัตโนมัติเมื่อ push
- `/` ยังแสดงหน้าเมนูที่ลิงก์ไป Male, Pair และ Infographic
- `/infographic_ay_pink_layered.html` ตอบ `200 OK` เมื่อเข้าด้วย URL ตรง
- `/Vag0.JPG`, `/Vag3.JPG` และ `/aye_portrait_2.png` ตอบ `200 OK` จาก Vercel
- `admin.html` ตอบ `200 OK` โดยไม่ต้องล็อกอิน
- GitHub repository และไฟล์ raw เปิดได้โดยไม่ล็อกอิน
- `admin.html` มี Google Apps Script endpoint อยู่ใน client-side HTML/JavaScript
- ไฟล์จาก Vercel ใช้ `Cache-Control: public, max-age=0, must-revalidate`
- ยังไม่มี `X-Robots-Tag` บน deployment ปัจจุบัน
- `Vag0.webp` และ `Vag3.webp` ยังไม่ถูก deploy และตอบ `404`
- local working tree มี `infographic_ay_pink_layered.html` ที่แก้แล้ว และ WebP ใหม่ที่ยังไม่ tracked

ข้อสรุป: การไม่มีลิงก์จากหน้าแรกไม่ใช่ access control ปัจจุบัน Infographic, รูปต้นฉบับ และ Admin เข้าถึงได้ด้วย URL ตรง

## 3. กติกาก่อนทำงานต่อ

- [ ] ห้าม push `Vag0.webp`, `Vag3.webp` หรือ Infographic รุ่นใหม่ไป Production สาธารณะก่อนแยกพื้นที่
- [ ] ห้ามใช้ JavaScript password หรือ age gate เป็นระบบรักษาความปลอดภัย
- [ ] ห้ามฝัง secret, token หรือ endpoint ที่ถือเป็นความลับใน HTML/JavaScript
- [ ] การเข้าถึงไฟล์ภาพโดยตรงต้องถูกป้องกันเหมือนหน้า HTML
- [ ] การ rewrite Git history และ force-push ต้องได้รับคำยืนยันก่อนทุกครั้ง

## 4. Phase 0 — Privacy Containment (เร่งด่วน)

เป้าหมาย: หยุดเผยแพร่ข้อมูลที่ยังไม่ตั้งใจเปิด ก่อนทำฟีเจอร์ใหม่

### 4.0 Local Backup

- [x] เพิ่ม private assets และ `/private/` ลง `.gitignore`
- [x] สร้าง local backup ที่ `D:\mysex\private\backup-2026-08-25`
- [x] สำรอง Infographic, JPG, WebP, portrait และ `admin.html` ครบ 7 ไฟล์
- [x] ตรวจ SHA-256 ของไฟล์สำรองตรงกับต้นฉบับทุกไฟล์
- [x] สำรองหน้าเมนูเดิมเป็น `private\backup-2026-08-25\index-menu.html` และตรวจ SHA-256 แล้ว
- [ ] ทำ secondary backup ไว้นอกดิสก์ `D:` เพื่อป้องกันกรณีดิสก์เสีย

### 4.1 หยุด Public Navigation

- [x] ยกเลิกหน้าเมนูเดิมที่มีลิงก์ Pair/Infographic และเก็บสำรองไว้ใน `/private/`
- [x] เปลี่ยน Male Calculator ให้เป็น `index.html` โดยตรง (local · pending commit/push)
- [x] ไม่แสดงลิงก์ Admin ในส่วน Public

### 4.2 เอา Private/Unfinished Files ออกจาก Production

- [x] Stage การลบ `infographic_ay_pink_layered.html` ออกจาก Public branch (pending commit/push)
- [x] Stage การลบ `Vag0.JPG`, `Vag3.JPG` และลบ WebP ที่ยัง untracked ออกจาก root (pending commit/push)
- [x] Stage การลบ `aye_portrait_2.png` ออกจาก Public branch (pending commit/push)
- [x] Stage การลบ `admin.html` ออกจาก Public branch (pending commit/push)
- [x] ปิด route `vagina_penis_calculator.html` ชั่วคราวด้วย Vercel redirect ไป `/` (pending commit/push)

### 4.3 ล้างประวัติ Public Git

รายการนี้เป็น destructive operation และต้องอนุมัติก่อน:

- [ ] สำรอง repository ก่อน rewrite
- [ ] ใช้ `git filter-repo` หรือเครื่องมือเทียบเท่าเพื่อลบไฟล์ส่วนตัวจากทุก commit
- [ ] Force-push ประวัติใหม่ไป GitHub
- [ ] ตรวจ raw GitHub URLs ให้ตอบ `404`
- [ ] Redeploy Vercel จากประวัติใหม่
- [ ] ตรวจ Production URLs ให้ตอบ `404`
- [ ] พิจารณาคำขอล้าง cache/search removal หาก URL เคยถูกเก็บดัชนี

หมายเหตุ: การล้างต้นทางลดการเข้าถึงต่อไป แต่ไม่สามารถรับประกันการเรียกคืนสำเนาที่บุคคลอื่นอาจบันทึกไว้ก่อนแล้ว

### 4.4 Admin Endpoint

- [ ] ถือว่า Google Apps Script endpoint ปัจจุบันถูกเปิดเผยแล้ว
- [ ] เปลี่ยนหรือ deploy endpoint ใหม่
- [ ] ปิด endpoint เดิมเมื่อระบบใหม่พร้อม
- [ ] ให้ API ใหม่ตรวจ session/token ฝั่งเซิร์ฟเวอร์ก่อนคืนข้อมูล

## 5. Phase 1 — Public Male Calculator

เป้าหมาย: `https://mysex.vercel.app/` เปิด Male Calculator ที่เสถียรโดยตรง

### 5.1 Routing

แนวทางที่เลือก:

- [x] เปลี่ยน `male_calculator.html` เป็น `index.html` เพื่อให้ `/` เปิดเครื่องคำนวณโดยตรง
- [x] ถอด Vercel rewrite ที่ไม่จำเป็นออก
- [x] เปลี่ยนปุ่ม Home ในเครื่องคำนวณให้ชี้กลับ `/`

### 5.2 Stabilization

- [ ] ทดสอบ input validation
- [ ] ทดสอบค่าต่ำสุด/สูงสุด/ค่าว่าง/ตัวอักษร
- [ ] ทดสอบสูตรและหน่วยทั้งหมดด้วย test cases ที่บันทึกผลคาดหวัง
- [ ] ทดสอบ reset, export, print และ local storage ถ้ามี
- [ ] ทดสอบ Chrome, Edge และ Safari/iOS
- [ ] ทดสอบ viewport มือถือ 360, 390, 430px
- [ ] ตรวจ console ให้ไม่มี error
- [ ] ตรวจว่าไม่มีการส่งข้อมูลผู้ใช้ไปภายนอกโดยไม่ได้แจ้ง
- [ ] ผ่าน regression test ก่อน merge เข้า branch ที่ Vercel deploy

### 5.3 Public Security Headers

- [x] เพิ่ม `vercel.json` (local · pending commit/push)
- [x] ตั้ง `X-Content-Type-Options: nosniff`
- [x] ตั้ง `X-Frame-Options: DENY`
- [x] ตั้ง `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] วาง Content Security Policy หลังตรวจ external dependencies
- [ ] ไม่ตั้ง `noindex` ทั้งเว็บ หากอนาคตต้องการให้เครื่องคำนวณค้นเจอ

## 6. Phase 2 — Pair Compatibility Calculator

สถานะ: ยังมีบัคจำนวนมากและยังไม่ใช่ Production feature

- [ ] ย้ายการพัฒนาไป branch แยก
- [ ] ใช้ Vercel Preview พร้อม Vercel Authentication สำหรับผู้พัฒนา/ผู้ทดสอบ
- [ ] ไม่ลิงก์จากหน้า Production
- [ ] แยกสูตรคำนวณออกจาก DOM เพื่อให้เขียน automated tests ได้
- [ ] จัดทำรายการ known bugs และ severity
- [ ] ใช้ test cases ชุดเดียวกับ Male Calculator ในส่วนข้อมูลร่วม
- [ ] เปิด Production เมื่อไม่มี blocker/critical bug และผ่าน regression test

## 7. Phase 3 — Aye Infographic

สถานะ: ตัวหน้าออกแบบพร้อม แต่ยังไม่ตัดสินใจว่าจะเปิดแก่ใครในอนาคต

### 7.1 ระหว่างยังไม่ตัดสินใจ

- [ ] เก็บหน้าและรูปไว้ local encrypted storage หรือ private repository
- [ ] ไม่เก็บไฟล์ใน Public Git history
- [ ] ไม่ deploy ไป `mysex.vercel.app`
- [ ] เก็บเอกสารความยินยอมไว้นอกเว็บไซต์

### 7.2 หากเปิดเฉพาะบางกลุ่ม

- [ ] สร้าง project/domain แยกจาก Public Calculator
- [ ] ใช้ access control ฝั่งเซิร์ฟเวอร์ก่อนโหลด HTML และรูป
- [ ] วาง age/content gate หลังผ่าน access control
- [ ] ป้องกัน URL ของ HTML, WebP และ portrait ทั้งหมด
- [ ] ตั้ง `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`
- [ ] ตั้ง `Cache-Control: private, no-store`
- [ ] ตั้ง `Referrer-Policy: no-referrer`
- [ ] ใช้ฟอนต์แบบ self-hosted
- [ ] ตรวจขอบเขตความยินยอมใหม่เมื่อเปลี่ยนผู้ชม รูป หรือช่องทางเผยแพร่

### 7.3 หากเปิดสาธารณะในอนาคต

- [ ] ขอความยินยอมโดยชัดแจ้งสำหรับการเผยแพร่สาธารณะโดยเฉพาะ
- [ ] ทบทวนความเสี่ยงด้านการระบุตัวบุคคล การดาวน์โหลด และการส่งต่อ
- [ ] กำหนดช่องทางถอนความยินยอมและกระบวนการนำเนื้อหาออก
- [ ] ตรวจข้อกฎหมายและเงื่อนไขของผู้ให้บริการอีกครั้งก่อนเปิด

## 8. Phase 4 — Admin and Logs

เป้าหมาย: มีเฉพาะ Admin ที่ได้รับอนุญาตเท่านั้นที่ดูหน้าและข้อมูลได้

- [ ] ห้าม deploy `admin.html` เป็น static public file
- [ ] ใช้ server-side authentication และ HttpOnly secure session cookie
- [ ] ตรวจสิทธิ์ทั้งหน้า Admin และทุก API request
- [ ] เก็บ secret/API URL ใน Vercel Environment Variables
- [ ] ห้ามส่ง secret มาที่ browser
- [ ] API ต้องคืน `401/403` เมื่อไม่มีสิทธิ์ แม้ทราบ URL
- [ ] จำกัด CORS ให้เฉพาะ origin ที่จำเป็น
- [ ] ตั้ง `Cache-Control: private, no-store`
- [ ] ปิดการแสดงข้อมูลละเอียดเกินความจำเป็นใน log
- [ ] บันทึก audit log สำหรับ login, data access และ configuration changes
- [ ] เพิ่ม logout, session expiry และการเพิกถอน session
- [ ] ทดสอบเปิด `/admin` และ API ใน incognito แล้วต้องเข้าไม่ได้

## 9. Vercel Strategy

### Public Project

```text
mysex.vercel.app
└─ Male Calculator
```

- GitHub auto-deploy ใช้ต่อได้
- branch ที่ deploy ต้องมีเฉพาะ public assets
- Preview deployments ใช้ทดสอบก่อน promote

### Private Projects

```text
private-preview project
├─ Pair Calculator development
└─ จำกัดเฉพาะผู้พัฒนา/ผู้ทดสอบ

aye-private project (ถ้าตัดสินใจเปิด)
├─ Access control
├─ Age/content gate
└─ Infographic + protected assets

admin project/route
├─ Server authentication
└─ Protected log API
```

หมายเหตุเรื่อง Vercel:

- Standard Protection บน Hobby ป้องกัน Preview/Deployment URLs แต่ไม่ป้องกัน Production domain
- การป้องกัน Production ทั้ง project ด้วย Vercel Password Protection ต้องตรวจ plan/add-on ปัจจุบัน
- หากต้องการผู้ชมภายนอกบางกลุ่มและไม่ใช้ plan ที่รองรับ ให้ใช้ระบบ auth ของแอปหรือผู้ให้บริการ access control อื่น

อ้างอิง:

- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection
- https://vercel.com/docs/project-configuration/vercel-json

## 10. Definition of Done

### Public Site

- [ ] `/` เปิด Male Calculator โดยตรง
- [ ] หน้า Public ไม่มีลิงก์ Pair, Aye หรือ Admin
- [ ] URL เดิมของ Aye, รูป และ Admin เข้าไม่ได้จาก Production
- [ ] Male Calculator ผ่าน test matrix และไม่มี console error

### Pair Calculator

- [ ] อยู่ใน protected development environment
- [ ] มี known-bug list และ automated tests สำหรับสูตรหลัก
- [ ] ยังไม่ deploy Production จนกว่าจะผ่านเกณฑ์

### Aye Infographic

- [ ] ไม่มีไฟล์หรือประวัติไฟล์ส่วนตัวใน Public repository
- [ ] ไม่มีไฟล์ส่วนตัวใน Public Vercel deployment
- [ ] หากเปิดเฉพาะกลุ่ม ทุก asset ต้องผ่าน access control

### Admin

- [ ] หน้า Admin และ API ตอบ `401/403` เมื่อไม่มี session
- [ ] ไม่มี secret หรือ endpoint สำคัญใน client-side source
- [ ] endpoint เก่าถูกเพิกถอนหรือจำกัดสิทธิ์

## 11. Decisions Required Before Execution

- [ ] อนุมัติหรือไม่อนุมัติการล้างไฟล์ส่วนตัวออกจาก Git history และ force-push
- [ ] เลือกให้ Pair Calculator ตอบ `404` หรือแสดง Coming Soon ระหว่างพัฒนา
- [x] เลือกให้ Male Calculator เป็น `index.html` โดยตรง ไม่ใช้ rewrite/redirect
- [ ] เลือกวิธี auth สำหรับ Admin
- [ ] เลือกว่าจะเก็บ Aye Infographic ใน local encrypted storage หรือ private repository

## 12. Execution Steps (เลขสเตปหลักที่ใช้คุยและทำงาน)

เพื่อไม่ให้สับสนกับหมายเลข Phase ให้ยึดเลขสเตปในหัวข้อนี้เป็นเลขอ้างอิงหลักระหว่างทำงาน

### Step 1 — Privacy Prep & Local Backup — เสร็จแล้ว

- [x] เพิ่มไฟล์ส่วนตัวและ `/private/` ลง `.gitignore`
- [x] สำรองไฟล์ส่วนตัวและหน้าเมนูเดิมไว้ที่ `D:\mysex\private\backup-2026-08-25`
- [x] ตรวจว่าไฟล์สำรองครบและไม่ถูก Git ติดตาม
- [ ] สำรอง Git repository ทั้งชุดก่อนทำ history rewrite (ทำเมื่อจะเริ่ม Step 4)

Step 1 เป็นงาน local ไม่ต้องและไม่ควรอัปโหลดโฟลเดอร์ `/private/` ขึ้น Git

### Step 2 — Public Cleanup & Main Route — ทำ local แล้ว รอ deploy

- [x] Stage การนำ Infographic, รูปส่วนตัว และ `admin.html` ออกจาก Public repository
- [x] ไม่แสดง Pair, Infographic และ Admin ในหน้า Public
- [x] สำรองหน้า `index.html` เดิมเป็น `private/backup-2026-08-25/index-menu.html`
- [x] เปลี่ยน Male Calculator ให้เป็น `index.html` โดยตรง
- [x] ตั้ง URL ของ Pair Calculator เดิมให้ redirect กลับ `/` ชั่วคราว
- [x] เพิ่ม security headers ใน `vercel.json`
- [ ] Commit และ push ชุดการเปลี่ยนแปลง

Step 2 จะมีผลกับเว็บ Production หลัง commit/push และ Vercel deploy สำเร็จเท่านั้น

### Step 3 — Production Verification — ยังไม่เริ่ม

- [ ] ตรวจว่า `/` เปิด Male Calculator โดยตรง
- [ ] ตรวจว่า URL เดิมของ Infographic, รูปส่วนตัว และ Admin ตอบ `404`
- [ ] ตรวจว่า Pair URL redirect กลับ `/`
- [ ] ตรวจ security headers จาก Production response
- [ ] ตรวจว่าไม่มีลิงก์ Public ไปยัง Pair, Aye หรือ Admin

### Step 4 — Public Git History Cleanup — ต้องอนุมัติก่อน

- [ ] สำรอง Git repository ทั้งชุด
- [ ] ล้างไฟล์ส่วนตัวออกจากทุก commit ที่เคยเผยแพร่
- [ ] Force-push เฉพาะหลังตรวจ backup และได้รับอนุมัติชัดเจน
- [ ] ตรวจว่า Raw GitHub URL และ commit เก่าไม่เปิดไฟล์ส่วนตัวอีก

### Step 5 — Admin Endpoint Containment — ยังไม่เริ่ม

- [ ] ถือว่า Google Apps Script endpoint เดิมถูกเปิดเผยแล้ว
- [ ] เปลี่ยนหรือปิด endpoint เดิม
- [ ] ยังไม่คืน `admin.html` เข้า Public repository

### Step 6 — Male Calculator Stabilization — ยังไม่เริ่ม

- [ ] ทำ regression tests สำหรับ input, validation, หน่วย และสูตร
- [ ] ทดสอบ responsive layout และ interaction สำคัญ
- [ ] แก้บัคและทดสอบซ้ำจนผ่านเกณฑ์ Production

### Step 7 — Private Features — ทำภายหลัง

- [ ] ตั้ง protected Preview สำหรับ Pair Calculator
- [ ] สร้าง Admin ใหม่ที่มี server-side authentication
- [ ] ตัดสินใจขอบเขตผู้ชม Aye Infographic โดยไม่ผูกกับ Public release
