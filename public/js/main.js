
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

// --- Bổ sung: Hàm kiểm tra quyền Owner (Chủ sở hữu) ---
const isOwner = () => {
    const role = localStorage.getItem('userRole');
    return role === 'owner';
};

// 1. Khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    // FIX: Kiểm tra an toàn cho localStorage (tránh lỗi trên Safari Private Mode)
    let token, userName, userRole;
    try {
        token = localStorage.getItem('token');
        userName = localStorage.getItem('userName');
        userRole = localStorage.getItem('userRole');
    } catch (e) {
        console.warn('Không thể truy cập localStorage (có thể do chế độ Ẩn danh)');
    }

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
    if (document.querySelector('.user-role')) {
        let roleText = 'Người xem';
        if (userRole === 'owner') roleText = 'Chủ sở hữu';
        else if (userRole === 'admin') roleText = 'Quản trị viên';
        else if (userRole && userRole.startsWith('branch_')) roleText = `Trưởng Phái ${userRole.split('_')[1]}`;
        
        document.querySelector('.user-role').textContent = roleText;
    }
    
    // FIX: Nếu là khách (Viewer), đổi tiêu đề trang để bỏ chữ "Quản lý"
    if (!isAdmin()) {
        document.title = "Gia phả Họ Lê Công";
        const headerTitle = document.querySelector('.header-info h1');
        if (headerTitle) headerTitle.innerHTML = "Gia phả Họ Lê Công<br>Thôn Linh An, tỉnh Quảng Trị";
    }

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
    // FIX: Cho phép Trưởng phái (isBranch) thấy nút Thêm
    const isBranch = userRole && userRole.startsWith('branch_');
    if (!isAdmin() && !isBranch) {
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
            .settings-card[onclick="syncGoogleSheets()"], 
            .settings-card[onclick="openUserManagementModal()"] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
        console.log('🔒 Đã kích hoạt chế độ Khách: Ẩn toàn bộ nút quản trị bằng CSS.');
    }

    // --- YÊU CẦU: Di chuyển Tab Thành viên lên ngay sau Tab Dashboard ---
    const dashboardBtn = document.querySelector('.tab-btn[data-target="#dashboard-tab"]');
    const membersBtn = document.querySelector('.tab-btn[data-target="#members-tab"]');
    if (dashboardBtn && membersBtn) {
        dashboardBtn.after(membersBtn);
    }

    // --- BỔ SUNG: Tự động tạo Tab Sổ Gia Phả (Di chuyển lên trước initTabs để gắn sự kiện click) ---
    const tabsContainer = document.querySelector('.tabs-container');
    const mainContent = document.querySelector('.main-content');
    if (tabsContainer && mainContent && !document.querySelector('.tab-btn[data-target="#book-tab"]')) {
        // 1. Create Tab Button
        const bookTabBtn = document.createElement('button');
        bookTabBtn.className = 'tab-btn';
        bookTabBtn.dataset.target = '#book-tab';
        bookTabBtn.innerHTML = '<i class="fas fa-book-open"></i> Sổ Gia phả';
        
        // FIX: Chèn vào sau tab Cây Gia Phả (Tree Tab)
        const treeTabBtn = tabsContainer.querySelector('[data-target="#tree-tab"]');
        if (treeTabBtn) {
            treeTabBtn.after(bookTabBtn);
        } else {
            tabsContainer.appendChild(bookTabBtn);
        }

        // 2. Create Tab Content Pane
        const bookTabContent = document.createElement('div');
        bookTabContent.id = 'book-tab';
        bookTabContent.className = 'tab-content';
        mainContent.appendChild(bookTabContent);
    }

    // --- BỔ SUNG: Tab Phả hệ & Phân phái (Bên phải Sổ Gia phả) ---
    if (tabsContainer && mainContent) {
        // 1. Tab Phả hệ
        if (!document.querySelector('.tab-btn[data-target="#genealogy-tab"]')) {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.dataset.target = '#genealogy-tab';
            btn.innerHTML = '<i class="fas fa-project-diagram"></i> Phả hệ';
            
            // Chèn sau tab Sổ Gia phả
            const bookBtn = tabsContainer.querySelector('[data-target="#book-tab"]');
            if (bookBtn) bookBtn.after(btn);
            else tabsContainer.appendChild(btn);

            const content = document.createElement('div');
            content.id = 'genealogy-tab';
            content.className = 'tab-content';
            content.innerHTML = '<div style="text-align:center; padding:50px; color:#666;"><i class="fas fa-tools" style="font-size:48px; margin-bottom:20px; color:#ddd;"></i><h3>Chức năng Phả hệ</h3><p>Tính năng đang được phát triển.</p></div>';
            mainContent.appendChild(content);
        }

        // 2. Tab Phân phái
        if (!document.querySelector('.tab-btn[data-target="#branches-tab"]')) {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.dataset.target = '#branches-tab';
            btn.innerHTML = '<i class="fas fa-code-branch"></i> Phân phái';
            
            // Chèn sau tab Phả hệ
            const genBtn = tabsContainer.querySelector('[data-target="#genealogy-tab"]');
            if (genBtn) genBtn.after(btn);
            else tabsContainer.appendChild(btn);

            const content = document.createElement('div');
            content.id = 'branches-tab';
            content.className = 'tab-content';
            content.innerHTML = '<div style="text-align:center; padding:50px; color:#666;"><i class="fas fa-tools" style="font-size:48px; margin-bottom:20px; color:#ddd;"></i><h3>Chức năng Phân phái</h3><p>Tính năng đang được phát triển.</p></div>';
            mainContent.appendChild(content);
        }
    }

    // Khởi tạo giao diện tab
    initTabs();

    // --- YÊU CẦU: Đặt Tab "Bài viết" làm tab mặc định khi tải trang ---
    // --- YÊU CẦU: Đặt Tab "Dashboard" làm tab mặc định khi tải trang ---
    // 1. Xóa class 'active' khỏi tất cả các tab và nội dung tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // 2. Thêm class 'active' vào tab "Dashboard" và nội dung của nó
    const dashboardTabButton = document.querySelector('.tab-btn[data-target="#dashboard-tab"]');
    const dashboardTabContent = document.querySelector('#dashboard-tab');
    if (dashboardTabButton) dashboardTabButton.classList.add('active');
    if (dashboardTabContent) dashboardTabContent.classList.add('active');

    // Tải dữ liệu và render tab mặc định (đã là Bài viết)
    // Tải dữ liệu và render tab mặc định (đã là Dashboard)
    loadAndRenderAll();

    // Khởi tạo form bài viết (chèn input ảnh)
    initPostForm();

    // Tăng lượt truy cập hệ thống
    fetch('/api/stats/visit?increment=true', {
        headers: { 'Authorization': `Bearer ${token}` }
    }).catch(e => console.error("Lỗi tăng visit:", e));

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
                case '#book-tab':
                    renderBookTab();
                    break;
                case '#genealogy-tab':
                    renderGenealogyTab();
                    break;
                case '#branches-tab':
                    renderBranchesTab();
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
        renderDashboardTab(); // Mặc định render Dashboard
        return;
    }
    
    switch(activeTab.id) {
        case 'dashboard-tab': renderDashboardTab(); break;
        case 'tree-tab': renderTreeTab(); break;
        case 'members-tab': renderMembersTab(); break;
        case 'posts-tab': renderPostsTab(); break;
        case 'settings-tab': renderSettingsTab(); break;
        case 'book-tab': renderBookTab(); break;
        case 'genealogy-tab': renderGenealogyTab(); break;
        case 'branches-tab': renderBranchesTab(); break;
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

        // FIX: Tính toán số đời tối đa từ dữ liệu thực tế để tạo option động
        const maxGen = (allMembers && allMembers.length > 0) ? Math.max(...allMembers.map(m => parseInt(m.generation) || 0)) : 0;
        
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

// --- HÀM MỚI: Đặt lại toàn bộ tìm kiếm (Cơ bản + Nâng cao + Lọc) ---
function resetAllSearch() {
    // 1. Reset ô tìm kiếm thường
    const searchInput = document.getElementById('member-search-input');
    if (searchInput) searchInput.value = '';

    // 2. Reset bộ lọc loại thành viên
    const filterSelect = document.getElementById('member-filter-type');
    if (filterSelect) filterSelect.value = 'all';

    // 3. Reset các trường trong tìm kiếm nâng cao (nếu modal đã được tạo)
    if (document.getElementById('advanced-search-modal')) {
        const ids = ['adv-name', 'adv-gen', 'adv-branch', 'adv-gender', 'adv-status', 'adv-job', 'adv-address'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    // 4. Render lại danh sách đầy đủ
    renderMemberList(allMembers);
}

// Hàm render tab Thành viên (Bổ sung hàm bị thiếu)
function renderMembersTab() {
    // --- BỔ SUNG: Khôi phục các nút chức năng trong Header của Tab Thành viên ---
    const header = document.querySelector('#members-tab .members-header');
    // Kiểm tra xem đã có nút chưa để tránh tạo trùng
    if (header && !document.getElementById('btn-adv-search')) {
        const addBtn = header.querySelector('.btn-add'); // Nút Thêm thành viên (đã có sẵn)
        // --- YÊU CẦU: Đổi chữ và icon cho nút Thêm ---
        if (addBtn) {
            // Thay đổi text và icon, giữ lại class để CSS hoạt động
            addBtn.innerHTML = '<i class="fas fa-plus"></i><span class="btn-text"> Thêm mới</span>';
        }

        const searchBar = header.querySelector('.search-bar');

        // --- KHÔI PHỤC: Dropdown lọc Huyết thống / Dâu rể ---
        const select = document.createElement('select');
        select.id = 'member-filter-type';
        select.className = 'tree-select'; // Dùng chung class với cây gia phả cho đồng bộ
        select.style.height = '40px'; // Chỉnh lại chiều cao cho khớp
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

        // 3. Nút Đặt lại (Mới) - Áp dụng chung cho mọi tìm kiếm
        const resetBtn = document.createElement('button');
        resetBtn.id = 'btn-reset-all';
        resetBtn.innerHTML = '<i class="fas fa-undo"></i><span class="btn-text"> Đặt lại</span>';
        resetBtn.title = 'Đặt lại tìm kiếm & bộ lọc';
        resetBtn.className = 'btn-control';
        resetBtn.style.color = '#f59e0b'; // Màu cam
        resetBtn.onclick = resetAllSearch;

        // Chèn vào trước nút Thêm thành viên
        header.insertBefore(advBtn, addBtn);
        header.insertBefore(resetBtn, addBtn);
        header.insertBefore(pdfBtn, addBtn);
    }

    // --- FIX: Thay thế nút X bằng cụm nút Tìm kiếm & Làm mới (Layout cùng hàng) ---
    const searchInput = document.getElementById('member-search-input');
    const searchContainer = searchInput ? searchInput.parentElement : null;

    // Cấu hình lại giao diện ô tìm kiếm (chỉ chạy 1 lần)
    if (searchContainer && !searchContainer.dataset.styled) {
        searchContainer.dataset.styled = 'true';
        
        // 1. Cấu hình lại container để xếp ngang
        searchContainer.style.display = 'flex';
        searchContainer.style.alignItems = 'center';
        searchContainer.style.gap = '8px'; // Khoảng cách giữa các phần tử
        searchContainer.style.position = 'relative';
        
        // 2. Dọn dẹp sạch sẽ: Xóa tất cả icon cũ (kính lúp, mũi tên rác) bên trong container
        const oldIcons = searchContainer.querySelectorAll('i');
        oldIcons.forEach(icon => icon.remove());

        // 3. Chỉnh lại input: Giảm chiều ngang, bỏ padding thừa
        if (searchInput) {
            searchInput.style.paddingLeft = '12px'; 
            searchInput.style.paddingRight = '12px';
            searchInput.style.width = 'auto'; // Reset width
            searchInput.style.flex = '1'; // Chiếm phần không gian còn lại
        }
    }

    // Ẩn nút "Thêm thành viên" nếu không phải Admin
    const userRole = localStorage.getItem('userRole');
    const isBranch = userRole && userRole.startsWith('branch_');
    const addMemberBtn = document.querySelector('#members-tab .btn-add');
    if (addMemberBtn && !isAdmin() && !isBranch) {
        addMemberBtn.style.setProperty('display', 'none', 'important');
        addMemberBtn.remove(); // Xóa hoàn toàn khỏi HTML
    }

    // --- HÀM XỬ LÝ TÌM KIẾM CHUNG (Thay thế filterMembers cũ) ---
    const executeSearch = () => {
        const searchInput = document.getElementById('member-search-input');
        const filterSelect = document.getElementById('member-filter-type');
        
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterSelect ? filterSelect.value : 'all';

        const filteredMembers = allMembers.filter(m => {
            const matchesName = m.full_name.toLowerCase().includes(query);
            
            // --- FIX: Logic Dâu/Rể cho bộ lọc (Loại trừ Đời 1 - Thủy tổ) ---
            const gen = parseInt(m.generation) || 0;
            const isInLaw = !!m.pid && !m.fid && !m.mid && gen > 1;
            
            let matchesType = true;
            if (filterType === 'bloodline') matchesType = !isInLaw;
            else if (filterType === 'inlaw') matchesType = isInLaw;
            
            return matchesName && matchesType;
        });
        renderMemberList(filteredMembers);
    };

    // Gắn sự kiện tìm kiếm ngay khi gõ (Live Search)
    if (searchInput) {
        searchInput.onkeyup = () => executeSearch();
    }
    
    // Gắn sự kiện khi đổi dropdown loại thành viên
    const filterSelect = document.getElementById('member-filter-type');
    if (filterSelect) filterSelect.onchange = executeSearch;

    executeSearch(); // Render lần đầu
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

        // Rule 1.5: Sắp xếp theo Phái (Branch)
        // 'Gốc' hoặc '0' hoặc rỗng lên đầu, sau đó là 1, 2, 3...
        const branchA = (a.branch === 'Gốc' || !a.branch || a.branch === '0') ? '0' : String(a.branch);
        const branchB = (b.branch === 'Gốc' || !b.branch || b.branch === '0') ? '0' : String(b.branch);
        if (branchA !== branchB) {
            // Sử dụng localeCompare với numeric: true để sắp xếp chuỗi số đúng (VD: '2' < '10')
            return branchA.localeCompare(branchB, undefined, { numeric: true });
        }

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
        // Yêu cầu: Những người có generation < 5 thì không hiển thị chữ dâu, rể (Tránh bị lỗi ở Đời 1)
        const gen = parseInt(m.generation) || 0;
        const isInLaw = !!m.pid && !m.fid && !m.mid && gen >= 5;
        let inLawLabel = 'Dâu/Rể';
        if (isInLaw) {
            inLawLabel = (m.gender === 'Nam') ? 'Rể' : 'Dâu';
        }

        // Tìm tên vợ/chồng (Hỗ trợ đa thê - Hiển thị tất cả)
        const spouseList = [];
        if (m.pid) {
            const s = allMembers.find(x => String(x.id) === String(m.pid));
            if (s) spouseList.push(s);
        }
        const others = allMembers.filter(p => String(p.pid) === String(m.id));
        others.forEach(o => {
            if (!spouseList.some(s => String(s.id) === String(o.id))) spouseList.push(o);
        });
        spouseList.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));

        let spouseName = '';
        if (spouseList.length > 0) {
            spouseName = spouseList.map(s => s.full_name).join(', ');
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
        
        // Logic hiển thị ảnh: Nếu có ảnh thì hiện ảnh, không thì hiện chữ cái
        let avatarContent;
        if (m.image && m.image.trim() !== '') {
            // Nếu có ảnh: Hiển thị ảnh. Nếu lỗi tải ảnh -> Thay thế bằng chữ cái
            avatarContent = `<img src="${m.image}" alt="${m.full_name}" onerror="this.parentElement.innerText='${avatarLetter}'">`;
        } else {
            // Không có ảnh: Hiển thị chữ cái
            avatarContent = avatarLetter;
        }

        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-card-avatar" style="background-color: ${avatarColor};">
                    ${avatarContent}
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
            // FIX: Cho phép Trưởng phái sửa thành viên của mình
            const userRole = localStorage.getItem('userRole');
            const isBranch = userRole && userRole.startsWith('branch_');
            
            let canEdit = isAdmin();
            if (isBranch) {
                const branchCode = userRole.split('_')[1];
                if (String(m.branch) === String(branchCode)) canEdit = true;
            }

            if (canEdit) {
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

    // Helper tạo nút
    const createBtn = (html, page, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = `btn-control btn-pagination ${isActive ? 'active' : ''}`;
        btn.innerHTML = html;
        if (isDisabled) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';
        } else {
            btn.onclick = () => changePage(page);
        }
        return btn;
    };

    // 1. Nút Trước
    controls.appendChild(createBtn('<i class="fas fa-chevron-left"></i>', pagination.currentPage - 1, false, pagination.currentPage === 1));

    // 2. Logic hiển thị số trang (1 ... 4 5 6 ... 10)
    const maxVisible = 5; // Số nút trang tối đa hiển thị liền kề
    let startPage, endPage;

    if (totalPages <= maxVisible) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const maxPagesBefore = Math.floor(maxVisible / 2);
        const maxPagesAfter = Math.ceil(maxVisible / 2) - 1;
        if (pagination.currentPage <= maxPagesBefore + 1) {
            startPage = 1;
            endPage = maxVisible;
        } else if (pagination.currentPage + maxPagesAfter >= totalPages) {
            startPage = totalPages - maxVisible + 1;
            endPage = totalPages;
        } else {
            startPage = pagination.currentPage - maxPagesBefore;
            endPage = pagination.currentPage + maxPagesAfter;
        }
    }

    // Trang đầu + Dấu ...
    if (startPage > 1) {
        controls.appendChild(createBtn('1', 1));
        if (startPage > 2) controls.appendChild(document.createTextNode('...'));
    }

    // Các trang ở giữa
    for (let i = startPage; i <= endPage; i++) {
        controls.appendChild(createBtn(i, i, i === pagination.currentPage));
    }

    // Dấu ... + Trang cuối
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) controls.appendChild(document.createTextNode('...'));
        controls.appendChild(createBtn(totalPages, totalPages));
    }

    // 3. Nút Sau
    controls.appendChild(createBtn('<i class="fas fa-chevron-right"></i>', pagination.currentPage + 1, false, pagination.currentPage === totalPages));

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
    const userRole = localStorage.getItem('userRole');
    const isBranch = userRole && userRole.startsWith('branch_');

    // Bảo vệ: Chỉ Admin hoặc Trưởng phái mới được mở
    if (!isAdmin() && !isBranch) {
        alert('Bạn không có quyền thêm thành viên.');
        return;
    }
    currentEditingId = null; // Đặt lại trạng thái: đang thêm mới
    
    // 1. Render lại toàn bộ form sạch sẽ
    const modalContent = document.querySelector('#add-member-modal .modal-content');
    // SỬ DỤNG FORM THÊM RIÊNG BIỆT
    modalContent.innerHTML = renderAddMemberFormHTML();
    
    // Dọn dẹp form
    document.getElementById('m-name').value = '';
    document.getElementById('m-gender').value = 'Nam';
    document.getElementById('m-birth').value = '';
    document.getElementById('m-death').value = '';
    if(document.getElementById('m-phone')) document.getElementById('m-phone').value = '';
    previewAvatarFile(null); // Reset ảnh preview
    compressedAvatarBlob = null; // Reset blob ảnh nén

    // --- BỔ SUNG: Nếu là Trưởng phái, tự động điền và khóa trường Phái ---
    if (isBranch) {
        const branchCode = userRole.split('_')[1];
        const branchInput = document.getElementById('m-branch');
        if (branchInput) {
            branchInput.value = branchCode;
            branchInput.disabled = true;
        }
    }
    
    // Khởi tạo Smart Search
    setupSmartSearch('m-fid-search', 'm-fid', 'res-fid', m => m.gender === 'Nam');
    setupSmartSearch('m-mid-search', 'm-mid', 'res-mid', m => m.gender === 'Nữ');
    setupSmartSearch('m-pid-search', 'm-pid', 'res-pid', () => true);

    // Hiển thị modal
    document.getElementById('add-member-modal').style.display = 'flex';
}

