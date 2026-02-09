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
    const MONGO_URI = process.env.MONGO_URI;
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
let apiRouter, authRouter;
try {
    // 1. Ưu tiên nạp từ utils/api (Cấu trúc mới)
    apiRouter = require('./utils/api');
    console.log('✅ Đã nạp API Router từ utils/api');
} catch (error) {
    console.error('❌ KHÔNG THỂ NẠP API ROUTER (Kiểm tra lại thư viện hoặc đường dẫn):');
    console.error('   - Lỗi tại utils/api:', error.message);
}

try {
    authRouter = require('./routes/auth');
} catch (error) {
    console.error('❌ Lỗi nạp Auth Router:', error.message);
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
// --- FIX: Phục vụ thư mục uploads để hiển thị ảnh thành viên ---
// Cho phép truy cập đường dẫn dạng /uploads/ten-file.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check: Để Render biết server vẫn đang chạy tốt
app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    // 0: disconnected; 1: connected; 2: connecting; 3: disconnecting
    if (dbState === 1) {
        res.status(200).json({ status: 'UP', db: 'Connected' });
    } else {
        res.status(503).json({ status: 'DOWN', db: 'Disconnected' });
    }
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
        },
        mongo_uri_configured: !!process.env.MONGO_URI,
        port: PORT
    });
});

// --- CẢI TIẾN: Middleware kiểm tra kết nối DB trước khi xử lý API ---
const checkDBConnected = (req, res, next) => {
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) { // 1 = Connected
        return next();
    }
    // Trả về lỗi 503 Service Unavailable nếu DB chưa sẵn sàng
    res.status(503).json({ message: 'Hệ thống đang khởi động, database chưa sẵn sàng. Vui lòng thử lại sau giây lát.' });
};

// 4. API Routes
if (authRouter) app.use('/api/auth', checkDBConnected, authRouter);
if (apiRouter) app.use('/api', checkDBConnected, apiRouter);

// 404 Handler cho API: Trả về JSON thay vì HTML nếu gọi sai đường dẫn API
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API Route not found', error: 'API Route not found', path: req.originalUrl });
});

// Fallback Route: Bất kỳ route nào không phải API sẽ trả về index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// 1. Khởi động Server NGAY LẬP TỨC (Để Render không bị timeout)
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    
    // 2. Sau đó mới thực hiện kết nối Database
    if (!process.env.MONGO_URI) {
        console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy biến MONGO_URI. Server có thể không kết nối được DB trên Cloud.');
    } else {
        console.log('✅ Tìm thấy biến môi trường MONGO_URI');
    }

    // --- KIỂM TRA CẤU HÌNH GOOGLE SHEETS ---
    if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        console.log('✅ Tìm thấy cấu hình Google Sheets (SHEET_ID, EMAIL, KEY)');
    } else {
        console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy cấu hình Google Sheets trong .env (Hãy kiểm tra lại tên file hoặc khởi động lại Server)');
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

// --- FIX: Xử lý đóng server an toàn (Graceful Shutdown) ---
// Giúp tránh lỗi "npm error signal SIGTERM" khi Railway redeploy
const gracefulShutdown = () => {
    console.log('🛑 Đang dừng server (SIGTERM/SIGINT)...');
    
    const closeDB = () => {
        if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
             return mongoose.connection.close(false).then(() => console.log('✅ MongoDB connection closed.'));
        }
        return Promise.resolve();
    };

    if (server) {
        server.close(() => {
            console.log('✅ HTTP Server đã đóng.');
            closeDB().then(() => process.exit(0));
        });
    } else {
        closeDB().then(() => process.exit(0));
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);