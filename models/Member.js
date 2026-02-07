// c:\Users\129\family-app\models\Member.js
const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    full_name: { type: String, required: true },
    gender: { type: String, enum: ['Nam', 'Nữ'], default: 'Nam' },
    birth_date: String,
    death_date: String,
    is_live: { type: Boolean, default: true },
    fid: String, // ID Cha
    mid: String, // ID Mẹ
    pid: String, // ID Vợ/Chồng
    generation: Number, // Đời thứ mấy
    order: Number,      // Thứ tự trong gia đình
    branch: String,     // Chi/Phái
    address: { type: String, default: '' }, // Thêm địa chỉ
    phone: { type: String, default: '' },   // Thêm số điện thoại
    job: { type: String, default: '' },     // Thêm nghề nghiệp
    note: { type: String, default: '' },    // Thêm ghi chú
    image: { type: String, default: '' }    // Thêm ảnh đại diện
});

// --- QUAN TRỌNG: Xóa model cũ để nạp lại Schema mới (có trường image) ---
// Dòng này bắt buộc phải có khi sửa Schema trong quá trình dev
if (mongoose.models && mongoose.models.Member) delete mongoose.models.Member;

module.exports = mongoose.model('Member', memberSchema);
