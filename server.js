require('dotenv').config();
const express = require('express');
const path = require('path');

// --- FIX: Bắt lỗi thiếu thư viện Mongoose ---
let mongoose;
try {
    mongoose = require('mongoose');
} catch (e) {
    console.error('❌ LỖI NGHIÊM TRỌNG: Chưa cài đặt thư viện "mongoose". Hãy chạy lệnh: npm install mongoose');
    process.exit(1);
}

const cors = require('cors'); // Thêm CORS để tránh lỗi kết nối từ trình duyệt

// Cấu hình kết nối Database trực tiếp (Bỏ qua file config cũ để tránh nhầm lẫn)
const connectDB = async () => {
    // Ưu tiên lấy từ .env, nếu không có thì dùng chuỗi mặc định trỏ vào 'family-app'
    const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://lecong12:Lecong78@cluster0.onrzjrx.mongodb.net/family-app?retryWrites=true&w=majority';
    console.log(`🔌 Đang kết nối tới Database...`);
    try { 
        await mongoose.connect(MONGO_URI); 
        console.log('✅ MongoDB Connected'); 
        console.log(`💽 Đang sử dụng Database: "${mongoose.connection.name}"`);

        // --- DEBUG: Kiểm tra dữ liệu thực tế trong DB ---
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📂 Danh sách Collection trong Database:');
        
        let memberCount = 0;
        const memberCol = collections.find(c => c.name === 'members');

        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`   👉 Collection "${col.name}": ${count} bản ghi`);
        }

        if (memberCol) {
            memberCount = await mongoose.connection.db.collection('members').countDocuments();
            if (memberCount === 0) {
                console.warn(`⚠️ CẢNH BÁO: Có collection 'members' nhưng TRỐNG (0 bản ghi).`);
                console.warn(`👉 Hãy kiểm tra xem bạn có đang kết nối nhầm Database không? (Hiện tại: "${mongoose.connection.name}")`);
            } else {
                console.log(`✅ Đã tìm thấy dữ liệu! Collection 'members' có ${memberCount} thành viên.`);
            }
        } else {
            console.error(`❌ LỖI: Không tìm thấy collection 'members' trong database "${mongoose.connection.name}".`);
        }
        // ------------------------------------------------
    }
    catch (e) { 
        console.error('❌ Lỗi kết nối DB:', e.message); 
        console.warn('⚠️ Server vẫn chạy nhưng chưa kết nối được Database (Kiểm tra lại MONGO_URI).');
        // process.exit(1); // Tạm thời không tắt server để bạn có thể đăng nhập và debug
    }
};

// Nạp Router an toàn (Tránh crash nếu thiếu file)
let apiRouter, authRouter, postsRouter;
try {
    // 1. Ưu tiên nạp từ utils/api (Cấu trúc mới)
    apiRouter = require('./utils/api');
    console.log('✅ Đã nạp API Router từ utils/api');
} catch (error1) {
    try {
        // 2. Nếu lỗi, thử nạp từ routes/api (Cấu trúc cũ)
        apiRouter = require('./routes/api');
        console.log('✅ Đã nạp API Router từ routes/api');
    } catch (error2) {
        console.error('❌ KHÔNG THỂ NẠP API ROUTER (Kiểm tra lại thư viện hoặc đường dẫn):');
        console.error('   - Lỗi tại utils/api:', error1.message);
        console.error('   - Lỗi tại routes/api:', error2.message);
    }
}

try {
    authRouter = require('./routes/auth');
} catch (error) {
    console.error('❌ Lỗi nạp Auth Router:', error.message);
}

try {
    postsRouter = require('./routes/posts');
} catch (error) {
    console.error('❌ Lỗi nạp Posts Router:', error.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware xử lý JSON (quan trọng cho Login)
app.use(express.json({ limit: '50mb' })); // Tăng giới hạn upload JSON
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Tăng giới hạn form data
app.use(cors());

const publicPath = path.resolve(__dirname, 'public');
console.log('📂 Đang phục vụ file tĩnh từ:', publicPath); // Log đường dẫn để debug
// Phục vụ file tĩnh chuẩn xác
app.use(express.static(publicPath));

// Route gốc: Đảm bảo luôn trả về index.html khi truy cập trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Health Check: Để Render biết server vẫn đang chạy tốt
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// DEBUG: Trang kiểm tra trạng thái hệ thống
app.get('/status', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
    
    res.json({
        database: states[dbState] || 'Unknown',
        routers: {
            auth: !!authRouter ? 'OK' : 'FAILED (Check logs)',
            api: !!apiRouter ? 'OK' : 'FAILED (Check logs)',
            posts: !!postsRouter ? 'OK' : 'FAILED (Check logs)'
        },
        mongo_uri_configured: !!process.env.MONGO_URI,
        port: PORT
    });
});

// 4. API Routes
if (authRouter) app.use('/api/auth', authRouter);
if (apiRouter) app.use('/api', apiRouter);

// 404 Handler cho API: Trả về JSON thay vì HTML nếu gọi sai đường dẫn API
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found', error: 'API Route not found', path: req.originalUrl });
});

// 1. Khởi động Server NGAY LẬP TỨC (Để Render không bị timeout)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    
    // 2. Sau đó mới thực hiện kết nối Database
    if (!process.env.MONGO_URI) {
        console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy biến MONGO_URI. Server có thể không kết nối được DB trên Cloud.');
    } else {
        console.log('✅ Tìm thấy biến môi trường MONGO_URI');
    }
    connectDB();
});

// Bắt các lỗi không mong muốn để tránh sập server
process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi không mong muốn (Uncaught Exception):', err);
    process.exit(1); // Thoát tiến trình để môi trường (Render) tự khởi động lại
});

// Bắt các Promise bị từ chối nhưng không được xử lý
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Lỗi không được xử lý (Unhandled Rejection):', reason);
  process.exit(1); // Thoát tiến trình
});