const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth'); // Sử dụng middleware xác thực có sẵn

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
router.post('/', auth, async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Tiêu đề và nội dung là bắt buộc' });
        }

        const newPost = new Post({
            title,
            content,
            category: category || 'announcement',
            is_pinned: is_pinned || false,
            author: req.user.id // Lấy ID user từ token (middleware auth)
        });

        await newPost.save();
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
router.put('/:id', auth, async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

        // Kiểm tra quyền: Chỉ tác giả hoặc admin (nếu có role) mới được sửa
        // Ở đây tạm thời chỉ kiểm tra tác giả
        if (post.author.toString() !== req.user.id) {
             // Nếu muốn cho phép admin sửa, cần check req.user.role === 'admin'
             return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa bài viết này' });
        }

        post.title = title || post.title;
        post.content = content || post.content;
        post.category = category || post.category;
        post.is_pinned = is_pinned !== undefined ? is_pinned : post.is_pinned;
        post.updated_at = Date.now();

        await post.save();
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

        // Kiểm tra quyền
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bài viết này' });
        }

        await Post.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa bài viết' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;