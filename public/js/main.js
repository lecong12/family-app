
// Biến toàn cục lưu danh sách thành viên
let allMembers = [];
let currentDisplayedMembers = []; // Biến lưu danh sách đang hiển thị để xuất PDF
let chartInstances = {};

// Biến trạng thái để biết đang Thêm hay Sửa
let currentEditingId = null;

// Biến quản lý phân trang
let pagination = {
    currentPage: 1,
    itemsPerPage: 12, // Số lượng thẻ trên mỗi trang
    data: []
};

// --- Bổ sung: Hàm giải mã Token để lấy quyền chính xác từ Server ---
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return null; }
}

// --- Bổ sung: Hàm kiểm tra quyền Admin ---
const isAdmin = () => {
    const role = localStorage.getItem('userRole');
    return role === 'admin' || role === 'owner';
};

// 1. Khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    let userName = localStorage.getItem('userName');
    let userRole = localStorage.getItem('userRole');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // --- FIX: Tự động cập nhật quyền từ Token nếu localStorage bị sai ---
    const payload = parseJwt(token);
    if (payload && payload.role) {
        // Nếu quyền trong Token khác với quyền đang lưu, cập nhật ngay
        if (userRole !== payload.role) {
            console.log(`🔄 Cập nhật quyền từ Token: ${userRole} -> ${payload.role}`);
            userRole = payload.role;
            localStorage.setItem('userRole', userRole);
            
            if (payload.username) {
                userName = payload.username;
                localStorage.setItem('userName', userName);
            }
        }
    }

    // Cập nhật tên và vai trò người dùng trên Header
    if (document.querySelector('.user-name')) document.querySelector('.user-name').textContent = userName || 'User';
    if (document.querySelector('.user-role')) document.querySelector('.user-role').textContent = userRole === 'owner' ? 'Chủ sở hữu' : (userRole === 'admin' ? 'Quản trị viên' : 'Người xem');
    
    // --- FIX: Gắn sự kiện Đăng xuất bằng Event Delegation (Chắc chắn hoạt động 100%) ---
    document.addEventListener('click', (e) => {
        // Kiểm tra nếu click vào nút đăng xuất hoặc icon bên trong nó
        const btn = e.target.closest('.btn-logout') || e.target.closest('#btn-logout') || e.target.closest('[onclick="logout()"]');
        if (btn) {
            e.preventDefault();
            e.stopPropagation(); // Ngăn chặn các sự kiện khác
            logout();
        }
    });

    // --- FIX MẠNH TAY: Chèn CSS để ẩn triệt để các nút quản trị nếu là khách ---
    // Cách này mạnh hơn việc tìm và xóa element vì nó chặn hiển thị ngay từ cấp độ CSS
    if (!isAdmin()) {
        const style = document.createElement('style');
        style.id = 'guest-css-override';
        style.innerHTML = `
            /* Ẩn nút Viết bài mới (Target bằng ID, Class và Onclick) */
            #btn-create-post, .btn-create-post, button[onclick="openCreatePostModal()"],
            /* Ẩn nút Thêm thành viên */
            #members-tab .btn-add, .btn-add-member, button[onclick="openAddModal()"],
            /* Ẩn các nút Sửa/Xóa bài viết */
            .btn-edit, .btn-delete,
            /* Ẩn các thẻ cài đặt quản trị */
            .settings-card[onclick="openImportModal()"], 
            .settings-card[onclick="syncGoogleSheets()"], 
            .settings-card[onclick="openUserManagementModal()"] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
        console.log('🔒 Đã kích hoạt chế độ Khách: Ẩn toàn bộ nút quản trị bằng CSS.');
    }

    // Khởi tạo các ô tìm kiếm thông minh và cấu trúc form
    initSmartSelects();
    
    // Khởi tạo giao diện tab
    initTabs();

    // Tải dữ liệu và render tab mặc định (Dashboard)
    loadAndRenderAll();

    // Khởi tạo form bài viết (chèn input ảnh)
    initPostForm();

    // --- FIX: Đảm bảo các nút Lưu/Xóa luôn tồn tại trong Modal ---
    initModalButtons();

});

// 2. Hàm tải dữ liệu từ Server
async function loadMembers() {
    try {
        // Hiển thị trạng thái đang tải (nếu có element status)
        const statusEl = document.getElementById('loading-status');
        if (statusEl) statusEl.style.display = 'block';

        const token = localStorage.getItem('token');
        const res = await fetch('/api/members', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Kiểm tra nếu server trả về HTML (lỗi 404/500) thay vì JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error("Server lỗi (trả về HTML): " + text.substring(0, 100) + "...");
        }

        if (!res.ok) {
            const errData = await res.json();
            if (res.status === 401) {
                logout(); // Gọi hàm đăng xuất chuẩn
                return;
            }
            throw new Error(errData.error || errData.message || "Lỗi tải dữ liệu từ server");
        }

        allMembers = await res.json();
        console.log(`✅ Đã tải ${allMembers.length} thành viên từ Server.`);
        
        // Lưu dữ liệu vào Cache để lần sau refresh không bị mất
        localStorage.setItem('familyData', JSON.stringify(allMembers));
        
        renderData(allMembers);

    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        alert('⚠️ Hệ thống báo lỗi: ' + err.message); // Hiển thị lỗi cho người dùng thấy
    } finally {
        const statusEl = document.getElementById('loading-status');
        if (statusEl) statusEl.style.display = 'none';
    }
}

async function loadAndRenderAll() {
    await loadMembers();
    // Render tab mặc định (Dashboard) sau khi có dữ liệu
    renderDashboardTab();
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Tắt active cho tất cả
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Kích hoạt tab được click
            button.classList.add('active');
            const targetId = button.dataset.target;
            const targetContent = document.querySelector(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Render nội dung cho tab tương ứng
            switch(targetId) {
                case '#dashboard-tab':
                    renderDashboardTab();
                    break;
                case '#tree-tab':
                    renderTreeTab();
                    break;
                case '#members-tab':
                    renderMembersTab();
                    break;
                case '#posts-tab':
                    renderPostsTab();
                    break;
                case '#settings-tab':
                    renderSettingsTab();
                    break;
            }
        });
    });
}

// Hàm render dữ liệu chung (khi dữ liệu thay đổi)
function renderData(members) {
    // Sau khi có dữ liệu, cập nhật lại tab đang active
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) {
        renderDashboardTab(); // Mặc định render dashboard
        return;
    }
    
    switch(activeTab.id) {
        case 'dashboard-tab': renderDashboardTab(); break;
        case 'tree-tab': renderTreeTab(); break;
        case 'members-tab': renderMembersTab(); break;
        case 'posts-tab': renderPostsTab(); break;
        case 'settings-tab': renderSettingsTab(); break;
    }
}

function renderTreeTab() {
    const treeContainer = document.querySelector('#tree-tab #tree-canvas');
    if (!treeContainer) return;
    
    // --- BỔ SUNG: Hiển thị thông báo nếu chưa có dữ liệu ---
    if (allMembers.length === 0) {
        treeContainer.innerHTML = '<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; color:#666;"><i class="fas fa-tree" style="font-size:48px; margin-bottom:15px; color:#d1d5db;"></i><p>Chưa có dữ liệu để vẽ cây.</p></div>';
        return;
    }

    // 1. Tạo UI chọn số đời (nếu chưa có)
    const searchInput = document.getElementById('tree-search-input');
    if (searchInput) searchInput.classList.add('search-input'); // Đảm bảo có class CSS chuẩn
    if (searchInput && !document.getElementById('tree-gen-limit')) {
        const select = document.createElement('select');
        select.id = 'tree-gen-limit';
        select.className = 'tree-select'; // Sử dụng class CSS thay vì inline style
        
        // Option "Tất cả"
        const optAll = document.createElement('option');
        optAll.value = 0;
        optAll.textContent = 'Tất cả';
        select.appendChild(optAll);

        // Tính toán số đời tối đa để tạo option động
        let maxGen = (allMembers && allMembers.length > 0) ? Math.max(...allMembers.map(m => parseInt(m.generation) || 0)) : 0;
        if (maxGen < 10) maxGen = 10; // Tối thiểu 10 đời

        for (let i = 1; i <= maxGen; i++) {
            const o = document.createElement('option');
            o.value = i;
            o.textContent = `Đời thứ ${i}`;
            select.appendChild(o);
        }
        
        select.value = 0; // Mặc định hiển thị tất cả
        select.onchange = () => renderTreeTab(); // Vẽ lại khi thay đổi
        
        searchInput.parentNode.insertBefore(select, searchInput.nextSibling);

        // --- BỔ SUNG: Nút Đặt lại (Reset) ---
        const controls = document.querySelector('.tree-controls');
        if (controls) {
            if (!document.getElementById('btn-reset-tree')) {
            const resetBtn = document.createElement('button');
            resetBtn.id = 'btn-reset-tree';
            resetBtn.className = 'btn-control';
            resetBtn.innerHTML = '<i class="fas fa-sync-alt"></i> <span class="btn-text">Đặt lại</span>';
            resetBtn.onclick = () => {
                const select = document.getElementById('tree-gen-limit');
                if (select) select.value = 0; // Reset về Tất cả
                renderTreeTab(); // Vẽ lại và tự động zoom chuẩn
            };
            
            // Chèn vào trước nút "Xem toàn bộ"
            const viewAllBtn = controls.querySelector('button[onclick*="zoomToNode"]');
            
            // --- FIX: Đảm bảo nút "Xem toàn bộ" cũng ẩn chữ trên mobile ---
            if (viewAllBtn && !viewAllBtn.querySelector('.btn-text')) {
                const icon = viewAllBtn.querySelector('i');
                const text = viewAllBtn.innerText.trim();
                viewAllBtn.innerHTML = '';
                if(icon) viewAllBtn.appendChild(icon);
                viewAllBtn.innerHTML += ` <span class="btn-text">${text}</span>`;
            }

            if (viewAllBtn) controls.insertBefore(resetBtn, viewAllBtn);
            else controls.appendChild(resetBtn);
            }

            // --- BỔ SUNG: Nút Tải xuống (Download) ---
            if (!document.getElementById('btn-download-tree')) {
                const downloadBtn = document.createElement('button');
                downloadBtn.id = 'btn-download-tree';
                downloadBtn.className = 'btn-control';
                downloadBtn.innerHTML = '<i class="fas fa-file-download"></i> <span class="btn-text">Tải cây</span>';
                downloadBtn.onclick = downloadTreePDF;
                controls.appendChild(downloadBtn);
            }
        }
    }

    // 2. Lọc dữ liệu và Vẽ cây
    const selectedGen = document.getElementById('tree-gen-limit') ? parseInt(document.getElementById('tree-gen-limit').value) : 0;
    
    let dataToDraw;
    if (selectedGen > 0) {
        // Logic mới: Hiển thị đời được chọn, cùng với đời cha mẹ và đời con cái của họ.
        const targetGenerations = new Set([selectedGen]);
        if (selectedGen > 1) {
            targetGenerations.add(selectedGen - 1); // Đời cha mẹ
        }
        targetGenerations.add(selectedGen + 1); // Đời con cái

        // 1. Lọc ra tất cả thành viên thuộc các đời mục tiêu
        const coreMembers = allMembers.filter(m => targetGenerations.has(parseInt(m.generation)));
        
        // 2. Lấy ID của các thành viên cốt lõi này và ID của vợ/chồng họ để đảm bảo node gia đình không bị vỡ
        const memberIdsToShow = new Set();
        const spouseMap = new Map(); // Xử lý quan hệ vợ chồng 2 chiều
        allMembers.forEach(m => {
            if(m.pid) {
                spouseMap.set(String(m.id), String(m.pid));
                spouseMap.set(String(m.pid), String(m.id));
            }
        });

        coreMembers.forEach(m => {
            const memberId = String(m.id);
            memberIdsToShow.add(memberId); // Thêm chính họ
            const spouseId = spouseMap.get(memberId); // Thêm vợ/chồng của họ
            if (spouseId) memberIdsToShow.add(spouseId);
        });

        dataToDraw = allMembers.filter(m => memberIdsToShow.has(String(m.id)));
    } else {
        dataToDraw = allMembers; // Tùy chọn "Tất cả"
    }

    if (typeof drawTree === 'function') {
        drawTree(dataToDraw);
    }

    // 3. Cập nhật ô tìm kiếm của cây
    const searchResults = document.getElementById('tree-search-results');
    if (searchInput) {
        searchInput.onkeyup = () => handleTreeSearch(searchInput, searchResults);
    }
}

// Hàm Đăng xuất: Xóa Token và Xóa Dữ liệu Cache
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('familyData'); // Xóa sạch dữ liệu gia phả đã lưu
    window.location.href = '/login.html';
}
// Đảm bảo hàm logout có thể gọi được từ bất kỳ đâu
window.logout = logout;

// Hàm render tab Thành viên (Bổ sung hàm bị thiếu)
function renderMembersTab() {
    // --- BỔ SUNG: Khôi phục các nút chức năng trong Header của Tab Thành viên ---
    const header = document.querySelector('#members-tab .members-header');
    // Kiểm tra xem đã có nút chưa để tránh tạo trùng
    if (header && !document.getElementById('btn-adv-search')) {
        const addBtn = header.querySelector('.btn-add'); // Nút Thêm thành viên (đã có sẵn)
        const searchBar = header.querySelector('.search-bar');

        // --- KHÔI PHỤC: Dropdown lọc Huyết thống / Dâu rể ---
        const select = document.createElement('select');
        select.id = 'member-filter-type';
        select.className = 'tree-select'; // Dùng chung class với cây gia phả cho đồng bộ
        select.style.height = '48px'; // Chỉnh lại chiều cao cho khớp
        select.style.minWidth = '180px';
        
        select.innerHTML = `
            <option value="all">Tất cả thành viên</option>
            <option value="bloodline">🩸 Huyết thống</option>
            <option value="inlaw">💍 Dâu/Rể</option>
        `;
        
        // Chèn vào sau ô tìm kiếm
        if (searchBar) searchBar.parentNode.insertBefore(select, searchBar.nextSibling);
        
        // 1. Nút Tìm nâng cao
        const advBtn = document.createElement('button');
        advBtn.id = 'btn-adv-search';
        advBtn.innerHTML = '<i class="fas fa-filter"></i><span class="btn-text"> Tìm nâng cao</span>';
        advBtn.title = 'Tìm kiếm nâng cao';
        advBtn.className = 'btn-control';
        advBtn.onclick = openAdvancedSearchModal;
        
        // 2. Nút Tải xuống PDF
        const pdfBtn = document.createElement('button');
        pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i><span class="btn-text"> Xuất PDF</span>';
        pdfBtn.title = 'Xuất danh sách PDF';
        pdfBtn.className = 'btn-control';
        pdfBtn.style.color = '#ef4444';
        pdfBtn.onclick = downloadMemberPDF;

        // Chèn vào trước nút Thêm thành viên
        header.insertBefore(advBtn, addBtn);
        header.insertBefore(pdfBtn, addBtn);
    }

    // Ẩn nút "Thêm thành viên" nếu không phải Admin
    const addMemberBtn = document.querySelector('#members-tab .btn-add');
    if (addMemberBtn && !isAdmin()) {
        addMemberBtn.style.setProperty('display', 'none', 'important');
        addMemberBtn.remove(); // Xóa hoàn toàn khỏi HTML
    }

    // --- CẬP NHẬT: Hàm xử lý lọc kết hợp (Tên + Loại) ---
    const filterMembers = () => {
        const searchInput = document.getElementById('member-search-input');
        const filterSelect = document.getElementById('member-filter-type');
        
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterSelect ? filterSelect.value : 'all';
        
        const filteredMembers = allMembers.filter(m => {
            const matchesName = m.full_name.toLowerCase().includes(query);
            
            const isInLaw = !!m.pid && !m.fid && !m.mid;
            let matchesType = true;
            if (filterType === 'bloodline') matchesType = !isInLaw;
            else if (filterType === 'inlaw') matchesType = isInLaw;
            
            return matchesName && matchesType;
        });
        renderMemberList(filteredMembers);
    };

    // Gắn sự kiện và render lần đầu
    const searchInput = document.getElementById('member-search-input');
    if (searchInput) searchInput.onkeyup = filterMembers;
    const filterSelect = document.getElementById('member-filter-type');
    if (filterSelect) filterSelect.onchange = filterMembers;

    filterMembers(); // Render lần đầu với bộ lọc mặc định
}

// 3. Render danh sách thành viên (Sidebar)
function renderMemberList(members) {
    const container = document.getElementById('membersGrid');
    if (!container) return;
    
    currentDisplayedMembers = members; // Cập nhật danh sách hiện tại để dùng cho xuất PDF
    container.innerHTML = ''; // Xóa danh sách cũ trước khi render lại
    
    // --- Logic sắp xếp nâng cao theo dòng huyết thống ---
    const memberMap = new Map(allMembers.map(m => [String(m.id), m]));
    // Xóa cache sắp xếp cũ trước mỗi lần chạy để đảm bảo tính đúng đắn
    allMembers.forEach(m => delete m._ancestryOrder);

    const getBloodlineAncestryOrder = (member) => {
        if (!member) return [];
        if (member._ancestryOrder) return member._ancestryOrder; // Lấy từ cache nếu đã tính

        let bloodlineMember = member;
        // Nếu là dâu/rể, tìm người phối ngẫu để lấy dòng huyết thống
        if (bloodlineMember.pid && !bloodlineMember.fid && !bloodlineMember.mid) {
            const partner = memberMap.get(String(bloodlineMember.pid));
            if (partner) bloodlineMember = partner;
        }
        
        const getOrderChain = (m) => {
            if (!m) return [];
            if (m._ancestryOrder) return m._ancestryOrder;

            const parentId = m.fid || m.mid;
            const parent = parentId ? memberMap.get(String(parentId)) : null;
            const parentOrderChain = parent ? getOrderChain(parent) : [];
            const ancestryOrder = [...parentOrderChain, parseInt(m.order) || 999];
            
            m._ancestryOrder = ancestryOrder; // Cache lại kết quả
            return ancestryOrder;
        };

        const finalOrderChain = getOrderChain(bloodlineMember);
        member._ancestryOrder = finalOrderChain; // Cache cho cả thành viên gốc (dâu/rể)
        return finalOrderChain;
    };

    const sortedMembers = [...members].sort((a, b) => {
        // Rule 1: Sắp xếp theo Đời (Generation)
        const genA = parseInt(a.generation) || 999;
        const genB = parseInt(b.generation) || 999;
        if (genA !== genB) return genA - genB;

        // Rule 2: Sắp xếp theo "dòng" tổ tiên (con ông anh trước, con ông em sau)
        const ancestryA = getBloodlineAncestryOrder(a);
        const ancestryB = getBloodlineAncestryOrder(b);
        const minLength = Math.min(ancestryA.length, ancestryB.length);
        for (let i = 0; i < minLength; i++) {
            if (ancestryA[i] !== ancestryB[i]) return ancestryA[i] - ancestryB[i];
        }

        // Rule 3: Nếu dòng họ y hệt (vợ/chồng), xếp Nam trước Nữ
        if (a.gender !== b.gender) {
            return a.gender === 'Nam' ? -1 : 1;
        }

        return 0;
    });

    // Cập nhật dữ liệu phân trang và render trang đầu tiên
    pagination.data = sortedMembers;
    pagination.currentPage = 1;
    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('membersGrid');
    if (!container) return;
    container.innerHTML = '';

    // Đảm bảo container hiển thị dạng Grid
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    container.style.gap = '12px'; // Giảm khoảng cách từ 24px xuống 12px

    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const end = start + pagination.itemsPerPage;
    const pageMembers = pagination.data.slice(start, end);

    pageMembers.forEach(m => {
        // Logic xác định sinh tử (đồng bộ với Dashboard và Cây gia phả)
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
        const isDeceased = hasDeathDate || isDeadByFlag;

        // Logic Dâu/Rể (nếu có pid mà không có fid/mid)
        const isInLaw = !!m.pid && !m.fid && !m.mid;
        let inLawLabel = 'Dâu/Rể';
        if (isInLaw) {
            inLawLabel = (m.gender === 'Nam') ? 'Rể' : 'Dâu';
        }

        // Tìm tên vợ/chồng (Sử dụng allMembers để tìm chính xác ngay cả khi bị lọc)
        let spouseName = '';
        if (m.pid) {
            const spouse = allMembers.find(s => String(s.id) === String(m.pid));
            if (spouse) spouseName = spouse.full_name;
        }

        // Tính tuổi (nếu còn sống và có năm sinh)
        let ageDisplay = '';
        if (!isDeceased && m.birth_date) {
            try {
                // Lấy năm sinh từ chuỗi (hỗ trợ dd/mm/yyyy hoặc yyyy)
                const parts = String(m.birth_date).split(/[\/\-]/);
                let year = 0;
                if (parts.length === 3) year = parts[0].length === 4 ? parseInt(parts[0]) : parseInt(parts[2]);
                else if (parts.length === 1 && parts[0].length === 4) year = parseInt(parts[0]);
                
                if (year > 0) {
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - year;
                    if (age >= 0) ageDisplay = ` (${age} tuổi)`;
                }
            } catch(e) {}
        }

        // Tạo thẻ div thay vì chuỗi HTML để dễ gắn sự kiện onclick
        const card = document.createElement('div');
        card.className = `member-card ${m.gender === 'Nam' ? 'male' : 'female'} ${isDeceased ? 'deceased' : ''}`;
        
        // Branch display
        const branchMap = { '0': 'Tổ khảo', '1': 'Phái Nhất', '2': 'Phái Nhì', '3': 'Phái Ba', '4': 'Phái Bốn' };
        let branchDisplay = branchMap[m.branch] || (m.branch ? `Phái ${m.branch}` : 'Gốc');
        if (m.branch === 'Gốc') branchDisplay = 'Gốc';

        // --- BỔ SUNG LẠI LOGIC BỊ THIẾU ---
        const avatarColor = isDeceased ? '#5d4037' : (m.gender === 'Nam' ? '#3b82f6' : '#ec4899');
        const nameParts = (m.full_name || '?').trim().split(/\s+/);
        const avatarLetter = nameParts[nameParts.length - 1].charAt(0).toUpperCase();

        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-card-avatar" style="background-color: ${avatarColor};">
                    ${avatarLetter}
                </div>
                <div class="member-card-info">
                    <h4 class="member-card-name">${m.full_name}</h4>
                    <div class="member-card-gender">
                        ${m.gender === 'Nam' ? '<i class="fas fa-mars"></i> Nam' : '<i class="fas fa-venus"></i> Nữ'}
                        ${ageDisplay}
                    </div>
                </div>
            </div>
            
            <div class="member-card-tags">
                <span class="tag tag-gen">Đời thứ ${m.generation}</span>
                <span class="tag tag-branch">${branchDisplay}</span>
                ${isInLaw ? `<span class="tag tag-inlaw"><i class="fas fa-ring"></i> ${inLawLabel}</span>` : ''}
            </div>

            <div class="member-card-body">
                <p><i class="fas fa-birthday-cake icon-birth"></i> ${m.birth_date || 'Không rõ'}</p>
                ${isDeceased ? `<p><i class="fas fa-star-of-life icon-death"></i> Mất: ${m.death_date || 'Không rõ'}</p>` : ''}
                ${spouseName ? `<p><i class="fas fa-ring icon-spouse"></i> VC: ${spouseName}</p>` : ''}
                ${m.job ? `<p><i class="fas fa-briefcase icon-job"></i> ${m.job}</p>` : ''}
            </div>
        `;

        // Thêm sự kiện click để zoom đến người đó trên cây
        card.style.cursor = 'pointer';
        card.onclick = () => {
            // --- PHÂN QUYỀN: Admin mở form Sửa, Khách mở form Xem ---
            if (isAdmin()) {
                openEditModal(m.id);
            } else {
                openViewMemberModal(m.id);
            }
        };
        
        container.appendChild(card);
    });

    renderPaginationControls(container);
}