// Mở modal Sửa (Được gọi khi click vào node)
window.openEditModal = function(memberId) {
    const userRole = localStorage.getItem('userRole');
    const isBranch = userRole && userRole.startsWith('branch_');

    // Chặn ngay từ đầu nếu không phải admin và không phải trưởng phái
    if (!isAdmin() && !isBranch) {
        alert('Bạn không có quyền chỉnh sửa thông tin.');
        return;
    }

    const member = allMembers.find(m => m.id == memberId);
    if (!member) {
        console.error("Không tìm thấy thành viên với ID:", memberId);
        return;
    }

    // --- BỔ SUNG: Kiểm tra quyền sửa của Trưởng phái ---
    if (isBranch) {
        const branchCode = userRole.split('_')[1];
        if (String(member.branch) !== String(branchCode)) {
            alert(`Bạn chỉ có quyền sửa thành viên thuộc Phái ${branchCode}.`);
            return;
        }
    }

    currentEditingId = memberId; // Đặt trạng thái: đang sửa
    
    // 1. Render lại form
    const modalContent = document.querySelector('#add-member-modal .modal-content');
    // SỬ DỤNG FORM SỬA RIÊNG BIỆT
    modalContent.innerHTML = renderEditMemberFormHTML();

    // Điền dữ liệu cơ bản
    document.getElementById('m-name').value = member.full_name;
    document.getElementById('m-gender').value = member.gender;
    document.getElementById('m-birth').value = member.birth_date || '';
    document.getElementById('m-death').value = member.death_date || '';
    // Điền dữ liệu các trường bổ sung
    
    // Hiển thị ảnh cũ nếu có
    previewAvatarFile(member.image || null);
    compressedAvatarBlob = null; // Reset blob ảnh nén

    document.getElementById('m-job').value = member.job || '';
    document.getElementById('m-phone').value = member.phone || '';
    document.getElementById('m-address').value = member.address || '';

    // --- LOGIC MỚI: Tự động điền Phái nếu trống ---
    let branchToFill = member.branch || '';
    if (!branchToFill) {
        // Ưu tiên 1: Lấy phái của vợ/chồng
        if (member.pid) {
            const spouse = allMembers.find(m => String(m.id) === String(member.pid));
            if (spouse && spouse.branch) branchToFill = spouse.branch;
        }
        // Ưu tiên 2: Nếu vẫn trống, lấy phái của cha
        if (!branchToFill && member.fid) {
            const father = allMembers.find(m => String(m.id) === String(member.fid));
            if (father && father.branch) branchToFill = father.branch;
        }
    }
    document.getElementById('m-branch').value = branchToFill;
    document.getElementById('m-generation').value = member.generation || '';
    document.getElementById('m-order').value = member.order || '';
    
    // --- BỔ SUNG: Điền Ghi chú & Tình trạng ---
    document.getElementById('m-note').value = member.note || '';
    
    const isDead = member.is_live === 0 || member.is_live === '0' || member.is_live === false;
    if (isDead) {
        const rb = document.querySelector('input[name="m-is-live"][value="0"]');
        if(rb) rb.checked = true;
    } else {
        const rb = document.querySelector('input[name="m-is-live"][value="1"]');
        if(rb) rb.checked = true;
    }

    // Helper điền smart select
    const fillSmart = (id, val) => {
        document.getElementById(id).value = val || '';
        const m = allMembers.find(x => String(x.id) === String(val));
        document.getElementById(id + '-search').value = m ? m.full_name : '';
    };
    fillSmart('m-fid', member.fid);
    fillSmart('m-mid', member.mid);
    
    // --- LOGIC MỚI: Xử lý Đa thê (Tìm tất cả vợ/chồng) ---
    const spouseList = [];
    // 1. Người mà mình trỏ tới (pid của mình)
    if (member.pid) {
        const s = allMembers.find(x => String(x.id) === String(member.pid));
        if (s) spouseList.push(s);
    }
    // 2. Những người trỏ tới mình (pid của họ = id của mình)
    const others = allMembers.filter(p => String(p.pid) === String(member.id));
    others.forEach(o => {
        // Tránh trùng lặp
        if (!spouseList.some(s => String(s.id) === String(o.id))) spouseList.push(o);
    });
    // Sắp xếp theo thứ tự (order)
    spouseList.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));

    // Điền người đầu tiên vào ô input chính
    if (spouseList.length > 0) {
        fillSmart('m-pid', spouseList[0].id);
    } else {
        fillSmart('m-pid', '');
    }

    // Hiển thị danh sách vợ/chồng thứ 2 trở đi (nếu có)
    const extraDiv = document.getElementById('extra-spouses-list');
    if (extraDiv) {
        if (spouseList.length > 1) {
            const extras = spouseList.slice(1);
            // Tạo danh sách tên phân tách bằng dấu phẩy
            const namesHtml = extras.map(s => `<span style="font-weight:600; color:#374151;">${s.full_name}</span>`).join(', ');
            
            extraDiv.innerHTML = `
                <div style="margin-top:8px; padding:8px 12px; background:#f9fafb; border:1px dashed #d1d5db; border-radius:8px; font-size:13px; color:#6b7280;">
                    <i class="fas fa-users" style="color:#3b82f6; margin-right:6px;"></i> 
                    Vợ thứ: ${namesHtml}
                </div>`;
            extraDiv.style.display = 'block';
        } else {
            extraDiv.innerHTML = '';
            extraDiv.style.display = 'none';
        }
    }

    setupSmartSearch('m-fid-search', 'm-fid', 'res-fid', m => m.gender === 'Nam');
    setupSmartSearch('m-mid-search', 'm-mid', 'res-mid', m => m.gender === 'Nữ');
    setupSmartSearch('m-pid-search', 'm-pid', 'res-pid', () => true);

    // --- BỔ SUNG: Khóa trường Phái nếu là Trưởng phái ---
    if (isBranch) {
        const branchInput = document.getElementById('m-branch');
        if (branchInput) {
            branchInput.disabled = true;
        }
    }

    // --- BỔ SUNG: Hiển thị danh sách con cái ---
    const childrenContainer = document.getElementById('children-list-container');
    if (childrenContainer) {
        const children = allMembers.filter(c => String(c.fid) === String(memberId) || String(c.mid) === String(memberId))
                                   .sort((a, b) => (a.order || 99) - (b.order || 99)); // Sắp xếp theo thứ tự

        if (children.length > 0) {
            let childrenHtml = '<ul style="list-style: none; padding: 0; margin: 0;">';
            children.forEach(child => {
                const genderIcon = child.gender === 'Nam' ? '<i class="fas fa-male" style="color: #3b82f6; width: 20px; text-align: center;"></i>' : '<i class="fas fa-female" style="color: #ec4899; width: 20px; text-align: center;"></i>';
                childrenHtml += `<li style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${genderIcon} 
                                        <a href="#" onclick="event.preventDefault(); closeModal(); openEditModal('${child.id}');" style="color: #374151; text-decoration: none; font-weight: 500;">
                                            ${child.full_name}
                                        </a> 
                                    </div>
                                    <span style="font-size: 0.85em; color: #9ca3af;">(Đời ${child.generation})</span>
                                 </li>`;
            });
            childrenHtml += '</ul>';
            childrenContainer.innerHTML = childrenHtml;
        }
    }

    document.getElementById('add-member-modal').style.display = 'flex';
}

