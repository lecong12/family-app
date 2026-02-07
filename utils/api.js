// Đảm bảo đọc biến môi trường ngay tại file này
require('dotenv').config();

const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const mongoose = require('mongoose'); // --- FIX: Đưa lên đầu để dùng được trong try/catch bên dưới

// --- Safe Require cho Model Post ---
let Post;
try {
    Post = require('../models/Post');
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy model "Post". Tính năng bài viết sẽ không hoạt động.');
    // Tạo model giả để tránh crash server khi gọi API
    const PostSchema = new mongoose.Schema({ title: String, content: String });
    Post = mongoose.models.Post || mongoose.model('Post', PostSchema);
}

const fs = require('fs');
const axios = require('axios');

// --- Safe Require cho googleapis ---
let google;
try {
    const googleApis = require('googleapis');
    google = googleApis.google;
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa cài đặt "googleapis". Tính năng Google Sheets sẽ không hoạt động.');
}

// --- Safe Require cho csv-parse ---
let parse;
try {
    parse = require('csv-parse/sync').parse;
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa cài đặt "csv-parse". Tính năng Import Google Sheets sẽ không hoạt động.');
}

console.log('✅ API Router đang khởi động...'); // Log kiểm tra phiên bản mới

// Nạp importers an toàn (nếu lỗi thì tính năng import file sẽ báo lỗi, nhưng web vẫn chạy)
let importCSV, importExcel, importGedcom;
try {
    const importers = require('../utils/importers');
    importCSV = importers.importCSV;
    importExcel = importers.importExcel;
    importGedcom = importers.importGedcom;
} catch (e) {
    console.error('❌ Lỗi nạp importers:', e.message);
    const dummyImporter = async () => { throw new Error('Module importers lỗi: ' + e.message); };
    importCSV = importExcel = importGedcom = dummyImporter;
}

// Xử lý riêng cho Middleware
let upload, auth;
try { upload = require('../middleware/upload'); } 
catch (e) { upload = { single: () => (req, res, next) => next() }; console.error('Lỗi upload:', e.message); }

try { auth = require('../middleware/auth'); } 
catch (e) { auth = (req, res, next) => next(); console.error('Lỗi auth:', e.message); }

// --- Activity Model & Helper (Thêm mới) ---
const ActivitySchema = new mongoose.Schema({
    actor_name: String,
    actor_role: String,
    action_type: { type: String, enum: ['create', 'update', 'delete'] },
    description: String,
    created_at: { type: Date, default: Date.now }
});
const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);

// --- Visit Model (Thống kê truy cập) ---
const VisitSchema = new mongoose.Schema({
    count: { type: Number, default: 0 },
    last_updated: { type: Date, default: Date.now }
});
const Visit = mongoose.models.Visit || mongoose.model('Visit', VisitSchema);

const logToDB = async (req, action, description) => {
    try {
        const actor_name = (req.user && req.user.username) ? req.user.username : 'Unknown';
        const actor_role = (req.user && req.user.role) ? req.user.role : 'viewer';
        await Activity.create({ actor_name, actor_role, action_type: action, description });
    } catch (e) {
        console.error('Log Error:', e);
    }
};

// --- Middleware phân quyền Admin (Toàn quyền hệ thống) ---
const adminOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
        next(); // Cho phép đi tiếp nếu là admin/owner
    } else {
        res.status(403).json({ success: false, message: 'Chức năng chỉ dành cho Quản trị viên hệ thống.' });
    }
};

// --- Middleware phân quyền Biên tập (Admin + Trưởng phái) ---
const editorOnly = (req, res, next) => {
    // Cho phép: admin, owner, và các role bắt đầu bằng 'branch_'
    if (req.user && (req.user.role === 'admin' || req.user.role === 'owner' || req.user.role.startsWith('branch_'))) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này.' });
    }
};

// ============================================================
// PHẦN 1: CÁC HÀM HỖ TRỢ ĐỒNG BỘ (CORE LOGIC)
// ============================================================

// 1. Hàm tạo ID tự động theo quy luật (1-5000 và 5001+)
async function generateMemberId(isDauRe = false) {
    const members = await Member.find({}, 'id').lean();
    let maxId = 0;
    
    members.forEach(m => {
        const val = parseInt(m.id);
        if (!isNaN(val)) {
            if (isDauRe) {
                if (val >= 5001 && val > maxId) maxId = val;
            } else {
                if (val < 5001 && val > maxId) maxId = val;
            }
        }
    });

    if (isDauRe) {
        return maxId < 5001 ? 5001 : maxId + 1;
    } else {
        return maxId === 0 ? 1 : maxId + 1;
    }
}