function renderPaginationControls(container) {
    const totalPages = Math.ceil(pagination.data.length / pagination.itemsPerPage);
    if (totalPages <= 1) return;

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';
    controls.style.gridColumn = '1 / -1';
    controls.style.display = 'flex';
    controls.style.justifyContent = 'center';
    controls.style.alignItems = 'center';
    controls.style.gap = '15px';
    controls.style.marginTop = '20px';
    controls.style.padding = '20px 0';

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Trước';
    prevBtn.className = 'btn-control';
    prevBtn.style.width = 'auto';
    prevBtn.disabled = pagination.currentPage === 1;
    if (pagination.currentPage === 1) prevBtn.style.opacity = '0.5';
    prevBtn.onclick = () => changePage(pagination.currentPage - 1);
    
    const info = document.createElement('span');
    info.innerText = `Trang ${pagination.currentPage} / ${totalPages}`;
    info.style.fontWeight = '600';
    info.style.color = '#4b5563';

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = 'Sau <i class="fas fa-chevron-right"></i>';
    nextBtn.className = 'btn-control';
    nextBtn.style.width = 'auto';
    nextBtn.disabled = pagination.currentPage === totalPages;
    if (pagination.currentPage === totalPages) nextBtn.style.opacity = '0.5';
    nextBtn.onclick = () => changePage(pagination.currentPage + 1);

    controls.appendChild(prevBtn);
    controls.appendChild(info);
    controls.appendChild(nextBtn);

    container.appendChild(controls);
}

