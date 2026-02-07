const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth'); // Sử dụng middleware xác thực có sẵn
const mongoose = require('mongoose');

// Thêm middleware upload để xử lý ảnh (nếu có)
let upload;
try { upload = require('../middleware/upload'); } 
catch (e) { upload = { single: () => (req, res, next) => next() }; }

// --- Activity Model & Helper (Thêm để ghi log) ---
const ActivitySchema = new mongoose.Schema({
    actor_name: String,
    actor_role: String,
    action_type: { type: String, enum: ['create', 'update', 'delete'] },
    description: String,
    created_at: { type: Date, default: Date.now }
});
const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);

async function logToDB(req, type, description) {
    try {
        const name = (req.user && req.user.full_name) ? req.user.full_name : 'Admin';
        const role = (req.user && req.user.role) ? req.user.role : 'owner';
        await Activity.create({ actor_name: name, actor_role: role, action_type: type, description });
    } catch (e) {
        console.error("Logging failed:", e.message);
    }
}

// 1. Lấy tất cả bài viết
router.get('/', auth, async (req, res) => {
    try {
        // Sắp xếp: Ghim lên đầu, sau đó đến ngày tạo mới nhất
        const posts = await Post.find()
            .populate('author', 'username') // Lấy tên tác giả từ bảng User
            .sort({ is_pinned: -1, created_at: -1 });
        
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Tạo bài viết mới
router.post('/', auth, upload.single('image'), async (req, res) => {
    try {
        // Kiểm tra quyền: Chỉ Admin/Owner mới được đăng bài
        if (req.user.role !== 'admin' && req.user.role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền đăng bài viết.' });
        }

        const { title, content, category, is_pinned } = req.body;
        let imagePath = '';

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Tiêu đề và nội dung là bắt buộc' });
        }

        if (req.file) {
            let safePath = req.file.path.replace(/\\/g, '/');
            if (safePath.includes('public/')) {
                safePath = safePath.split('public/').pop();
            } else if (safePath.includes('uploads/')) {
                safePath = 'uploads/' + safePath.split('uploads/').pop();
            }
            if (!safePath.startsWith('/')) safePath = '/' + safePath;
            imagePath = safePath;
        }

        const newPost = new Post({
            title,
            content,
            category: category || 'announcement',
            is_pinned: is_pinned || false,
            image: imagePath,
            author: req.user.id // Lấy ID user từ token (middleware auth)
        });

        await newPost.save();
        logToDB(req, 'create', `Đăng bài viết: ${title}`); // Ghi log
        res.status(201).json({ success: true, message: 'Đã tạo bài viết', post: newPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Lấy chi tiết 1 bài viết
router.get('/:id', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate('author', 'username');
        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Cập nhật bài viết
router.put('/:id', auth, upload.single('image'), async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

        // Kiểm tra quyền: Chỉ tác giả hoặc admin (nếu có role) mới được sửa
        // Ở đây tạm thời chỉ kiểm tra tác giả
        // Bổ sung: Admin/Owner luôn có quyền sửa
        if ((post.author && post.author.toString() !== req.user.id) && (req.user.role !== 'admin' && req.user.role !== 'owner')) {
             return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa bài viết này' });
        }
        
        let imagePath = post.image;
        if (req.file) {
            let safePath = req.file.path.replace(/\\/g, '/');
            if (safePath.includes('public/')) {
                safePath = safePath.split('public/').pop();
            } else if (safePath.includes('uploads/')) {
                safePath = 'uploads/' + safePath.split('uploads/').pop();
            }
            if (!safePath.startsWith('/')) safePath = '/' + safePath;
            imagePath = safePath;
        }

        post.title = title || post.title;
        post.content = content || post.content;
        post.category = category || post.category;
        post.is_pinned = is_pinned !== undefined ? is_pinned : post.is_pinned;
        post.image = imagePath;
        post.updated_at = Date.now();

        await post.save();
        logToDB(req, 'update', `Cập nhật bài viết: ${post.title}`); // Ghi log
        res.json({ success: true, message: 'Cập nhật thành công', post });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. Xóa bài viết
router.delete('/:id', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
        const postTitle = post.title; // Lưu lại tiêu đề để ghi log

        // Kiểm tra quyền
        // Bổ sung: Admin/Owner luôn có quyền xóa
        if ((post.author && post.author.toString() !== req.user.id) && (req.user.role !== 'admin' && req.user.role !== 'owner')) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bài viết này' });
        }

        await Post.findByIdAndDelete(req.params.id);
        logToDB(req, 'delete', `Xóa bài viết: ${postTitle}`); // Ghi log
        res.json({ success: true, message: 'Đã xóa bài viết' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;