// 2. Hàm Mapping dữ liệu MongoDB -> Mảng Google Sheets (Chuẩn cột A-P và A-O)
function mapMemberToRow(m, type) {
    const fmtLive = (v) => {
        if (v === true || v === 'true' || v === 1 || v === '1') return '1';
        return '0';
    };
    const val = (v) => (v === null || v === undefined) ? '' : String(v);

    // --- FIX: Hàm làm sạch ID cha/mẹ (loại bỏ ngày tháng bị lưu nhầm và đời 1) ---
    const valParent = (v) => {
        const s = val(v);
        if (m.generation == 1) return ''; // Đời 1 không có cha mẹ
        if (s.includes('/')) return '';   // Nếu chứa dấu '/' (ngày tháng) thì bỏ
        return s;
    };

    if (type === 'Data') {
        // Sheet Data (16 cột: A -> P)
        // id, full_name, gender, fid, mid, birth_date, death_date, is_live, branch, generation, order, phone, address, job, note, image
        return [
            val(m.id), val(m.full_name), val(m.gender),
            valParent(m.fid), valParent(m.mid),
            val(m.birth_date), val(m.death_date), fmtLive(m.is_live),
            val(m.branch), val(m.generation), val(m.order),
            val(m.phone), val(m.address), val(m.job), val(m.note), val(m.image)
        ];
    } else {
        // Sheet dData (15 cột: A -> O) - Giữ nguyên
        // id, full_name, gender, pid, birth_date, death_date, is_live, branch, generation, order, phone, address, job, note, image
        return [
            val(m.id), val(m.full_name), val(m.gender), val(m.pid), val(m.birth_date), val(m.death_date), fmtLive(m.is_live),
            val(m.branch), val(m.generation), val(m.order), val(m.phone), val(m.address), val(m.job), val(m.note), val(m.image)
        ];
    }
}

