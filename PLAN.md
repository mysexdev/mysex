# MySex Public Development Plan

อัปเดตล่าสุด: 2026-08-26

## เป้าหมาย Production

- หน้า `/` เปิดเครื่องมือคำนวณสำหรับผู้ชายโดยตรง
- ทำ `Male Calculator` ให้เสถียรก่อนขยายไปส่วนอื่น
- ไม่เผยแพร่หน้า รูป แผน หรือระบบ Admin ที่เป็นข้อมูลส่วนตัวใน Public repository
- ใช้ Public GitHub/Vercel เฉพาะไฟล์ที่จำเป็นต่อเว็บคำนวณสาธารณะ

## สถานะปัจจุบัน

- [x] นำหน้าและ asset ส่วนตัวออกจาก Public branch
- [x] หน้า Production ไม่มีลิงก์ไป Pair Calculator, Aye profile หรือ Admin
- [x] URL สาธารณะเดิมของไฟล์ส่วนตัวตอบ `404`
- [x] หน้า `/` ใช้ Male Calculator เป็นหน้าหลัก
- [x] จำกัด Admin endpoint และเก็บ Admin UI ไว้นอก Public deployment
- [ ] ทำ Male Calculator stabilization
- [ ] ตัดสินใจแนวทาง Pair Calculator หลัง Male Calculator เสถียร

## งานหลักถัดไป — Male Calculator Stabilization

- [ ] ทำรายการ input, validation, หน่วย และสูตรทั้งหมด
- [ ] สร้าง regression test cases สำหรับค่าปกติ ค่าขอบเขต และค่าที่ไม่ถูกต้อง
- [ ] ตรวจผลลัพธ์และการแปลงหน่วยให้สอดคล้องกันทุกส่วน
- [ ] ทดสอบ responsive layout บน desktop, tablet และ mobile
- [ ] ทดสอบ interaction สำคัญ รวมถึง reset, export และการส่ง log
- [ ] จัดทำรายการ known bugs พร้อม severity
- [ ] แก้ blocker/critical bugs และทดสอบซ้ำก่อน Production release

## Public Security and Privacy

- [ ] รักษา `.gitignore` สำหรับ `/private/` และ asset ส่วนตัว
- [ ] ตรวจ `git status` ก่อน commit ทุกครั้ง
- [ ] ไม่ commit secret, Admin key, log ส่วนตัว หรือรูปส่วนตัว
- [ ] เพิ่ม security headers ที่เหมาะสมกับ Public Calculator
- [ ] ตรวจว่า route และ asset ที่ไม่ใช่ Public ยังเข้าไม่ได้หลัง deploy

## งานภายหลัง

### Pair Calculator

- [ ] เก็บเป็นงานที่ยังไม่เปิดสาธารณะ
- [ ] ใช้ test cases ร่วมกับ Male Calculator ในส่วนข้อมูลและสูตรที่เกี่ยวข้อง
- [ ] เปิด Production เมื่อผ่าน regression tests และไม่มี blocker

### Private Features

- แผนละเอียด หน้า รูป และ source ที่เป็นส่วนตัวอยู่ใน private repository แยก
- ห้ามเพิ่ม navigation จาก Public Calculator ไป Private Features จนกว่าจะตัดสินใจขอบเขตผู้ชมและระบบป้องกันเรียบร้อย

## Definition of Done — Public Site

- [ ] `/` เปิด Male Calculator ได้โดยตรง
- [ ] การคำนวณและ validation ผ่าน regression tests
- [ ] layout และ interaction สำคัญใช้งานได้ในขนาดหน้าจอเป้าหมาย
- [ ] การส่ง log ทำงานตามที่กำหนดและไม่เปิดเผย secret ใน browser
- [ ] ไม่มีลิงก์หรือไฟล์ส่วนตัวใน Public build
- [ ] Git working tree สะอาดก่อน release

