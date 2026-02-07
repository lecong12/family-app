const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'news' },
    image: String,
    is_pinned: { type: Boolean, default: false },
    
    // Sửa lại trường này để tự động lấy thời gian hiện tại nếu không truyền vào
    // Giữ nguyên tên created_at để Frontend không bị lỗi "Invalid Date"
    created_at: { 
        type: Date, 
        default: Date.now 
    }
}, { 
    collection: 'posts', // Ép về số nhiều như bạn muốn
    timestamps: false    // Tắt timestamps tự động để tránh tạo ra quá nhiều trường thời gian gây loạn
});

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);