// 3. Hàm Đồng bộ Thời gian thực (Real-time Sync)
async function syncToSheetRealtime(member) {
    console.log(`🔄 [Real-time] Đang chuẩn bị đồng bộ ID: ${member.id}...`);

    if (!google) {
        console.error('❌ [Real-time] Lỗi: Chưa nạp thư viện "googleapis".');
        return;
    }
    if (!process.env.GOOGLE_SHEET_ID) {
        console.error('❌ [Real-time] Lỗi: Chưa cấu hình GOOGLE_SHEET_ID trong .env');
        return;
    }

    try {
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const SHEET_ID = process.env.GOOGLE_SHEET_ID;

        const id = parseInt(member.id);
        if (isNaN(id)) {
            console.warn(`⚠️ [Real-time] Bỏ qua vì ID không phải số: ${member.id}`);
            return;
        }

        const isData = id < 5001;
        const sheetName = isData ? 'Data' : 'dData';
        const rowData = mapMemberToRow(member, sheetName);

        // Tìm dòng chứa ID này
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A:A`,
        });
        
        const rows = res.data.values || [];
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === String(id)) { // So sánh chuỗi để chính xác hơn
                rowIndex = i + 1;
                break;
            }
        }

        if (rowIndex > 0) {
            // UPDATE: Ghi đè dòng đó (Data đến P, dData đến O)
            const rangeEnd = isData ? 'P' : 'O';
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A${rowIndex}:${rangeEnd}${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            console.log(`✅ [Real-time] Đã cập nhật ID ${id} tại dòng ${rowIndex} sheet ${sheetName}`);
        } else {
            // APPEND: Thêm mới vào cuối
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            console.log(`✅ [Real-time] Đã thêm mới ID ${id} vào sheet ${sheetName}`);
        }
    } catch (e) {
        console.error('❌ [Real-time] Lỗi API Google:', e.message);
    }
}

// --- Logic Xử lý Trực tiếp (Thay thế memberController) ---

const getMembers = async (req, res) => {
    try {
        const members = await Member.find().select('-__v').sort({ generation: 1, order: 1 });
        res.json(members);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const createMember = async (req, res) => {
    try {
        // --- PHÂN QUYỀN PHÁI: Nếu là Trưởng phái, ép buộc branch theo tài khoản ---
        if (req.user.role.startsWith('branch_')) {
            const allowedBranch = req.user.role.split('_')[1]; // Lấy số phái (1, 2, 3, 4)
            req.body.branch = allowedBranch; // Ghi đè branch trong dữ liệu gửi lên
        }

        // 1. Xác định loại thành viên để tạo ID (Dâu/Rể nếu có pid mà ko có fid/mid)
        const isDauReInput = (req.body.pid && !req.body.fid && !req.body.mid); 
        const newId = await generateMemberId(isDauReInput);
        const newPid = req.body.pid || null;

        // --- FIX: Xử lý ảnh upload ---
        let imagePath = '';
        if (req.file) {
            // CÁCH MỚI: Lưu trực tiếp Base64 vào MongoDB (Do ảnh đã được nén ở Client còn ~20KB)
            // Giải quyết triệt để vấn đề mất ảnh trên Render/Heroku
            const imgBuffer = fs.readFileSync(req.file.path);
            imagePath = `data:${req.file.mimetype};base64,${imgBuffer.toString('base64')}`;
            
            // Xóa file tạm trong thư mục uploads ngay lập tức
            fs.unlink(req.file.path, (err) => { if (err) console.error("Lỗi xóa file tạm:", err); });
        }

        const newMember = new Member({
            ...req.body,
            image: imagePath, // Lưu đường dẫn ảnh
            id: newId
        });
        await newMember.save();

        // Nếu có gán vợ/chồng, xử lý quan hệ 2 chiều và ngắt các liên kết cũ
        if (newPid) {
            // Tìm người vợ/chồng mới được gán
            const spouse = await Member.findOne({ id: newPid });
            // Nếu người đó đang có vợ/chồng khác, ngắt liên kết đó trước
            if (spouse && spouse.pid) {
                await Member.updateOne({ id: spouse.pid }, { $set: { pid: null } });
            }
            // Tạo liên kết 2 chiều mới
            await Member.updateOne({ id: newPid }, { $set: { pid: newId } });
        }

        // --- KÍCH HOẠT ĐỒNG BỘ REAL-TIME ---
        syncToSheetRealtime(newMember);

        await logToDB(req, 'create', `Thêm thành viên: ${newMember.full_name}`);
        res.status(201).json(newMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi tạo thành viên: " + err.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params; // ID của member đang sửa (M)
        const newPid = req.body.pid || null; // ID của vợ/chồng mới (S_new)

        // --- FIX: Xử lý ảnh upload (nếu có) ---
        let updateData = { ...req.body };
        if (req.file) {
            // CÁCH MỚI: Lưu Base64 vào DB
            const imgBuffer = fs.readFileSync(req.file.path);
            updateData.image = `data:${req.file.mimetype};base64,${imgBuffer.toString('base64')}`;
            fs.unlink(req.file.path, (err) => { if (err) console.error("Lỗi xóa file tạm:", err); });
        }

        // Lấy trạng thái cũ của M để biết vợ/chồng cũ (S_old)
        const memberM_before = await Member.findOne({ id: id });
        if (!memberM_before) return res.status(404).json({ message: "Không tìm thấy thành viên" });
        const oldPid = memberM_before.pid || null;

        // --- PHÂN QUYỀN PHÁI: Kiểm tra quyền sửa ---
        if (req.user.role.startsWith('branch_')) {
            const allowedBranch = req.user.role.split('_')[1];
            // 1. Kiểm tra thành viên đang sửa có thuộc phái mình không
            if (String(memberM_before.branch) !== allowedBranch) {
                return res.status(403).json({ message: `Bạn chỉ được sửa thành viên thuộc Phái ${allowedBranch}.` });
            }
            // 2. Ngăn chặn việc sửa trường 'branch' sang phái khác
            if (req.body.branch && String(req.body.branch) !== allowedBranch) {
                 return res.status(403).json({ message: `Bạn không thể chuyển thành viên sang phái khác.` });
            }
        }

        // Nếu quan hệ vợ/chồng không đổi, chỉ cần cập nhật và thoát
        if (oldPid === newPid) {
            const updatedMember = await Member.findOneAndUpdate({ id: id }, updateData, { new: true });
            syncToSheetRealtime(updatedMember); // Đồng bộ ngay
            return res.json(updatedMember);
        }

        // Ngắt liên kết của vợ/chồng cũ (S_old)
        if (oldPid) {
            await Member.updateOne({ id: oldPid }, { $set: { pid: null } });
        }

        // Ngắt liên kết của vợ/chồng hiện tại của S_new (nếu có) và gán liên kết mới
        if (newPid) {
            const memberS_new = await Member.findOne({ id: newPid });
            if (memberS_new && memberS_new.pid) {
                await Member.updateOne({ id: memberS_new.pid }, { $set: { pid: null } });
            }
            await Member.updateOne({ id: newPid }, { $set: { pid: id } }); // Gán S_new trỏ về M
        }

        // --- LOGIC GHI NHẬN THAY ĐỔI TÌNH TRẠNG SỐNG ---
        let logMsg = `Cập nhật thông tin: ${memberM_before.full_name}`;
        if (req.body.is_live !== undefined) {
            const oldStatus = !!memberM_before.is_live;
            const newStatus = req.body.is_live == '1' || req.body.is_live === true;
            
            if (oldStatus !== newStatus) {
                logMsg = `Đổi trạng thái: ${memberM_before.full_name} sang ${newStatus ? 'Còn sống' : 'Đã mất'}`;
            }
        }

        // Cập nhật M với pid mới và các thông tin khác
        const updatedMember = await Member.findOneAndUpdate(
            { id: id }, 
            updateData, 
            { new: true } // Trả về dữ liệu mới sau khi update
        );
        syncToSheetRealtime(updatedMember); // Đồng bộ ngay
        await logToDB(req, 'update', logMsg);
        res.json(updatedMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi cập nhật: " + err.message });
    }
};

const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const memberToDelete = await Member.findOne({ id: id });
        if (!memberToDelete) {
            return res.status(404).json({ message: "Không tìm thấy thành viên để xóa" });
        }

        // --- PHÂN QUYỀN PHÁI: Kiểm tra quyền xóa ---
        if (req.user.role.startsWith('branch_')) {
            const allowedBranch = req.user.role.split('_')[1];
            if (String(memberToDelete.branch) !== allowedBranch) {
                return res.status(403).json({ message: `Bạn chỉ được xóa thành viên thuộc Phái ${allowedBranch}.` });
            }
        }

        // Xóa thành viên khỏi database
        await Member.deleteOne({ id: id });

        // Cập nhật lại các thành viên khác có liên quan (gỡ bỏ liên kết)
        await Member.updateMany({ fid: id }, { $set: { fid: null } }); // Gỡ liên kết cha
        await Member.updateMany({ mid: id }, { $set: { mid: null } }); // Gỡ liên kết mẹ
        await Member.updateMany({ pid: id }, { $set: { pid: null } }); // Gỡ liên kết vợ/chồng

        await logToDB(req, 'delete', `Xóa thành viên: ${memberToDelete.full_name}`);
        res.json({ message: `Đã xóa thành viên "${memberToDelete.full_name}"` });
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        res.status(500).json({ message: "Lỗi server khi xóa thành viên: " + err.message });
    }
};

const exportToCSV = async (req, res) => {
    try {
        // Chỉ sử dụng Mongoose cho MongoDB
        const members = await Member.find().lean();
        
        // Define headers based on user request, correcting typos
        const headers = [
            'id', 'full_name', 'gender', 'fid', 'mid', 'pid',
            'birth_date', 'death_date', 'is_live', 'branch',
            'generation', 'order', 'phone', 'address', 'job', 'note', 'image'
        ];

        // Helper to escape commas, quotes, and newlines
        const escapeCsvValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            const strValue = String(value);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
        };

        // Create CSV content, starting with the header
        let csvContent = headers.join(',') + '\n';

        for (const member of members) {
            const row = headers.map(header => {
                let val = member[header];
                
                // --- FIX: Chuẩn hóa giới tính (Nam/Nữ) để giống hiển thị trên Web ---
                if (header === 'gender') {
                    const s = String(val || '').trim().toLowerCase();
                    if (s === 'nữ' || s === 'nu' || s === 'female' || s === 'f') val = 'Nữ';
                    else val = 'Nam'; // Mặc định là Nam nếu không phải Nữ (giống logic Web/Import)
                }
                
                // --- FIX: Chuẩn hóa trạng thái (1/0) ---
                if (header === 'is_live') {
                    if (val === undefined || val === null) val = true; // Mặc định true theo Schema
                    val = (val === true || val === 'true' || val === 1 || val === '1') ? '1' : '0';
                }

                return escapeCsvValue(val);
            });
            csvContent += row.join(',') + '\n';
        }

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename="giapha_export_${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send('\ufeff' + csvContent); // Add BOM for Excel to correctly open UTF-8
    } catch (error) {
        console.error('Lỗi khi xuất CSV:', error);
        res.status(500).json({ message: 'Lỗi server khi xuất file CSV: ' + error.message });
    }
};

// --- Logic Xuất GEDCOM (MyHeritage Standard) ---
const exportToGEDCOM = async (req, res) => {
    try {
        // 1. Lấy dữ liệu dạng object thuần túy để xử lý nhanh
        const members = await Member.find().lean();

        let allIndis = {};
        let families = {};
        let indiToFamC = {}; // Người này là con của gia đình nào
        let indiToFamS = {}; // Người này là vợ/chồng của gia đình nào (Set)

        // --- BƯỚC 1: QUÉT TẤT CẢ CÁ NHÂN (INDI) ---
        members.forEach(m => {
            const id = m.id;
            if (!id) return;

            // Xác định giới tính chuẩn GEDCOM (M/F)
            let sex = "M";
            const genderRaw = String(m.gender || "").toLowerCase();
            // Ưu tiên check theo trường gender, fallback sang ID nếu gender ko rõ
            if (genderRaw === 'nữ' || genderRaw.includes("fe") || genderRaw.includes("nu")) {
                sex = "F";
            } else if (genderRaw !== 'nam' && genderRaw !== 'male' && parseInt(id) >= 5000) {
                // Logic fallback cũ: ID >= 5000 là nữ (nếu không xác định được qua gender)
                sex = "F";
            }

            allIndis[id] = {
                name: m.full_name || "Unknown",
                sex: sex,
                birth: m.birth_date || "",
                death: m.death_date || "",
                is_live: m.is_live
            };
        });

        // --- BƯỚC 2: PHÂN LOẠI QUAN HỆ (FAM) ---
        members.forEach(m => {
            const id = m.id;
            
            // A. Xử lý quan hệ Vợ/Chồng (Dựa trên pid)
            if (m.pid && allIndis[id] && allIndis[m.pid]) {
                const spouseId = m.pid;
                // Luôn sắp xếp: Chồng là HUSB, Vợ là WIFE để tạo Key duy nhất
                const h = (allIndis[id].sex === "M") ? id : spouseId;
                const w = (allIndis[id].sex === "F") ? id : spouseId;
                
                // Chỉ tạo gia đình nếu xác định được đúng 1 Nam 1 Nữ (hoặc logic tương đối)
                const fKey = `FAM_H${h}_W${w}`;

                if (!families[fKey]) families[fKey] = { h, w, ch: [] };
                
                if (!indiToFamS[h]) indiToFamS[h] = new Set();
                if (!indiToFamS[w]) indiToFamS[w] = new Set();
                indiToFamS[h].add(fKey);
                indiToFamS[w].add(fKey);
            }

            // B. Xử lý quan hệ Con cái (Dựa trên fid và mid)
            if (m.fid || m.mid) {
                const parentH = m.fid || "Unknown"; // Cha
                const parentW = m.mid || "Unknown"; // Mẹ
                // Tạo key gia đình cha mẹ (Lưu ý: Key này có thể khác key vợ chồng ở trên nếu dữ liệu pid thiếu)
                // Để đơn giản và khớp, ta ưu tiên dùng fid/mid làm key
                const fKey = `FAM_H${parentH}_W${parentW}`;

                if (!families[fKey]) families[fKey] = { h: m.fid, w: m.mid, ch: [] };
                families[fKey].ch.push(id);
                indiToFamC[id] = fKey;
            }
        });

        // --- BƯỚC 3: XÂY DỰNG NỘI DUNG GEDCOM ---
        let ged = "0 HEAD\n1 CHAR UTF-8\n1 GEDC\n2 VERS 5.5.1\n1 SUBM @SUBM@\n0 @SUBM@ SUBM\n1 NAME Gia Pha Le Cong App\n";

        // Xuất thông tin cá nhân (INDI)
        for (let id in allIndis) {
            const p = allIndis[id];
            ged += `0 @I${id}@ INDI\n`;
            ged += `1 NAME ${p.name}\n`;
            ged += `1 SEX ${p.sex}\n`;
            
            if (p.birth) ged += `1 BIRT\n2 DATE ${p.birth}\n`;
            
            // Logic chết: Có ngày mất HOẶC is_live = false
            if (p.death) {
                ged += `1 DEAT\n2 DATE ${p.death}\n`;
            } else if (p.is_live === false || p.is_live === 0 || p.is_live === '0') {
                ged += `1 DEAT Y\n`; 
            }

            if (indiToFamC[id]) ged += `1 FAMC @${indiToFamC[id]}@\n`;
            if (indiToFamS[id]) {
                indiToFamS[id].forEach(fk => ged += `1 FAMS @${fk}@\n`);
            }
        }

        // Xuất thông tin gia đình (FAM)
        for (let fKey in families) {
            const fam = families[fKey];
            ged += `0 @${fKey}@ FAM\n`;
            if (fam.h && allIndis[fam.h]) ged += `1 HUSB @I${fam.h}@\n`;
            if (fam.w && allIndis[fam.w]) ged += `1 WIFE @I${fam.w}@\n`;
            
            // Loại bỏ con cái trùng lặp
            const uniqueChildren = [...new Set(fam.ch)];
            uniqueChildren.forEach(cid => {
                if (allIndis[cid]) ged += `1 CHIL @I${cid}@\n`;
            });
        }

        ged += "0 TRLR";

        // Thiết lập header để trình duyệt tự động tải xuống
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename="GiaPha_LeCong_${new Date().toISOString().slice(0, 10)}.ged"`);
        res.send(ged);

    } catch (error) {
        console.error('Lỗi khi xuất GEDCOM:', error);
        res.status(500).json({ message: 'Lỗi server khi xuất file GEDCOM: ' + error.message });
    }
};