function changePage(page) {
    const totalPages = Math.ceil(pagination.data.length / pagination.itemsPerPage);
    if (page < 1 || page > totalPages) return;
    pagination.currentPage = page;
    renderPagination();
    const grid = document.getElementById('membersGrid');
    if (grid) {
        const y = grid.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({top: y, behavior: 'smooth'});
    }
}

// 5. Các hàm Modal (Tách riêng Thêm/Sửa và Import)

// Mở modal Thêm mới
function openAddModal() {
    // Bảo vệ: Chỉ Admin mới được mở
    if (!isAdmin()) {
        alert('Bạn không có quyền thêm thành viên.');
        return;
    }
    currentEditingId = null; // Đặt lại trạng thái: đang thêm mới
    document.getElementById('modal-title').innerText = "Thêm thành viên mới";
    
    // Dọn dẹp form
    document.getElementById('m-name').value = '';
    document.getElementById('m-gender').value = 'Nam';
    document.getElementById('m-birth').value = '';
    document.getElementById('m-death').value = '';
    // Reset các trường bổ sung
    if(document.getElementById('m-job')) document.getElementById('m-job').value = '';
    if(document.getElementById('m-address')) document.getElementById('m-address').value = '';
    if(document.getElementById('m-branch')) document.getElementById('m-branch').value = '';
    
    ['m-fid', 'm-mid', 'm-pid'].forEach(id => {
        document.getElementById(id).value = ''; // Hidden input
        document.getElementById(id + '-search').value = ''; // Search input
    });

    // Ẩn nút Xóa khi ở chế độ Thêm mới
    document.getElementById('btn-delete-member').style.display = 'none';
    
    document.getElementById('add-member-modal').style.display = 'flex';
}

// Mở modal Sửa (Được gọi khi click vào node)
window.openEditModal = function(memberId) {
    // Chặn ngay từ đầu nếu không phải admin
    if (!isAdmin()) {
        alert('Bạn không có quyền chỉnh sửa thông tin.');
        return;
    }

    const member = allMembers.find(m => m.id == memberId);
    if (!member) {
        console.error("Không tìm thấy thành viên với ID:", memberId);
        return;
    }

    currentEditingId = memberId; // Đặt trạng thái: đang sửa
    document.getElementById('modal-title').innerText = "Sửa thông tin thành viên";

    // Điền dữ liệu cơ bản
    document.getElementById('m-name').value = member.full_name;
    document.getElementById('m-gender').value = member.gender;
    document.getElementById('m-birth').value = member.birth_date || '';
    document.getElementById('m-death').value = member.death_date || '';
    // Điền dữ liệu các trường bổ sung
    if(document.getElementById('m-job')) document.getElementById('m-job').value = member.job || '';
    if(document.getElementById('m-address')) document.getElementById('m-address').value = member.address || '';
    if(document.getElementById('m-branch')) document.getElementById('m-branch').value = member.branch || '';
    
    // --- FIX: Xóa bỏ logic tìm vợ/chồng 2 chiều thông minh ---
    // Điền dữ liệu cho các ô tìm kiếm thông minh
    const relations = {
        'm-fid': member.fid,
        'm-mid': member.mid,
        'm-pid': member.pid // Lấy trực tiếp pid, không tìm ngược
    };
    for (const id in relations) {
        const relatedId = relations[id];
        document.getElementById(id).value = relatedId || ''; // Set hidden input
        const relatedMember = allMembers.find(m => String(m.id) === String(relatedId));
        document.getElementById(id + '-search').value = relatedMember ? relatedMember.full_name : ''; // Set search input
    }

    // Hiển thị nút Xóa khi ở chế độ Sửa
    document.getElementById('btn-delete-member').style.display = 'inline-block';

    document.getElementById('add-member-modal').style.display = 'flex';
}

// Đóng tất cả modal
function closeModal() {
    const addModal = document.getElementById('add-member-modal');
    
    if (addModal) addModal.style.display = 'none';
    
    // Reset trạng thái sửa về null
    currentEditingId = null;
}

function updateSmartSelectOptions() {
    // Hàm này sẽ được gọi khi allMembers thay đổi để cập nhật lại dữ liệu cho các smart select
    // Hiện tại, logic lọc đã nằm trong event listener của searchInput, nên không cần làm gì nhiều ở đây.
    // Tuy nhiên, nếu có các trường hợp cần cập nhật lại danh sách hiển thị mà không cần gõ,
    // thì logic sẽ được thêm vào đây.
    // Ví dụ: khi chọn Cha, danh sách Mẹ sẽ tự động lọc lại mà không cần gõ lại.
    // Điều này đã được xử lý trong event listener của searchInput cho m-mid.
}

function initSmartSelects() {
    const modalContent = document.querySelector('#add-member-modal .modal-content');
    if (!modalContent || modalContent.dataset.smartInit === 'true') return;

    console.log('🛠️ Đang khởi tạo form nhập liệu (Bootstrap-like layout)...');

    // --- BỔ SUNG: Xóa chữ "(nếu có)" khỏi tất cả label ---
    modalContent.querySelectorAll('label').forEach(lbl => {
        lbl.innerHTML = lbl.innerHTML.replace(/\(nếu có\)/gi, '').trim();
    });

    const configs = [
        { id: 'm-name', type: 'text' }, // Giữ nguyên input text
        { id: 'm-gender', type: 'select' }, // Giữ nguyên select
        { id: 'm-birth', type: 'text' },
        { id: 'm-death', type: 'text' },
        { id: 'm-fid', type: 'smart-select', filter: (m) => m.gender === 'Nam', placeholder: 'Gõ để tìm kiếm Cha...' },
        { id: 'm-mid', type: 'smart-select', filter: (m) => m.gender === 'Nữ', placeholder: 'Gõ để tìm kiếm Mẹ...' },
        { id: 'm-pid', type: 'smart-select', filter: () => true, placeholder: 'Gõ để tìm kiếm Vợ/Chồng...' },
    ];

    configs.forEach(({ id, type, filter, placeholder }) => {
        const originalEl = document.getElementById(id);
        if (!originalEl) return;

        // Tìm nhãn (label) đã có sẵn trong HTML
        const labelEl = modalContent.querySelector(`label[for="${id}"]`);

        // Tạo một div mới để nhóm label và input/smart-select
        const group = document.createElement('div');
        group.className = 'form-group';

        // Chèn group vào trước label hoặc input gốc
        const referenceNode = labelEl || originalEl;
        referenceNode.parentElement.insertBefore(group, referenceNode);

        // Di chuyển label đã có vào trong group
        if (labelEl) {
            group.appendChild(labelEl);
        }

        if (type === 'smart-select') {
            const wrapper = document.createElement('div');
            wrapper.className = 'smart-select-wrapper';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = id + '-search';
            searchInput.placeholder = placeholder || 'Gõ để tìm kiếm...';
            searchInput.autocomplete = 'off';

            const resultsDiv = document.createElement('div');
            resultsDiv.className = 'smart-select-results';

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = id; // Giữ ID gốc cho input ẩn

            wrapper.appendChild(searchInput);
            wrapper.appendChild(resultsDiv);
            group.appendChild(wrapper);
            group.appendChild(hiddenInput);

            // Cập nhật lại thuộc tính 'for' của label để trỏ đúng vào ô tìm kiếm mới
            if (labelEl) {
                labelEl.setAttribute('for', id + '-search');
            }

            // Xóa thẻ <select> gốc đi
            originalEl.remove();

            // Logic tìm kiếm
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                resultsDiv.innerHTML = '';
                
                // --- FIX: Xóa bỏ logic lọc thông minh (tìm vợ cho chồng, mẹ theo cha...) ---
                // Chỉ lọc theo tiêu chí cơ bản (Giới tính) đã định nghĩa trong config
                let dataSource = allMembers.filter(filter);

                // Nếu là chọn Vợ/Chồng, loại bỏ chính mình khỏi danh sách
                if (id === 'm-pid' && currentEditingId) {
                    dataSource = dataSource.filter(m => String(m.id) !== String(currentEditingId));
                }

                const matched = query ? dataSource.filter(m => m.full_name.toLowerCase().includes(query)) : dataSource;
                matched.slice(0, 10).forEach(member => {
                    const item = document.createElement('div');
                    item.textContent = member.full_name;
                    item.addEventListener('click', () => {
                        searchInput.value = member.full_name;
                        hiddenInput.value = member.id;
                        resultsDiv.style.display = 'none';
                        if (id === 'm-fid') { // Nếu vừa chọn Cha, tự động xóa lựa chọn Mẹ cũ
                            document.getElementById('m-mid-search').value = '';
                            document.getElementById('m-mid').value = '';
                        }
                        // --- FIX: Đã xóa logic tự động xóa Mẹ khi chọn Cha ---
                    });
                    resultsDiv.appendChild(item);
                });
                resultsDiv.style.display = matched.length > 0 ? 'block' : 'none';
            });

            searchInput.addEventListener('focus', () => { if (!searchInput.value) searchInput.dispatchEvent(new Event('input')); });
            searchInput.addEventListener('change', () => { if (searchInput.value === '') hiddenInput.value = ''; });

        } else {
            // Đối với các trường input/select thường, chỉ cần di chuyển chúng vào trong nhóm
            group.appendChild(originalEl);
        }
    });

    // Đóng danh sách kết quả tìm kiếm khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.smart-select-wrapper')) {
            document.querySelectorAll('.smart-select-results').forEach(div => div.style.display = 'none');
        }
    });

    modalContent.dataset.smartInit = 'true';
}

