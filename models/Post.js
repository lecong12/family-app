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
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Liên kết với bảng User
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);