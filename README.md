Để phục hồi về bản code cũ đó một cách nhanh nhất và an toàn nhất, bạn hãy mở Terminal (hoặc CMD/Git Bash) tại thư mục dự án trên máy tính và chạy lần lượt 3 lệnh sau:

Bước 1: Kéo dữ liệu từ GitHub về (để máy nhận diện mã hash)

git fetch origin

Bước 2: Ép code ở máy tính quay về đúngbản đang chạy trên Railway

git reset --hard bc3d182b15f1a73d35cd5245a10a750d706e9

Bước 3: Đẩy bản này lên GitHub để xóa bỏ các bản lỗi mới nhất

git push origin main --force

(Nếu nhánh chính của bạn tên là master thay vì main, hãy đổi tên ở cuối lệnh).

Kết quả sau khi chạy:
GitHub: Sẽ quay trở lại đúng trạng thái của bản bc3d182. Các thay đổi gây lỗi quyền Admin sẽ bị xóa sạch.

Railway: Sẽ nhận thấy GitHub vừa có cập nhật và tự động chạy lại (Redeploy) bản này.