// --- BỔ SUNG: Hàm khởi tạo nút bấm cho Modal (Phòng trường hợp HTML bị thiếu) ---
function initModalButtons() {
    const modal = document.getElementById('add-member-modal');
    if (!modal) return;
    
    let footer = modal.querySelector('.form-actions');
    // Nếu chưa có footer (nơi chứa nút), tạo mới
    if (!footer) {
        const content = modal.querySelector('.modal-content');
        if (content) {
            footer = document.createElement('div');
            footer.className = 'form-actions';
            content.appendChild(footer);
        }
    }
    
    if (footer) {
        // 1. Nút Xóa (Delete)
        if (!document.getElementById('btn-delete-member')) {
            const delBtn = document.createElement('button');
            delBtn.id = 'btn-delete-member';
            delBtn.type = 'button';
            // Style inline để đảm bảo hiển thị đúng ngay lập tức
            delBtn.style.cssText = "background: #fee2e2; color: #dc2626; margin-right: auto;"; 
            delBtn.innerHTML = '<i class="fas fa-trash"></i> Xóa';
            delBtn.onclick = deleteMember;
            footer.appendChild(delBtn);
        }
        
        // 2. Nút Hủy (Cancel)
        if (!footer.querySelector('.btn-cancel')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-cancel';
            cancelBtn.innerText = 'Hủy';
            cancelBtn.onclick = closeModal;
            footer.appendChild(cancelBtn);
        }
        
        // 3. Nút Lưu (Save)
        if (!footer.querySelector('.btn-save')) {
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn-save';
            saveBtn.innerText = 'Lưu thông tin';
            saveBtn.onclick = saveMember;
            footer.appendChild(saveBtn);
        }
    }
}

async function saveMember() {
    const nameInput = document.getElementById('m-name');
    const genderInput = document.getElementById('m-gender');
    const birthInput = document.getElementById('m-birth');
    const deathInput = document.getElementById('m-death');
    const jobInput = document.getElementById('m-job');
    const addressInput = document.getElementById('m-address');
    const branchInput = document.getElementById('m-branch');
    const fidInput = document.getElementById('m-fid');
    const midInput = document.getElementById('m-mid');
    const pidInput = document.getElementById('m-pid'); // Thêm input cho Vợ/Chồng

    // Validate cơ bản
    if (!nameInput || !nameInput.value.trim()) { alert("Vui lòng nhập họ tên!"); return; }

    // Tự động tính đời (Generation) dựa trên cha/mẹ hoặc vợ/chồng
    let generation = 1;
    const fid = fidInput ? fidInput.value : null;
    const mid = midInput ? midInput.value : null;
    const pid = pidInput ? pidInput.value : null;

    if (fid || mid) {
        const parent = allMembers.find(m => m.id == (fid || mid));
        if (parent) {
            generation = (parent.generation || 0) + 1;
        }
    } else if (pid) {
        // Nếu không có cha mẹ nhưng có vợ/chồng, lấy cùng đời với vợ/chồng
        const spouse = allMembers.find(m => m.id == pid);
        if (spouse) {
            generation = spouse.generation || 1;
        }
    }

    const payload = {
        full_name: nameInput.value.trim(),
        gender: genderInput ? genderInput.value : 'Nam',
        birth_date: birthInput ? birthInput.value.trim() : '',
        death_date: deathInput ? deathInput.value.trim() : '',
        job: jobInput ? jobInput.value.trim() : '',
        address: addressInput ? addressInput.value.trim() : '',
        branch: branchInput ? branchInput.value.trim() : '',
        fid: fid,
        mid: mid,
        pid: pid, // Thêm pid vào payload
        generation: generation,
        // Các trường mặc định khác sẽ do Server hoặc Model xử lý
    };

    try {
        const token = localStorage.getItem('token');
        
        // Quyết định URL và Method dựa trên việc đang Thêm hay Sửa
        const url = currentEditingId ? `/api/members/${currentEditingId}` : '/api/members';
        const method = currentEditingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Lỗi khi lưu thành viên");
        }

        alert(currentEditingId ? "✅ Cập nhật thành công!" : "✅ Thêm thành viên thành công!");
        
        closeModal();
        loadMembers(); // Tải lại dữ liệu để cập nhật cây
    } catch (err) {
        console.error(err);
        alert("❌ Lỗi: " + err.message);
    }
}

// Hàm xóa thành viên (được gọi từ nút Xóa trong modal)
async function deleteMember() {
    // Bảo vệ: Chỉ Admin mới được xóa
    if (!isAdmin()) {
        alert('Bạn không có quyền xóa thành viên.');
        return;
    }
    if (!currentEditingId) return;

    const memberToDelete = allMembers.find(m => m.id === currentEditingId);
    if (!memberToDelete) {
        alert("Không tìm thấy thành viên để xóa.");
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa thành viên "${memberToDelete.full_name}" không?\n\nHành động này không thể hoàn tác.`);
    if (!confirmDelete) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/members/${currentEditingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Lỗi từ server");

        alert(`✅ ${data.message}`);
        closeModal();
        loadMembers(); // Tải lại cây gia phả
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        alert(`❌ Lỗi: ${err.message}`);
    }
}

// 6. Hàm đồng bộ Google Sheets
async function syncGoogleSheets() {
    const confirmSync = confirm("Hệ thống sẽ xóa dữ liệu cũ và nạp lại từ Google Sheets.");
    if (!confirmSync) return;

    const btn = document.getElementById('btn-sync-sheets');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⌛ Đang xử lý...";
        btn.style.backgroundColor = "#ccc";
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/import-sheets', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok) {
            alert("✅ Thành công: " + result.message);
            loadMembers(); // Tải lại cây gia phả
        } else {
            alert("❌ Lỗi: " + (result.message || response.statusText));
        }
    } catch (error) {
        console.error("Sync Error:", error);
        alert("❌ Lỗi kết nối đến Server!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.style.backgroundColor = "#f39c12";
        }
    }
}

// --- Chức năng Bài Viết (Posts) ---
let currentPostId = null;

// Hàm khởi tạo form bài viết (chèn input file vào modal nếu chưa có)
function initPostForm() {
    const categorySelect = document.getElementById('post-category');
    if (categorySelect && !document.getElementById('post-image')) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.marginTop = '15px';
        
        const label = document.createElement('label');
        label.innerText = 'Ảnh minh họa (Tùy chọn)';
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'post-image';
        input.accept = 'image/*';
        input.style.width = '100%';
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        
        // Chèn vào sau ô chọn danh mục
        categorySelect.parentNode.parentNode.insertBefore(formGroup, categorySelect.parentNode.nextSibling);
    }
}

function renderPostsTab() {
    // Ẩn/hiện nút "Viết bài mới" dựa trên quyền
    const createPostBtn = document.getElementById('btn-create-post');
    if (createPostBtn) {
        if (isAdmin()) {
            createPostBtn.style.display = 'flex';
            createPostBtn.style.visibility = 'visible';
        } else {
            // Dùng setProperty với 'important' để chắc chắn ẩn, bất chấp CSS khác
            createPostBtn.style.setProperty('display', 'none', 'important');
            createPostBtn.style.visibility = 'hidden';
            createPostBtn.remove(); // Xóa hoàn toàn khỏi HTML
        }
    }

    // Chỉ cần load dữ liệu, HTML tĩnh đã có sẵn trong index.html
    loadPosts();
}

async function loadPosts() {
    const container = document.getElementById('posts-list-container');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/posts', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.posts.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">Chưa có bài viết nào.</p>';
                return;
            }

            container.innerHTML = data.posts.map(post => {
                const date = new Date(post.created_at).toLocaleDateString('vi-VN');
                const pinnedIcon = post.is_pinned ? '<span class="pinned-icon">📌 Đã ghim</span>' : '';
                const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức' };
                const catClass = `cat-${post.category}`;
                const shortContent = post.content.length > 150 ? post.content.substring(0, 150) + '...' : post.content;
                const imageHtml = post.image ? `<div class="post-thumb"><img src="${post.image}" alt="${post.title}" onerror="this.style.display='none'; this.parentElement.style.display='none';"></div>` : '';
                
                const actionsHtml = isAdmin() ? `
                    <div class="post-actions">
                        <button class="btn-edit" onclick="openEditPostModal('${post._id}')" style="padding:4px 8px; font-size:12px;"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deletePost('${post._id}')" style="padding:4px 8px; font-size:12px;"><i class="fas fa-trash"></i></button>
                    </div>
                ` : '';
                
                return `
                <div class="post-card ${post.is_pinned ? 'pinned' : ''}">
                    <div class="post-card-inner">
                        ${imageHtml}
                        <div class="post-card-content">
                            <div class="post-header">
                                <h3 class="post-title" style="margin:0; font-size:18px;">${post.title}</h3>
                                ${actionsHtml}
                            </div>
                            <div class="post-meta">
                                <span class="post-category ${catClass}" style="background:#f3f4f6; padding:2px 8px; border-radius:4px;">${catMap[post.category]}</span>
                                <span><i class="far fa-clock"></i> ${date}</span>
                                ${pinnedIcon}
                            </div>
                            <div class="post-excerpt" style="flex-grow:1; color:#4b5563; margin-bottom:15px;">${shortContent}</div>
                            <button onclick="openViewPostModal('${post._id}')" style="align-self:flex-start; background:none; border:none; color:#0ea5e9; cursor:pointer; padding:0; font-weight:600;">Đọc tiếp →</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (err) {
        container.innerHTML = `<p style="color:red;">Lỗi tải bài viết: ${err.message}</p>`;
    }
}

function openCreatePostModal() {
    currentPostId = null;
    document.getElementById('post-modal-title').innerText = 'Viết bài mới';
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-category').value = 'announcement';
    document.getElementById('post-pinned').checked = false;
    if(document.getElementById('post-image')) document.getElementById('post-image').value = ''; // Reset file input
    
    document.getElementById('post-modal').style.display = 'block';
}

function closePostModal() {
    document.getElementById('post-modal').style.display = 'none';
    currentPostId = null;
}

async function openEditPostModal(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const post = data.post;
            currentPostId = post._id;
            
            document.getElementById('post-modal-title').innerText = 'Sửa bài viết';
            document.getElementById('post-title').value = post.title;
            document.getElementById('post-content').value = post.content;
            document.getElementById('post-category').value = post.category;
            document.getElementById('post-pinned').checked = post.is_pinned;
            if(document.getElementById('post-image')) document.getElementById('post-image').value = ''; // Reset file input
            
            document.getElementById('post-modal').style.display = 'block';
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi tải thông tin bài viết');
    }
}