// --- HÀM MỚI: Xem chi tiết thành viên (Read-only) ---
function openViewMemberModal(memberId) {
    const member = allMembers.find(m => m.id == memberId);
    if (!member) return;

    // Tạo modal nếu chưa có
    if (!document.getElementById('view-member-modal')) {
        const modalHtml = `
        <div id="view-member-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); align-items: center; justify-content: center;">
            <div class="modal-content" style="background-color: #fff; padding: 0; border: none; width: 90%; max-width: 500px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden;">
                <div class="modal-header" style="background: linear-gradient(135deg, #f97316, #fbbf24); padding: 20px; display: flex; justify-content: space-between; align-items: center; color: white;">
                    <h2 style="margin: 0; font-size: 20px; color: white;">Thông tin thành viên</h2>
                    <button onclick="document.getElementById('view-member-modal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer; color: white; opacity: 0.8;">&times;</button>
                </div>
                <div class="modal-body" id="view-member-body" style="padding: 30px;">
                    <!-- Content will be injected here -->
                </div>
                <div class="modal-footer" style="padding: 15px 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: right;">
                    <button onclick="document.getElementById('view-member-modal').style.display='none'" style="padding: 8px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Đóng</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const body = document.getElementById('view-member-body');
    
    // Format dữ liệu
    const genderIcon = member.gender === 'Nam' ? '<i class="fas fa-mars" style="color:#3b82f6"></i>' : '<i class="fas fa-venus" style="color:#ec4899"></i>';
    
    // Logic xác định sinh tử
    const hasDeathDate = member.death_date && String(member.death_date).trim() !== '' && String(member.death_date).trim() !== '0';
    const isDeadByFlag = member.is_live === 0 || member.is_live === '0' || member.is_live === false;
    const isDeceased = hasDeathDate || isDeadByFlag;

    const status = isDeceased 
        ? '<span style="color:#6b7280; background:#f3f4f6; padding:2px 8px; border-radius:10px; font-size:12px;">Đã mất</span>' 
        : '<span style="color:#16a34a; background:#dcfce7; padding:2px 8px; border-radius:10px; font-size:12px;">Còn sống</span>';

    // Tìm cha mẹ vợ chồng
    const father = allMembers.find(m => String(m.id) === String(member.fid));
    const mother = allMembers.find(m => String(m.id) === String(member.mid));
    
    // Tìm vợ/chồng (hỗ trợ đa thê)
    const spouseList = [];
    if (member.pid) {
        const s = allMembers.find(x => String(x.id) === String(member.pid));
        if (s) spouseList.push(s);
    }
    const others = allMembers.filter(p => String(p.pid) === String(member.id));
    others.forEach(o => {
        if (!spouseList.some(s => String(s.id) === String(o.id))) spouseList.push(o);
    });
    const spouseNames = spouseList.length > 0 ? spouseList.map(s => s.full_name).join(', ') : '---';

    // Ảnh đại diện
    const avatarSrc = member.image || (member.gender === 'Nam' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png');

    body.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="${avatarSrc}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);" onerror="this.src='https://via.placeholder.com/100'">
            <h3 style="margin: 10px 0 5px; font-size: 22px; color: #1f2937;">${member.full_name}</h3>
            <div style="font-size: 14px; color: #6b7280;">${genderIcon} ${member.gender} • Đời thứ ${member.generation} • ${status}</div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
            <div style="grid-column: 1 / -1; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px; font-weight: 600; color: #f97316;">Thông tin cá nhân</div>
            
            <div><span style="color:#6b7280;">Ngày sinh:</span><br><strong>${member.birth_date || '---'}</strong></div>
            <div><span style="color:#6b7280;">Ngày mất:</span><br><strong>${member.death_date || '---'}</strong></div>
            <div><span style="color:#6b7280;">Nghề nghiệp:</span><br><strong>${member.job || '---'}</strong></div>
            <div><span style="color:#6b7280;">Điện thoại:</span><br><strong>${member.phone || '---'}</strong></div>
            <div style="grid-column: 1 / -1;"><span style="color:#6b7280;">Địa chỉ:</span><br><strong>${member.address || '---'}</strong></div>

            <div style="grid-column: 1 / -1; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px; margin-top: 10px; font-weight: 600; color: #f97316;">Quan hệ gia đình</div>
            
            <div><span style="color:#6b7280;">Cha:</span><br><strong>${father ? father.full_name : '---'}</strong></div>
            <div><span style="color:#6b7280;">Mẹ:</span><br><strong>${mother ? mother.full_name : '---'}</strong></div>
            <div style="grid-column: 1 / -1;"><span style="color:#6b7280;">Vợ/Chồng:</span><br><strong>${spouseNames}</strong></div>
        </div>

        ${member.note ? `
        <div style="margin-top: 15px; background: #fff7ed; padding: 10px; border-radius: 8px; font-size: 13px; color: #9a3412;">
            <strong><i class="fas fa-sticky-note"></i> Ghi chú:</strong> ${member.note}
        </div>` : ''}
    `;

    document.getElementById('view-member-modal').style.display = 'flex';
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

// --- HÀM MỚI: Form Thêm Thành Viên (Riêng biệt) ---
function renderAddMemberFormHTML() {
    return `
    <div class="modal-header">
        <h2 id="modal-title">Thêm thành viên mới</h2>
        <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
        <form id="member-form" onsubmit="return false;">
            <!-- Ảnh đại diện -->
            <div class="avatar-upload-box">
                <label for="m-avatar" class="avatar-preview" title="Chọn ảnh đại diện">
                    <img id="avatar-preview-img" src="" style="display:none;">
                    <i id="avatar-placeholder-icon" class="fas fa-camera" style="font-size: 32px; color: #9ca3af;"></i>
                </label>
                <input type="file" id="m-avatar" accept="image/*" style="display: none;" onchange="handleAvatarSelect(this)">
                <span style="font-size: 12px; color: #6b7280;">Nhấn vào hình tròn để tải ảnh</span>
            </div>

            <!-- Hàng 1: Họ tên + Giới tính -->
            <div class="form-row-compact">
                <div class="form-group" style="flex: 2;">
                    <label for="m-name">Họ và tên <span style="color:red">*</span></label>
                    <input type="text" id="m-name" placeholder="Nhập họ tên đầy đủ" required>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label for="m-gender">Giới tính</label>
                    <select id="m-gender">
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                    </select>
                </div>
            </div>

            <!-- Hàng 2 (MỚI): Cha + Mẹ (Smart Select) -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-fid">Cha</label>
                    <div class="smart-select-wrapper">
                        <input type="text" id="m-fid-search" placeholder="Tìm tên cha..." autocomplete="off">
                        <input type="hidden" id="m-fid">
                        <div class="smart-select-results" id="res-fid"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="m-mid">Mẹ</label>
                    <div class="smart-select-wrapper">
                        <input type="text" id="m-mid-search" placeholder="Tìm tên mẹ..." autocomplete="off">
                        <input type="hidden" id="m-mid">
                        <div class="smart-select-results" id="res-mid"></div>
                    </div>
                </div>
            </div>

            <!-- Hàng 3: Vợ/Chồng (Smart Select) -->
            <div class="form-group">
                <label for="m-pid">Vợ / Chồng</label>
                <div class="smart-select-wrapper">
                    <input type="text" id="m-pid-search" placeholder="Tìm tên vợ/chồng..." autocomplete="off">
                    <input type="hidden" id="m-pid">
                    <div class="smart-select-results" id="res-pid"></div>
                </div>
                <!-- Khu vực hiển thị vợ/chồng thêm (cho trường hợp đa thê) -->
                <div id="extra-spouses-list" style="display:none;"></div>
            </div>

            <!-- Hàng 2: Đời + Phái + Thứ tự -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-generation">Đời thứ</label>
                    <input type="number" id="m-generation" min="1" placeholder="Tự động">
                </div>
                <div class="form-group">
                    <label for="m-branch">Phái</label>
                    <input type="text" id="m-branch" placeholder="VD: Phái Nhất">
                </div>
                <div class="form-group">
                    <label for="m-order">Con thứ</label>
                    <input type="number" id="m-order" min="1" placeholder="1">
                </div>
            </div>

            <!-- Hàng Tình trạng (Đã chuyển xuống dưới) -->
            <div class="form-group">
                <label>Tình trạng</label>
                <div class="status-toggle-group">
                    <input type="radio" id="status-alive" name="m-is-live" value="1" checked class="hidden-radio" style="display:none !important;">
                    <label for="status-alive" class="status-option option-alive">
                        <i class="fas fa-heartbeat"></i> Còn sống
                    </label>

                    <input type="radio" id="status-deceased" name="m-is-live" value="0" class="hidden-radio" style="display:none !important;">
                    <label for="status-deceased" class="status-option option-deceased">
                        <i class="fas fa-praying-hands"></i> Đã mất
                    </label>
                </div>
            </div>

            <!-- Hàng 3: Ngày sinh + Ngày mất -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-birth">Năm sinh</label>
                    <input type="text" id="m-birth" placeholder="dd/mm/yyyy hoặc yyyy">
                </div>
                <div class="form-group">
                    <label for="m-death">Năm mất</label>
                    <input type="text" id="m-death" placeholder="Để trống nếu còn sống">
                </div>
            </div>

            <!-- Hàng 6: Thông tin khác -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-job">Nghề nghiệp</label>
                    <input type="text" id="m-job" placeholder="Công việc">
                </div>
                <div class="form-group">
                    <label for="m-phone">Điện thoại</label>
                    <input type="text" id="m-phone" placeholder="Số điện thoại">
                </div>
            </div>
            <div class="form-group">
                <label for="m-address">Địa chỉ</label>
                <input type="text" id="m-address" placeholder="Nơi ở hiện tại">
            </div>

            <div class="form-group">
                <label for="m-note">Ghi chú</label>
                <textarea id="m-note" placeholder="Ghi chú thêm về thành viên..." rows="3"></textarea>
            </div>

            <!-- Danh sách con cái (Mới) -->
            <div class="form-group" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e5e7eb;">
                <label>Danh sách con cái</label>
                <div id="children-list-container" style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 14px; color: #4b5563; max-height: 200px; overflow-y: auto; border: 1px solid #f3f4f6;">
                    <em>Chưa có thông tin con cái.</em>
                </div>
            </div>
        </form>
    </div>
    <div class="modal-footer form-actions">
        <!-- Form Thêm không có nút Xóa -->
        <button type="button" class="btn-cancel" onclick="closeModal()">Hủy</button>
        <button type="button" class="btn-save" onclick="saveMember()">Thêm thành viên</button>
    </div>
    `;
}

// --- HÀM MỚI: Form Sửa Thành Viên (Riêng biệt) ---
function renderEditMemberFormHTML() {
    return `
    <div class="modal-header">
        <h2 id="modal-title">Sửa thông tin thành viên</h2>
        <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
        <form id="member-form" onsubmit="return false;">
            <!-- Ảnh đại diện -->
            <div class="avatar-upload-box">
                <label for="m-avatar" class="avatar-preview" title="Chọn ảnh đại diện">
                    <img id="avatar-preview-img" src="" style="display:none;">
                    <i id="avatar-placeholder-icon" class="fas fa-camera" style="font-size: 32px; color: #9ca3af;"></i>
                </label>
                <input type="file" id="m-avatar" accept="image/*" style="display: none;" onchange="handleAvatarSelect(this)">
                <span style="font-size: 12px; color: #6b7280;">Nhấn vào hình tròn để tải ảnh</span>
            </div>

            <!-- Hàng 1: Họ tên + Giới tính -->
            <div class="form-row-compact">
                <div class="form-group" style="flex: 2;">
                    <label for="m-name">Họ và tên <span style="color:red">*</span></label>
                    <input type="text" id="m-name" placeholder="Nhập họ tên đầy đủ" required>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label for="m-gender">Giới tính</label>
                    <select id="m-gender">
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                    </select>
                </div>
            </div>

            <!-- Hàng 2 (MỚI): Cha + Mẹ (Smart Select) -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-fid">Cha</label>
                    <div class="smart-select-wrapper">
                        <input type="text" id="m-fid-search" placeholder="Tìm tên cha..." autocomplete="off">
                        <input type="hidden" id="m-fid">
                        <div class="smart-select-results" id="res-fid"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="m-mid">Mẹ</label>
                    <div class="smart-select-wrapper">
                        <input type="text" id="m-mid-search" placeholder="Tìm tên mẹ..." autocomplete="off">
                        <input type="hidden" id="m-mid">
                        <div class="smart-select-results" id="res-mid"></div>
                    </div>
                </div>
            </div>

            <!-- Hàng 3: Vợ/Chồng (Smart Select) -->
            <div class="form-group">
                <label for="m-pid">Vợ / Chồng</label>
                <div class="smart-select-wrapper">
                    <input type="text" id="m-pid-search" placeholder="Tìm tên vợ/chồng..." autocomplete="off">
                    <input type="hidden" id="m-pid">
                    <div class="smart-select-results" id="res-pid"></div>
                </div>
                <div id="extra-spouses-list" style="display:none;"></div>
            </div>

            <!-- Hàng 2: Đời + Phái + Thứ tự -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-generation">Đời thứ</label>
                    <input type="number" id="m-generation" min="1" placeholder="Tự động">
                </div>
                <div class="form-group">
                    <label for="m-branch">Phái</label>
                    <input type="text" id="m-branch" placeholder="VD: Phái Nhất">
                </div>
                <div class="form-group">
                    <label for="m-order">Con thứ</label>
                    <input type="number" id="m-order" min="1" placeholder="1">
                </div>
            </div>

            <!-- Hàng Tình trạng (Đã chuyển xuống dưới) -->
            <div class="form-group">
                <label>Tình trạng</label>
                <div class="status-toggle-group">
                    <input type="radio" id="status-alive" name="m-is-live" value="1" checked class="hidden-radio" style="display:none !important;">
                    <label for="status-alive" class="status-option option-alive">
                        <i class="fas fa-heartbeat"></i> Còn sống
                    </label>

                    <input type="radio" id="status-deceased" name="m-is-live" value="0" class="hidden-radio" style="display:none !important;">
                    <label for="status-deceased" class="status-option option-deceased">
                        <i class="fas fa-praying-hands"></i> Đã mất
                    </label>
                </div>
            </div>

            <!-- Hàng 3: Ngày sinh + Ngày mất -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-birth">Năm sinh</label>
                    <input type="text" id="m-birth" placeholder="dd/mm/yyyy hoặc yyyy">
                </div>
                <div class="form-group">
                    <label for="m-death">Năm mất</label>
                    <input type="text" id="m-death" placeholder="Để trống nếu còn sống">
                </div>
            </div>

            <!-- Hàng 6: Thông tin khác -->
            <div class="form-row-compact">
                <div class="form-group">
                    <label for="m-job">Nghề nghiệp</label>
                    <input type="text" id="m-job" placeholder="Công việc">
                </div>
                <div class="form-group">
                    <label for="m-phone">Điện thoại</label>
                    <input type="text" id="m-phone" placeholder="Số điện thoại">
                </div>
            </div>
            <div class="form-group">
                <label for="m-address">Địa chỉ</label>
                <input type="text" id="m-address" placeholder="Nơi ở hiện tại">
            </div>

            <div class="form-group">
                <label for="m-note">Ghi chú</label>
                <textarea id="m-note" placeholder="Ghi chú thêm về thành viên..." rows="3"></textarea>
            </div>

            <!-- Danh sách con cái (Mới) -->
            <div class="form-group" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e5e7eb;">
                <label>Danh sách con cái</label>
                <div id="children-list-container" style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 14px; color: #4b5563; max-height: 200px; overflow-y: auto; border: 1px solid #f3f4f6;">
                    <em>Chưa có thông tin con cái.</em>
                </div>
            </div>
        </form>
    </div>
    <div class="modal-footer form-actions">
        <!-- Form Sửa có nút Xóa -->
        <button type="button" id="btn-delete-member" onclick="deleteMember()" style="display:inline-block;">
            <i class="fas fa-trash"></i> Xóa
        </button>
        <button type="button" class="btn-cancel" onclick="closeModal()">Hủy</button>
        <button type="button" class="btn-save" onclick="saveMember()">Lưu thay đổi</button>
    </div>
    `;
}

// Biến lưu file ảnh đã nén tạm thời
let compressedAvatarBlob = null;

// Hàm nén ảnh client-side (Canvas)
function compressImage(file, maxWidth = 200, quality = 0.7, crop = true) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                const ctx = canvas.getContext('2d');

                if (crop) {
                    // Chế độ Cắt vuông (Dùng cho Avatar)
                    const minSize = Math.min(width, height);
                    canvas.width = maxWidth;
                    canvas.height = maxWidth;
                    
                    const sx = (width - minSize) / 2;
                    const sy = (height - minSize) / 2;
                    ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, maxWidth, maxWidth);
                } else {
                    // Chế độ Giữ tỷ lệ (Dùng cho Bài viết)
                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxWidth) {
                            width *= maxWidth / height;
                            height = maxWidth;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    // Vẽ ảnh full lên canvas đã resize
                    ctx.drawImage(img, 0, 0, width, height);
                }

                // Trả về Blob
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas to Blob failed'));
                }, 'image/jpeg', quality);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// Hàm xử lý xem trước ảnh khi chọn file