const importSheets = async (req, res) => {
    const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";
    
    // Hàm hỗ trợ lấy dữ liệu linh hoạt (Chuẩn hóa key bỏ dấu cách và gạch dưới)
    const getCol = (row, keys) => {
        // row là object { normalized_header: value }
        for (const key of keys) {
            // Chuẩn hóa key tìm kiếm: "Full Name" -> "fullname", "full_name" -> "fullname"
            const searchKey = key.trim().toLowerCase().replace(/[\s_]+/g, '');
            if (row[searchKey] !== undefined && row[searchKey] !== null && String(row[searchKey]).trim() !== '') {
                return String(row[searchKey]).trim();
            }
        }
        return null;
    };
    

    // Hàm chuẩn hóa giới tính: Nữ/nu -> "Nữ", còn lại (bao gồm trống, Nam, male...) mặc định là "Nam"
    const normalizeGender = (val) => {
        const s = (val || '').trim().toLowerCase();
        if (s === 'nữ' || s === 'nu') {
            return 'Nữ';
        }
        // Mặc định là "Nam" cho tất cả các trường hợp còn lại để đảm bảo dữ liệu hợp lệ.
        // Điều này xử lý các trường hợp: 'nam', 'male', chuỗi trống, hoặc các giá trị không xác định khác.
        return 'Nam';
    };

    try {
        if (!google) {
            return res.status(500).json({ message: "Server thiếu thư viện 'googleapis'. Vui lòng chạy lệnh: npm install googleapis" });
        }

        // 1. Lấy cấu hình từ .env
        const SHEET_ID = process.env.GOOGLE_SHEET_ID;
        const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
        
        // --- FIX: Xử lý Private Key an toàn hơn ---
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            // Nếu key bị bao bởi ngoặc kép thừa (do copy paste), gỡ bỏ
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            // Thay thế \n thành xuống dòng thật
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
            return res.status(500).json({ message: 'Chưa cấu hình Google Credentials trong file .env' });
        }

        console.log('📥 Đang kết nối Google Sheets API...');
        
        // 2. Kết nối Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 3. Lấy danh sách các Sheet trong file
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
        if (!meta.data.sheets || meta.data.sheets.length === 0) {
            throw new Error("File Google Sheet không có trang tính nào.");
        }

        const sheetList = meta.data.sheets.map(s => s.properties.title);
        console.log('📄 Danh sách Sheet tìm thấy:', sheetList);

        // Hàm chuẩn hóa tên để so sánh (bỏ khoảng trắng thừa, chuyển thường)
        const norm = (s) => s ? s.trim().toLowerCase() : '';

        // Tìm sheet "Data" (hoặc sheet đầu tiên)
        let dataSheetName = sheetList.find(s => norm(s) === 'data') || sheetList[0];
        
        // Tìm sheet "dData" (hoặc sheet khác Data)
        let dDataSheetName = sheetList.find(s => norm(s) === 'ddata');
        
        if (!dDataSheetName) {
            // Nếu không tìm thấy sheet tên "dData", tìm sheet bất kỳ khác "Data"
            dDataSheetName = sheetList.find(s => s !== dataSheetName);
            if (dDataSheetName) {
                console.log(`⚠️ Không thấy sheet tên "dData", hệ thống sẽ thử đọc sheet: "${dDataSheetName}"`);
            }
        }

        // Hàm đọc và parse dữ liệu từ 1 sheet
        const readSheet = async (sheetName) => {
            if (!sheetName) return [];
            console.log(`📥 Đang đọc sheet: "${sheetName}"...`);
            try {
                // QUAN TRỌNG: Thêm dấu nháy đơn '' bao quanh tên sheet để tránh lỗi nếu tên có khoảng trắng
                const range = `'${sheetName}'!A:Z`;
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: range,
                    valueRenderOption: 'UNFORMATTED_VALUE', // Lấy giá trị thô để tránh lỗi format ngày tháng
                });
                const rows = res.data.values;
                if (!rows || rows.length < 2) return []; // Không có dữ liệu hoặc chỉ có header

                // Chuẩn hóa header: "Họ và tên" -> "hovaten", "Full Name" -> "fullname"
                const headers = rows[0].map(h => h.toString().trim().toLowerCase().replace(/[\s_]+/g, ''));
                
                return rows.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        if (header) { // Chỉ map nếu header không rỗng
                            obj[header] = row[index] !== undefined ? row[index] : '';
                        }
                    });
                    return obj;
                });
            } catch (e) {
                console.warn(`⚠️ Không đọc được sheet "${sheetName}": ${e.message}`);
                return [];
            }
        };

        // 4. Đọc song song cả 2 sheet
        const [records, spouseRecords] = await Promise.all([
            readSheet(dataSheetName),
            readSheet(dDataSheetName)
        ]);

        console.log(`✅ Kết quả: ${records.length} dòng (Data) và ${spouseRecords.length} dòng (dData).`);

        if (records.length === 0 && spouseRecords.length === 0) {
            return res.status(400).json({ message: 'Không tìm thấy dữ liệu thành viên nào trong cả 2 sheet.' });
        }

        await Member.deleteMany({});

        const allPeople = [
            ...records.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha', 'ma cha', 'mã cha', 'bố', 'id bố', 'mã bố', 'bo']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ', 'ma me', 'mã mẹ', 'ma mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng', 'ma vo chong', 'mã vợ chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'adress', 'địa chỉ', 'dia chi'], ''),
                phone: getCol(r, ['phone', 'mobile', 'sđt', 'số điện thoại', 'tel'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                note: getCol(r, ['note', 'ghi chú', 'ghi chu', 'notes'], ''),
                image: getCol(r, ['image', 'photo', 'avatar', 'ảnh', 'anh', 'hình', 'hinh', 'url'], ''),
                generation: parseInt(getCol(r, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
                order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('S' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha', 'ma cha', 'mã cha', 'bố', 'id bố', 'mã bố', 'bo']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ', 'ma me', 'mã mẹ', 'ma mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng', 'ma vo chong', 'mã vợ chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'adress', 'địa chỉ', 'dia chi'], ''),
                phone: getCol(r, ['phone', 'mobile', 'sđt', 'số điện thoại', 'tel'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                note: getCol(r, ['note', 'ghi chú', 'ghi chu', 'notes'], ''),
                image: getCol(r, ['image', 'photo', 'avatar', 'ảnh', 'anh', 'hình', 'hinh', 'url'], ''),
                generation: parseInt(getCol(r, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
                order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
                temp_id: `spouse_${clean(r.id)}`
            }))
        ];

        // Lọc trùng lặp và loại bỏ dữ liệu rác (dòng trống)
        const uniquePeopleMap = new Map();
        allPeople.forEach(person => {
            // Bỏ qua nếu tên là "Chưa có tên" (do dòng trống sinh ra)
            if (person.full_name === 'Chưa có tên') return;

            // Chỉ thêm vào nếu ID chưa có trong Map
            if (person.id && !uniquePeopleMap.has(person.id)) {
                uniquePeopleMap.set(person.id, person);
            }
        });
        const uniquePeople = Array.from(uniquePeopleMap.values());

        const docs = await Member.insertMany(uniquePeople);
        await logToDB(req, 'create', `Đồng bộ ${docs.length} thành viên từ Google Sheets`);
        res.json({ message: `Đã nạp thành công ${docs.length} thành viên từ Google Sheets!` });
    } catch (error) {
        console.error('Google Sheets Import Error:', error);
        res.status(500).json({ message: 'Lỗi khi nạp dữ liệu từ Google Sheets: ' + error.message });
    }
};

// --- Logic Xuất ngược lên Google Sheets (Sync Up) ---
const exportToGoogleSheets = async (req, res) => {
    try {
        if (!google) {
            return res.status(500).json({ message: "Server thiếu thư viện 'googleapis'. Vui lòng chạy lệnh: npm install googleapis" });
        }

        // 1. Kiểm tra cấu hình môi trường
        const SHEET_ID = process.env.GOOGLE_SHEET_ID;
        const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
        // Xử lý xuống dòng trong Private Key (do .env thường gộp thành 1 dòng)
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        // --- DEBUG: In ra console để kiểm tra biến nào bị thiếu ---
        console.log('--- DEBUG GOOGLE SHEETS CONFIG ---');
        console.log('1. SHEET_ID:', SHEET_ID ? `OK (${SHEET_ID.substring(0, 5)}...)` : '❌ MISSING');
        console.log('2. CLIENT_EMAIL:', CLIENT_EMAIL ? `OK (${CLIENT_EMAIL})` : '❌ MISSING');
        console.log('3. PRIVATE_KEY:', PRIVATE_KEY ? `OK (${PRIVATE_KEY.substring(0, 25)}...)` : '❌ MISSING');
        // ---------------------------------------------------------

        if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
            return res.status(500).json({ 
                message: `Thiếu cấu hình: ${!SHEET_ID ? 'SHEET_ID ' : ''}${!CLIENT_EMAIL ? 'CLIENT_EMAIL ' : ''}${!PRIVATE_KEY ? 'PRIVATE_KEY' : ''}. Xem Terminal để biết chi tiết.` 
            });
        }

        // 2. Lấy dữ liệu từ MongoDB
        const members = await Member.find().select('-__v -_id').lean();
        if (members.length === 0) {
            return res.status(400).json({ message: 'Database trống, không có gì để đồng bộ.' });
        }

        // 3. Chuẩn bị Header và Dữ liệu
        // Phân loại dữ liệu dựa trên ID
        const dataMembers = [];
        const dDataMembers = [];

        members.forEach(m => {
            const idVal = parseInt(m.id);
            if (!isNaN(idVal)) {
                if (idVal < 5001) dataMembers.push(m);
                else dDataMembers.push(m);
            } else {
                dataMembers.push(m); // ID cũ đưa vào Data
            }
        });

        // Map dữ liệu sang mảng
        const rowsData = dataMembers.map(m => mapMemberToRow(m, 'Data'));
        const rowsdData = dDataMembers.map(m => mapMemberToRow(m, 'dData'));

        // Headers (để ghi vào dòng 1 nếu cần, nhưng ở đây ta ghi từ A2)
        // Data: A-P (16 cột)
        const headerData = ['id', 'full_name', 'gender', 'fid', 'mid', 'birth_date', 'death_date', 'is_live', 'branch', 'generation', 'order', 'phone', 'address', 'job', 'note', 'image'];
        // dData: A-O (15 cột)
        const headerdData = ['id', 'full_name', 'gender', 'pid', 'birth_date', 'death_date', 'is_live', 'branch', 'generation', 'order', 'phone', 'address', 'job', 'note', 'image'];

        // 4. Kết nối Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 5. Thực hiện Ghi đè (Clear + Update) cho Sheet Data (A2:P)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Data!A2:P',
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Data!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsData },
        });

        // 6. Thực hiện Ghi đè cho Sheet dData (A2:O)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'dData!A2:O',
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'dData!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsdData },
        });

        await logToDB(req, 'update', `Export ${members.length} thành viên lên 2 Sheets`);
        res.json({ success: true, message: `Đã đồng bộ ${dataMembers.length} dòng vào Data và ${dDataMembers.length} dòng vào dData.` });

    } catch (error) {
        console.error('Google Sheets Export Error:', error);
        res.status(500).json({ message: 'Lỗi khi ghi lên Google Sheets: ' + error.message });
    }
};