async function savePost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const category = document.getElementById('post-category').value;
    const is_pinned = document.getElementById('post-pinned').checked;
    const imageInput = document.getElementById('post-image');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('category', category);
    formData.append('is_pinned', is_pinned);
    if (imageInput && imageInput.files[0]) {
        formData.append('image', imageInput.files[0]);
    }

    const method = currentPostId ? 'PUT' : 'POST';
    const url = currentPostId ? `/api/posts/${currentPostId}` : '/api/posts';
    const token = localStorage.getItem('token');

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${token}` }, // Không set Content-Type để browser tự set multipart/form-data
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Lưu thành công!');
            closePostModal();
            loadPosts();
        } else {
            alert('❌ Lỗi: ' + data.message);
        }
    } catch (err) {
        alert('❌ Lỗi kết nối: ' + err.message);
    }
}

async function deletePost(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa bài viết này?')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadPosts();
        } else {
            alert('❌ ' + data.message);
        }
    } catch (err) {
        alert('❌ Lỗi: ' + err.message);
    }
}

function renderSettingsTab() {
    const wrapper = document.getElementById('settings-content-wrapper');
    if (!wrapper) return;
    
    // Xóa class grid mặc định của wrapper để có thể bố trí tự do (Grid + Hướng dẫn)
    wrapper.classList.remove('settings-grid');
    
    wrapper.innerHTML = `
        <!-- PHẦN TRÊN: CÔNG CỤ & THÔNG TIN (NGANG - 4 CỘT) -->
        <div class="settings-section">
            <h3 class="settings-section-title">Công cụ & Thông tin</h3>
            <div class="settings-row">
                ${isAdmin() ? `
                    <div class="settings-card" onclick="syncGoogleSheets()">
                        <i class="fas fa-cloud-download-alt" style="color: #3498db;"></i>
                        <h3>Đồng bộ Sheets</h3>
                        <p>Nạp lại từ Google Sheets.</p>
                    </div>
                    <div class="settings-card" onclick="openImportModal()" style="position: relative;">
                        <i class="fas fa-file-csv" style="color: #27ae60;"></i>
                        <h3>Nhập File CSV</h3>
                        <p>Thêm/Cập nhật từ CSV.</p>
                        <button onclick="event.stopPropagation(); downloadSampleCSV()" class="btn-sample-download" title="Tải file mẫu cấu trúc chuẩn">
                            <i class="fas fa-file-download"></i> Tải mẫu
                        </button>
                    </div>
                    <div class="settings-card" onclick="openUserManagementModal()">
                        <i class="fas fa-users-cog" style="color: #4b5563;"></i>
                        <h3>Quản lý Tài khoản</h3>
                        <p>Thêm/Xóa người dùng.</p>
                    </div>
                ` : ''}
                <div class="settings-card" onclick="exportToCSV()">
                    <i class="fas fa-file-export" style="color: #f39c12;"></i>
                    <h3>Xuất File CSV</h3>
                    <p>Tải dữ liệu hiện tại.</p>
                </div>
                <div class="settings-card" onclick="alert('Gia Phả Họ Lê Công v2.5\\n\\nỨng dụng quản lý gia phả dòng họ.\\nPhát triển bởi: Lê Công Kỷ\\nLiên hệ: lecong12@gmail.com')">
                    <i class="fas fa-info-circle" style="color: #8e44ad;"></i>
                    <h3>Thông tin App</h3>
                    <p>Phiên bản V 2.5.</p>
                </div>
            </div>
        </div>

        <!-- PHẦN DƯỚI: HƯỚNG DẪN CHI TIẾT (DỌC) -->
        <div class="settings-section" style="margin-top: 40px; border-top: 1px solid var(--gray-200); padding-top: 30px;">
            <h3 class="settings-section-title">Hướng dẫn sử dụng chi tiết</h3>
            <div class="settings-col">
                
                <div class="settings-card guide-card">
                    <div class="guide-header">
                        <i class="fas fa-sitemap"></i>
                        <h3>1. Cây Gia Phả</h3>
                    </div>
                    <div class="guide-body">
                        <ul>
                            <li><strong>Hiển thị:</strong> Cây gia phả được vẽ tự động dựa trên mối quan hệ Cha-Con và Vợ-Chồng.
                                <ul>
                                    <li><span style="color:#3b82f6">🟦 Nam</span> / <span style="color:#ec4899">🟥 Nữ</span>: Phân biệt bằng màu sắc viền và nền.</li>
                                    <li><span style="color:#9ca3af">⬜ Xám</span>: Thành viên đã mất.</li>
                                    <li><strong>Nét đứt:</strong> Biểu thị quan hệ Dâu/Rể (không cùng huyết thống).</li>
                                </ul>
                            </li>
                            <li><strong>Di chuyển & Zoom:</strong> Nhấn giữ chuột trái vào vùng trống để kéo. Lăn chuột để phóng to/thu nhỏ.</li>
                            <li><strong>Xem & Sửa:</strong> Click chuột trái vào thẻ để xem. <strong>Double click</strong> (nhấn đúp) để mở cửa sổ chỉnh sửa thông tin.</li>
                            <li><strong>Công cụ:</strong> Thanh công cụ phía trên cho phép tìm kiếm nhanh, lọc số đời hiển thị và tải cây về dạng ảnh PDF.</li>
                        </ul>
                    </div>
                </div>

                <div class="settings-card guide-card">
                    <div class="guide-header">
                        <i class="fas fa-users"></i>
                        <h3>2. Quản lý Thành viên</h3>
                    </div>
                    <div class="guide-body">
                        <ul>
                            <li><strong>Thêm thành viên:</strong> Nhấn nút "Thêm Thành viên" ở góc phải. Nhập đầy đủ Họ tên, Giới tính, và liên kết Cha/Mẹ/Vợ/Chồng (nếu có).</li>
                            <li><strong>Tìm kiếm nâng cao:</strong> Sử dụng bộ lọc để tìm theo Đời, Phái, Năm sinh, Nghề nghiệp... Kết quả có thể xuất ra file PDF.</li>
                            <li><strong>Sửa/Xóa:</strong> Có thể sửa hoặc xóa thành viên bằng cách click vào tên họ trong danh sách. <em>Lưu ý: Xóa thành viên sẽ xóa cả các mối quan hệ liên quan.</em></li>
                        </ul>
                    </div>
                </div>

                <div class="settings-card guide-card">
                    <div class="guide-header">
                        <i class="fas fa-database"></i>
                        <h3>3. Dữ liệu & Hệ thống</h3>
                    </div>
                    <div class="guide-body">
                        <ul>
                            <li><strong>Nhập từ CSV:</strong> Dùng để thêm hàng loạt thành viên. Hãy tải <strong>File mẫu</strong> ở mục trên để biết cấu trúc cột (id, full_name, fid, mid, pid...).</li>
                            <li><strong>Xuất ra CSV:</strong> Sao lưu toàn bộ dữ liệu hiện tại về máy tính để lưu trữ hoặc chỉnh sửa trên Excel.</li>
                            <li><strong>Đồng bộ Google Sheets:</strong> Tính năng nâng cao dành cho Quản trị viên để nạp dữ liệu từ nguồn online.</li>
                        </ul>
                    </div>
                </div>

            </div>
        </div>
    `;
}

function openImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
        // Reset lại form mỗi khi mở
        document.getElementById('csv-file-input').value = '';
        const statusDiv = document.getElementById('import-status');
        statusDiv.innerHTML = '';
        statusDiv.className = ''; // Xóa các class success/error/info
        
        // Reset hiển thị tên file và nút tải lên
        updateFileName(document.getElementById('csv-file-input'));

        // Reset nút upload
        const uploadBtn = document.getElementById('btn-upload-csv');
        uploadBtn.innerHTML = 'Tải lên & Xử lý';

        modal.style.display = 'block';
    }
}

function updateFileName(input) {
    const fileNameDisplay = document.getElementById('file-name-display');
    const uploadBtn = document.getElementById('btn-upload-csv');
    if (input.files.length > 0) {
        fileNameDisplay.textContent = `Đã chọn: ${input.files[0].name}`;
        fileNameDisplay.style.color = '#0f5132'; // Màu xanh lá cây đậm
        uploadBtn.disabled = false; // Kích hoạt nút tải lên
    } else {
        fileNameDisplay.textContent = 'Chưa có file nào được chọn';
        fileNameDisplay.style.color = '#6c757d'; // Màu xám
        uploadBtn.disabled = true; // Vô hiệu hóa nút
    }
}

async function handleFileUpload() {
    const fileInput = document.getElementById('csv-file-input');
    const statusDiv = document.getElementById('import-status');
    const uploadBtn = document.getElementById('btn-upload-csv');

    if (fileInput.files.length === 0) {
        alert('Vui lòng chọn một file CSV.');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('csvfile', file); // 'csvfile' phải khớp với tên field trong upload.single() ở backend

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '⌛ Đang xử lý...';
    statusDiv.className = 'info';
    statusDiv.innerHTML = 'Đang tải file lên và xử lý, vui lòng chờ...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/import-csv', {
            method: 'POST',
            headers: {
                // 'Content-Type': 'multipart/form-data' được trình duyệt tự động thêm vào khi dùng FormData
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            statusDiv.className = 'success';
            statusDiv.innerHTML = result.message.replace(/\n/g, '<br>'); // Thay \n bằng <br> để xuống dòng
            
            const hasWarning = result.message.includes('⚠️');

            if (hasWarning) {
                // Có cảnh báo, giữ modal mở và bật lại nút để thử lại
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = 'Tải lên & Xử lý';
            } else {
                // Thành công không có cảnh báo, tự động đóng sau 2.5 giây
                setTimeout(() => {
                    const modal = document.getElementById('import-modal');
                    if (modal) modal.style.display = 'none';
                }, 2500);
            }

            loadMembers(); // Tải lại toàn bộ dữ liệu gia phả
        } else {
            // Server có thể trả về lỗi dạng { message: ... } hoặc { error: ... }
            throw new Error(result.message || result.error || 'Lỗi không xác định từ server.');
        }

    } catch (error) {
        console.error('Lỗi import file:', error);
        statusDiv.className = 'error';
        statusDiv.innerHTML = `❌ Lỗi: ${error.message}`;
        // Nếu có lỗi, kích hoạt lại nút để người dùng có thể thử lại
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'Tải lên & Xử lý';
    }
}

async function exportToCSV() {
    // Cập nhật selector để tìm đúng thẻ card trong giao diện Settings mới
    const btn = document.querySelector('.settings-card[onclick="exportToCSV()"]');
    let originalText = '';
    
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><h3>⌛ Đang xử lý...</h3><p>Đang tạo file CSV</p></div>';
        btn.style.pointerEvents = 'none'; // Chặn click nhiều lần
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/export-csv', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Lỗi khi tạo file CSV');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `giapha_export_${date}.csv`;
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error('Lỗi xuất CSV:', error);
        alert('❌ Lỗi: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
}

// Hàm tải file CSV mẫu
function downloadSampleCSV() {
    const headers = [
        'id', 'full_name', 'gender', 'pid', 'fid', 'mid', 
        'generation', 'order', 'branch', 
        'birth_date', 'death_date', 'address', 'job', 'is_live'
    ];
    
    // Dữ liệu mẫu demo
    const demoData = [
        ['M001', 'Lê Công Tổ', 'Nam', '', '', '', '1', '1', 'Gốc', '1900', '1980', 'Quê quán', 'Nông dân', '0'],
        ['S001', 'Nguyễn Thị Bà', 'Nữ', 'M001', '', '', '1', '1', 'Gốc', '1905', '1985', 'Quê quán', 'Nội trợ', '0'],
        ['M002', 'Lê Công Con', 'Nam', '', 'M001', 'S001', '2', '1', '1', '1930', '', 'Hà Nội', 'Giáo viên', '1'],
        ['M003', 'Lê Thị Gái', 'Nữ', '', 'M001', 'S001', '2', '2', '1', '1935', '', 'TP.HCM', 'Bác sĩ', '1']
    ];

    let csvContent = headers.join(',') + '\n';
    demoData.forEach(row => {
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mau_nhap_lieu_giapha.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleTreeSearch(input, resultsContainer) {
    const filter = input.value.toLowerCase();

    if (!filter) {
        resultsContainer.style.display = 'none';
        return;
    }

    const results = allMembers.filter(m => m.full_name.toLowerCase().includes(filter));

    resultsContainer.innerHTML = '';
    if (results.length > 0) {
        results.slice(0, 5).forEach(member => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `${member.full_name} (Đời thứ ${member.generation})`;
            div.onclick = () => {
                if (typeof zoomToNode === 'function') zoomToNode(member.id);
                input.value = '';
                resultsContainer.style.display = 'none';
            };
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.style.display = 'none';
    }
}

function renderDashboardTab() {
    const wrapper = document.getElementById('stats-content-wrapper');
    if (!wrapper) return;

    // Chèn HTML dashboard vào
    wrapper.innerHTML = `
        <h2 style="text-align: center; margin-bottom: 20px; color: #ef4444; text-transform: uppercase;">Tổng quan Gia phả</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #f97316, #fbbf24);">
                    <i class="fa-solid fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>Tổng Thành Viên</h3>
                    <div class="stat-number" id="totalMembers">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #06b6d4, #0ea5e9);">
                    <i class="fa-solid fa-male"></i>
                </div>
                <div class="stat-info">
                    <h3>Nam</h3>
                    <div class="stat-number" id="maleCount">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #ec4899, #f43f5e);">
                    <i class="fa-solid fa-female"></i>
                </div>
                <div class="stat-info">
                    <h3>Nữ</h3>
                    <div class="stat-number" id="femaleCount">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #34d399);">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="stat-info">
                    <h3>Số Thế Hệ</h3>
                    <div class="stat-number" id="generationCount">0</div>
                </div>
            </div>
        </div>

        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>Phân bố theo Thế hệ</h3>
                <div id="gen-list-container" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>Thành phần Gia tộc</h3>
                <div style="height: 300px; position: relative; width: 100%;">
                    <canvas id="chartComp"></canvas>
                </div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>Phân bổ theo Phái</h3>
                <div id="branch-list-container" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>Tình trạng sinh tử</h3>
                <div style="height: 300px; position: relative; width: 100%;">
                    <canvas id="chartStatus"></canvas>
                </div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>🎂 Sinh nhật sắp tới (30 ngày)</h3>
                <div id="upcoming-birthdays" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>🕯️ Ngày giỗ sắp tới (30 ngày)</h3>
                <div id="upcoming-death-annivs" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col" style="grid-column: 1 / -1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">Hoạt động gần đây</h3>
                    ${isAdmin() ? `
                        <button onclick="clearActivities()" style="background: #fee2e2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85em; font-weight: 600; transition: background 0.2s;">
                            <i class="fas fa-trash-alt"></i> Xóa lịch sử
                        </button>
                    ` : ''}
                </div>
                <div id="recent-activities" style="max-height: 300px; overflow-y: auto;">Đang tải...</div>
            </div>
        </div>
    `;

    if (allMembers.length === 0) {
        wrapper.querySelector('.stats-grid').innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #fff; border: 2px dashed #e5e7eb; border-radius: 12px;">
                <i class="fas fa-users-slash" style="font-size: 48px; color: #d1d5db; margin-bottom: 15px;"></i>
                <h3 style="color: #374151; margin-bottom: 8px;">Không tìm thấy thành viên nào</h3>
                <p style="color: #6b7280; margin-bottom: 20px;">
                    Hệ thống đã kết nối Database nhưng không đọc được dữ liệu thành viên.
                </p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button onclick="loadAndRenderAll()" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-sync-alt"></i> Tải lại dữ liệu
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // --- Tính toán ---
    const total = allMembers.length;
    const males = allMembers.filter(m => m.gender === 'Nam').length;
    const females = total - males;
    const spouses = allMembers.filter(m => m.pid && !m.fid && !m.mid).length;
    const coreMembers = total - spouses;

    // Tính toán Tình trạng sinh tử
    let deceasedCount = 0;
    let aliveCount = 0;
    allMembers.forEach(m => {
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;

        if (hasDeathDate || isDeadByFlag) deceasedCount++;
        else aliveCount++;
    });

    // Tính toán cho biểu đồ thế hệ
    const genCounts = allMembers.reduce((acc, m) => {
        // Chỉ tính các thế hệ hợp lệ (số dương) để biểu đồ hiển thị đúng thứ tự
        if (m.generation && !isNaN(m.generation) && m.generation > 0) {
            const gen = m.generation;
            acc[gen] = (acc[gen] || 0) + 1;
        }
        return acc;
    }, {});
    // Sắp xếp label theo giá trị số (1, 2, 3... 10, 11) thay vì string (1, 10, 11, 2...)
    const genLabels = Object.keys(genCounts).sort((a, b) => parseInt(a) - parseInt(b));
    const genData = genLabels.map(label => genCounts[label]);

    // Tính toán cho Phân bổ theo Phái
    const branchCounts = allMembers.reduce((acc, m) => {
        let b = m.branch;
        // Nếu branch là 0, trống hoặc null thì quy về '0' (Tổ khảo, Tổ thúc)
        if (!b || String(b).trim() === '' || String(b).trim() === '0') {
            b = '0';
        }
        acc[b] = (acc[b] || 0) + 1;
        return acc;
    }, {});
    const branchLabels = Object.keys(branchCounts).sort();

    // --- Cập nhật thẻ ---
    document.getElementById('totalMembers').innerText = total;
    document.getElementById('maleCount').innerText = males;
    document.getElementById('femaleCount').innerText = females;
    document.getElementById('generationCount').innerText = genLabels.length;

    // --- Vẽ biểu đồ ---
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } };
    
    // Hiển thị danh sách Phân bố thế hệ (thay vì biểu đồ)
    const genListContainer = document.getElementById('gen-list-container');
    if (genListContainer) {
        if (genLabels.length === 0) {
            genListContainer.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có dữ liệu.</p>';
        } else {
            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            genLabels.forEach(label => {
                const count = genCounts[label];
                html += `<li style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500;">Đời thứ ${label}</span>
                            <span style="background: #fff3e0; color: #e67e22; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em;">${count} người</span>
                         </li>`;
            });
            html += '</ul>';
            genListContainer.innerHTML = html;
        }
    }

    // Biểu đồ Thành phần
    const chartCompEl = document.getElementById('chartComp');
    if (chartCompEl) chartInstances.comp = new Chart(chartCompEl, { type: 'doughnut', data: { labels: ['Huyết thống', 'Dâu/Rể'], datasets: [{ data: [coreMembers, spouses], backgroundColor: ['#36a2eb', '#ff6384'] }] }, options: chartOptions });

    // Biểu đồ Tình trạng sinh tử
    const chartStatusEl = document.getElementById('chartStatus');
    if (chartStatusEl) chartInstances.status = new Chart(chartStatusEl, { type: 'doughnut', data: { labels: ['Còn sống', 'Đã mất'], datasets: [{ data: [aliveCount, deceasedCount], backgroundColor: ['#10b981', '#9ca3af'] }] }, options: chartOptions });

    // Hiển thị danh sách Phân bổ theo Phái
    const branchListContainer = document.getElementById('branch-list-container');
    if (branchListContainer) {
        if (branchLabels.length === 0) {
            branchListContainer.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có dữ liệu phái.</p>';
        } else {
            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            const branchMap = { 
                '0': 'Tổ khảo',                                 
                '1': 'Phái Nhất', 
                '2': 'Phái Nhì', 
                '3': 'Phái Ba', 
                '4': 'Phái Bốn' 
            };
            
            branchLabels.forEach(label => {
                const count = branchCounts[label];
                // Lấy tên hiển thị, nếu không nằm trong 1-4 thì hiển thị nguyên gốc
                const displayName = branchMap[label] || (label === 'Gốc' ? 'Gốc' : `Phái ${label}`);
                
                html += `<li style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500;">${displayName}</span>
                            <span style="background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em;">${count} người</span>
                         </li>`;
            });
            html += '</ul>';
            branchListContainer.innerHTML = html;
        }
    }

    // --- Xử lý Sự kiện sắp tới ---
    const birthdaysContainer = document.getElementById('upcoming-birthdays');
    const deathAnnivsContainer = document.getElementById('upcoming-death-annivs');

    if (birthdaysContainer || deathAnnivsContainer) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset giờ để so sánh chính xác
        const currentYear = today.getFullYear();
        const upcomingBirthdays = [];
        const upcomingDeathAnnivs = [];
        const checkDays = 30; // Số ngày kiểm tra trước

        // Hàm parse ngày tháng từ chuỗi (hỗ trợ dd/mm/yyyy, dd-mm-yyyy)
        const parseDayMonth = (dateStr) => {
            if (!dateStr) return null;
            
            // 1. Ưu tiên check format ISO: YYYY-MM-DD (để tránh nhầm năm thành ngày)
            const isoMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (isoMatch) {
                return { day: parseInt(isoMatch[3]), month: parseInt(isoMatch[2]) };
            }

            // 2. Check format thường: DD/MM/YYYY
            const vnMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})/);
            if (vnMatch) {
                return { day: parseInt(vnMatch[1]), month: parseInt(vnMatch[2]) };
            }
            return null;
        };

        allMembers.forEach(m => {
            // Xác định trạng thái sống/mất dựa trên dữ liệu
            // Nếu có death_date thì coi như đã mất. Nếu không, kiểm tra is_live (nếu có)
            const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
            const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
            const isDeceased = hasDeathDate || isDeadByFlag;

            // 1. Kiểm tra Sinh nhật (Chỉ áp dụng cho người còn sống)
            if (!isDeceased && m.birth_date) {
                const dm = parseDayMonth(m.birth_date);
                if (dm) checkEvent(m, dm, 'birthday', '🎂 Sinh nhật', upcomingBirthdays);
            }

            // 2. Kiểm tra Ngày giỗ (Chỉ áp dụng cho người đã mất có ngày mất)
            if (hasDeathDate) {
                const dm = parseDayMonth(m.death_date);
                if (dm) checkEvent(m, dm, 'death_anniv', '🕯️ Giỗ', upcomingDeathAnnivs);
            }
        });

        function checkEvent(member, { day, month }, type, label, targetList) {
            // Tạo ngày sự kiện trong năm nay
            let eventDate = new Date(currentYear, month - 1, day);
            
            // Nếu ngày này trong năm nay đã qua, xét năm sau
            if (eventDate < today) {
                eventDate.setFullYear(currentYear + 1);
            }

            // Tính khoảng cách ngày
            const diffTime = eventDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= checkDays) {
                targetList.push({
                    member: member,
                    type: type,
                    label: label,
                    dateStr: `${day}/${month}`,
                    daysLeft: diffDays,
                    fullDate: eventDate
                });
            }
        }

        // Hàm render danh sách
        const renderList = (container, list, emptyMsg) => {
            if (!container) return;
            
            list.sort((a, b) => a.daysLeft - b.daysLeft);

            if (list.length === 0) {
                container.innerHTML = `<p style="text-align:center; color:#666; padding: 20px;">${emptyMsg}</p>`;
                return;
            }

            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            list.forEach(evt => {
                const timeText = evt.daysLeft === 0 ? '<span style="color:red; font-weight:bold;">Hôm nay</span>' : 
                                 evt.daysLeft === 1 ? '<span style="color:#e67e22; font-weight:bold;">Ngày mai</span>' : 
                                 `${evt.daysLeft} ngày nữa`;
                
                const bgColor = evt.type === 'birthday' ? '#ecfdf5' : '#f3f4f6'; // Xanh lá nhạt cho SN, Xám cho Giỗ
                const iconColor = evt.type === 'birthday' ? '#10b981' : '#6b7280';

                html += `
                <li style="padding: 12px; margin-bottom: 8px; background: ${bgColor}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${iconColor};">
                    <div>
                        <div style="font-weight: 600; color: #374151;">${evt.label}: ${evt.member.full_name}</div>
                        <div style="font-size: 0.85em; color: #6b7280;">Ngày: ${evt.dateStr} (Đời thứ ${evt.member.generation})</div>
                    </div>
                    <div style="text-align: right; font-size: 0.9em;">
                        ${timeText}
                    </div>
                </li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
        };

        // Render 2 danh sách
        renderList(birthdaysContainer, upcomingBirthdays, 'Không có sinh nhật nào sắp tới.');
        renderList(deathAnnivsContainer, upcomingDeathAnnivs, 'Không có ngày giỗ nào sắp tới.');
    }

    // --- Tải Hoạt động gần đây ---
    loadRecentActivities();
}