window.handleAvatarSelect = async function(input) {
    if (input.files && input.files[0]) {
        try {
            const file = input.files[0];
            // Nén ảnh xuống 200x200px, chất lượng 70%, CÓ CẮT VUÔNG (mặc định)
            const compressedBlob = await compressImage(file, 200, 0.7);
            compressedAvatarBlob = compressedBlob;

            // Tạo URL preview từ blob đã nén
            const previewUrl = URL.createObjectURL(compressedBlob);
            previewAvatarFile(previewUrl);
        } catch (e) {
            console.error("Lỗi nén ảnh:", e);
            // Fallback: hiển thị ảnh gốc nếu nén lỗi
            const reader = new FileReader();
            reader.onload = function(e) { previewAvatarFile(e.target.result); }
            reader.readAsDataURL(input.files[0]);
        }
    }
}

function previewAvatarFile(src) {
    const img = document.getElementById('avatar-preview-img');
    const icon = document.getElementById('avatar-placeholder-icon');
    if (src) {
        img.src = src; img.style.display = 'block'; icon.style.display = 'none';
    } else {
        img.src = ''; img.style.display = 'none'; icon.style.display = 'block';
    }
}

// Hàm thiết lập Smart Search cho các ô input
function setupSmartSearch(inputId, hiddenId, resultId, filterFn) {
    const searchInput = document.getElementById(inputId);
    const hiddenInput = document.getElementById(hiddenId);
    const resultsDiv = document.getElementById(resultId);

    if (!searchInput || !resultsDiv) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        resultsDiv.innerHTML = '';
        
        let dataSource = allMembers.filter(filterFn);
        // Loại bỏ chính mình khỏi danh sách (nếu đang sửa)
        if (currentEditingId) {
            dataSource = dataSource.filter(m => String(m.id) !== String(currentEditingId));
        }

        const matched = query ? dataSource.filter(m => m.full_name.toLowerCase().includes(query)) : [];
        
        matched.slice(0, 10).forEach(member => {
            const item = document.createElement('div');
            item.textContent = `${member.full_name} (Đời ${member.generation})`;
            item.onclick = () => {
                searchInput.value = member.full_name;
                hiddenInput.value = member.id;
                resultsDiv.style.display = 'none';
                
                // Tự động tính đời
                const genInput = document.getElementById('m-generation');
                if (genInput && !genInput.value) {
                    if (hiddenId === 'm-pid') genInput.value = member.generation;
                    else genInput.value = (parseInt(member.generation) || 0) + 1;
                }

                // --- FIX: Tự động điền Phái (Branch) khi chọn Cha ---
                const branchInput = document.getElementById('m-branch');
                if (branchInput && !branchInput.value && hiddenId === 'm-fid') {
                    branchInput.value = member.branch || '';
                }

                // --- BỔ SUNG: Tự động điền Mẹ khi chọn Cha ---
                if (hiddenId === 'm-fid') {
                    const father = member;
                    // Tìm vợ của người cha này (2 chiều)
                    const mother = allMembers.find(p => (String(p.pid) === String(father.id) || String(father.pid) === String(p.id)) && p.gender === 'Nữ');
                    
                    if (mother) {
                        // Điền thông tin Mẹ
                        document.getElementById('m-mid-search').value = mother.full_name;
                        document.getElementById('m-mid').value = mother.id;
                    }
                }

                // --- BỔ SUNG: Tự động tính Con thứ (Order) ---
                if (hiddenId === 'm-fid' || hiddenId === 'm-mid') {
                    const parentId = member.id;
                    // Tìm các anh chị em (đã có trong DB) của người đang thêm
                    const siblings = allMembers.filter(s => String(s.fid) === String(parentId) || String(s.mid) === String(parentId));
                    
                    let maxOrder = 0;
                    if (siblings.length > 0) {
                        maxOrder = siblings.reduce((max, s) => Math.max(max, parseInt(s.order) || 0), 0);
                    }
                    
                    const orderInput = document.getElementById('m-order');
                    if (orderInput) orderInput.value = maxOrder + 1;
                }

                // --- BỔ SUNG: Logic khi chọn Vợ/Chồng (m-pid) ---
                if (hiddenId === 'm-pid') {
                    // 1. Điền Phái và Đời theo chồng/vợ
                    if (branchInput && !branchInput.value) branchInput.value = member.branch || '';
                    if (genInput) genInput.value = member.generation || '';

                    // 2. Tính Order (Thứ tự hôn phối)
                    const spouseId = member.id;
                    // Tìm những người đã kết hôn với người này (pid trỏ về member.id)
                    const existingSpouses = allMembers.filter(m => String(m.pid) === String(spouseId));
                    
                    let maxOrder = 0;
                    if (existingSpouses.length > 0) {
                        maxOrder = existingSpouses.reduce((max, s) => Math.max(max, parseInt(s.order) || 0), 0);
                    }
                    
                    const orderInput = document.getElementById('m-order');
                    if (orderInput) orderInput.value = maxOrder + 1;
                }
            };
            resultsDiv.appendChild(item);
        });
        
        resultsDiv.style.display = matched.length > 0 ? 'block' : 'none';
    });

    // Ẩn kết quả khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) resultsDiv.style.display = 'none';
    });
}

async function saveMember() {
    const nameInput = document.getElementById('m-name');
    const genderInput = document.getElementById('m-gender');
    const birthInput = document.getElementById('m-birth');
    const deathInput = document.getElementById('m-death');
    const jobInput = document.getElementById('m-job');
    const phoneInput = document.getElementById('m-phone');
    const addressInput = document.getElementById('m-address');
    const branchInput = document.getElementById('m-branch');
    const fidInput = document.getElementById('m-fid');
    const midInput = document.getElementById('m-mid');
    const pidInput = document.getElementById('m-pid'); // Thêm input cho Vợ/Chồng
    const genInput = document.getElementById('m-generation');
    const orderInput = document.getElementById('m-order');
    // --- BỔ SUNG: Lấy dữ liệu Ghi chú & Tình trạng ---
    const noteInput = document.getElementById('m-note');
    const isLiveInput = document.querySelector('input[name="m-is-live"]:checked');
    const avatarInput = document.getElementById('m-avatar');

    // Validate cơ bản
    if (!nameInput || !nameInput.value.trim()) { alert("Vui lòng nhập họ tên!"); return; }

    // Tự động tính đời (Generation) dựa trên cha/mẹ hoặc vợ/chồng
    // Ưu tiên giá trị nhập tay
    let generation = genInput && genInput.value ? parseInt(genInput.value) : null;
    const fid = fidInput ? fidInput.value : null;
    const mid = midInput ? midInput.value : null;
    const pid = pidInput ? pidInput.value : null;

    if (!generation) {
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
        } else {
            generation = 1;
        }
    }

    // Chuyển sang dùng FormData để gửi file
    const formData = new FormData();
    formData.append('full_name', nameInput.value.trim());
    formData.append('gender', genderInput ? genderInput.value : 'Nam');
    formData.append('birth_date', birthInput ? birthInput.value.trim() : '');
    formData.append('death_date', deathInput ? deathInput.value.trim() : '');
    formData.append('job', jobInput ? jobInput.value.trim() : '');
    formData.append('phone', phoneInput ? phoneInput.value.trim() : '');
    formData.append('address', addressInput ? addressInput.value.trim() : '');
    formData.append('branch', branchInput ? branchInput.value.trim() : '');
    if (fid) formData.append('fid', fid);
    if (mid) formData.append('mid', mid);
    if (pid) formData.append('pid', pid);
    formData.append('generation', generation);
    const orderVal = (orderInput && orderInput.value) ? parseInt(orderInput.value) : 1;
    formData.append('order', isNaN(orderVal) ? 1 : orderVal);
    formData.append('note', noteInput ? noteInput.value.trim() : '');
    formData.append('is_live', isLiveInput ? isLiveInput.value : '1');

    // Nếu có file ảnh được chọn
    if (compressedAvatarBlob) {
        formData.append('image', compressedAvatarBlob, 'avatar.jpg');
    } else if (avatarInput && avatarInput.files[0]) {
        formData.append('image', avatarInput.files[0]);
    }

    try {
        const token = localStorage.getItem('token');
        
        // Quyết định URL và Method dựa trên việc đang Thêm hay Sửa
        const url = currentEditingId ? `/api/members/${currentEditingId}` : '/api/members';
        const method = currentEditingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 
                // Không set Content-Type để browser tự set multipart/form-data boundary
                'Authorization': `Bearer ${token}` 
            },
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Lỗi khi lưu thành viên");
        }

        showToast(currentEditingId ? "Cập nhật thành công!" : "Thêm thành viên thành công!");
        
        closeModal();
        loadMembers(); // Tải lại dữ liệu để cập nhật cây
    } catch (err) {
        console.error(err);
        alert("❌ Lỗi: " + err.message);
    }
}