// --- Logic Xử lý Bài viết (Posts) ---

const getPosts = async (req, res) => {
    try {
        // Sắp xếp theo bài ghim, sau đó là ngày cập nhật mới nhất
        const posts = await Post.find().sort({ is_pinned: -1, updated_at: -1, created_at: -1 });
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createPost = async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        let imagePath = '';
        
        if (req.file) {
            const imgBuffer = fs.readFileSync(req.file.path);
            imagePath = `data:${req.file.mimetype};base64,${imgBuffer.toString('base64')}`;
            fs.unlink(req.file.path, (err) => { if (err) console.error("Lỗi xóa file tạm:", err); });
        }

        const newPost = new Post({
            title,
            content,
            category,
            is_pinned: is_pinned === 'true' || is_pinned === true,
            image: imagePath
        });

        await newPost.save();
        await logToDB(req, 'create', `Đăng bài viết mới: ${title}`);
        res.json({ success: true, post: newPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const updatePost = async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        const updateData = { 
            title, 
            content, 
            category, 
            is_pinned: is_pinned === 'true' || is_pinned === true,
            updated_at: Date.now() // Luôn cập nhật ngày sửa đổi
        };

        if (req.file) {
            const imgBuffer = fs.readFileSync(req.file.path);
            updateData.image = `data:${req.file.mimetype};base64,${imgBuffer.toString('base64')}`;
            fs.unlink(req.file.path, (err) => { if (err) console.error("Lỗi xóa file tạm:", err); });
        }

        const updatedPost = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
        await logToDB(req, 'update', `Cập nhật bài viết: ${title}`);
        res.json({ success: true, post: updatedPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const deletePost = async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.id);
        await logToDB(req, 'delete', `Xóa bài viết ID: ${req.params.id}`);
        res.json({ success: true, message: 'Đã xóa bài viết' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Logic Thống kê Visit ---
const getVisitCount = async (req, res) => {
    try {
        let visit = await Visit.findOne();
        if (!visit) {
            visit = new Visit({ count: 0 });
            await visit.save();
        }
        // Nếu có cờ increment thì tăng số đếm
        if (req.query.increment === 'true') {
            visit.count += 1;
            visit.last_updated = Date.now();
            await visit.save();
        }
        res.json({ success: true, count: visit.count });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// --- Định nghĩa Routes ---

// Lấy danh sách thành viên (Có thể để công khai hoặc bảo vệ tùy bạn)
router.get('/members', auth, getMembers);

// Thêm thành viên mới (Cần đăng nhập)
router.post('/members', auth, editorOnly, upload.single('image'), createMember);

// Cập nhật thành viên (Sửa)
router.put('/members/:id', auth, editorOnly, upload.single('image'), updateMember);

// Xóa thành viên
router.delete('/members/:id', auth, editorOnly, deleteMember);

// Import Google Sheets
router.post('/import-sheets', auth, adminOnly, importSheets);

// Export to Google Sheets (Sync Up)
router.post('/export-sheets', auth, adminOnly, exportToGoogleSheets);

// THÊM MỚI: API lấy danh sách hoạt động
router.get('/activities', auth, async (req, res) => {
    try {
        const logs = await Activity.find().sort({ created_at: -1 }).limit(20);
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// API Thống kê truy cập
router.get('/stats/visit', auth, getVisitCount);

// THÊM MỚI: API xóa toàn bộ hoạt động
router.delete('/activities', auth, adminOnly, async (req, res) => {
    try {
        await Activity.deleteMany({});
        res.json({ success: true, message: 'Đã xóa sạch lịch sử hoạt động.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// THÊM MỚI: Route để xuất dữ liệu ra file CSV
router.get('/export-csv', auth, exportToCSV);

// THÊM MỚI: Route để xuất dữ liệu ra file GEDCOM
router.get('/export-gedcom', auth, adminOnly, exportToGEDCOM);

// THÊM MỚI: Route để import từ file CSV do người dùng tải lên
router.post('/import-csv', auth, adminOnly, upload.single('csvfile'), async (req, res) => {
    // 'csvfile' phải khớp với tên field trong FormData ở frontend
    if (!req.file) {
        return res.status(400).json({ message: 'Vui lòng tải lên một file CSV.' });
    }

    const filePath = req.file.path;
    const replaceData = req.body.replace === 'true'; // Kiểm tra cờ thay thế

    try {
        // Đọc file và xử lý BOM (Byte Order Mark) để tránh lỗi header
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Parse CSV với cấu hình chuẩn
        const records = parse(fileContent, {
            columns: header => header.map(column => column.trim().toLowerCase().replace(/[\s_]+/g, '')), // Chuẩn hóa header (bỏ dấu cách, chữ thường)
            skip_empty_lines: true,
            bom: true, // QUAN TRỌNG: Tự động xử lý ký tự BOM của Excel
            trim: true,
            relax_column_count: true
        });

        if (!records || records.length === 0) {
            throw new Error('File CSV trống hoặc không đúng định dạng.');
        }

        // Helper functions (Tái sử dụng logic mapping)
        const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";
        const normalizeGender = (val) => {
            const s = (val || '').trim().toLowerCase();
            return (s === 'nữ' || s === 'nu') ? 'Nữ' : 'Nam';
        };
        const getCol = (row, keys) => {
            for (const key of keys) {
                const searchKey = key.trim().toLowerCase().replace(/[\s_]+/g, '');
                if (row[searchKey] !== undefined && row[searchKey] !== null && String(row[searchKey]).trim() !== '') {
                    return String(row[searchKey]).trim();
                }
            }
            return null;
        };

        // Map dữ liệu CSV sang Model Member
        const members = records.map(r => ({
            id: getCol(r, ['id', 'mã', 'ma']) || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
            full_name: getCol(r, ['fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
            gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
            fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha']),
            mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ']),
            pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng']),
            birth_date: getCol(r, ['birthdate', 'birth', 'ngày sinh', 'dob'], ''),
            death_date: getCol(r, ['deathdate', 'death', 'ngày mất', 'dod'], ''),
            is_live: getCol(r, ['islive', 'alive', 'còn sống'], '1') !== '0',
            branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
            generation: parseInt(getCol(r, ['generation', 'gen', 'đời'], 1)) || 1,
            order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
            phone: getCol(r, ['phone', 'mobile', 'sđt'], ''),
            address: getCol(r, ['address', 'địa chỉ'], ''),
            job: getCol(r, ['job', 'nghề nghiệp'], ''),
            note: getCol(r, ['note', 'ghi chú'], ''),
            image: getCol(r, ['image', 'photo', 'avatar', 'ảnh'], '')
        }));

        // Xử lý Database
        if (replaceData) {
            await Member.deleteMany({}); // Xóa sạch cũ nếu chọn thay thế
            await Member.insertMany(members);
        } else {
            // Upsert (Cập nhật nếu có, Thêm nếu chưa)
            const bulkOps = members.map(m => ({
                updateOne: { filter: { id: m.id }, update: { $set: m }, upsert: true }
            }));
            await Member.bulkWrite(bulkOps);
        }

        let message = `Nhập dữ liệu thành công! Đã xử lý ${members.length} thành viên.`;
        if (replaceData) message += ' (Đã xóa dữ liệu cũ)';
        
        logToDB(req, 'create', `Import file CSV: ${members.length} thành viên ${replaceData ? '(Thay thế)' : ''}`);
        res.json({ message });
    } catch (error) {
        console.error('Lỗi khi import CSV:', error);
        res.status(500).json({ message: 'Lỗi xử lý file CSV: ' + error.message });
    } finally {
        // Xóa file tạm sau khi xử lý xong để dọn dẹp server
        fs.unlink(filePath, (err) => {
            if (err) console.error("Lỗi xóa file tạm:", err);
        });
    }
});

// --- Routes cho Bài viết ---
router.get('/posts', auth, getPosts);
router.get('/posts/:id', auth, getPostById);
router.post('/posts', auth, editorOnly, upload.single('image'), createPost); // Cho phép Trưởng phái đăng bài
router.put('/posts/:id', auth, editorOnly, upload.single('image'), updatePost);
router.delete('/posts/:id', auth, editorOnly, deletePost);

module.exports = router;