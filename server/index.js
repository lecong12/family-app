const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // 1. Xác định đường dẫn file dựa trên yêu cầu từ trình duyệt
    // Nếu URL là '/', ta phục vụ index.html. Nếu không, ta tìm trong thư mục public.
    let filePath = req.url === '/' 
        ? path.join(__dirname, '../public/index.html') 
        : path.join(__dirname, '../public', req.url);

    // 2. Xác định loại tệp (MIME type) để trình duyệt hiểu cách xử lý
    const extname = path.extname(filePath);
    let contentType = 'text/html';

    switch (extname) {
        case '.css':
            contentType = 'text/css';
            break;
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
    }

    // 3. Đọc file và gửi dữ liệu về trình duyệt
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Không tìm thấy file (Lỗi 404)
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found: Khong tim thay tep');
            } else {
                // Lỗi server khác (Lỗi 500)
                res.writeHead(500);
                res.end(`Loi server: ${err.code}`);
            }
        } else {
            // Thành công: Gửi file với đúng Content-Type
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server Node.js thuan dang chay tai http://localhost:${PORT}`);
});
