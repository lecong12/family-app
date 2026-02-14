// --- CẤU HÌNH API URL TỰ ĐỘNG (Đồng bộ với auth.js) ---
let API_URL = '';
const hostname = window.location.hostname;
const protocol = window.location.protocol;
const port = window.location.port;

if (protocol === 'file:') {
    API_URL = 'http://localhost:8060';
    console.log('🔧 Dashboard: File Mode. API URL:', API_URL);
} else if (port && port !== '8060') {
    // Hỗ trợ cả Localhost và IP LAN (192.168.x.x)
    API_URL = `${protocol}//${hostname}:8060`;
    console.log('🔧 Dashboard: Dev/LAN Mode. API URL:', API_URL);
} else {
    console.log('🌍 Dashboard: Production Mode.');
}

// --- HÀM KIỂM TRA KẾT NỐI SERVER ---
async function checkServerConnection() {
    try {
        // Thử gọi API health check
        const res = await fetch(API_URL + '/api/health', { method: 'GET' });
        if (res.ok) return true;
    } catch (err) {
        console.error('❌ Dashboard mất kết nối:', err);
    }

    // Hiển thị cảnh báo nếu mất kết nối
    const warningId = 'connection-warning';
    if (!document.getElementById(warningId)) {
        const warningDiv = document.createElement('div');
        warningDiv.id = warningId;
        warningDiv.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #dc2626; color: white; padding: 12px 24px;
            border-radius: 50px; z-index: 99999; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 10px;
        `;
        warningDiv.innerHTML = `<i class="fas fa-wifi"></i> Mất kết nối đến Server! Đang thử lại...`;
        document.body.appendChild(warningDiv);
    }
}

/* ==========================================================
0. KIỂM TRA TOKEN
========================================================== */
   
/* ============================================================
   CHECK AUTHENTICATION - Hỗ trợ cả Owner và Viewer
============================================================ */
function ensureAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = "/login";
        return false;
    }

    // ✅ FIX: Hỗ trợ cả Token cũ (id_...) và JWT (ey...)
    // Nếu là token cũ (có '_' và không có '.') thì mới kiểm tra format cũ
    if (token.includes('_') && !token.includes('.')) {
        try {
            const parts = token.split('_');
            if (parts.length < 3) throw new Error('Invalid legacy token');
        } catch (err) {
            console.error('Legacy token validation failed:', err);
            localStorage.clear();
            window.location.href = "/login";
            return false;
        }
    }
    
    // Với JWT, ta chỉ kiểm tra sự tồn tại (hoặc decode nếu cần)
    return true;
}
// Biến global để lưu danh sách members và trạng thái edit
let allMembers = [];
let editingMemberId = null;
let editingPostId = null;
let treeRenderer; // Biến quản lý cây gia phả
/* ==========================================================
   HELPER FUNCTIONS
========================================================== */

/**
 * Tính tuổi từ ngày sinh
 * @param {string} birthDate - Ngày sinh format YYYY-MM-DD
 * @returns {number} - Tuổi
 */
function calculateAge(birthDate) {
  if (!birthDate) return 0;
  
  const today = new Date();
  const birth = new Date(birthDate);
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  // Nếu chưa đến sinh nhật trong năm nay thì trừ 1 tuổi
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Rút gọn tên hiển thị cho cây gia phả (theo yêu cầu: 3-4 chữ giữ nguyên, dài hơn lấy 3 chữ cuối)
 */
function formatNameForTree(fullName) {
  if (!fullName) return '';
  const words = fullName.trim().split(/\s+/);
  if (words.length <= 4) return fullName;
  return words.slice(-3).join(' ');
}

/**
 * ✅ Hàm format ngày an toàn (Tránh lỗi Invalid Date)
 */
function formatDateSafe(dateString) {
    if (!dateString) return 'Vừa xong';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '---';
        return date.toLocaleDateString('vi-VN');
    } catch (e) { return '---'; }
}

// ✅ FIX: Hàm giải mã JWT an toàn (Tránh lỗi 'The string did not match the expected pattern')
function parseJwtSafe(token) {
    try {
        if (!token || !token.includes('.')) return null;
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.warn("Lỗi decode JWT:", e);
        return null;
    }
}

/* ==========================================================
1. CHUYỂN TAB
========================================================== */

function handleTabSwitch(event) {
    const clickedButton = event.currentTarget;
    const targetSelector = clickedButton.dataset.target;
    if (!targetSelector) return;

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => {
        content.style.display = 'none';
    });

    clickedButton.classList.add('active');

    const selectedContent = document.querySelector(targetSelector);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }

    // ✅ THÊM LOGIC NÀY
    if (targetSelector === '#tree') {
        if (!treeRenderer) {
            setTimeout(async () => {
                await initFamilyTree();
                showFullFamilyTree(); // Tự động hiện toàn bộ cây
            }, 100);
        } else {
            // Nếu đã init, hiển thị lại toàn bộ cây ngay lập tức
            setTimeout(() => {
                showFullFamilyTree();
                populatePersonDropdown(); // Cập nhật dropdown nếu có thành viên mới
            }, 100);
        }
    }
}

/* ==========================================================
2. HÀM GỌI API KÈM TOKEN
========================================================== */

function getAuthToken() {
  return localStorage.getItem('authToken') || '';
}

async function apiGet(url) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(API_URL + url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  // ✅ FIX: Kiểm tra xem server có trả về JSON không
  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Lỗi Server (${res.status}): ${text.substring(0, 100)}...`);
  }

  if (res.status === 401) {
    // Token sai/hết hạn -> xóa và quay lại login
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
}

async function apiPost(url, body) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(url, body) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiDelete(url) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (res.status === 204) return { success: true };
    return res.json();
}

/* ==========================================================
   3. CÁC CHỨC NĂNG SETTINGS (IMPORT/EXPORT)
========================================================== */

async function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
 
        if (!confirm(`Bạn muốn import file: ${file.name}?\n\nHành động này sẽ thay thế danh sách thành viên hiện tại.`)) return;
 
        const token = localStorage.getItem('authToken');
        if (!token) {
            alert("Vui lòng đăng nhập lại.");
            window.location.href = "/login";
            return;
        }
 
        const formData = new FormData();
        formData.append('file', file);
        showToast('⏳ Đang xử lý import, vui lòng chờ...');
        try {
            const uploadUrl = `${API_URL}/api/members/import?token=${token}`;
 
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    // QUAN TRỌNG: Không set Content-Type để browser tự set boundary cho FormData
                        'Authorization': `Bearer ${token}`
                },
                body: formData
            });
 
            const result = await response.json();
            
            if (response.ok && result.success) {
                showToast(result.message || `Đã import thành công!`);
                // Reload lại trang hoặc danh sách thành viên
                setTimeout(() => window.location.reload(), 1500); // Chờ 1.5s để đọc thông báo
            } else {
                showToast('❌ Lỗi Import: ' + (result.message || 'Lỗi không xác định từ server.'), true);
            }
        } catch (err) {
            console.error(err);
            showToast('❌ Lỗi kết nối server', true);
        }
    };
    
    input.click();
}