// Hàm xóa thành viên (được gọi từ nút Xóa trong modal)
async function deleteMember() {
    const userRole = localStorage.getItem('userRole');
    const isBranch = userRole && userRole.startsWith('branch_');

    // Bảo vệ: Chỉ Admin hoặc Trưởng phái mới được xóa
    if (!isAdmin() && !isBranch) {
        alert('Bạn không có quyền xóa thành viên.');
        return;
    }
    if (!currentEditingId) return;

    const memberToDelete = allMembers.find(m => m.id === currentEditingId);
    if (!memberToDelete) {
        alert("Không tìm thấy thành viên để xóa.");
        return;
    }

    // --- BỔ SUNG: Kiểm tra quyền xóa của Trưởng phái ---
    if (isBranch) {
        const branchCode = userRole.split('_')[1];
        if (String(memberToDelete.branch) !== String(branchCode)) {
            alert(`Bạn chỉ có quyền xóa thành viên thuộc Phái ${branchCode}.`);
            return;
        }
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
    if (!isAdmin()) {
        alert("Bạn không có quyền thực hiện chức năng này.");
        return;
    }

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

// 7. Hàm đồng bộ ngược lên Google Sheets (Sync Up)
async function syncToGoogleSheets() {
    if (!isAdmin()) {
        alert("Bạn không có quyền thực hiện chức năng này.");
        return;
    }

    const confirmSync = confirm("⚠️ CẢNH BÁO: Hành động này sẽ GHI ĐÈ toàn bộ dữ liệu trên file Google Sheet bằng dữ liệu hiện tại của phần mềm.\n\nBạn có chắc chắn muốn tiếp tục?");
    if (!confirmSync) return;

    const btn = document.querySelector('.settings-card[onclick="syncToGoogleSheets()"]');
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: #e74c3c;"></i><h3>Đang ghi...</h3><p>Vui lòng chờ</p>';
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/export-sheets', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok) {
            alert("✅ " + result.message);
        } else {
            alert("❌ Lỗi: " + (result.message || response.statusText));
        }
    } catch (error) {
        console.error("Sync Up Error:", error);
        alert("❌ Lỗi kết nối đến Server!");
    } finally {
        if (btn) {
            btn.style.pointerEvents = 'auto';
            btn.innerHTML = originalContent;
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

            container.innerHTML = data.posts.map((post, index) => {
                const createdDateStr = new Date(post.created_at).toLocaleDateString('vi-VN');
                const updatedDate = new Date(post.updated_at || post.created_at);
                const createdDate = new Date(post.created_at);
                const updatedDateStr = updatedDate.toLocaleDateString('vi-VN');
                // Kiểm tra nếu ngày cập nhật khác ngày tạo (hơn 1 phút) thì coi là đã sửa
                const wasEdited = (updatedDate.getTime() - createdDate.getTime()) > 60000;

                const pinnedIcon = post.is_pinned ? '<span class="pinned-icon">📌 Đã ghim</span>' : '';
                const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức', 'guide': 'Hướng dẫn' };
                const catClass = `cat-${post.category}`;
                
                // Bài viết đầu tiên nếu được ghim sẽ là bài nổi bật (Featured)
                const isFeatured = index === 0 && post.is_pinned;
                const featuredClass = isFeatured ? 'featured' : '';
                const excerptLength = isFeatured ? 300 : 120; // Bài nổi bật hiển thị dài hơn
                
                const shortContent = post.content.length > excerptLength ? post.content.substring(0, excerptLength) + '...' : post.content;
                
                // Nếu không có ảnh, dùng ảnh mặc định placeholder đẹp mắt
                const imageSrc = post.image || 'https://via.placeholder.com/600x400/f3f4f6/9ca3af?text=Gia+Pha+Le+Cong';
                const imageHtml = `<div class="post-thumb"><img src="${imageSrc}" alt="${post.title}" onerror="this.onerror=null;this.src='https://via.placeholder.com/600x400/f3f4f6/9ca3af?text=No+Image'"></div>`;
                
                const actionsHtml = isAdmin() ? `
                    <div class="post-actions">
                        <button class="btn-edit" onclick="openEditPostModal('${post._id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deletePost('${post._id}')" title="Xóa"><i class="fas fa-trash"></i></button>
                    </div>
                ` : '';
                
                return `
                <div class="post-card ${post.is_pinned ? 'pinned' : ''} ${featuredClass}">
                    ${imageHtml}
                    <div class="post-card-content">
                        <div class="post-meta">
                            <span class="post-category ${catClass}">${catMap[post.category]}</span>
                            <span><i class="far fa-clock"></i> ${createdDateStr}</span>
                            ${wasEdited ? `<span><i class="fas fa-pen"></i> ${updatedDateStr} (đã sửa)</span>` : ''}
                            ${pinnedIcon}
                        </div>
                        <div class="post-header">
                            <h3 class="post-title" style="margin:0; font-size:18px; font-weight: 700; color: #1f2937; line-height: 1.4;">${post.title}</h3>
                            ${actionsHtml}
                        </div>
                        <div class="post-excerpt" style="flex-grow:1; color:#4b5563; margin-bottom:20px; line-height: 1.6; font-size: 14px;">${shortContent}</div>
                        <button onclick="openViewPostModal('${post._id}')" style="align-self:flex-start; background:none; border:none; color:#f97316; cursor:pointer; padding:0; font-weight:600; font-size: 14px; display: flex; align-items: center; gap: 5px;">
                            Đọc tiếp <i class="fas fa-arrow-right"></i>
                        </button>
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
        try {
            // Nén ảnh bài viết: Max 800px, chất lượng 80%, KHÔNG CẮT VUÔNG (false)
            const compressedPostBlob = await compressImage(imageInput.files[0], 800, 0.8, false);
            formData.append('image', compressedPostBlob, 'post-image.jpg');
        } catch (e) {
            formData.append('image', imageInput.files[0]); // Fallback nếu lỗi
        }
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
            showToast('✅ Lưu bài viết thành công!');
            closePostModal();
            loadPosts();
        } else {
            alert('❌ Lỗi: ' + data.message);
            showToast('❌ Lỗi: ' + data.message, 'error');
        }
    } catch (err) {
        alert('❌ Lỗi kết nối: ' + err.message);
        showToast('❌ Lỗi kết nối: ' + err.message, 'error');
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
                        <h3>Nạp từ Google Sheet</h3>
                        <p>Nạp dữ liệu từ Sheet vào web.</p>
                    </div>
                    <div class="settings-card" onclick="syncToGoogleSheets()">
                        <i class="fas fa-cloud-upload-alt" style="color: #e74c3c;"></i>
                        <h3>Sao lưu lên Google Sheet</h3>
                        <p>Lưu dữ liệu từ web lên Sheet.</p>
                    </div>
                ` : ''}
                <div class="settings-card" onclick="openImportModal()">
                    <i class="fas fa-file-csv" style="color: #27ae60;"></i>
                    <h3>Nhập File CSV</h3>
                    <p>Thêm/Cập nhật từ CSV.</p>
                </div>
                <div class="settings-card" onclick="downloadSampleCSV()">
                    <i class="fas fa-file-download" style="color: #16a085;"></i>
                    <h3>Tải File Mẫu</h3>
                    <p>File CSV chuẩn để nhập liệu.</p>
                </div>
                ${isAdmin() ? `
                    <div class="settings-card" onclick="exportToCSV()">
                        <i class="fas fa-file-export" style="color: #f39c12;"></i>
                        <h3>Xuất File CSV</h3>
                        <p>Tải dữ liệu hiện tại.</p>
                    </div>
                    <div class="settings-card" onclick="exportToGEDCOM()">
                        <i class="fas fa-project-diagram" style="color: #8e44ad;"></i>
                        <h3>Xuất File GEDCOM</h3>
                        <p>Chuẩn MyHeritage.</p>
                    </div>
                ` : ''}
                ${isOwner() ? `
                    <div class="settings-card" onclick="openUserManagementModal()">
                        <i class="fas fa-users-cog" style="color: #4b5563;"></i>
                        <h3>Quản lý Tài khoản</h3>
                        <p>Thêm/Xóa người dùng.</p>
                    </div>
                ` : ''}
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
                
                <details class="guide-details" open>
                    <summary class="guide-summary">
                        <i class="fas fa-tachometer-alt"></i>
                        <h3>1. Bảng điều khiển (Dashboard)</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Đây là màn hình tổng quan, cung cấp các thông tin nhanh về gia phả.</p>
                        <ul>
                            <li><strong>Thẻ thống kê:</strong> Hiển thị các con số chính: Tổng thành viên, số Nam/Nữ, và tổng số Thế hệ.</li>
                            <li><strong>Biểu đồ tròn:</strong>
                                <ul>
                                    <li><em>Thành phần Gia tộc:</em> Tỷ lệ giữa thành viên huyết thống (con cháu) và thành viên dâu/rể.</li>
                                    <li><em>Tình trạng sinh tử:</em> Tỷ lệ giữa thành viên còn sống và đã mất.</li>
                                </ul>
                            </li>
                            <li><strong>Danh sách phân bổ:</strong>
                                <ul>
                                    <li><em>Theo Thế hệ:</em> Liệt kê số lượng thành viên trong từng đời.</li>
                                    <li><em>Theo Phái/Chi:</em> Liệt kê số lượng thành viên thuộc từng phái (Phái Nhất, Phái Nhì...).</li>
                                </ul>
                            </li>
                            <li><strong>Sự kiện sắp tới:</strong> Tự động nhắc nhở các ngày Sinh nhật (cho người còn sống) và ngày Giỗ (cho người đã mất) trong vòng 30 ngày tới.</li>
                            <li><strong>Hoạt động gần đây (Admin):</strong> Ghi lại lịch sử các thao tác quan trọng như thêm, sửa, xóa thành viên hoặc bài viết, giúp quản trị viên theo dõi các thay đổi. Admin có thể xóa lịch sử này.</li>
                        </ul>
                    </div>
                </details>

                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-sitemap"></i>
                        <h3>2. Cây Gia Phả</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Công cụ trực quan để khám phá các mối quan hệ trong dòng họ.</p>
                        <ul>
                            <li><strong>Thao tác cơ bản:</strong>
                                <ul>
                                    <li><strong>Di chuyển:</strong> Nhấn và giữ chuột trái, sau đó kéo để di chuyển cây.</li>
                                    <li><strong>Phóng to/Thu nhỏ:</strong> Sử dụng con lăn chuột (scroll) để zoom.</li>
                                </ul>
                            </li>
                            <li><strong>Chú giải màu sắc:</strong>
                                <ul>
                                    <li><span style="color:#38bdf8">■ Thẻ xanh dương:</span> Thành viên nam.</li>
                                    <li><span style="color:#ec4899">■ Thẻ hồng:</span> Thành viên nữ.</li>
                                    <li><span style="color:#9ca3af">■ Thẻ xám:</span> Thành viên đã mất.</li>
                                    <li><strong>Đường nối đỏ:</strong> Biểu thị quan hệ vợ/chồng.</li>
                                    <li><strong>Đường nối xám:</strong> Biểu thị quan hệ cha/mẹ - con.</li>
                                </ul>
                            </li>
                            <li><strong>Tương tác với thành viên:</strong>
                                <ul>
                                    <li><strong>Xem chi tiết:</strong> Nhấn chuột 1 lần vào thẻ của thành viên để xem thông tin chi tiết. Admin sẽ có thêm nút "Sửa" trong form này.</li>
                                    <li><strong>Sửa nhanh (Admin):</strong> Nhấn đúp chuột (double-click) vào thẻ của thành viên để mở ngay form chỉnh sửa.</li>
                                </ul>
                            </li>
                            <li><strong>Thanh công cụ:</strong>
                                <ul>
                                    <li><strong>Tìm kiếm:</strong> Gõ tên thành viên để tìm và tự động zoom tới vị trí của họ trên cây.</li>
                                    <li><strong>Lọc theo đời:</strong> Chọn một đời cụ thể để chỉ hiển thị đời đó cùng với đời cha mẹ và con cái liền kề, giúp cây gọn gàng hơn.</li>
                                    <li><strong>Đặt lại:</strong> Đưa cây về trạng thái xem mặc định, zoom vào cụ tổ.</li>
                                    <li><strong>Tải cây (PDF):</strong> Xuất toàn bộ chế độ xem cây hiện tại ra file PDF.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>
                
                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-users"></i>
                        <h3>3. Danh sách Thành viên</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Hiển thị toàn bộ thành viên dưới dạng danh sách thẻ, được sắp xếp theo thứ tự gia phả.</p>
                        <ul>
                            <li><strong>Sắp xếp:</strong> Danh sách được tự động sắp xếp theo Đời, sau đó theo thứ tự con cái trong gia đình, đảm bảo tính logic của gia phả.</li>
                            <li><strong>Tìm kiếm & Lọc:</strong>
                                <ul>
                                    <li><strong>Tìm kiếm nhanh:</strong> Gõ tên vào ô tìm kiếm để lọc danh sách.</li>
                                    <li><strong>Lọc theo loại:</strong> Chọn "Huyết thống" để chỉ xem con cháu, hoặc "Dâu/Rể" để xem các thành viên dâu rể.</li>
                                    <li><strong>Tìm kiếm Nâng cao:</strong> Cho phép lọc kết hợp nhiều điều kiện như Tên, Đời, Phái, Giới tính, Tình trạng, Nghề nghiệp, Địa chỉ.</li>
                                </ul>
                            </li>
                            <li><strong>Xuất PDF:</strong> Nhấn nút "Xuất PDF" để tải danh sách thành viên đang được hiển thị (sau khi đã lọc) về máy.</li>
                            <li><strong>Thêm/Sửa (Admin):</strong>
                                <ul>
                                    <li><strong>Thêm mới:</strong> Nhấn nút "Thêm thành viên". Form hỗ trợ tìm kiếm thông minh để liên kết Cha/Mẹ/Vợ/Chồng.</li>
                                    <li><strong>Sửa:</strong> Nhấn vào thẻ thành viên bất kỳ để mở form chỉnh sửa.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>

                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-book-open"></i>
                        <h3>4. Sổ Gia Phả Điện Tử</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Phiên bản số hóa của cuốn gia phả truyền thống.</p>
                        <ul>
                            <li><strong>Giao diện:</strong> Mô phỏng sách thật với hiệu ứng lật trang mượt mà.</li>
                            <li><strong>Nội dung:</strong> Tự động biên soạn dựa trên dữ liệu đã nhập. Mỗi trang trình bày thông tin của một chủ hộ (Trưởng nam/Thứ nam) cùng vợ và danh sách con cái sinh hạ.</li>
                            <li><strong>Trình bày:</strong> Văn phong trang trọng, cổ điển, phù hợp với văn hóa dòng họ.</li>
                            <li><strong>Thiết bị:</strong> Tối ưu hiển thị cho cả máy tính (xem 2 trang) và điện thoại (xem 1 trang).</li>
                        </ul>
                    </div>
                </details>

                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-newspaper"></i>
                        <h3>5. Tin tức & Sự kiện</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Kênh thông tin chính thức của dòng họ.</p>
                        <ul>
                            <li><strong>Xem bài viết:</strong> Tất cả thành viên có thể đọc các bài viết đã đăng. Nhấn "Đọc tiếp" để xem toàn bộ nội dung.</li>
                            <li><strong>Quản trị (Admin):</strong>
                                <ul>
                                    <li><strong>Viết bài mới:</strong> Soạn thảo tiêu đề, nội dung, chọn danh mục (Thông báo, Sự kiện, Tin tức) và đính kèm ảnh minh họa.</li>
                                    <li><strong>Ghim bài:</strong> Tích vào ô "Ghim bài viết" để đưa bài viết quan trọng lên đầu danh sách.</li>
                                    <li><strong>Sửa/Xóa:</strong> Admin có thể chỉnh sửa hoặc xóa bất kỳ bài viết nào.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>

                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-cogs"></i>
                        <h3>6. Cài đặt & Dữ liệu</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Khu vực quản lý dữ liệu và tài khoản của hệ thống.</p>
                        <ul>
                            <li><strong>Nhập/Xuất Dữ liệu:</strong>
                                <ul>
                                    <li><strong>Tải File Mẫu:</strong> Tải về file CSV với cấu trúc cột chuẩn để chuẩn bị dữ liệu.</li>
                                    <li><strong>Nhập File CSV:</strong> Tải file CSV đã có dữ liệu lên để thêm mới hoặc cập nhật hàng loạt thành viên. Chức năng này dành cho cả Khách và Admin.</li>
                                    <li><strong>Xuất File CSV (Admin):</strong> Tải toàn bộ dữ liệu thành viên trong hệ thống về máy dưới dạng file CSV.</li>
                                    <li><strong>Xuất File GEDCOM (Admin):</strong> Xuất dữ liệu chuẩn quốc tế (GEDCOM) để lưu trữ hoặc nhập vào các phần mềm gia phả khác.</li>
                                </ul>
                            </li>
                            <li><strong>Đồng bộ Google Sheets (Admin):</strong>
                                <ul>
                                    <li><strong>Nạp từ Google Sheet:</strong> Xóa toàn bộ dữ liệu hiện tại trên web và nạp lại từ Google Sheet.</li>
                                    <li><strong>Sao lưu lên Google Sheet:</strong> Ghi đè toàn bộ dữ liệu từ web lên Google Sheet để lưu trữ.</li>
                                </ul>
                            </li>
                            <li><strong>Quản lý Tài khoản (Admin):</strong> Thêm, sửa (vai trò), và xóa tài khoản người dùng (viewer/admin).</li>
                            <li><strong>Thông tin App:</strong> Xem phiên bản hiện tại của ứng dụng.</li>
                        </ul>
                    </div>
                </details>

                <details class="guide-details">
                    <summary class="guide-summary">
                        <i class="fas fa-user-shield"></i>
                        <h3>7. Phân quyền & Bảo mật</h3>
                    </summary>
                    <div class="guide-body">
                        <p>Hệ thống áp dụng cơ chế phân quyền 3 cấp để bảo vệ tính toàn vẹn của dữ liệu:</p>
                        <ul>
                            <li><strong>Admin (Quản trị viên / Chủ sở hữu):</strong>
                                <ul>
                                    <li><em>Phạm vi:</em> Toàn bộ gia tộc.</li>
                                    <li><em>Quyền hạn:</em> Toàn quyền (Thêm, Sửa, Xóa, Đồng bộ Sheet, Quản lý tài khoản).</li>
                                </ul>
                            </li>
                            <li><strong>Trưởng Phái (Tài khoản p1-p4):</strong>
                                <ul>
                                    <li><em>Phạm vi:</em> Chỉ quản lý thành viên thuộc Chi phái của mình.</li>
                                    <li><em>Quyền hạn:</em> Xem tất cả, nhưng chỉ được Thêm/Sửa/Xóa thành viên thuộc phái tương ứng.</li>
                                </ul>
                            </li>
                            <li><strong>Khách (Guest):</strong>
                                <ul>
                                    <li><em>Phạm vi:</em> Toàn bộ gia tộc.</li>
                                    <li><em>Quyền hạn:</em> Chỉ xem, không được chỉnh sửa bất kỳ dữ liệu nào.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>

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

        // --- THÊM: Checkbox tùy chọn thay thế dữ liệu ---
        if (uploadBtn && !document.getElementById('chk-replace-data')) {
            const wrapper = document.createElement('div');
            wrapper.style.margin = '15px 0';
            wrapper.innerHTML = `
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#c0392b; font-weight:600;">
                    <input type="checkbox" id="chk-replace-data">
                    Xóa toàn bộ dữ liệu cũ và thay thế bằng file này
                </label>
            `;
            uploadBtn.parentNode.insertBefore(wrapper, uploadBtn);
        }
        if (document.getElementById('chk-replace-data')) {
            document.getElementById('chk-replace-data').checked = false;
        }

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

    // Gửi kèm tùy chọn thay thế
    const replaceChk = document.getElementById('chk-replace-data');
    if (replaceChk && replaceChk.checked) {
        formData.append('replace', 'true');
    }

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
                uploadBtn.innerHTML = 'Tải lại (nếu cần)';
            } else {
                // Thành công không có cảnh báo, tự động đóng sau 2.5 giây
                uploadBtn.innerHTML = '✅ Thành công';
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

// Hàm xuất GEDCOM
async function exportToGEDCOM() {
    const btn = document.querySelector('.settings-card[onclick="exportToGEDCOM()"]');
    let originalText = '';
    
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><h3>⌛ Đang xử lý...</h3><p>Đang tạo file GEDCOM</p></div>';
        btn.style.pointerEvents = 'none';
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/export-gedcom', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Lỗi khi tạo file GEDCOM');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `GiaPha_LeCong_${new Date().toISOString().slice(0, 10)}.ged`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    } finally {
        if (btn) { btn.innerHTML = originalText; btn.style.pointerEvents = 'auto'; }
    }
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG SỔ GIA PHẢ
// ==========================================
let currentBookId = null;
let bookInstance = null; // Biến lưu instance của PageFlip

// Hàm tải script động
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function renderBookTab() {
    const container = document.getElementById('book-tab');
    if (!container) return;
    
    // Nếu sách đã được vẽ rồi thì không vẽ lại (tránh mất trạng thái trang hiện tại)
    if (container.querySelector('.stf__wrapper')) return;

    container.innerHTML = '<div style="text-align:center; padding:50px; color:#666;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Đang đóng sách gia phả...</div>';

    try {
        // 1. Tải thư viện PageFlip
        await loadScript('https://cdn.jsdelivr.net/npm/page-flip/dist/js/page-flip.browser.js');
    } catch (e) {
        container.innerHTML = '<p style="color:red; text-align:center;">Không thể tải thư viện lật trang. Vui lòng kiểm tra kết nối mạng.</p>';
        return;
    }

    // 2. Chuẩn bị dữ liệu
    const pagesData = getSortedBookPages();
    if (pagesData.length === 0) {
         container.innerHTML = '<p style="text-align:center; padding:20px;">Chưa có dữ liệu để tạo sách.</p>';
         return;
    }

    // Xác định thiết bị Mobile để tối ưu hiển thị (Bỏ trang trắng)
    const isMobile = window.innerWidth < 768;

    // Nút in ấn cho Admin
    let adminControls = '';
    if (isAdmin()) {
        adminControls = `<button class="btn-control" id="btn-book-print" style="color: #c0392b;" title="In Sổ (PDF)"><i class="fas fa-print"></i></button>`;
    }

    // 3. Tạo khung HTML cho sách
    container.innerHTML = `
        <div class="book-controls" style="text-align:center; margin-bottom:15px; display:flex; justify-content:center; align-items:center; gap:5px; flex-wrap:wrap;">
            <button class="btn-control" id="btn-book-prev"><i class="fas fa-chevron-left"></i><span class="btn-text"> Trang trước</span></button>
            
            <!-- Pagination Input (Phân trang) -->
            <div class="book-pagination" style="display:flex; align-items:center; gap:5px; background:white; padding:4px 8px; border-radius:8px; border:1px solid #ddd;">
                <span style="font-size:13px; color:#666;">Trang</span>
                <input type="number" id="book-page-input" min="1" style="width:50px; text-align:center; padding:4px; border:1px solid #ccc; border-radius:4px; font-weight:bold;">
                <span id="book-total-pages" style="font-size:13px; font-weight:bold; color:#555;">/ ...</span>
                <button id="btn-book-goto" class="btn-control" style="padding:4px 8px; min-width:auto; height:28px;" title="Đi đến trang"><i class="fas fa-level-down-alt" style="transform: rotate(90deg);"></i></button>
            </div>

            <button class="btn-control" id="btn-book-next"><span class="btn-text">Trang sau </span><i class="fas fa-chevron-right"></i></button>
            ${adminControls}
        </div>
        <div class="book-stage" id="so-gia-pha-content" style="display:flex; justify-content:center; align-items:center; overflow:hidden;">
            <div id="my-book">
                <!-- Pages will be injected here -->
            </div>
        </div>
        <p style="text-align:center; font-size:12px; color:#888; margin-top:10px;">
            <i class="fas fa-hand-pointer"></i> Vuốt hoặc kéo góc giấy để lật trang
        </p>
    `;

    const bookEl = document.getElementById('my-book');
    let pagesHTML = '';

    // --- TRANG BÌA ---
    pagesHTML += `
        <div class="page" data-density="hard">
            <div class="page-content cover-page">
                <div style="border: 3px double #d7ccc8; padding: 20px; height: 100%; display:flex; flex-direction:column; justify-content:flex-start; align-items:center; padding-top: 80px;">
                    <h1 style="font-family: 'Times New Roman', serif; font-size: 2.5em; text-align: center; color: #d7ccc8; margin-bottom: 20px; text-shadow: 1px 1px 2px #000;">GIA PHẢ<br>HỌ LÊ CÔNG</h1>
                    <div style="width: 50px; height: 2px; background: #5d4037; margin: 20px auto;"></div>
                    <p style="font-size: 1.2em; color: #d7ccc8;">Thôn Linh An,Tỉnh Quảng Trị</p>
                    <p style="margin-top: auto; font-size: 0.9em; color: #a1887f;">Năm ${new Date().getFullYear()}</p>
                </div>
            </div>
        </div>
    `;

    // --- MẶT SAU CỦA BÌA (Trang lót - Trống) ---
    if (!isMobile) {
        pagesHTML += `
            <div class="page" data-density="hard">
                <div class="page-content cover-page" style="background-color: #5d4037; border-left: 1px solid #3e2723;"></div>
            </div>
        `;
    }

    // --- CÁC TRANG NỘI DUNG ---
    pagesData.forEach((member, index) => {
        const content = generatePageContent(member);
        
        // 1. Trang nội dung (Mặt phải)
        pagesHTML += `
            <div class="page">
                <div class="page-content notebook-page">
                    <div style="position:absolute; top:15px; right:20px; font-size:12px; color:#8d6e63; font-family:serif; font-style:italic;">Trang ${index + 1}</div>
                    ${content}
                </div>
            </div>
        `;

        // 2. Trang trắng (Mặt trái - Mặt sau của tờ giấy)
        if (!isMobile) {
            pagesHTML += `
                <div class="page">
                    <div class="page-content" style="background-color: #fff8e1; height: 100%; opacity: 0.6; box-shadow: inset -5px 0 20px rgba(0,0,0,0.05);">
                        <!-- Có thể thêm họa tiết mờ hoặc để trống hoàn toàn -->
                    </div>
                </div>
            `;
        }
    });

    // --- TRANG BÌA SAU ---
    pagesHTML += `
        <div class="page" data-density="hard">
            <div class="page-content cover-page" style="background-color:#5d4037;"></div>
        </div>
    `;

    bookEl.innerHTML = pagesHTML;

    // 4. Khởi tạo PageFlip
    // Kích thước sách: Mobile thì full màn hình trừ lề, PC thì cố định đẹp
    const width = isMobile ? Math.min(window.innerWidth - 20, 400) : 450;
    const height = isMobile ? Math.min(window.innerHeight - 200, 600) : 650;

    bookInstance = new St.PageFlip(bookEl, {
        width: width,
        height: height,
        size: isMobile ? "stretch" : "fixed", // Mobile co giãn, PC cố định
        minWidth: 300,
        maxWidth: 600,
        minHeight: 400,
        maxHeight: 800,
        maxShadowOpacity: 0.5, // Độ đậm bóng đổ
        showCover: true,
        mobileScrollSupport: false, // Tắt scroll trang web khi vuốt sách
        startPage: 0
    });

    bookInstance.loadFromHTML(document.querySelectorAll('.page'));

    // 5. Gắn sự kiện điều khiển
    // Hàm cuộn lên đầu sách khi chuyển trang (Tham khảo từ yêu cầu)
    const handleBookPageChange = () => {
        const element = document.getElementById("so-gia-pha-content");
        if (element) {
            const rect = element.getBoundingClientRect();
            const headerOffset = 100; // Trừ đi chiều cao header sticky
            
            // FIX: Chỉ cuộn nếu đỉnh sách bị khuất phía trên (người dùng đã cuộn xuống quá sâu)
            // Giúp tránh giật màn hình khi đang xem trọn vẹn sách
            if (rect.top < headerOffset) {
                const offsetPosition = rect.top + window.pageYOffset - headerOffset;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        }
    };

    document.getElementById('btn-book-prev').onclick = () => {
        bookInstance.flipPrev();
        // FIX: Delay cuộn để hiệu ứng lật trang chạy mượt trước (600ms là thời gian lật mặc định)
        setTimeout(handleBookPageChange, 600);
    };
    document.getElementById('btn-book-next').onclick = () => {
        bookInstance.flipNext();
        setTimeout(handleBookPageChange, 600);
    };

    // Xử lý nhảy trang (Pagination)
    const goToPage = () => {
        const input = document.getElementById('book-page-input');
        if (!input) return;
        let page = parseInt(input.value);
        const total = bookInstance.getPageCount();
        
        if (isNaN(page) || page < 1) page = 1;
        if (page > total) page = total;
        
        // PageFlip index bắt đầu từ 0
        bookInstance.flip(page - 1);
        handleBookPageChange();
    };

    document.getElementById('btn-book-goto').onclick = goToPage;
    document.getElementById('book-page-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goToPage();
    });

    if (isAdmin()) {
        document.getElementById('btn-book-print').onclick = printGenealogyBook;
    }

    const updateInfo = () => {
        const current = bookInstance.getCurrentPageIndex() + 1;
        const total = bookInstance.getPageCount();
        
        // Cập nhật input thay vì span text
        const input = document.getElementById('book-page-input');
        if(input && document.activeElement !== input) input.value = current; // Chỉ update nếu không đang gõ
        
        const totalSpan = document.getElementById('book-total-pages');
        if(totalSpan) totalSpan.innerText = `/ ${total}`;
    };

    bookInstance.on('flip', updateInfo);
    updateInfo();
}

// --- BỔ SUNG: Hàm lấy danh sách các trang sách theo thứ tự tuyến tính ---
function getSortedBookPages() {
    // Lọc ra những người là "Chủ hộ" (Thường là Nam giới thuộc dòng huyết thống)
    // Điều kiện: Là Nam VÀ (Có cha/mẹ HOẶC là Thủy tổ id=1)
    let pages = allMembers.filter(m => {
        const isBloodline = String(m.id) === '1' || m.fid || m.mid;
        return isBloodline && m.gender === 'Nam';
    });

    // Tạo Map để tra cứu nhanh cha mẹ
    const memberMap = new Map(allMembers.map(m => [String(m.id), m]));

    // Hàm đệ quy lấy chuỗi thứ tự tổ tiên: [Order Cụ, Order Ông, Order Cha, Order Mình]
    const getAncestryChain = (member) => {
        let chain = [];
        let current = member;
        // Duyệt ngược lên tối đa 10 đời để tránh lặp vô tận nếu dữ liệu lỗi
        let safety = 0;
        while (current && safety < 10) {
            // Thêm order của người hiện tại vào đầu chuỗi
            chain.unshift(parseInt(current.order) || 999);
            
            // Tìm cha/mẹ để leo lên tiếp
            if (current.fid) current = memberMap.get(String(current.fid));
            else if (current.mid) current = memberMap.get(String(current.mid));
            else current = null; // Hết đường
            
            safety++;
        }
        return chain;
    };

    // Sắp xếp theo logic: Đời -> Phái -> Thứ tự con
    pages.sort((a, b) => {
        // 1. Ưu tiên Đời (Generation)
        const genA = parseInt(a.generation) || 999;
        const genB = parseInt(b.generation) || 999;
        if (genA !== genB) return genA - genB;

        // 2. Tiếp theo là Phái (Branch)
        // Quy đổi: Gốc/0 -> 0, còn lại giữ nguyên để so sánh chuỗi
        const branchA = (a.branch === 'Gốc' || !a.branch || a.branch === '0') ? '0' : String(a.branch);
        const branchB = (b.branch === 'Gốc' || !b.branch || b.branch === '0') ? '0' : String(b.branch);
        
        if (branchA !== branchB) {
            return branchA.localeCompare(branchB, undefined, { numeric: true });
        }

        // 3. Quan trọng: Sắp xếp theo dòng họ (Ancestry Chain)
        // So sánh từng cấp order của tổ tiên. Ai có cha/ông là anh thì đứng trước.
        const chainA = getAncestryChain(a);
        const chainB = getAncestryChain(b);
        
        const len = Math.min(chainA.length, chainB.length);
        for (let i = 0; i < len; i++) {
            if (chainA[i] !== chainB[i]) {
                return chainA[i] - chainB[i];
            }
        }
        
        // Nếu chuỗi giống nhau (anh em ruột), người có chuỗi ngắn hơn (đời cao hơn - ít xảy ra ở đây do đã sort Gen) hoặc order chính mình sẽ quyết định
        return chainA.length - chainB.length;
    });

    return pages;
}

// --- HÀM MỚI: In Sổ Gia Phả ra PDF (Chỉ Admin) ---
// --- HÀM MỚI: In Sổ Gia Phả (Sử dụng trình in mặc định của trình duyệt) ---
async function printGenealogyBook() {
    if (!isAdmin()) return;

    const pagesData = getSortedBookPages();
    if (pagesData.length === 0) {
        alert("Không có dữ liệu để in.");
        return;
    }

    // Tạo cửa sổ in mới
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép trang web này mở cửa sổ mới để in.');
        return;
    }

    // Chuẩn bị nội dung HTML
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>In Sổ Gia Phả</title>
        <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap" rel="stylesheet">
        <style>
            @page {
                size: A4;
                margin: 0;
            }
            body {
                margin: 0;
                padding: 0;
                background-color: #f4ecd8;
                font-family: 'Dancing Script', cursive;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .print-page {
                width: 210mm;
                min-height: 296mm; /* A4 height */
                height: auto; /* Cho phép giãn chiều cao nếu nội dung dài */
                position: relative;
                page-break-after: always;
                overflow: visible; /* Hiển thị hết nội dung */
                background-color: #f4ecd8;
                /* Tái tạo nền giấy cũ */
                background-image:
                    linear-gradient(90deg, rgba(139, 69, 19, 0.15) 1px, transparent 1px),
                    linear-gradient(rgba(139, 69, 19, 0.15) 1px, transparent 1px);
                background-size: 25px 25px;
                box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.05);
                border: 1px solid #d2b48c;
                padding: 40px;
                box-sizing: border-box;
            }
            /* Trang bìa */
            .cover-page {
                background-color: #3e2723 !important;
                background-image: none !important;
                color: #d7ccc8 !important;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                border: 10px double #5d4037;
            }
            .cover-border {
                border: 3px double #d7ccc8;
                padding: 40px;
                width: 80%;
                height: 80%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            }
            /* Typography cho nội dung */
            .page-number {
                position: absolute;
                top: 20px;
                right: 30px;
                font-family: serif;
                font-size: 12pt;
                color: #8d6e63;
                font-style: italic;
            }
            .generation-title {
                color: #b71c1c;
                font-size: 24pt;
                font-weight: bold;
                text-align: center;
                margin-bottom: 20px;
                margin-top: 0;
            }
            .branch-name {
                display: block;
                font-size: 14pt;
                color: #e65100;
                font-weight: bold;
                margin-top: 5px;
            }
            .main-couple {
                text-align: center;
                margin-bottom: 30px;
            }
            .father-name {
                font-size: 20pt;
                font-weight: bold;
                border-bottom: 2px solid #b71c1c;
                display: inline-block;
                margin-bottom: 10px;
                color: #4b3621;
            }
            .mother-info {
                font-size: 16pt;
                color: #5d4037;
                margin-top: 5px;
            }
            .sinh-ha-title {
                font-size: 18pt;
                text-align: center;
                margin-top: 25px;
                margin-bottom: 15px;
                text-decoration: underline;
                font-weight: bold;
                color: #4b3621;
            }
            .children-grid {
                padding-left: 20px;
            }
            .child-line {
                font-size: 15pt;
                line-height: 1.6;
                margin-bottom: 5px;
                border-bottom: 1px dotted #ccc;
                display: flex;
                align-items: baseline;
                color: #4b3621;
            }
            .order-no {
                font-weight: bold;
                margin-right: 10px;
                min-width: 25px;
            }
            .name {
                font-weight: 600;
            }
            .note {
                font-size: 13pt;
                font-style: italic;
                color: #6d4c41;
                margin-left: 5px;
            }
            /* Ẩn các icon không cần thiết khi in */
            .icon-next { display: none; }
        </style>
    </head>
    <body>
    `;

    // 1. Thêm Trang Bìa
    htmlContent += `
        <div class="print-page cover-page">
            <div class="cover-border">
                <h1 style="font-family: 'Times New Roman', serif; font-size: 40pt; margin-bottom: 30px; text-shadow: 1px 1px 2px #000;">GIA PHẢ<br>HỌ LÊ CÔNG</h1>
                <div style="width: 150px; height: 3px; background: #d7ccc8; margin: 30px auto;"></div>
                <p style="font-size: 20pt; margin-top: 20px; font-family: 'Times New Roman', serif;">Thôn Linh An, Tỉnh Quảng Trị</p>
                <p style="margin-top: auto; font-size: 16pt; font-family: 'Times New Roman', serif;">Năm ${new Date().getFullYear()}</p>
            </div>
        </div>
    `;

    // 2. Thêm Các Trang Nội Dung
    pagesData.forEach((member, index) => {
        const content = generatePageContent(member);
        htmlContent += `
            <div class="print-page">
                <div class="page-number">Trang ${index + 1}</div>
                ${content}
            </div>
        `;
    });

    htmlContent += `
        <script>
            // Tự động in khi tải xong
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                }, 1000); // Đợi 1 giây để font chữ tải xong
            };
        </script>
    </body>
    </html>
    `;

    // Ghi nội dung vào cửa sổ mới
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

// --- HÀM MỚI: Tạo nội dung HTML cho 1 trang sách (Tách từ displayFamilyPage cũ) ---
function generatePageContent(father) {
    // Helper: Format ngày sinh - mất
    const getLifeDates = (m) => {
        return ''; // Tạm ẩn ngày tháng năm sinh/mất theo yêu cầu
        /*
        if (!m || (!m.birth_date && !m.death_date)) return '';
        const birth = m.birth_date || '...';
        const death = m.death_date ? m.death_date : ((m.is_live === false || m.is_live === '0' || m.is_live === 0) ? '?' : 'nay');
        return `<span class="life-dates">(${birth} - ${death})</span>`;
        */
    };

    // Find all spouses, sorted by order
    const spouseIds = new Set();
    if (father.pid) {
        const primarySpouse = allMembers.find(m => String(m.id) === String(father.pid));
        if (primarySpouse) spouseIds.add(primarySpouse.id);
    }
    allMembers.forEach(m => {
        if (String(m.pid) === String(father.id)) {
            spouseIds.add(m.id);
        }
    });
    const spouses = Array.from(spouseIds)
        .map(id => allMembers.find(m => String(m.id) === String(id)))
        .filter(Boolean)
        .sort((a, b) => (a.order || 99) - (b.order || 99));

    // --- NEW LOGIC: Group children by mother ---
    const families = spouses.map(wife => {
        const childrenOfWife = allMembers
            .filter(child => String(child.fid) === String(father.id) && String(child.mid) === String(wife.id))
            .sort((a, b) => (a.order || 99) - (b.order || 99))
            .map(child => ({
                ...child,
                hasChildren: allMembers.some(grandchild => String(grandchild.fid) === String(child.id) || String(grandchild.mid) === String(child.id))
            }));
        return { wife, children: childrenOfWife };
    });

    // Find children with unknown mother
    const unknownMotherChildren = allMembers
        .filter(child => String(child.fid) === String(father.id) && (!child.mid || child.mid === ''))
        .sort((a, b) => (a.order || 99) - (b.order || 99))
        .map(child => ({
            ...child,
            hasChildren: allMembers.some(grandchild => String(grandchild.fid) === String(child.id) || String(grandchild.mid) === String(child.id))
        }));

    // --- GENERATE HTML ---
    const renderChildrenList = (children) => {
        if (children.length === 0) {
            return '<p style="font-style: italic; color: #666; padding-left: 40px;">(Chưa có thông tin)</p>';
        }
        return children.map(child => {
            const note = child.gender === 'Nữ' && child.note ? `<span class="note">(gả tại ${child.note})</span>` : '';
            return `
                <div class="child-line">
                    <span class="order-no" style="font-weight:bold; min-width:25px;">${child.order}.</span>
                    <span class="name" style="font-weight:600; color: #3e2723;">${child.full_name}</span>
                    ${getLifeDates(child)}
                    <span style="font-size: 0.85em; font-style: italic; margin-left: 5px; color: #5d4037;">${note}</span>
                </div>
            `;
        }).join('');
    };

    let pageContentHtml = '';
    if (families.length > 0) {
        pageContentHtml += families.map((fam, index) => {
            // FIX: Xử lý hiển thị Chánh thất/Kế thất để tránh trùng lặp và canh giữa đẹp mắt
            let motherInfoHtml = '';
            
            if (index > 0) {
                // Kế thất: Hiển thị tên và canh giữa (Chánh thất đã hiện ở Header nên bỏ qua ở đây)
                const title = 'Kế thất'; 
                motherInfoHtml = `
                    <p class="mother-info" style="text-align: center; margin-bottom: 10px; margin-top: 20px; border-top: 1px dashed #a1887f; padding-top: 10px; color: #5d4037;">
                        ${title}: <strong>${fam.wife.full_name}</strong> 
                        ${getLifeDates(fam.wife)}
                        ${fam.wife.note ? `(${fam.wife.note})` : ''}
                    </p>`;
            }

            return `
                <div class="family-group" style="margin-top: 15px;">
                    ${motherInfoHtml}
                    <h3 class="sinh-ha-title" style="font-size: 1.5rem;">Sinh hạ</h3>
                    <div class="children-grid">${renderChildrenList(fam.children)}</div>
                </div>
            `;
        }).join('');
    }

    if (unknownMotherChildren.length > 0) {
        pageContentHtml += `
            <div class="family-group" style="margin-top: 15px;">
                <p class="mother-info" style="text-align: center; margin-bottom: 10px; margin-top: 20px; border-top: 1px dashed #a1887f; padding-top: 10px; color: #5d4037;">
                    Con (không rõ mẹ)
                </p>
                <h3 class="sinh-ha-title" style="font-size: 1.5rem;">Sinh hạ</h3>
                <div class="children-grid">${renderChildrenList(unknownMotherChildren)}</div>
            </div>
        `;
    }

    if (pageContentHtml === '') {
        pageContentHtml = '<p style="text-align: center; font-style: italic; color: #666; padding-top: 40px;">Chưa có thông tin đời sau.</p>';
    }

    // Main spouse for header (Chánh thất)
    const mainSpouse = spouses.length > 0 ? spouses[0] : null;
    const mainSpouseHtml = mainSpouse 
        ? `<p class="mother-info">Chánh thất: <strong>${mainSpouse.full_name}</strong> ${getLifeDates(mainSpouse)} ${mainSpouse.note ? `(${mainSpouse.note})` : ''}</p>`
        : `<p class="mother-info" style="color: #5d4037;">Chánh thất: (Chưa có thông tin)</p>`;

    // --- BỔ SUNG: Hiển thị tên Phái (Nhất, Nhì, Ba, Bốn) ---
    const branchNameMap = {
        '1': 'Nhất',
        '2': 'Nhì',
        '3': 'Ba',
        '4': 'Bốn'
    };
    const branchName = branchNameMap[father.branch];
    const branchDisplay = branchName ? `<span class="branch-name">Phái ${branchName}</span>` : '';

    return `
        <div class="page-header">
            <h2 class="generation-title">Đời thứ <span class="generation-number">${father.generation}</span> ${branchDisplay}</h2>
            <div class="main-couple">
                <p class="father-name">${father.full_name} <span style="display:block; margin-top:0;">${getLifeDates(father)}</span></p>
                ${mainSpouseHtml}
            </div>
        </div>
        <div class="page-content-body">
            ${pageContentHtml}
        </div>
    `;
}

function navigateToChild(childId) {
    displayFamilyPage(childId);
}
window.navigateToChild = navigateToChild;

// Hàm tải file CSV mẫu
function downloadSampleCSV() {
    const headers = [
        'id', 'full_name', 'gender', 'fid', 'mid', 'pid',
        'birth_date', 'death_date', 'is_live', 'branch',
        'generation', 'order', 'phone', 'address', 'job', 'note', 'image'
    ];
    
    // Dữ liệu mẫu demo
    const demoData = [
        ['M001', 'Lê Công Tổ', 'Nam', '', '', '', '1900', '1980', '0', 'Gốc', '1', '1', '', 'Quê quán', 'Nông dân', 'Ghi chú tổ', ''],
        ['S001', 'Nguyễn Thị Bà', 'Nữ', '', '', 'M001', '1905', '1985', '0', 'Gốc', '1', '1', '', 'Quê quán', 'Nội trợ', '', ''],
        ['M002', 'Lê Công Con', 'Nam', 'M001', 'S001', '', '1930', '', '1', '1', '2', '1', '', 'Hà Nội', 'Giáo viên', '', ''],
        ['M003', 'Lê Thị Gái', 'Nữ', 'M001', 'S001', '', '1935', '', '1', '1', '2', '2', '', 'TP.HCM', 'Bác sĩ', '', '']
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

        <!-- Thống kê truy cập (Minimalist - Không nền) -->
        <div style="text-align: center; margin-top: 10px; padding: 10px; color: #6b7280; font-size: 13px; font-weight: 500;">
            <span style="opacity: 0.8;">
                <i class="fas fa-chart-line"></i> Lượt truy cập: 
            </span>
            <strong id="site-visit-count" style="color: #374151; font-size: 15px;">...</strong>
        </div>
    `;

    // --- FIX: Tải hoạt động gần đây ngay lập tức (không phụ thuộc vào dữ liệu thành viên) ---
    loadRecentActivities();
    loadVisitCount();

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
                html += `<li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500; font-size: 14px;">Đời thứ ${label}</span>
                            <span style="background: #fff3e0; color: #e67e22; padding: 2px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85em;">${count} người</span>
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
                
                html += `<li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500; font-size: 14px;">${displayName}</span>
                            <span style="background: #e0f2fe; color: #0284c7; padding: 2px 10px; border-radius: 20px; font-weight: bold; font-size: 0.85em;">${count} người</span>
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
            const str = String(dateStr).trim(); // FIX: Chuyển về chuỗi để tránh lỗi crash nếu dữ liệu là số
            
            // 1. Ưu tiên check format ISO: YYYY-MM-DD (để tránh nhầm năm thành ngày)
            const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (isoMatch) {
                return { day: parseInt(isoMatch[3]), month: parseInt(isoMatch[2]) };
            }

            // 2. Check format thường: DD/MM/YYYY
            const vnMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})/);
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
                let roleBadge = '<span style="background:#dbeafe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75em;">Viewer</span>';
                if (log.actor_role === 'owner' || log.actor_role === 'admin') {
                    roleBadge = '<span style="background:#ffedd5; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.75em;">Admin</span>';
                } else if (log.actor_role && log.actor_role.startsWith('branch_')) {
                    roleBadge = `<span style="background:#f3e8ff; color:#7e22ce; padding:2px 6px; border-radius:4px; font-size:0.75em;">Trưởng phái ${log.actor_role.split('_')[1]}</span>`;
                }

                html += `
                <li style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
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

async function loadVisitCount() {
    const el = document.getElementById('site-visit-count');
    if (!el) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/stats/visit', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) el.innerText = data.count.toLocaleString('vi-VN');
    } catch (e) {
        console.error(e);
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
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Đời thứ<label>
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
                    <img id="view-post-image" src="" alt="Ảnh bài viết" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
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
            document.getElementById('view-post-title').innerText = post.title;
            
            const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức', 'guide': 'Hướng dẫn' };
            document.getElementById('view-post-cat').innerText = catMap[post.category] || post.category;
            
            const date = new Date(post.created_at).toLocaleDateString('vi-VN');
            document.getElementById('view-post-date').innerHTML = `<i class="far fa-clock"></i> ${date}`;
            
            const imgContainer = document.getElementById('view-post-image-container');
            const img = document.getElementById('view-post-image');
            
            if (post.image) {
                img.src = post.image;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }
            
            document.getElementById('view-post-content').innerText = post.content;
            
            document.getElementById('view-post-modal').style.display = 'block';
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi tải bài viết');
    }
}

// --- BỔ SUNG: Các hàm hỗ trợ tải xuống (bị thiếu gây lỗi ReferenceError) ---

function downloadMemberPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép trang web này mở cửa sổ mới để in.');
        return;
    }

    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Danh sách Thành viên</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
            h1 { text-align: center; color: #333; }
            .gender-nam { color: #2980b9; }
            .gender-nu { color: #c0392b; }
        </style>
    </head>
    <body>
        <h1>Danh sách Thành viên Gia phả</h1>
        <p>Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</p>
        <p>Tổng số: ${currentDisplayedMembers.length} thành viên</p>
        <table>
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Họ và tên</th>
                    <th>Giới tính</th>
                    <th>Đời</th>
                    <th>Phái</th>
                    <th>Năm sinh</th>
                    <th>Năm mất</th>
                </tr>
            </thead>
            <tbody>
    `;

    currentDisplayedMembers.forEach((m, index) => {
        htmlContent += `
            <tr>
                <td>${index + 1}</td>
                <td style="font-weight:bold;">${m.full_name}</td>
                <td class="gender-${m.gender === 'Nam' ? 'nam' : 'nu'}">${m.gender}</td>
                <td>${m.generation}</td>
                <td>${m.branch}</td>
                <td>${m.birth_date || ''}</td>
                <td>${m.death_date || ''}</td>
            </tr>
        `;
    });

    htmlContent += `
            </tbody>
        </table>
        <script>
            window.onload = function() { window.print(); }
        </script>
    </body>
    </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function downloadTreePDF() {
    const svgElement = document.querySelector('#tree-canvas svg');
    if (!svgElement) {
        alert("Không tìm thấy cây gia phả để tải.");
        return;
    }

    // Clone SVG để xử lý
    const clonedSvg = svgElement.cloneNode(true);
    
    // 1. Reset transform trên group <g> của clone để lấy nội dung gốc không bị méo/lệch do zoom
    const clonedG = clonedSvg.querySelector('g');
    if (clonedG) {
        clonedG.setAttribute('transform', '');
    }

    // 2. Lấy BBox của nội dung thật (group <g>) để tính toán viewBox chuẩn
    const contentG = svgElement.querySelector('g');
    if (!contentG) return;
    
    const bbox = contentG.getBBox();
    const padding = 50;

    // 3. Cập nhật kích thước và viewBox cho SVG clone bao trọn nội dung
    clonedSvg.setAttribute("width", bbox.width + padding * 2);
    clonedSvg.setAttribute("height", bbox.height + padding * 2);
    clonedSvg.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
    clonedSvg.style.backgroundColor = "#ffffff"; // Thêm nền trắng

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `CayGiaPha_${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- BỔ SUNG: Hàm hiển thị thông báo Toast (Fix lỗi showToast is not defined) ---
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '<i class="fas fa-info-circle"></i>';
    if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
    if (type === 'error') icon = '<i class="fas fa-exclamation-triangle"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    container.appendChild(toast);

    // Trigger reflow để kích hoạt transition
    void toast.offsetWidth; 
    
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/* ==========================================================
   8. LOGIC TAB PHẢ HỆ (LINEAGE)
========================================================== */

function renderGenealogyTab() {
    const container = document.getElementById('genealogy-tab');
    if (!container) return;
    
    // Khởi tạo cấu trúc nếu chưa có hoặc đang hiển thị placeholder
    if (!container.querySelector('.lineage-container')) {
        container.innerHTML = `
            <div class="lineage-container" style="display:flex; gap:20px; height: calc(100vh - 180px); flex-direction: column;">
                <div class="lineage-sidebar" style="width:100%; flex-shrink:0; border-bottom:1px solid #eee; padding-bottom: 10px;">
                    <div id="lineageGenerations" style="display:flex; gap:10px; overflow-x:auto; padding: 5px 0; align-items: center;"></div>
                </div>
                <div class="lineage-content" style="flex:1; overflow-y:auto; padding: 0 10px;">
                    <h2 id="lineageTitle" style="margin-top:0; color:#d32f2f; border-bottom:2px solid #eee; padding-bottom:10px; position:sticky; top:0; background:#fff; z-index:1;"></h2>
                    <div id="lineageList"></div>
                </div>
            </div>
        `;
        initLineage();
    }
}

function initLineage() {
    if (!allMembers || allMembers.length === 0) return;
    renderLineageSidebar();
    // Mặc định chọn đời 1 nếu chưa có nội dung
    const list = document.getElementById('lineageList');
    if (list && list.innerHTML === '') {
        renderLineageMembers(1);
    }
}

function renderLineageSidebar() {
    const container = document.getElementById('lineageGenerations');
    if (!container) return;
    container.innerHTML = '';

    const stats = {};
    let maxGen = 0;

    allMembers.forEach(m => {
        const gen = parseInt(m.generation) || 1;
        if (gen > maxGen) maxGen = gen;
        if (!stats[gen]) stats[gen] = { total: 0 };
        stats[gen].total++;
    });

    for (let i = 1; i <= maxGen; i++) {
        const s = stats[i] || { total: 0 };
        const btn = document.createElement('div');
        btn.className = 'gen-btn';
        btn.style.minWidth = 'fit-content';
        btn.style.marginBottom = '0';
        if (i === 1) btn.classList.add('active');
        btn.onclick = () => renderLineageMembers(i);
        btn.dataset.gen = i;
        btn.id = `gen-btn-${i}`; // Thêm ID để dễ tìm
        
        btn.innerHTML = `<span>Đời thứ ${i}</span><span class="gen-badge">${s.total}</span>`;
        container.appendChild(btn);
    }
}

function renderLineageMembers(generation) {
    document.querySelectorAll('#lineageGenerations .gen-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.gen) === generation);
    });

    const title = document.getElementById('lineageTitle');
    if (title) title.textContent = `Danh sách thành viên Đời thứ ${generation}`;

    const container = document.getElementById('lineageList');
    if (!container) return;
    container.innerHTML = '';

    const members = allMembers.filter(m => parseInt(m.generation) === generation);
    
    if (members.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Không có thành viên nào.</div>';
        return;
    }

    // Sắp xếp: Nam trước Nữ, sau đó theo Order
    members.sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === 'Nam' ? -1 : 1;
        return (parseInt(a.order) || 99) - (parseInt(b.order) || 99);
    });

    members.forEach(m => {
        // Tìm vợ/chồng
        const spouse = m.pid ? allMembers.find(s => String(s.id) === String(m.pid)) : null;
        
        // Tìm con cái
        const children = allMembers.filter(c => String(c.fid) === String(m.id) || String(c.mid) === String(m.id))
                                   .sort((a, b) => (parseInt(a.order) || 99) - (parseInt(b.order) || 99));

        // Tìm tên bố mẹ
        let fatherName = "";
        let motherName = "";
        let fatherId = "";
        let motherId = "";

        if (m.fid) {
            const f = allMembers.find(p => String(p.id) === String(m.fid));
            if (f) { fatherName = f.full_name; fatherId = f.id; }
        }
        if (m.mid) {
            const mo = allMembers.find(p => String(p.id) === String(m.mid));
            if (mo) { motherName = mo.full_name; motherId = mo.id; }
        }

        let parentHtml = "";
        if (generation === 1) {
            parentHtml = '<span style="font-weight:bold; color:#d97706;">👑 Thủy Tổ</span>';
        } else {
            if (fatherName) {
                parentHtml += `<div style="display:flex; align-items:center; gap:5px;"><i class="fas fa-male" style="color:#3b82f6; width:12px;"></i> Cha: <strong><a href="javascript:void(0)" onclick="jumpToLineageMember('${fatherId}')" class="jump-link">${fatherName}</a></strong></div>`;
            }
            if (motherName) {
                parentHtml += `<div style="display:flex; align-items:center; gap:5px;"><i class="fas fa-female" style="color:#ec4899; width:12px;"></i> Mẹ: <strong><a href="javascript:void(0)" onclick="jumpToLineageMember('${motherId}')" class="jump-link">${motherName}</a></strong></div>`;
            }
            if (!fatherName && !motherName) parentHtml = '<span style="color:#999; font-style:italic;">Chưa cập nhật cha mẹ</span>';
        }

        const avatar = m.image || (m.gender === 'Nam' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png');

        const card = document.createElement('div');
        card.className = 'member-card-red';
        card.id = `lineage-card-${m.id}`; // Gắn ID để scroll tới
        card.innerHTML = `
            <div class="card-header-red">
                <div class="parent-info" style="display:flex; flex-direction:column; gap:2px; text-transform:none; font-weight:normal;">${parentHtml}</div>
                <div class="main-info">
                    <img src="${avatar}" class="avatar-circle-small" onerror="this.src='https://via.placeholder.com/50'">
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
                ${spouse ? `<div class="sub-row"><span class="label-gold">Vợ/Chồng</span> <span class="sub-name"><a href="javascript:void(0)" onclick="jumpToLineageMember('${spouse.id}')" class="jump-link">${spouse.full_name}</a></span></div>` : ''}
                ${children.map((c, idx) => `<div class="sub-row"><span class="label-gold">Con ${idx+1}</span> <span class="sub-name"><a href="javascript:void(0)" onclick="jumpToLineageMember('${c.id}')" class="jump-link">${c.full_name}</a></span></div>`).join('')}
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
// Expose global
window.toggleLineageDetails = toggleLineageDetails;

/* ==========================================================
   9. LOGIC TAB PHÂN PHÁI (BRANCHES)
========================================================== */

function renderBranchesTab() {
    const container = document.getElementById('branches-tab');
    if (!container) return;

    if (!container.querySelector('.branch-container')) {
        container.innerHTML = `
            <div class="branch-container" style="display:flex; gap:20px; height: calc(100vh - 180px); flex-direction: column;">
                <div class="branch-sidebar" style="width:100%; flex-shrink:0; border-bottom:1px solid #eee; padding-bottom: 10px;">
                    <div id="branchListSidebar" style="display:flex; gap:10px; overflow-x:auto; padding: 5px 0; align-items: center;"></div>
                </div>
                <div class="branch-content" style="flex:1; overflow-y:auto; padding: 0 10px;">
                    <h2 id="branchTitle" style="margin-top:0; color:#1d4ed8; border-bottom:2px solid #eee; padding-bottom:10px; position:sticky; top:0; background:#fff; z-index:1;"></h2>
                    <div id="branchMemberList"></div>
                </div>
            </div>
        `;
        initBranches();
    }
}

function initBranches() {
    if (!allMembers || allMembers.length === 0) return;
    renderBranchSidebar();
}

function renderBranchSidebar() {
    const container = document.getElementById('branchListSidebar');
    if (!container) return;
    container.innerHTML = '';

    const stats = {};
    allMembers.forEach(m => {
        const branchName = m.branch ? m.branch.trim() : "Chưa phân phái";
        if (!stats[branchName]) stats[branchName] = { total: 0, name: branchName };
        stats[branchName].total++;
    });

    const sortedBranches = Object.values(stats).sort((a, b) => {
        if (a.name === "Chưa phân phái") return 1;
        if (b.name === "Chưa phân phái") return -1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedBranches.forEach((br, index) => {
        const btn = document.createElement('div');
        btn.className = 'gen-btn';
        btn.style.minWidth = 'fit-content';
        btn.style.marginBottom = '0';
        if (index === 0) {
            btn.classList.add('active');
            renderBranchMembers(br.name);
        }
        
        btn.onclick = () => {
            document.querySelectorAll('#branchListSidebar .gen-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBranchMembers(br.name);
        };
        
        btn.dataset.branchName = br.name; // Gắn data để tìm kiếm
        // Map tên phái hiển thị đẹp hơn
        const branchMap = { '0': 'Tổ khảo', '1': 'Phái Nhất', '2': 'Phái Nhì', '3': 'Phái Ba', '4': 'Phái Bốn' };
        const displayName = branchMap[br.name] || (br.name === 'Gốc' ? 'Gốc' : br.name);

        btn.innerHTML = `<span>${displayName}</span><span class="gen-badge">${br.total}</span>`;
        container.appendChild(btn);
    });
}

function renderBranchMembers(branchName) {
    const title = document.getElementById('branchTitle');
    const branchMap = { '0': 'Tổ khảo', '1': 'Phái Nhất', '2': 'Phái Nhì', '3': 'Phái Ba', '4': 'Phái Bốn' };
    const displayName = branchMap[branchName] || (branchName === 'Gốc' ? 'Gốc' : branchName);
    
    if (title) title.textContent = `Danh sách thành viên thuộc: ${displayName}`;

    const container = document.getElementById('branchMemberList');
    if (!container) return;
    container.innerHTML = '';

    let members = allMembers.filter(m => {
        const mBranch = m.branch ? m.branch.trim() : "Chưa phân phái";
        return mBranch === branchName;
    });

    // Sắp xếp: Đời -> Order
    members.sort((a, b) => {
        const genA = parseInt(a.generation) || 0;
        const genB = parseInt(b.generation) || 0;
        if (genA !== genB) return genA - genB;
        return (parseInt(a.order) || 99) - (parseInt(b.order) || 99);
    });

    if (members.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Không có thành viên nào.</div>';
        return;
    }

    members.forEach(m => {
        try {
            // Tìm vợ/chồng
            const spouse = m.pid ? allMembers.find(s => String(s.id) === String(m.pid)) : null;
            
            // Tìm con cái
            const children = allMembers.filter(c => String(c.fid) === String(m.id) || String(c.mid) === String(m.id))
                                    .sort((a, b) => (parseInt(a.order) || 99) - (parseInt(b.order) || 99));

            // Tìm tên bố mẹ
            let fatherName = "";
            let motherName = "";
            if (m.fid) {
                const f = allMembers.find(p => String(p.id) === String(m.fid));
                if (f) fatherName = `<a href="javascript:void(0)" onclick="jumpToBranchMember('${f.id}')" class="jump-link">${f.full_name}</a>`;
            }
            if (m.mid) {
                const mo = allMembers.find(p => String(p.id) === String(m.mid));
                if (mo) motherName = `<a href="javascript:void(0)" onclick="jumpToBranchMember('${mo.id}')" class="jump-link">${mo.full_name}</a>`;
            }

            let parentText = "";
            if ((parseInt(m.generation) || 1) === 1) parentText = "Thủy Tổ";
            else {
                const parts = [];
                if (fatherName) parts.push(`Cha: ${fatherName}`);
                if (motherName) parts.push(`Mẹ: ${motherName}`);
                parentText = parts.length > 0 ? parts.join(" | ") : "";
            }

            const avatar = m.image || (m.gender === 'Nam' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png');

            // Xây dựng HTML chi tiết
            let detailsHtml = '';
            if (spouse) {
                detailsHtml += `<div class="sub-row" style="background-color: #f9fafb; font-weight:bold;">
                    <span class="label-gold">Vợ/Chồng</span> 
                    <span class="sub-name"><a href="javascript:void(0)" onclick="jumpToBranchMember('${spouse.id}')" class="jump-link">${spouse.full_name}</a></span>
                </div>`;
            }
            children.forEach((child, cIdx) => {
                detailsHtml += `<div class="sub-row" style="padding-left: 20px; border-bottom: 1px dashed #eee;">
                    <span class="label-gold" style="font-weight:normal; font-size:12px; width:auto; margin-right:8px;">Con ${cIdx + 1}</span> 
                    <span class="sub-name"><a href="javascript:void(0)" onclick="jumpToBranchMember('${child.id}')" class="jump-link">${child.full_name}</a></span>
                </div>`;
            });
            if (detailsHtml === '') {
                detailsHtml = '<div style="color:#999; font-size:13px; font-style:italic;">Chưa có thông tin vợ/chồng hoặc con cái.</div>';
            }

            const card = document.createElement('div');
            card.className = 'member-card-blue';
            card.id = `branch-card-${m.id}`; // Gắn ID để scroll tới
            card.innerHTML = `
                <div class="card-header-blue">
                    <div class="parent-info">${parentText ? parentText + ' | ' : ''}Đời ${m.generation}</div>
                    <div class="main-info">
                        <img src="${avatar}" class="avatar-circle-small" onerror="this.src='https://via.placeholder.com/50'">
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

// --- CÁC HÀM HỖ TRỢ ĐIỀU HƯỚNG VÀ HIGHLIGHT ---

function scrollToAndHighlight(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-card');
        setTimeout(() => el.classList.remove('highlight-card'), 2000);
    } else {
        console.warn('Không tìm thấy thẻ thành viên:', elementId);
    }
}

window.jumpToLineageMember = function(memberId) {
    const member = allMembers.find(m => String(m.id) === String(memberId));
    if (!member) return;
    
    const gen = parseInt(member.generation) || 1;
    
    // Chuyển sang đời của thành viên đó
    renderLineageMembers(gen);
    
    // Cuộn sidebar đến nút đời tương ứng (trên mobile)
    const btn = document.getElementById(`gen-btn-${gen}`);
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    
    // Đợi render xong rồi cuộn tới thẻ
    setTimeout(() => {
        scrollToAndHighlight(`lineage-card-${memberId}`);
    }, 150);
};

window.jumpToBranchMember = function(memberId) {
    const member = allMembers.find(m => String(m.id) === String(memberId));
    if (!member) return;
    
    const branchName = member.branch ? member.branch.trim() : "Chưa phân phái";
    
    // Cập nhật trạng thái active trên sidebar
    const sidebar = document.getElementById('branchListSidebar');
    if (sidebar) {
        const btns = sidebar.querySelectorAll('.gen-btn');
        btns.forEach(btn => {
            if (btn.dataset.branchName === branchName) {
                btn.classList.add('active');
                // Cuộn sidebar đến nút phái tương ứng (trên mobile)
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    renderBranchMembers(branchName);
    
    setTimeout(() => {
        scrollToAndHighlight(`branch-card-${memberId}`);
    }, 150);
};