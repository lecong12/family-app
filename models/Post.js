const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['announcement', 'event', 'news'],
        default: 'announcement'
    },
    is_pinned: {
        type: Boolean,
        default: false
    },
    image: { type: String, default: '' }, // Thêm trường này để đồng bộ với API upload ảnh
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Liên kết với bảng User
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// --- FIX: Kiểm tra model tồn tại để tránh lỗi OverwriteModelError ---
module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);