// ✅ THÊM: Hàm hiển thị thông báo "Toast"
function showToast(message, isError = false) {
    const toastId = 'toast-notification';
    // Xóa toast cũ nếu có
    const oldToast = document.getElementById(toastId);
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast ${isError ? 'error' : 'success'}`;
    toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${message}`;
    
    document.body.appendChild(toast);

    // Tự động ẩn sau 5 giây
    setTimeout(() => toast.remove(), 5000);
}

function downloadSampleCSV() {
    // ✅ Cập nhật file mẫu hỗ trợ cả ID và Tên
    const csvContent = `id,full_name,gender,birth_date,death_date,generation,fid,pid,notes,phone,job,address,parent_name,spouse_name
1,Nguyễn Văn A,Nam,1950-01-01,,1,,,Thủy tổ,,,Hà Nội,,Trần Thị B
2,Trần Thị B,Nữ,1952-05-20,,1,,1,Vợ thủy tổ,,,Hà Nội,,Nguyễn Văn A
3,Nguyễn Văn C,Nam,1980-10-10,,2,1,,Con trưởng,,,Hà Nội,Nguyễn Văn A,`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mau_import_giapha.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function backupData() {
    const token = localStorage.getItem('authToken');
    if (!token) return alert("Vui lòng đăng nhập lại");

    const btn = document.getElementById('btnBackup'); // Giả sử bạn có nút này
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';

    try {
        const response = await fetch(API_URL + '/api/settings/backup-json', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `giapha_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            alert("✅ Đã tải bản sao lưu thành công! Hãy lưu file này cẩn thận.");
        } else {
            const err = await response.json();
            alert("❌ Lỗi backup: " + (err.message || response.statusText));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Lỗi kết nối server");
    } finally {
        if(btn) btn.innerHTML = '<i class="fas fa-download"></i> Tải Backup (JSON)';
    }
}

async function exportPDF() {
    // Gọi hàm export của FamilyTreeRenderer nếu đang ở tab cây
    if (treeRenderer) {
        treeRenderer.exportPDF();
    } else {
        alert("Vui lòng chuyển sang tab 'Cây Gia Phả' để xuất PDF.");
    }
}

async function deleteAllMembers() {
    if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ thành viên?\nHành động này không thể hoàn tác!")) return;
    
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch(API_URL + '/api/settings/delete-all-members', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
            alert("✅ " + result.message);
            window.location.reload();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        alert("❌ Lỗi kết nối server");
    }
}

async function resetData() {
    if (!confirm("⚠️ CẢNH BÁO: Reset dữ liệu sẽ xóa hết và tạo lại dữ liệu mẫu.\nBạn có chắc chắn không?")) return;

    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(API_URL + '/api/settings/reset-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        if (result.success) {
            alert("✅ " + result.message);
            window.location.reload();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        alert("❌ Lỗi kết nối server");
    }
}

/* ==========================================================
4. KHỞI TẠO SỰ KIỆN
========================================================== */
function handleLogout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');

  window.location.href = '/login';
}

/* ==========================================================
   5. LOGIC HIỂN THỊ DỮ LIỆU (BỊ THIẾU)
========================================================== */

// --- DASHBOARD STATS ---
async function loadDashboardStats() {
    try {
        const data = await apiGet('/api/dashboard/stats');
        if (!data || !data.success) return;

        const stats = data.stats;
        
        // Update counters
        const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        setText('totalMembers', stats.total);
        setText('maleCount', stats.males);
        setText('femaleCount', stats.females);
        setText('generationCount', stats.maxGeneration);

        if (stats.total > 0) {
            setText('malePercent', Math.round((stats.males / stats.total) * 100) + '%');
            setText('femalePercent', Math.round((stats.females / stats.total) * 100) + '%');
        }

        // Render lists
        renderUpcomingBirthdays(stats.upcomingBirthdays || []);
        renderUpcomingDeathAnniversaries(stats.upcomingDeathAnniversaries || []);
        renderRecentActivities(stats.activities || []);
        
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

function renderUpcomingBirthdays(list) {
    const container = document.getElementById('birthdayList');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Không có sinh nhật sắp tới</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        // Logic hiển thị ngày
        const daysText = item.daysLeft === 0 ? '<span style="color:#d97706; font-weight:bold;">Hôm nay!</span>' : `Còn ${item.daysLeft} ngày`;

        // ✅ FIX: Cắt chuỗi ngày dd/MM/yyyy để lấy dd/MM hiển thị trong badge
        const parts = item.birthday.split('/');
        const shortDate = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : item.birthday;

        div.className = 'event-item'; // Assumes CSS exists
        div.style.cssText = 'display:flex; gap:10px; padding:8px; border-bottom:1px solid #eee; align-items:center;';
        div.innerHTML = `
            <div style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:8px; font-weight:bold;">
                ${shortDate}
            </div>
            <div>
                <div style="font-weight:600;">${item.full_name}</div>
                <div style="font-size:12px; color:#666;">${daysText}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderUpcomingDeathAnniversaries(list) {
    const container = document.getElementById('deathAnniversaryList'); // Cần thêm ID này vào HTML dashboard.html nếu chưa có
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Không có ngày giỗ sắp tới</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        const daysText = item.daysLeft === 0 ? '<span style="color:#d97706; font-weight:bold;">Hôm nay!</span>' : `Còn ${item.daysLeft} ngày`;

        // ✅ FIX: Cắt chuỗi ngày dd/MM/yyyy để lấy dd/MM hiển thị trong badge
        const parts = item.death_date.split('/');
        const shortDate = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : item.death_date;

        div.style.cssText = 'display:flex; gap:10px; padding:8px; border-bottom:1px solid #eee; align-items:center;';
        div.innerHTML = `
            <div style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:8px; font-weight:bold;">
                ${shortDate}
            </div>
            <div>
                <div style="font-weight:600;">${item.full_name}</div>
                <div style="font-size:12px; color:#666;">Mất ${item.yearCount} năm • ${daysText}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderRecentActivities(list) {
    const container = document.getElementById('activityList');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Chưa có hoạt động nào</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px; border-bottom:1px solid #eee; font-size:14px;';
        const time = new Date(item.created_at).toLocaleString('vi-VN');
        div.innerHTML = `
            <div><strong>${item.description}</strong></div>
            <div style="font-size:12px; color:#666; margin-top:4px;">${item.actor_name} • ${time}</div>
        `;
        container.appendChild(div);
    });
}

// --- MEMBERS LIST ---
async function loadMembers() {
    try {
        const data = await apiGet('/api/members');
        if (data && data.success) {
            allMembers = data.members;
            renderMembers(allMembers);
        } else {
            throw new Error(data.message || "Dữ liệu không đúng định dạng");
        }
    } catch (err) {
        console.error('Error loading members:', err);
        const grid = document.getElementById('membersGrid');
        if (grid) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#dc2626; padding:20px;">
                <i class="fas fa-exclamation-triangle"></i> <strong>Lỗi tải dữ liệu:</strong> ${err.message}
            </div>`;
        }
    }
}

function renderMembers(members) {
    const grid = document.getElementById('membersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (!members.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#666;">Chưa có thành viên nào. Hãy thêm mới hoặc Import CSV.</div>';
        return;
    }

    members.forEach(m => {
        const card = document.createElement('div');
        card.className = 'member-card'; // Assumes CSS
        // Inline style fallback
        card.style.cssText = 'background:white; border-radius:12px; padding:15px; box-shadow:0 2px 5px rgba(0,0,0,0.1); display:flex; align-items:center; gap:15px; cursor:pointer; transition:transform 0.2s;';
        card.onmouseover = () => card.style.transform = 'translateY(-2px)';
        card.onmouseout = () => card.style.transform = 'translateY(0)';
        
        // ✅ FIX: Ưu tiên lấy 'photo' (từ importData), fallback sang 'avatar' hoặc ảnh mặc định
        const avatar = m.photo || m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');
        
        // Format ngày sinh dd/MM/yyyy
        let birthDateDisplay = m.birth_date || '?';
        if (m.birth_date && m.birth_date !== 'unknown') {
            const dateObj = new Date(m.birth_date);
            if (!isNaN(dateObj.getTime())) {
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const year = dateObj.getFullYear();
                birthDateDisplay = `${day}/${month}/${year}`;
            }
        }

        card.innerHTML = `
            <img src="${avatar}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid #eee;">
            <div style="flex:1;">
                <h3 style="margin:0; font-size:16px; font-weight:600;">${m.full_name}</h3>
                <p style="margin:4px 0 0; font-size:13px; color:#666;">Đời thứ ${m.generation}</p>
                <p style="margin:2px 0 0; font-size:12px; color:#999;">${birthDateDisplay}</p>
                ${m.job ? `<p style="margin:2px 0 0; font-size:12px; color:#4b5563;">💼 ${m.job}</p>` : ''}
            </div>
        `;
        
        // Click để xem chi tiết (nếu có hàm viewMemberDetail)
        card.onclick = () => { if(typeof viewMemberDetail === 'function') viewMemberDetail(m.id); };

        // Thêm nút sửa/xóa nhanh nếu là owner
        if (localStorage.getItem('userRole') === 'owner') {
            const actions = document.createElement('div');
            actions.style.cssText = 'margin-left: auto; display: flex; gap: 5px;';
            actions.innerHTML = `
                <button class="btn-icon edit" title="Sửa" style="background:none; border:none; cursor:pointer; color:#f59e0b;">
                    <i class="fas fa-edit"></i>
                </button>
            `;
            actions.querySelector('.edit').onclick = (e) => {
                e.stopPropagation();
                openEditMemberModal(m.id);
            };
            card.appendChild(actions);
        }
        
        grid.appendChild(card);
    });
}

function setupSimpleSearch() {
    const input = document.getElementById('searchInput');
    if(!input) return;
    input.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allMembers.filter(m => {
            const matchName = m.full_name.toLowerCase().includes(term);
            // Logic lọc type cơ bản (nếu có filterMemberType)
            const filterType = document.getElementById('filterMemberType');
            if (filterType && filterType.value !== 'all') {
                return matchName && (m.member_type === filterType.value);
            }
            return matchName;
        });
        renderMembers(filtered);
    };
}

// --- POSTS ---
async function loadPosts() {
    try {
        const data = await apiGet('/api/posts');
        if(data && data.success) {
            renderPosts(data.posts);
        }
    } catch(err) { console.error(err); }
}

function renderPosts(posts) {
    const grid = document.getElementById('postsGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    if(!posts.length) {
        grid.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Chưa có bài viết nào</div>';
        return;
    }

    // ✅ FIX: Lấy ID và Role từ Token nếu localStorage bị thiếu
    let finalUserId = localStorage.getItem('userId');
    let finalUserRole = localStorage.getItem('userRole');
    const token = localStorage.getItem('authToken');
    
    // Nếu thiếu thông tin nhưng có token, thử giải mã JWT
    if ((!finalUserId || !finalUserRole) && token) {
        const decoded = parseJwtSafe(token);
        if (decoded) {
            finalUserId = finalUserId || decoded.id || decoded.userId;
            finalUserRole = finalUserRole || decoded.role;
        }
    }
        
    posts.forEach(p => {
        const card = document.createElement('div');
        card.style.cssText = 'background:white; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.1); margin-bottom:15px; position: relative;';
        
        // ✅ Logic check quyền: Admin (owner) hoặc Tác giả bài viết
        const isOwner = finalUserRole === 'owner';
        const isAuthor = (String(p.author_id) === String(finalUserId));
        
        let actions = '';
        if (isOwner || isAuthor) {
            actions = `
                <div style="position: absolute; top: 20px; right: 20px; display: flex; gap: 8px;">
                    ${isAuthor ? `<button onclick="openEditPostModal('${p.id}')" style="border:none; background:none; color:#f59e0b; cursor:pointer;" title="Sửa"><i class="fas fa-edit"></i></button>` : ''}
                    <button onclick="deletePost('${p.id}')" style="border:none; background:none; color:#ef4444; cursor:pointer;" title="Xóa"><i class="fas fa-trash"></i></button>
                </div>`;
        }

        // ✅ Sử dụng hàm formatDateSafe để tránh lỗi
        const dateStr = formatDateSafe(p.created_at);

        card.innerHTML = `
            ${actions}
            <h3 style="margin:0 0 10px 0; font-size:18px; padding-right: 60px;">${p.title}</h3>
            <div style="font-size:12px; color:#666; margin-bottom:10px;">
                ${p.author_name} • ${dateStr}
            </div>
            <div style="line-height:1.5; color:#333;">${p.content}</div>
        `;
        grid.appendChild(card);
    });
}

// --- FAMILY TREE ---
async function initFamilyTree() {
    if (!window.FamilyTreeRenderer) return;
    if (!treeRenderer) {
        treeRenderer = new FamilyTreeRenderer('tree-canvas');
        await populatePersonDropdown(); // Load dữ liệu cho dropdown tìm kiếm
        await showFullFamilyTree();     // Mặc định hiển thị toàn bộ cây
    }
}

async function showFullFamilyTree() {
    if (!treeRenderer) await initFamilyTree();
    if (treeRenderer) {
        await treeRenderer.renderFullTree();
    }
}

// ✅ THÊM: Hiển thị cây của người được chọn
async function showSelectedPersonTree() {
    const id = document.getElementById('personSelect').value;
    if (id && treeRenderer) {
        if (typeof treeRenderer.highlightInCurrentTree === 'function') {
            await treeRenderer.highlightInCurrentTree(id);
        } else {
            await treeRenderer.render(id);
        }
    }
}

// ✅ THÊM: Reset view về trung tâm
function resetTreeToCenter() {
    if (treeRenderer) {
        if (treeRenderer.targetPersonId) {
            treeRenderer.centerOnTarget();
        } else {
            treeRenderer.centerContent();
        }
    }
}

// ✅ THÊM: Reset Zoom
function resetZoom() {
    if (treeRenderer) treeRenderer.resetZoom();
}

// ✅ THÊM: Tải xuống cây (PDF)
function downloadTree() {
    if (treeRenderer) treeRenderer.exportPDF();
}

// ✅ CẬP NHẬT: Populate dropdown với tính năng tìm kiếm (Searchable)
async function populatePersonDropdown() {
    // 1. Xử lý dropdown trong tab Cây Gia Phả
    const select = document.getElementById('personSelect');
    if (select) {
        let members = [];
        try {
            const data = await apiGet('/api/members');
            if (data.success && Array.isArray(data.members)) {
                members = data.members;
            }
        } catch (e) { console.error("Lỗi load dropdown cây", e); }

        // Chuyển đổi SELECT thành Input tìm kiếm nếu chưa làm
        if (select.tagName === 'SELECT') {
            const container = document.createElement('div');
            container.className = 'search-select-container';
            container.style.position = 'relative';
            container.style.display = 'inline-block';
            container.style.minWidth = '300px';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'personSelectSearch';
            searchInput.className = 'btn-control';
            searchInput.placeholder = '🔍 Gõ tên để tìm...';
            searchInput.style.width = '100%';
            searchInput.style.textAlign = 'left';
            searchInput.autocomplete = 'off';
            searchInput.style.backgroundColor = '#fff';

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = 'personSelect';
            hiddenInput.value = '';

            const resultsDiv = document.createElement('div');
            resultsDiv.id = 'personSelectResults';
            resultsDiv.className = 'search-results';
            
            container.appendChild(searchInput);
            container.appendChild(hiddenInput);
            container.appendChild(resultsDiv);
            
            select.parentNode.replaceChild(container, select);
        }

        // Sắp xếp danh sách thành viên
        const sortedMembers = members.sort((a, b) => {
            const genA = a.generation || 99, genB = b.generation || 99;
            if (genA !== genB) return genA - genB;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });

        setupSearchableDropdown('personSelectSearch', 'personSelect', 'personSelectResults', sortedMembers, showSelectedPersonTree);
    }

    // 2. Xử lý dropdown trong Modal Thêm/Sửa thành viên (Cha/Mẹ/Vợ/Chồng)
    // Logic cũ vẫn giữ nguyên hoặc có thể nâng cấp tương tự nếu cần
    const parentSelect = document.getElementById('memberParent');
    const spouseSelect = document.getElementById('memberSpouse');
    
    if(parentSelect && parentSelect.tagName === 'SELECT') {
        let html = '<option value="">-- Chọn --</option>';
        allMembers.forEach(m => {
            html += `<option value="${m.id}">${m.full_name} (Đời ${m.generation})</option>`;
        });
        parentSelect.innerHTML = html;
    }
    
    if(spouseSelect && spouseSelect.tagName === 'SELECT') {
        let html = '<option value="">-- Chọn --</option>';
        allMembers.forEach(m => {
            html += `<option value="${m.id}">${m.full_name} (Đời ${m.generation})</option>`;
        });
        spouseSelect.innerHTML = html;
    }
}

// ✅ THÊM: Hàm hỗ trợ tạo dropdown tìm kiếm
function setupSearchableDropdown(searchInputId, hiddenInputId, resultsId, data, onSelect) {
    const searchInput = document.getElementById(searchInputId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const resultsDiv = document.getElementById(resultsId);

    if (!searchInput) return;

    if (searchInput._closeListener) {
        document.removeEventListener('click', searchInput._closeListener);
    }

    const closeListener = (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    };
    document.addEventListener('click', closeListener);
    searchInput._closeListener = closeListener;

    const handleInput = () => {
        const keyword = searchInput.value.toLowerCase().trim();
        hiddenInput.value = ''; 
        
        let currentFiltered = data;
        if (keyword) {
            currentFiltered = data.filter(m => m.full_name.toLowerCase().includes(keyword));
        }
        
        resultsDiv.innerHTML = '';
        
        if (currentFiltered.length === 0) { 
            resultsDiv.innerHTML = '<div class="search-item" style="color:#999; cursor:default;">Không tìm thấy kết quả</div>';
            resultsDiv.style.display = 'block'; 
            return; 
        }

        currentFiltered.slice(0, 50).forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<strong>${item.full_name}</strong> <small>Đời thứ ${item.generation}</small>`;
            div.onclick = () => {
                searchInput.value = item.full_name;
                hiddenInput.value = item._id || item.id;
                resultsDiv.style.display = 'none';
                if (onSelect) onSelect();
            };
            resultsDiv.appendChild(div);
        });
        resultsDiv.style.display = 'block';
    };

    searchInput.oninput = handleInput;
    searchInput.onfocus = handleInput;
}

// --- MODAL HANDLERS (Placeholder minimal versions) ---

// 1. Mở modal thêm mới
function openAddMemberModal() {
    editingMemberId = null; // Reset ID đang sửa
    const modal = document.getElementById('addMemberModal');
    const form = document.getElementById('memberForm');
    const title = document.getElementById('addModalTitle');
    
    if(modal) {
        if(form) form.reset();
        if(title) title.textContent = "Thêm Thành Viên Mới";
        modal.classList.add('active');
        populatePersonDropdown();
    }
}

// 2. Mở modal sửa
async function openEditMemberModal(id) {
    editingMemberId = id;
    const modal = document.getElementById('addMemberModal');
    const form = document.getElementById('memberForm');
    const title = document.getElementById('addModalTitle');

    if (!modal || !form) return;

    try {
        const data = await apiGet(`/api/members/${id}`);
        if (data && data.success) {
            const m = data.member;
            
            if(title) title.textContent = "Sửa Thông Tin Thành Viên";
            
            // Điền dữ liệu vào form
            document.getElementById('memberName').value = m.full_name;
            document.getElementById('memberGender').value = m.gender === 'Nam' ? 'male' : 'female';
            document.getElementById('memberBirth').value = m.birth_date || ''; // Lưu ý: Input date cần format YYYY-MM-DD
            document.getElementById('memberDeath').value = m.death_date || '';
            document.getElementById('memberPhone').value = m.phone || '';
            document.getElementById('memberJob').value = m.job || '';
            document.getElementById('memberAddress').value = m.address || '';
            document.getElementById('memberGeneration').value = m.generation || 1;
            document.getElementById('memberNote').value = m.notes || '';
            
            populatePersonDropdown();
            
            // ✅ FIX: Xử lý xung đột dữ liệu Mảng (Array) vs Dropdown (Single Value)
            // parent_id trong DB là mảng [{_id, full_name}], nhưng dropdown cần chuỗi ID đơn
            let pId = "";
            if (m.parent_id) {
                if (Array.isArray(m.parent_id)) {
                    if (m.parent_id.length > 0) pId = m.parent_id[0]._id || m.parent_id[0];
                } else {
                    pId = m.parent_id._id || m.parent_id; // Fallback cho dữ liệu phẳng cũ
                }
            }
            document.getElementById('memberParent').value = pId;

            let sId = "";
            if (m.spouse_id) {
                if (Array.isArray(m.spouse_id)) {
                    if (m.spouse_id.length > 0) sId = m.spouse_id[0]._id || m.spouse_id[0];
                } else {
                    sId = m.spouse_id._id || m.spouse_id; // Fallback cho dữ liệu phẳng cũ
                }
            }
            document.getElementById('memberSpouse').value = sId;

            modal.classList.add('active');
        }
    } catch (err) {
        console.error(err);
        alert("Không thể tải thông tin thành viên");
    }
}
function closeAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    if(modal) modal.classList.remove('active');
}
function openCreatePostModal() {
    const modal = document.getElementById('postModal');
    if(modal) modal.classList.add('active');
    editingPostId = null;
    document.getElementById('postForm').reset();
    const title = document.getElementById('postModalTitle');
    if(title) title.textContent = "Tạo Bài Viết";
}
function closePostModal() {
    const modal = document.getElementById('postModal');
    if(modal) modal.classList.remove('active');
}

async function openEditPostModal(id) {
    editingPostId = id;
    const modal = document.getElementById('postModal');
    if(modal) modal.classList.add('active');
    
    // Load data (giả lập, thực tế nên gọi API lấy chi tiết)
    // Ở đây ta tạm thời không điền dữ liệu vì dashboard.js này thiếu logic fetch chi tiết post
    // Bạn nên dùng logic trong dashboard.html sẽ đầy đủ hơn
    const title = document.getElementById('postModalTitle');
    if(title) title.textContent = "Sửa Bài Viết (ID: " + id + ")";
}

// --- VIEW DETAIL & DELETE ---

async function viewMemberDetail(id) {
    const modal = document.getElementById('memberModal');
    const content = document.getElementById('memberDetailContent');
    if (!modal || !content) return;

    try {
        const data = await apiGet(`/api/members/${id}`);
        if (data && data.success) {
            const m = data.member;
            const avatar = m.photo || m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');
            
            content.innerHTML = `
                <div style="text-align:center; margin-bottom:20px;">
                    <img src="${avatar}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="margin:10px 0 5px;">${m.full_name}</h2>
                    <span style="background:#eee; padding:4px 10px; border-radius:20px; font-size:12px;">Đời thứ ${m.generation}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><strong>Giới tính:</strong> ${m.gender}</div>
                    <div><strong>Ngày sinh:</strong> ${m.birth_date || '---'}</div>
                    <div><strong>Ngày mất:</strong> ${m.death_date || '---'}</div>
                    <div><strong>Điện thoại:</strong> ${m.phone || '---'}</div>
                    <div><strong>Nghề nghiệp:</strong> ${m.job || '---'}</div>
                    <div><strong>Địa chỉ:</strong> ${m.address || '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Cha/Mẹ:</strong> ${m.parents && m.parents.length ? m.parents[0].full_name : '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Vợ/Chồng:</strong> ${m.spouse ? m.spouse.full_name : '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Ghi chú:</strong> ${m.notes || '---'}</div>
                </div>
                ${localStorage.getItem('userRole') === 'owner' ? `
                <div style="margin-top:20px; text-align:center; border-top:1px solid #eee; padding-top:15px;">
                    <button onclick="deleteMember('${m.id}')" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">
                        <i class="fas fa-trash"></i> Xóa thành viên này
                    </button>
                </div>` : ''}
            `;
            modal.classList.add('active');
        }
    } catch (err) {
        console.error(err);
    }
}

function closeMemberModal() {
    const modal = document.getElementById('memberModal');
    if (modal) modal.classList.remove('active');
}

async function deleteMember(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa thành viên này? Hành động này không thể hoàn tác.")) return;
    
    try {
        const res = await apiDelete(`/api/members/${id}`);
        if (res.success) {
            alert("Đã xóa thành công");
            closeMemberModal();
            loadMembers();
        } else {
            alert("Lỗi: " + res.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server");
    }
}

async function deletePost(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa bài viết này?")) return;
    try {
        const res = await apiDelete(`/api/posts/${id}`);
        if (res.success) {
            loadPosts();
        } else {
            alert("Lỗi: " + res.message);
        }
    } catch (err) { alert("Lỗi kết nối"); }
}

// --- FORM SUBMITS ---
async function submitMemberForm(e) {
    e.preventDefault();
    const form = document.getElementById('memberForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Fix checkboxes and numbers
    data.generation = parseInt(data.generation) || 1;
    data.gender = data.gender === 'male' ? 'Nam' : 'Nữ'; // Chuẩn hóa giới tính
    
    // ✅ FIX: Xóa các trường quan hệ nếu rỗng để tránh lỗi CastError ObjectId của MongoDB
    // Nếu gửi parent_id: "" (chuỗi rỗng), Mongoose sẽ báo lỗi.
    if (!data.parent_id) delete data.parent_id;
    if (!data.spouse_id) delete data.spouse_id;
    // Nếu có giá trị, Backend sẽ tự cast string ID thành mảng [ID] nhờ logic của Mongoose

    try {
        let result;
        if (editingMemberId) {
            // Cập nhật (PUT)
            result = await apiPut(`/api/members/${editingMemberId}`, data);
        } else {
            // Thêm mới (POST)
            result = await apiPost('/api/members', data);
        }

        if(result.success) {
            alert(editingMemberId ? 'Cập nhật thành công' : 'Thêm thành công');
            closeAddMemberModal();
            loadMembers();
            form.reset();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch(err) { alert('Lỗi kết nối'); }
}

async function submitPostForm(e) {
    e.preventDefault();
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    
    const url = editingPostId ? `/api/posts/${editingPostId}` : '/api/posts';
    const method = editingPostId ? 'PUT' : 'POST';

    try {
        const res = await fetch(API_URL + url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ title, content })
        });
        const result = await res.json();
        if(result.success) {
            alert('Đăng bài thành công');
            closePostModal();
            loadPosts();
            document.getElementById('postForm').reset();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch(err) { alert('Lỗi kết nối'); }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (!ensureAuth()) return;
    
    checkServerConnection();
    
    // Hiển thị thông tin user
    const userName = localStorage.getItem('userName');
    const userRole = localStorage.getItem('userRole');
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    if(nameEl) nameEl.textContent = userName || 'User';
    if(roleEl) roleEl.textContent = userRole === 'owner' ? 'Admin' : 'Viewer';

    // Gán sự kiện Tab
    // ✅ FIX: Xóa đoạn code gán sự kiện lặp lại ở đây vì đã có logic xử lý ở trên (dòng 640-660)
    // Hoặc nếu muốn dùng handleTabSwitch thì phải xóa logic inline ở trên.
    // Ở đây tôi chọn cách giữ logic inline ở trên (vì nó chi tiết hơn) và xóa dòng này để tránh conflict.
    // document.querySelectorAll('.tab-btn').forEach(btn => {
    //    btn.addEventListener('click', handleTabSwitch);
    // });

    // Load dữ liệu ban đầu
    loadDashboardStats();
    
    // Nếu đang ở tab members thì load luôn
    if(document.querySelector('.tab-btn[data-target="#members"]').classList.contains('active')) {
        loadMembers();
    }
    
    // Khởi tạo cây ngầm (để sẵn sàng khi chuyển tab)
    initFamilyTree();
    setupSimpleSearch();

    // ✅ Expose hàm sửa thành viên để D3 gọi khi double click
    window.openEditModal = openEditMemberModal;
    
    // ✅ Expose hàm toggle cho HTML gọi
    window.toggleLineageDetails = toggleLineageDetails;
});

/* ==========================================================
   6. LOGIC TAB PHẢ HỆ (LINEAGE) - MỚI
========================================================== */

function initLineage() {
    // Nếu chưa có dữ liệu thành viên, tải lại
    if (!allMembers || allMembers.length === 0) {
        loadMembers().then(() => {
            renderLineageSidebar();
            // Mặc định chọn đời 1
            renderLineageMembers(1);
        });
    } else {
        renderLineageSidebar();
        // Nếu chưa render list, mặc định chọn đời 1
        const list = document.getElementById('lineageList');
        if (list && list.innerHTML === '') {
            renderLineageMembers(1);
        }
    }
}

function renderLineageSidebar() {
    const container = document.getElementById('lineageGenerations');
    if (!container) return;
    container.innerHTML = '';

    // 1. Tính toán thống kê theo đời
    const stats = {};
    let maxGen = 0;

    allMembers.forEach(m => {
        const gen = m.generation || 1;
        if (gen > maxGen) maxGen = gen;
        
        if (!stats[gen]) stats[gen] = { total: 0, male: 0, female: 0 };
        stats[gen].total++;
        if (m.gender === 'Nam') stats[gen].male++;
        else stats[gen].female++;
    });

    // 2. Render buttons
    for (let i = 1; i <= maxGen; i++) {
        const s = stats[i] || { total: 0 };
        const btn = document.createElement('div');
        btn.className = 'gen-btn';
        if (i === 1) btn.classList.add('active'); // Mặc định active đời 1 lúc đầu (logic render sẽ update lại class này)
        btn.onclick = () => renderLineageMembers(i);
        btn.dataset.gen = i;
        
        btn.innerHTML = `
            <span>Đời thứ ${i}</span>
            <span class="gen-badge">${s.total}</span>
        `;
        container.appendChild(btn);
    }
}

function renderLineageMembers(generation) {
    // Update UI active button
    document.querySelectorAll('.gen-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.gen) === generation);
    });

    const title = document.getElementById('lineageTitle');
    if (title) title.textContent = `Danh sách thành viên Đời thứ ${generation}`;

    const container = document.getElementById('lineageList');
    if (!container) return;
    container.innerHTML = '';

    // Lọc thành viên theo đời
    const members = allMembers.filter(m => m.generation === generation);
    
    if (members.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Không có thành viên nào.</div>';
        return;
    }

    members.forEach(m => {
        // Tìm thông tin phụ
        const spouse = allMembers.find(s => (s._id || s.id) == (Array.isArray(m.spouse_id) ? m.spouse_id[0] : m.spouse_id));
        const children = allMembers.filter(c => {
            // Check parent_id (có thể là mảng hoặc string)
            if (Array.isArray(c.parent_id)) return c.parent_id.some(pid => (pid._id || pid) == (m._id || m.id));
            return (c.parent_id == (m._id || m.id));
        });

        // Tìm tên bố mẹ
        let parentText = "Chưa cập nhật";
        if (m.parent_id) {
            const pid = Array.isArray(m.parent_id) ? m.parent_id[0] : m.parent_id;
            const parent = allMembers.find(p => (p._id || p.id) == (pid._id || pid));
            if (parent) parentText = parent.full_name;
            else if (m.generation === 1) parentText = "Thủy Tổ";
        } else if (m.generation === 1) {
            parentText = "Thủy Tổ";
        }

        const avatar = m.photo || m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');

        // HTML Card
        const card = document.createElement('div');
        card.className = 'member-card-red';
        card.innerHTML = `
            <div class="card-header-red">
                <div class="parent-info">Phụ mẫu: ${parentText}</div>
                <div class="main-info">
                    <img src="${avatar}" class="avatar-circle-small">
                    <div style="flex:1">
                        <h3 class="member-name-red">${m.full_name}</h3>
                        <p class="meta-info">${m.gender} • ${children.length} Con</p>
                    </div>
                    <button class="expand-toggle" onclick="toggleLineageDetails(this)">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="card-details">
                ${spouse ? `<div class="sub-row"><span class="label-gold">Vợ/Chồng</span> <span class="sub-name">${spouse.full_name}</span></div>` : ''}
                ${children.map((c, idx) => `<div class="sub-row"><span class="label-gold">Con ${idx+1}</span> <span class="sub-name">${c.full_name}</span></div>`).join('')}
                ${!spouse && children.length === 0 ? '<div style="color:#999; font-size:13px; font-style:italic;">Chưa có thông tin vợ/chồng hoặc con cái.</div>' : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function toggleLineageDetails(btn) {
    const card = btn.closest('.member-card-red') || btn.closest('.member-card-blue');
    const details = card.querySelector('.card-details');
    const icon = btn.querySelector('i');
    
    if (details.style.display === 'block') {
        details.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    } else {
        details.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    }
}

/* ==========================================================
   7. LOGIC TAB PHÂN PHÁI (BRANCHES) - MỚI
========================================================== */

function initBranches() {
    if (!allMembers || allMembers.length === 0) {
        loadMembers().then(() => {
            renderBranchSidebar();
        });
    } else {
        renderBranchSidebar();
    }
}

function renderBranchSidebar() {
    const container = document.getElementById('branchListSidebar');
    if (!container) return;
    container.innerHTML = '';

    // 1. Thống kê theo Phái
    const stats = {};
    
    allMembers.forEach(m => {
        // Chuẩn hóa tên phái (nếu rỗng thì là "Chưa phân phái")
        const branchName = m.branch ? m.branch.trim() : "Chưa phân phái";
        
        if (!stats[branchName]) stats[branchName] = { total: 0, name: branchName };
        stats[branchName].total++;
    });

    // 2. Sắp xếp danh sách Phái (Ưu tiên số trong tên phái: Phái 1 < Phái 2 < Phái 10)
    const sortedBranches = Object.values(stats).sort((a, b) => {
        if (a.name === "Chưa phân phái") return 1; // Đẩy xuống cuối
        if (b.name === "Chưa phân phái") return -1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 3. Render buttons
    sortedBranches.forEach((br, index) => {
        const btn = document.createElement('div');
        btn.className = 'gen-btn'; // Tái sử dụng class CSS của tab Phả hệ
        if (index === 0) {
            btn.classList.add('active');
            renderBranchMembers(br.name); // Mặc định chọn phái đầu tiên
        }
        
        btn.onclick = () => {
            document.querySelectorAll('#branchListSidebar .gen-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBranchMembers(br.name);
        };
        
        btn.innerHTML = `
            <span>${br.name}</span>
            <span class="gen-badge">${br.total}</span>
        `;
        container.appendChild(btn);
    });
}

function renderBranchMembers(branchName) {
    const title = document.getElementById('branchTitle');
    if (title) title.textContent = `Danh sách thành viên thuộc: ${branchName}`;

    const container = document.getElementById('branchMemberList');
    if (!container) return;
    container.innerHTML = '';

    // Lọc thành viên theo phái
    let members = allMembers.filter(m => {
        const mBranch = m.branch ? m.branch.trim() : "Chưa phân phái";
        return mBranch === branchName;
    });

    // --- LOGIC SẮP XẾP: Phái -> Cha Mẹ (Đệ quy) -> Thứ tự -> Ngày sinh ---
    const memberMap = new Map(allMembers.map(m => [String(m._id || m.id), m]));
    const visited = new Set();

    const getSortKey = (m) => {
        if (m._sortKey) return m._sortKey; // Memoization
        const mId = String(m._id || m.id);
        if (visited.has(mId)) return "ZZZZ"; // Tránh vòng lặp
        visited.add(mId);

        // 1. Branch
        let branchVal = 9999;
        if (m.branch) {
            const nums = m.branch.match(/\d+/);
            if (nums) branchVal = parseInt(nums[0]);
        }
        const branchKey = String(branchVal).padStart(6, '0');

        // 2. Order
        const orderVal = (m.order !== undefined && m.order !== null) ? m.order : 9999;
        const orderKey = String(orderVal).padStart(6, '0');

        // 3. BirthDate
        let birthKey = "99999999";
        if (m.birth_date && m.birth_date !== 'unknown') {
            const d = new Date(m.birth_date);
            if (!isNaN(d.getTime())) birthKey = d.toISOString().slice(0, 10).replace(/-/g, '');
        }

        const selfKey = `${branchKey}-${orderKey}-${birthKey}-${mId}`;

        // 4. Parent Key (Đệ quy)
        let parentKey = "";
        if (m.parent_id) {
            const pids = Array.isArray(m.parent_id) ? m.parent_id : [m.parent_id];
            let parent = null;
            for (const pid of pids) {
                if (!pid) continue;
                const pIdStr = String(pid._id || pid);
                const p = memberMap.get(pIdStr);
                if (p && ['nam','male','trai'].includes((p.gender||'').toLowerCase())) {
                    parent = p; break;
                }
                if (p && !parent) parent = p;
            }
            if (parent) parentKey = getSortKey(parent);
        }

        visited.delete(mId);
        m._sortKey = parentKey ? `${parentKey}|${selfKey}` : selfKey;
        return m._sortKey;
    };

    allMembers.forEach(m => delete m._sortKey);
    members.sort((a, b) => {
        // 1. Ưu tiên xếp theo Đời (Generation) trước
        const genA = parseInt(a.generation) || 0;
        const genB = parseInt(b.generation) || 0;
        if (genA !== genB) return genA - genB;

        // 2. Trong cùng đời, xếp theo tôn ti (Con anh trước con em) dựa vào SortKey
        return getSortKey(a).localeCompare(getSortKey(b));
    });

    // ✅ FIX: Sắp xếp lại để đảm bảo Chồng đứng trước Vợ
    const finalMembers = [];
    const processedIds = new Set();

    members.forEach(member => {
        const mId = String(member._id || member.id);
        if (processedIds.has(mId)) return;

        const isMale = (member.gender || '').toLowerCase() === 'nam' || (member.gender || '').toLowerCase() === 'male';
        
        // Tìm tất cả vợ/chồng của người này
        const rawSpouse = member.spouse_id;
        const spouseArray = Array.isArray(rawSpouse) ? rawSpouse : (rawSpouse ? [rawSpouse] : []);
        const spouseIds = spouseArray.map(s => String(s._id || s));
        const spouses = members.filter(s => spouseIds.includes(String(s._id || s.id)));

        if (isMale) {
            // Nếu là Nam, thêm ông chồng vào trước
            finalMembers.push(member);
            processedIds.add(mId);
            // Sắp xếp các bà vợ theo order và thêm vào sau
            spouses.sort((a, b) => (a.order || 99) - (b.order || 99));
            spouses.forEach(spouse => {
                finalMembers.push(spouse);
                processedIds.add(String(spouse._id || spouse.id));
            });
        } else {
            // Nếu là Nữ và chưa được xử lý (tức là chồng không có trong list này), thêm vào
            finalMembers.push(member);
            processedIds.add(mId);
        }
    });


    if (finalMembers.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Không có thành viên nào.</div>';
        return;
    }

    // Tái sử dụng logic render card của Phả hệ
    finalMembers.forEach(m => {
        try {
            // 1. Tìm tất cả Vợ/Chồng
            let spouses = [];
            if (m.spouse_id) {
                const spouseIds = Array.isArray(m.spouse_id) ? m.spouse_id : [m.spouse_id];
                spouses = spouseIds.map(sid => allMembers.find(s => (s._id || s.id) == sid)).filter(s => s);
            }

            // 2. Tìm tất cả con cái
            const children = allMembers.filter(c => {
                if (!c.parent_id) return false;
                if (Array.isArray(c.parent_id)) {
                    return c.parent_id.some(pid => pid && (pid._id || pid) == (m._id || m.id));
                }
                return (c.parent_id == (m._id || m.id));
            });

            // 3. Gom nhóm con cái theo Vợ/Chồng (Mẹ/Cha khác)
            const childrenMap = new Map(); // Map<OtherParentID, [Child]>
            const unknownParentChildren = [];

            children.forEach(child => {
                const pids = Array.isArray(child.parent_id) ? child.parent_id : [child.parent_id];
                // Tìm ID phụ huynh KHÔNG PHẢI là m
                const otherPid = pids.find(pid => {
                    const idStr = (pid._id || pid).toString();
                    const mIdStr = (m._id || m.id).toString();
                    return idStr !== mIdStr;
                });

                if (otherPid) {
                    const otherPidStr = (otherPid._id || otherPid).toString();
                    if (!childrenMap.has(otherPidStr)) childrenMap.set(otherPidStr, []);
                    childrenMap.get(otherPidStr).push(child);
                } else {
                    unknownParentChildren.push(child);
                }
            });

            // 4. Xây dựng HTML chi tiết
            let detailsHtml = '';

            // A. Hiển thị theo từng Vợ/Chồng
            spouses.forEach((spouse, idx) => {
                const spouseIdStr = (spouse._id || spouse.id).toString();
                const kids = childrenMap.get(spouseIdStr) || [];
                childrenMap.delete(spouseIdStr); // Đánh dấu đã xử lý

                // Label: Vợ 1, Vợ 2... hoặc Chồng
                let label = "Vợ/Chồng";
                if ((m.gender || '').toLowerCase() === 'nam' || (m.gender || '').toLowerCase() === 'male') {
                    label = spouses.length > 1 ? `Vợ ${idx + 1}` : `Vợ`;
                } else {
                    label = spouses.length > 1 ? `Chồng ${idx + 1}` : `Chồng`;
                }

                detailsHtml += `<div class="sub-row" style="background-color: #f9fafb; font-weight:bold;">
                    <span class="label-gold">${label}</span> 
                    <span class="sub-name">${spouse.full_name}</span>
                </div>`;

                kids.forEach((child, cIdx) => {
                    detailsHtml += `<div class="sub-row" style="padding-left: 20px; border-bottom: 1px dashed #eee;">
                        <span class="label-gold" style="font-weight:normal; font-size:12px; width:auto; margin-right:8px;">Con ${cIdx + 1}</span> 
                        <span class="sub-name">${child.full_name}</span>
                    </div>`;
                });
            });

            // B. Hiển thị con với người khác (không nằm trong danh sách vợ chồng hiện tại)
            for (const [otherPidStr, kids] of childrenMap.entries()) {
                const otherParent = allMembers.find(p => (p._id || p.id) == otherPidStr);
                const otherName = otherParent ? otherParent.full_name : "Người khác";
                
                detailsHtml += `<div class="sub-row" style="background-color: #fff1f2; font-weight:bold;">
                    <span class="label-gold">Với</span> 
                    <span class="sub-name">${otherName}</span>
                </div>`;

                kids.forEach((child, cIdx) => {
                    detailsHtml += `<div class="sub-row" style="padding-left: 20px; border-bottom: 1px dashed #eee;">
                        <span class="label-gold" style="font-weight:normal; font-size:12px; width:auto; margin-right:8px;">Con</span> 
                        <span class="sub-name">${child.full_name}</span>
                    </div>`;
                });
            }

            // C. Hiển thị con không rõ mẹ/cha khác
            if (unknownParentChildren.length > 0) {
                if (spouses.length > 0) {
                    detailsHtml += `<div class="sub-row" style="background-color: #f3f4f6; font-style:italic;">
                        <span class="sub-name">Con chung (Không rõ mẹ/cha khác)</span>
                    </div>`;
                }
                unknownParentChildren.forEach((child, cIdx) => {
                    detailsHtml += `<div class="sub-row" style="padding-left: 20px; border-bottom: 1px dashed #eee;">
                        <span class="label-gold" style="font-weight:normal; font-size:12px; width:auto; margin-right:8px;">Con ${cIdx + 1}</span> 
                        <span class="sub-name">${child.full_name}</span>
                    </div>`;
                });
            }

            if (detailsHtml === '') {
                detailsHtml = '<div style="color:#999; font-size:13px; font-style:italic;">Chưa có thông tin vợ/chồng hoặc con cái.</div>';
            }

            // Tìm tên bố mẹ - Kiểm tra an toàn
            let fatherName = "";
            let motherName = "";

            if (m.parent_id) {
                const pids = Array.isArray(m.parent_id) ? m.parent_id : [m.parent_id];
                pids.forEach(pid => {
                    if (!pid) return;
                    const pId = pid._id || pid;
                    const parent = allMembers.find(p => (p._id || p.id) == pId);
                    if (parent) {
                        const g = (parent.gender || '').toLowerCase();
                        if (g === 'nam' || g === 'male' || g === 'trai') fatherName = parent.full_name;
                        else motherName = parent.full_name;
                    }
                });
            }

            let parentText = "";
            if ((parseInt(m.generation) || 1) === 1) parentText = "Thủy Tổ";
            else {
                const parts = [];
                if (fatherName) parts.push(`Cha: ${fatherName}`);
                if (motherName) parts.push(`Mẹ: ${motherName}`);
                parentText = parts.length > 0 ? parts.join(" | ") : "";
            }

        const avatar = m.photo || m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');

        const card = document.createElement('div');
        card.className = 'member-card-blue'; // Sử dụng CSS card xanh
        card.innerHTML = `
            <div class="card-header-blue">
                <div class="parent-info">${parentText ? parentText + ' | ' : ''}Đời ${m.generation}</div>
                <div class="main-info">
                    <img src="${avatar}" class="avatar-circle-small">
                    <div style="flex:1">
                        <h3 class="member-name-blue">${m.full_name}</h3>
                        <p class="meta-info">${m.gender} • ${children.length} Con</p>
                    </div>
                    <button class="expand-toggle" onclick="toggleLineageDetails(this)"><i class="fas fa-chevron-down"></i></button>
                </div>
            </div>
            <div class="card-details">
                ${detailsHtml}
            </div>
        `;
        container.appendChild(card);
        } catch (err) {
            console.error("Lỗi hiển thị thành viên phân phái:", m.full_name, err);
        }
    });
}