async function loadRecentActivities() {
    const container = document.getElementById('recent-activities');
    if (!container) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/activities', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            if (!data.logs || data.logs.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có hoạt động nào.</p>';
                return;
            }

            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            data.logs.forEach(log => {
                const date = new Date(log.created_at).toLocaleString('vi-VN');
                
                // Icon tương ứng với hành động
                let icon = '📝';
                let colorClass = '#374151';
                if (log.action_type === 'create') { icon = '✅'; colorClass = '#059669'; }
                else if (log.action_type === 'update') { icon = '✏️'; colorClass = '#d97706'; }
                else if (log.action_type === 'delete') { icon = '🗑️'; colorClass = '#dc2626'; }

                // Badge cho vai trò
                const roleBadge = (log.actor_role === 'owner' || log.actor_role === 'admin')
                    ? '<span style="background:#ffedd5; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.75em;">Admin</span>' 
                    : '<span style="background:#dbeafe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75em;">Viewer</span>';

                html += `
                <li style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: ${colorClass}; font-size: 0.95em;">${icon} ${log.description}</span>
                        <span style="font-size: 0.8em; color: #9ca3af; white-space: nowrap; margin-left: 8px;">${date}</span>
                    </div>
                    <div style="font-size: 0.85em; color: #6b7280; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-user" style="font-size: 0.8em;"></i> ${log.actor_name} ${roleBadge}
                    </div>
                </li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
        } else {
            // Xử lý khi success = false (để không bị treo chữ Đang tải)
            container.innerHTML = `<p style="text-align:center; color:#666; padding: 20px;">${data.message || 'Không có dữ liệu hoạt động.'}</p>`;
        }
    } catch (err) {
        console.error('Lỗi tải hoạt động:', err);
        container.innerHTML = '<p style="text-align:center; color:red; padding: 20px;">Không thể tải lịch sử hoạt động.</p>';
    }
}

// Hàm xóa toàn bộ lịch sử hoạt động
async function clearActivities() {
    if (!confirm('⚠️ Bạn có chắc chắn muốn xóa toàn bộ lịch sử hoạt động không?\nHành động này không thể hoàn tác.')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/activities', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            loadRecentActivities(); // Tải lại danh sách (sẽ trống)
        } else {
            alert('❌ ' + (data.message || 'Lỗi khi xóa lịch sử'));
        }
    } catch (err) {
        console.error('Lỗi:', err);
        alert('❌ Lỗi kết nối server');
    }
}

// --- Back to Top Feature ---
window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-back-to-top');
    if (btn) {
        // Hiện nút khi cuộn xuống quá 300px
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }
});

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG TÌM KIẾM NÂNG CAO
// ==========================================

function createAdvancedSearchModal() {
    if (document.getElementById('advanced-search-modal')) return;

    const modalHtml = `
    <div id="advanced-search-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
        <div class="modal-content" style="background-color: #fefefe; margin: 5% auto; padding: 20px; border: 1px solid #888; width: 90%; max-width: 600px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
            <h2 style="text-align: center; margin-bottom: 20px; color: #2c3e50;">Tìm kiếm Nâng cao</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <!-- Họ và tên (Input) -->
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Họ và tên</label>
                    <input type="text" id="adv-name" placeholder="Nhập tên thành viên..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>

                <!-- Đời (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Đời (Thế hệ)</label>
                    <select id="adv-gen" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        ${Array.from({length: 15}, (_, i) => `<option value="${i+1}">Đời thứ ${i+1}</option>`).join('')}
                    </select>
                </div>

                <!-- Phái (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Phái / Chi</label>
                    <select id="adv-branch" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="0">Gốc (Hiển Cao Tổ Khảo)</option>
                        <option value="1">Phái Nhất</option>
                        <option value="2">Phái Nhì</option>
                        <option value="3">Phái Ba</option>
                        <option value="4">Phái Bốn</option>
                    </select>
                </div>

                <!-- Giới tính (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Giới tính</label>
                    <select id="adv-gender" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                    </select>
                </div>

                <!-- Trạng thái (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Trạng thái</label>
                    <select id="adv-status" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="alive">Còn sống</option>
                        <option value="deceased">Đã mất</option>
                    </select>
                </div>

                <!-- Nghề nghiệp (Input) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nghề nghiệp</label>
                    <input type="text" id="adv-job" placeholder="VD: Giáo viên, Kỹ sư..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>

                <!-- Địa chỉ (Input) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Địa chỉ</label>
                    <input type="text" id="adv-address" placeholder="Nhập địa chỉ..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>
            </div>

            <div style="margin-top: 25px; text-align: right;">
                <button onclick="resetAdvancedSearch()" style="padding: 10px 20px; border: none; background: #f39c12; color: white; border-radius: 6px; cursor: pointer; margin-right: 10px;">Đặt lại</button>
                <button onclick="document.getElementById('advanced-search-modal').style.display='none'" style="padding: 10px 20px; border: none; background: #95a5a6; color: white; border-radius: 6px; cursor: pointer; margin-right: 10px;">Đóng</button>
                <button onclick="performAdvancedSearch()" style="padding: 10px 20px; border: none; background: #3498db; color: white; border-radius: 6px; cursor: pointer; font-weight: bold;">🔍 Tìm kiếm</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openAdvancedSearchModal() {
    createAdvancedSearchModal();
    document.getElementById('advanced-search-modal').style.display = 'block';
}

function resetAdvancedSearch() {
    document.getElementById('adv-name').value = '';
    document.getElementById('adv-gen').value = '';
    document.getElementById('adv-branch').value = '';
    document.getElementById('adv-gender').value = '';
    document.getElementById('adv-status').value = '';
    document.getElementById('adv-job').value = '';
    document.getElementById('adv-address').value = '';
    
    renderMemberList(allMembers);
}

function performAdvancedSearch() {
    const name = document.getElementById('adv-name').value.toLowerCase();
    const gen = document.getElementById('adv-gen').value;
    const branch = document.getElementById('adv-branch').value;
    const gender = document.getElementById('adv-gender').value;
    const status = document.getElementById('adv-status').value;
    const job = document.getElementById('adv-job').value.toLowerCase();
    const address = document.getElementById('adv-address').value.toLowerCase();

    const filtered = allMembers.filter(m => {
        // Logic xác định sinh tử
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
        const isDeceased = hasDeathDate || isDeadByFlag;

        // Kiểm tra từng tiêu chí
        if (name && !(m.full_name || '').toLowerCase().includes(name)) return false;
        if (gen && String(m.generation) !== gen) return false;
        if (branch && String(m.branch || '0') !== branch) return false;
        if (gender && m.gender !== gender) return false;
        if (status === 'alive' && isDeceased) return false;
        if (status === 'deceased' && !isDeceased) return false;
        if (job && (!m.job || !m.job.toLowerCase().includes(job))) return false;
        if (address && (!m.address || !m.address.toLowerCase().includes(address))) return false;

        return true;
    });

    document.getElementById('advanced-search-modal').style.display = 'none';
    renderMemberList(filtered);
    
    // Reset ô tìm kiếm thường để tránh nhầm lẫn
    const simpleSearch = document.getElementById('member-search-input');
    if (simpleSearch) simpleSearch.value = '';
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG XEM CHI TIẾT BÀI VIẾT
// ==========================================

async function openViewPostModal(postId) {
    // Tạo modal nếu chưa có
    if (!document.getElementById('view-post-modal')) {
        const modalHtml = `
        <div id="view-post-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
            <div class="modal-content" style="background-color: #fff; margin: 5% auto; padding: 30px; border: none; width: 90%; max-width: 800px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <h2 id="view-post-title" style="margin: 0; color: #1f2937; font-size: 24px;"></h2>
                    <button onclick="document.getElementById('view-post-modal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="margin-bottom: 20px; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">
                    <span id="view-post-cat" style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 10px; font-weight: 600;"></span>
                    <span id="view-post-date"><i class="far fa-clock"></i> </span>
                </div>
                <div id="view-post-image-container" style="margin-bottom: 20px; text-align: center; display: none;">
                    <img id="view-post-image" src="" alt="Ảnh bài viết" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                </div>
                <div id="view-post-content" style="line-height: 1.8; color: #374151; font-size: 16px; white-space: pre-wrap;"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${postId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const post = data.post;
            const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức' };
            
            document.getElementById('view-post-title').innerText = post.title;
            document.getElementById('view-post-cat').innerText = catMap[post.category] || post.category;
            document.getElementById('view-post-date').innerHTML = `<i class="far fa-clock"></i> ${new Date(post.created_at).toLocaleDateString('vi-VN')}`;
            document.getElementById('view-post-content').innerText = post.content;
            
            const imgContainer = document.getElementById('view-post-image-container');
            const img = document.getElementById('view-post-image');
            if (post.image) {
                img.src = post.image;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }
            
            document.getElementById('view-post-modal').style.display = 'block';
        }
    } catch (err) {
        alert('Không thể tải bài viết.');
    }
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG XUẤT PDF
// ==========================================

function downloadMemberPDF() {
    if (!currentDisplayedMembers || currentDisplayedMembers.length === 0) {
        alert("Không có dữ liệu để tải xuống.");
        return;
    }

    // Tạo nội dung HTML tạm thời để in
    const tempDiv = document.createElement('div');
    tempDiv.style.padding = '20px';
    tempDiv.style.fontFamily = 'Arial, sans-serif';
    
    let html = `<h2 style="text-align:center; margin-bottom:20px; color:#1f2937;">Danh sách Thành viên</h2>`;
    html += `<p style="margin-bottom:15px;"><strong>Tổng số:</strong> ${currentDisplayedMembers.length} thành viên</p>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:12px; border: 1px solid #e5e7eb;">`;
    html += `<thead>
                <tr style="background-color:#f3f4f6; color:#374151;">
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Họ tên</th>
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Giới tính</th>
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Ngày sinh</th>
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Đời</th>
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Phái</th>
                    <th style="border:1px solid #d1d5db; padding:10px; text-align:left;">Trạng thái</th>
                </tr>
             </thead><tbody>`;
             
    currentDisplayedMembers.forEach(m => {
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
        const isDeceased = hasDeathDate || isDeadByFlag;
        
        html += `<tr>
                    <td style="border:1px solid #d1d5db; padding:8px;"><strong>${m.full_name}</strong></td>
                    <td style="border:1px solid #d1d5db; padding:8px;">${m.gender}</td>
                    <td style="border:1px solid #d1d5db; padding:8px;">${m.birth_date || ''}</td>
                    <td style="border:1px solid #d1d5db; padding:8px;">${m.generation}</td>
                    <td style="border:1px solid #d1d5db; padding:8px;">${m.branch === '0' || m.branch === 'Gốc' ? 'Gốc' : 'Phái ' + (m.branch || '?')}</td>
                    <td style="border:1px solid #d1d5db; padding:8px; color:${isDeceased ? '#dc2626' : '#059669'};">${isDeceased ? 'Đã mất' : 'Còn sống'}</td>
                 </tr>`;
    });
    html += `</tbody></table>`;
    html += `<p style="margin-top:20px; font-size:10px; text-align:right; color:#6b7280;">Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}</p>`;
    
    tempDiv.innerHTML = html;
    
    // Cấu hình cho html2pdf
    const opt = {
        margin: 10,
        filename: `danh_sach_thanh_vien_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Thực hiện xuất PDF
    html2pdf().set(opt).from(tempDiv).save();
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG TẢI CÂY GIA PHẢ
// ==========================================

function downloadTreePDF() {
    const element = document.getElementById('tree-canvas');
    if (!element) {
        alert("Không tìm thấy cây gia phả để tải.");
        return;
    }

    const btn = document.getElementById('btn-download-tree');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;
    }

    const opt = {
        margin: 0,
        filename: `cay_gia_pha_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }).catch(err => {
        console.error(err);
        alert("Lỗi khi tải xuống: " + err.message);
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// ==========================================
// BỔ SUNG: QUẢN LÝ TÀI KHOẢN (USER MANAGEMENT)
// ==========================================

function openUserManagementModal() {
    // Tạo modal nếu chưa có
    if (!document.getElementById('user-mgmt-modal')) {
        const modalHtml = `
        <div id="user-mgmt-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
            <div class="modal-content" style="background-color: #fefefe; margin: 5% auto; padding: 20px; border: 1px solid #888; width: 90%; max-width: 700px; border-radius: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <h2 style="margin:0; color:#374151;">Quản lý Tài khoản</h2>
                    <button onclick="document.getElementById('user-mgmt-modal').style.display='none'" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                
                <!-- Form thêm mới -->
                <div style="background:#f9fafb; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #e5e7eb;">
                    <h4 id="user-form-title" style="margin-top:0; margin-bottom:10px;">Thêm tài khoản mới</h4>
                    <input type="hidden" id="edit-u-id">
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:10px; align-items:end;">
                        <div>
                            <label style="font-size:12px; font-weight:600;">Tên đăng nhập</label>
                            <input type="text" id="new-u-name" placeholder="Ví dụ: khach1" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
                        </div>
                        <div>
                            <label style="font-size:12px; font-weight:600;">Mật khẩu <span id="pass-hint" style="font-weight:normal; font-size:10px; color:#666; display:none;">(Để trống nếu không đổi)</span></label>
                            <input type="text" id="new-u-pass" placeholder="Mật khẩu" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
                        </div>
                        <div>
                            <label style="font-size:12px; font-weight:600;">Vai trò</label>
                            <select id="new-u-role" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
                                <option value="viewer">Người xem (Khách)</option>
                                <option value="admin">Quản trị viên</option>
                            </select>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button id="btn-save-user" onclick="saveUser()" style="padding:8px 16px; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; height:35px;">Thêm</button>
                            <button id="btn-cancel-edit" onclick="resetUserForm()" style="display:none; padding:8px 10px; background:#9ca3af; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; height:35px;">Hủy</button>
                        </div>
                    </div>
                </div>

                <!-- Danh sách -->
                <div id="user-list-container" style="max-height:400px; overflow-y:auto;">
                    <p style="text-align:center;">Đang tải danh sách...</p>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('user-mgmt-modal').style.display = 'block';
    loadUserList();
}

async function loadUserList() {
    const container = document.getElementById('user-list-container');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/auth/users', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        
        if (data.success) {
            if (data.users.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">Chưa có tài khoản nào.</p>';
                return;
            }
            
            let html = '<table style="width:100%; border-collapse:collapse;"><thead><tr style="background:#f3f4f6; text-align:left;"><th style="padding:10px;">Tên đăng nhập</th><th style="padding:10px;">Vai trò</th><th style="padding:10px; text-align:right;">Hành động</th></tr></thead><tbody>';
            
            data.users.forEach(u => {
                const roleLabel = u.role === 'owner' ? '<span style="color:#f97316; font-weight:bold;">Chủ sở hữu</span>' : 
                                  (u.role === 'admin' ? '<span style="color:#0ea5e9; font-weight:bold;">Quản trị viên</span>' : 'Người xem');
                
                const editBtn = (u.role === 'owner' && localStorage.getItem('userRole') !== 'owner') ? '' :
                    `<button onclick="editUser('${u._id}', '${u.username}', '${u.role}')" style="color:#3b82f6; background:none; border:none; cursor:pointer; font-weight:600; margin-right:10px;">Sửa</button>`;

                const deleteBtn = (u.role === 'owner' || u.username === 'admin') ? '' : 
                    `<button onclick="deleteUser('${u._id}', '${u.username}')" style="color:red; background:none; border:none; cursor:pointer; font-weight:600;">Xóa</button>`;
                
                html += `<tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${u.username}</td>
                            <td style="padding:10px;">${roleLabel}</td>
                            <td style="padding:10px; text-align:right;">${editBtn}${deleteBtn}</td>
                         </tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        }
    } catch (err) {
        container.innerHTML = `<p style="color:red;">Lỗi tải danh sách: ${err.message}</p>`;
    }
}

function editUser(id, username, role) {
    document.getElementById('edit-u-id').value = id;
    document.getElementById('new-u-name').value = username;
    document.getElementById('new-u-name').disabled = true; // Không cho sửa tên đăng nhập
    document.getElementById('new-u-role').value = role;
    document.getElementById('new-u-pass').value = '';
    document.getElementById('new-u-pass').placeholder = "Nhập nếu muốn đổi mật khẩu";
    
    document.getElementById('user-form-title').innerText = "Sửa tài khoản: " + username;
    document.getElementById('btn-save-user').innerText = "Lưu thay đổi";
    document.getElementById('btn-save-user').style.background = "#3b82f6"; // Màu xanh dương
    document.getElementById('btn-cancel-edit').style.display = "inline-block";
    document.getElementById('pass-hint').style.display = "inline";
}

function resetUserForm() {
    document.getElementById('edit-u-id').value = '';
    document.getElementById('new-u-name').value = '';
    document.getElementById('new-u-name').disabled = false;
    document.getElementById('new-u-pass').value = '';
    document.getElementById('new-u-pass').placeholder = "Mật khẩu";
    document.getElementById('new-u-role').value = 'viewer';
    
    document.getElementById('user-form-title').innerText = "Thêm tài khoản mới";
    document.getElementById('btn-save-user').innerText = "Thêm";
    document.getElementById('btn-save-user').style.background = "#10b981"; // Màu xanh lá
    document.getElementById('btn-cancel-edit').style.display = "none";
    document.getElementById('pass-hint').style.display = "none";
}

async function saveUser() {
    const id = document.getElementById('edit-u-id').value;
    const username = document.getElementById('new-u-name').value.trim();
    const password = document.getElementById('new-u-pass').value.trim();
    const role = document.getElementById('new-u-role').value;
    
    if (!username) return alert('Vui lòng nhập tên đăng nhập!');
    if (!id && !password) return alert('Vui lòng nhập mật khẩu cho tài khoản mới!');
    
    const token = localStorage.getItem('token');
    let url = '/api/auth/users';
    let method = 'POST';
    
    if (id) {
        url = `/api/auth/users/${id}`;
        method = 'PUT';
    }
    
    const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    
    if (data.success) {
        alert('✅ ' + data.message);
        resetUserForm();
        loadUserList();
    } else {
        alert('❌ ' + data.message);
    }
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG XEM CHI TIẾT THÀNH VIÊN (CHO KHÁCH)
// ==========================================

function openViewMemberModal(memberId) {
    const member = allMembers.find(m => m.id == memberId);
    if (!member) return;

    // Tạo modal nếu chưa có
    if (!document.getElementById('view-member-modal')) {
        const modalHtml = `
        <div id="view-member-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
            <div class="modal-content" style="background-color: #fff; margin: 5% auto; padding: 0; border: none; width: 90%; max-width: 600px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden;">
                <div class="modal-header" style="background: linear-gradient(135deg, #f97316, #fbbf24); padding: 20px 30px; border-bottom: none; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; color: white; font-size: 22px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-user-circle"></i> Thông tin thành viên
                    </h2>
                    <button onclick="document.getElementById('view-member-modal').style.display='none'" style="background: rgba(255,255,255,0.2); border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; transition: background 0.2s;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 30px;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <div id="view-m-avatar" style="width: 80px; height: 80px; border-radius: 50%; background: #ddd; color: white; font-size: 36px; font-weight: bold; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; border: 4px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">A</div>
                        <h3 id="view-m-name" style="margin: 0; font-size: 24px; color: #1f2937;"></h3>
                        <div id="view-m-meta" style="color: #6b7280; margin-top: 5px; font-size: 14px;"></div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Giới tính</label>
                            <div id="view-m-gender" style="font-weight: 500; color: #374151;"></div>
                        </div>
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Trạng thái</label>
                            <div id="view-m-status" style="font-weight: 500; color: #374151;"></div>
                        </div>
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Ngày sinh</label>
                            <div id="view-m-birth" style="font-weight: 500; color: #374151;"></div>
                        </div>
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Ngày mất</label>
                            <div id="view-m-death" style="font-weight: 500; color: #374151;"></div>
                        </div>
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Đời thứ</label>
                            <div id="view-m-gen" style="font-weight: 500; color: #374151;"></div>
                        </div>
                        <div class="info-group">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Phái / Chi</label>
                            <div id="view-m-branch" style="font-weight: 500; color: #374151;"></div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                        <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Quan hệ gia đình</h4>
                        <div style="display: grid; gap: 12px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Cha:</span>
                                <span id="view-m-father" style="font-weight: 500; color: #374151;"></span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Mẹ:</span>
                                <span id="view-m-mother" style="font-weight: 500; color: #374151;"></span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Vợ/Chồng:</span>
                                <span id="view-m-partner" style="font-weight: 500; color: #374151;"></span>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                        <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Thông tin khác</h4>
                        <div style="display: grid; gap: 12px;">
                            <div>
                                <span style="color: #6b7280; display: block; font-size: 12px; margin-bottom: 2px;">Nghề nghiệp:</span>
                                <span id="view-m-job" style="font-weight: 500; color: #374151;"></span>
                            </div>
                            <div>
                                <span style="color: #6b7280; display: block; font-size: 12px; margin-bottom: 2px;">Địa chỉ:</span>
                                <span id="view-m-address" style="font-weight: 500; color: #374151;"></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="background: #f9fafb; padding: 15px 30px; text-align: right;">
                    <button onclick="document.getElementById('view-member-modal').style.display='none'" style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Đóng</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Helper lấy tên
    const getName = (id) => {
        if (!id) return '---';
        const m = allMembers.find(x => String(x.id) === String(id));
        return m ? m.full_name : 'Không rõ';
    };

    // Xác định trạng thái sinh tử
    const hasDeathDate = member.death_date && String(member.death_date).trim() !== '' && String(member.death_date).trim() !== '0';
    const isDeadByFlag = member.is_live === 0 || member.is_live === '0' || member.is_live === false || member.is_alive === 0 || member.is_alive === '0' || member.is_alive === false;
    const isDeceased = hasDeathDate || isDeadByFlag;

    // Avatar
    const nameParts = (member.full_name || '?').trim().split(/\s+/);
    const avatarLetter = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    const avatarColor = isDeceased ? '#5d4037' : (member.gender === 'Nam' ? '#3b82f6' : '#ec4899');
    
    const avatarEl = document.getElementById('view-m-avatar');
    avatarEl.style.backgroundColor = avatarColor;
    avatarEl.innerText = avatarLetter;

    // Điền dữ liệu
    document.getElementById('view-m-name').innerText = member.full_name;
    document.getElementById('view-m-meta').innerText = member.gender === 'Nam' ? 'Nam' : 'Nữ';

    document.getElementById('view-m-gender').innerText = member.gender;
    document.getElementById('view-m-status').innerHTML = isDeceased 
        ? '<span style="color: #dc2626; background: #fee2e2; padding: 2px 8px; border-radius: 12px; font-size: 12px;">Đã mất</span>' 
        : '<span style="color: #059669; background: #d1fae5; padding: 2px 8px; border-radius: 12px; font-size: 12px;">Còn sống</span>';
    
    document.getElementById('view-m-birth').innerText = member.birth_date || '---';
    document.getElementById('view-m-death').innerText = member.death_date || '---';
    document.getElementById('view-m-gen').innerText = member.generation;
    
    const branchMap = { '0': 'Tổ khảo', '1': 'Phái Nhất', '2': 'Phái Nhì', '3': 'Phái Ba', '4': 'Phái Bốn' };
    document.getElementById('view-m-branch').innerText = branchMap[member.branch] || (member.branch === 'Gốc' ? 'Gốc' : `Phái ${member.branch || '---'}`);

    document.getElementById('view-m-father').innerText = getName(member.fid);
    document.getElementById('view-m-mother').innerText = getName(member.mid);
    
    // Logic tìm vợ/chồng 2 chiều
    let spouseName = '---';
    if (member.pid) {
        spouseName = getName(member.pid);
    } else {
        const spouse = allMembers.find(p => String(p.pid) === String(member.id));
        if (spouse) spouseName = spouse.full_name;
    }
    document.getElementById('view-m-partner').innerText = spouseName;

    document.getElementById('view-m-job').innerText = member.job || '---';
    document.getElementById('view-m-address').innerText = member.address || '---';

    // --- FIX: Cập nhật nút bấm ở Footer (Thêm nút Sửa cho Admin) ---
    const footer = document.querySelector('#view-member-modal .modal-footer');
    if (footer) {
        footer.innerHTML = ''; // Xóa nút cũ để tránh trùng lặp
        
        if (isAdmin()) {
            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<i class="fas fa-edit"></i> Sửa thông tin';
            editBtn.style.cssText = "padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; margin-right: 10px; transition: background 0.2s;";
            editBtn.onclick = () => {
                document.getElementById('view-member-modal').style.display = 'none';
                openEditModal(member.id); // Chuyển sang modal Sửa
            };
            footer.appendChild(editBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'Đóng';
        closeBtn.style.cssText = "padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s;";
        closeBtn.onclick = () => document.getElementById('view-member-modal').style.display = 'none';
        footer.appendChild(closeBtn);
    }

    document.getElementById('view-member-modal').style.display = 'block';
}

async function deleteUser(id, name) {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản "${name}" không?`)) return;
    
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/auth/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (data.success) {
        loadUserList();
    } else {
        alert('❌ ' + data.message);
    }
}