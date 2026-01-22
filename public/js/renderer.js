﻿const zoom = d3.zoom().on("zoom", (e) => g.attr("transform", e.transform));
const svg = d3.select("#tree-canvas").append("svg")
    .attr("width", "100%").attr("height", "100%") // Sửa thành 100% để khớp với khung chứa
    .call(zoom);
const g = svg.append("g");

// Biến toàn cục để lưu trữ cây D3
let globalRootD3 = null;

function drawTree(data) {
    g.selectAll("*").remove();
    if (!data || data.length === 0) return;

    // 1. Tiền xử lý: Gom nhóm Vợ/Chồng và tạo Node hiển thị
    const memberMap = new Map(data.map(d => [String(d.id), d])); // Chuyển ID sang String để đảm bảo khớp
    const spouseMap = new Map(); // Map lưu quan hệ: id -> Set([spouse_ids])

    // Xây dựng bản đồ quan hệ vợ chồng 2 chiều (xử lý trường hợp thiếu pid 1 chiều)
    data.forEach(d => {
        const myId = String(d.id);
        const pid = d.pid ? String(d.pid) : null;
        
        if (!spouseMap.has(myId)) spouseMap.set(myId, new Set());
        
        if (pid && memberMap.has(pid)) {
            spouseMap.get(myId).add(pid);
            // Tự động thêm quan hệ ngược lại cho người kia
            if (!spouseMap.has(pid)) spouseMap.set(pid, new Set());
            spouseMap.get(pid).add(myId);
        }
    });

    const memberToNode = new Map(); 
    const processed = new Set();
    const displayNodes = [];

    data.forEach(d => {
        const myId = String(d.id);
        if (processed.has(myId)) return;

        // Xác định chủ hộ (Head) để gom nhóm
        // Ưu tiên Nam làm chủ hộ. Nếu là Nữ, thử tìm chồng của cô ấy.
        let head = d;
        const spouses = Array.from(spouseMap.get(myId) || []);
        
        if (d.gender === 'Nữ') {
            const husbandId = spouses.find(sid => {
                const s = memberMap.get(sid);
                return s && s.gender === 'Nam';
            });
            if (husbandId) {
                head = memberMap.get(husbandId);
            }
        }

        // Nếu chủ hộ đã được xử lý (do đã duyệt qua thành viên khác trong gia đình này), bỏ qua
        if (processed.has(String(head.id))) return;

        // Tập hợp thành viên gia đình: [Chủ hộ, Vợ 1, Vợ 2...]
        const headId = String(head.id);
        const headSpousesIds = Array.from(spouseMap.get(headId) || []);
        
        // Lấy object member của các bà vợ và sắp xếp theo 'order' để xác định vợ trước, vợ sau
        const sortedSpouses = headSpousesIds
            .map(sid => memberMap.get(sid))
            .filter(s => s && String(s.id) !== headId) // Lọc ra chính head và các member không tồn tại
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        let familyMembers;
        // Chỉ áp dụng logic sắp xếp Chồng-vào-giữa khi có từ 2 vợ trở lên
        if (sortedSpouses.length >= 2) {
            familyMembers = [sortedSpouses[0], head, ...sortedSpouses.slice(1)];
        } else {
            // Giữ nguyên logic cũ cho trường hợp 0 hoặc 1 vợ: [Chồng, Vợ]
            familyMembers = [head, ...sortedSpouses];
        }

        // Đánh dấu tất cả thành viên trong gia đình là đã xử lý
        familyMembers.forEach(m => processed.add(String(m.id)));

        const node = {
            id: `node-${head.id}`,
            type: familyMembers.length > 1 ? 'couple' : 'single',
            members: familyMembers,
            children: [],
            data: head // Dùng chủ hộ làm đại diện nối với cha
        };

        familyMembers.forEach(m => memberToNode.set(String(m.id), node));
        displayNodes.push(node);
    });

    // 2. Xây dựng cây phân cấp (Hierarchy)
    const roots = [];
    displayNodes.forEach(node => {
        // Lấy người đại diện để liên kết với cha mẹ.
        // Ưu tiên tìm người có thông tin cha/mẹ (con ruột) để tránh trường hợp "rể" làm đại diện và gây mồ côi.
        const representative = node.members.find(m => m.fid || m.mid) || node.members[0];
        
        // Tìm node cha mẹ dựa trên fid hoặc mid (chuyển sang String để khớp)
        // Dùng fid/mid của người đại diện (con ruột) để tìm node cha mẹ.
        let parentNode = null;
        if (representative.fid && memberToNode.has(String(representative.fid))) {
            parentNode = memberToNode.get(String(representative.fid));
        } else if (representative.mid && memberToNode.has(String(representative.mid))) {
            parentNode = memberToNode.get(String(representative.mid));
        }

        if (parentNode) {
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sắp xếp các node con theo thứ tự (order) để đảm bảo đúng thứ tự phái/chi
    const sortNodes = (nodes) => {
        nodes.sort((a, b) => {
            // Sửa logic: Sắp xếp anh em theo `order` của người con ruột, thay vì của chủ hộ (head).
            // Điều này tránh lỗi sắp xếp sai khi một người con gái (có order) kết hôn với rể (không có order).
            const childA = a.members.find(m => m.fid || m.mid) || a.members[0];
            const childB = b.members.find(m => m.fid || m.mid) || b.members[0];
            return (childA.order || 0) - (childB.order || 0);
        });

        nodes.forEach(node => {
            if (node.children && node.children.length > 0) sortNodes(node.children);
        });
    };
    sortNodes(roots);

    // Tạo một node gốc ảo để chứa tất cả các nhánh (trường hợp có nhiều cụ tổ)
    const superRoot = { id: 'super-root', children: roots, type: 'root', members: [] };

    // 3. Sử dụng thuật toán D3 Tree Layout
    const rootD3 = d3.hierarchy(superRoot, d => d.children);
    globalRootD3 = rootD3; // Lưu lại để hàm zoom có thể truy cập
    
    // Cấu hình kích thước
    const boxWidth = 120;
    const boxHeight = 60;
    const gap = 20; // Khoảng cách giữa vợ và chồng
    const levelSeparation = 150; // Khoảng cách giữa các đời

    const treeLayout = d3.tree()
        .nodeSize([260, levelSeparation]) // Kích thước vùng không gian cho mỗi node
        .separation((a, b) => {
            // Tăng khoảng cách nếu node là cặp vợ chồng
            const aIsCouple = a.data.type === 'couple';
            const bIsCouple = b.data.type === 'couple';
            let sep = 1;
            if (aIsCouple) sep += 0.5;
            if (bIsCouple) sep += 0.5;
            return (a.parent === b.parent ? sep : sep + 0.5);
        });

    treeLayout(rootD3);

    // Căn chỉnh lại vị trí Y theo đúng Đời (Generation) trong dữ liệu
    // Giúp các thành viên cùng đời luôn nằm trên một hàng thẳng tắp
    rootD3.each(d => {
        if (d.data.id === 'super-root') return;
        if (d.data.data && d.data.data.generation) {
            d.y = (d.data.data.generation - 1) * levelSeparation;
        }
    });

    // 4. Vẽ hiển thị
    // Tính toán offset để căn giữa cây vào màn hình
    let minX = Infinity;
    rootD3.each(d => { 
        // Bỏ qua super-root để tính toán khung hình chính xác hơn
        if (d.data.id !== 'super-root' && d.x < minX) minX = d.x; 
    });
    if (minX === Infinity) minX = 0;

    const startY = 20; // Giảm khoảng trắng ở trên
    const offsetX = -minX + 100;

    // Vẽ đường nối (Vuông góc - Orthogonal)
    g.selectAll(".link")
        .data(rootD3.links().filter(l => l.source.data.id !== 'super-root'))
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d => {
            const parentMembers = d.source.data.members;
            const childMembers = d.target.data.members;
            const targetX = d.target.x + offsetX;
            const targetY = d.target.y + startY;

            // Trường hợp 1 Vợ 1 Chồng: Nối từ điểm giữa (nơi có đường hôn nhân và đường sổ dọc)
            if (parentMembers.length === 2) {
                const sourceX = d.source.x + offsetX;
                const sourceY = d.source.y + startY + boxHeight; // Bắt đầu từ đáy node nơi có đường sổ dọc
                const midY = sourceY + (targetY - sourceY) / 2;
                return `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`;
            }

            // Trường hợp Đa thê hoặc Đơn thân: Tìm đúng cha/mẹ để nối
            const bioChild = childMembers.find(c => 
                parentMembers.some(p => String(p.id) === String(c.fid) || String(p.id) === String(c.mid))
            ) || childMembers[0];

            let sourceX, sourceY;
            const totalW = parentMembers.length * boxWidth + (parentMembers.length - 1) * gap;
            const startXLocal = -(totalW / 2);

            const motherIndex = bioChild.mid ? parentMembers.findIndex(p => String(p.id) === String(bioChild.mid)) : -1;
            const husbandIndex = parentMembers.findIndex(p => p.gender === 'Nam');

            if (motherIndex !== -1 && husbandIndex !== -1 && motherIndex !== husbandIndex) {
                const motherCenterX = startXLocal + motherIndex * (boxWidth + gap) + (boxWidth / 2);
                const husbandCenterX = startXLocal + husbandIndex * (boxWidth + gap) + (boxWidth / 2);
                const parentCenterOffset = (motherCenterX + husbandCenterX) / 2;
                sourceX = d.source.x + offsetX + parentCenterOffset;
                sourceY = d.source.y + startY + boxHeight;
            } else {
                let parentIndex = -1;
                if (motherIndex !== -1) { parentIndex = motherIndex; }
                else if (bioChild.fid) { const idx = parentMembers.findIndex(p => String(p.id) === String(bioChild.fid)); if (idx !== -1) parentIndex = idx; }
                if (parentIndex === -1) parentIndex = 0;
                
                const parentCenterOffset = startXLocal + parentIndex * (boxWidth + gap) + (boxWidth / 2);
                sourceX = d.source.x + offsetX + parentCenterOffset;
                sourceY = d.source.y + startY + boxHeight;
            }
            
            const midY = sourceY + (targetY - sourceY) / 2;
            return `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`;
        });

    // Vẽ các Node (Nhóm thẻ chứa người)
    const nodeGroup = g.selectAll(".node")
        .data(rootD3.descendants().filter(d => d.data.id !== 'super-root'))
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x + offsetX},${d.y + startY})`);

    nodeGroup.each(function(d) {
        const group = d3.select(this);
        const members = d.data.members;
        
        const totalW = members.length * boxWidth + (members.length - 1) * gap;
        let currentX = -(totalW / 2);

        members.forEach((m, index) => {
            drawMemberBox(group, m, currentX, 0, boxWidth, boxHeight);
            
            if (index < members.length - 1) {
                group.append("line")
                    .attr("x1", currentX + boxWidth).attr("y1", boxHeight/2)
                    .attr("x2", currentX + boxWidth + gap).attr("y2", boxHeight/2)
                    .attr("stroke", "#e74c3c").attr("stroke-width", 2);
            }
            currentX += boxWidth + gap;
        });
    });

    // 5. Tự động zoom vào Thủy tổ khi tải xong
    zoomToNode(null);
}

// Hàm vẽ hộp thông tin thành viên
function drawMemberBox(group, member, x, y, w, h) {
    const g = group.append("g").attr("transform", `translate(${x},${y})`)
        .style("cursor", "pointer")
        .on("click", (event) => {
            event.stopPropagation();
            if (window.openEditModal) {
                window.openEditModal(member.id);
            }
        });

    const isSpouse = !!member.pid && !member.fid && !member.mid;
    let strokeColor, fillColor;

    if (isSpouse) {
        fillColor = member.gender === 'Nữ' ? "#e1bee7" : "#d7ccc8";
        strokeColor = member.gender === 'Nữ' ? "#9c27b0" : "#5d4037";
    } else {
        fillColor = member.gender === "Nam" ? "#bbdefb" : "#ffcdd2";
        strokeColor = member.gender === "Nam" ? "#2196f3" : "#e91e63";
    }

    g.append("rect")
        .attr("id", `rect-${member.id}`)
        .attr("class", "member-rect")
        .attr("data-original-stroke", strokeColor)
        .attr("width", w).attr("height", h).attr("rx", 4)
        .attr("fill", fillColor)
        .attr("stroke", strokeColor)
        .attr("stroke-width", 1.5);

    g.append("text").text(member.full_name || "Chưa có tên").attr("x", w/2).attr("y", h/2 - 5).attr("text-anchor", "middle").style("font-size", "12px").style("font-weight", "bold").style("fill", "#333");
    g.append("text").text(member.birth_date ? `NS: ${member.birth_date}` : `ID: ${member.id}`).attr("x", w/2).attr("y", h/2 + 15).attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#666");
}

// Hàm tìm kiếm và zoom tới node
function zoomToNode(memberId, customScale = 0.7) {
    if (!globalRootD3) return;

    d3.selectAll(".member-rect").attr("stroke", function() { return d3.select(this).attr("data-original-stroke"); }).attr("stroke-width", 1.5);

    let targetNode = null;
    if (memberId) {
        const targetRect = document.getElementById(`rect-${memberId}`);
        if (targetRect) {
            d3.select(targetRect).attr("stroke", "#ff9800").attr("stroke-width", 4);
        }
        targetNode = globalRootD3.descendants().find(d => d.data.members && d.data.members.some(m => String(m.id) === String(memberId)));
    } else {
        // Nếu không có memberId, zoom ra toàn bộ cây
        targetNode = globalRootD3;
    }

    if (targetNode) {
        const bounds = g.node().getBBox();
        const parent = g.node().parentElement;
        const fullWidth = parent.clientWidth;
        const fullHeight = parent.clientHeight;

        const width = bounds.width;
        const height = bounds.height;
        const midX = bounds.x + width / 2;
        const midY = bounds.y + height / 2;

        if (width === 0 || height === 0) return; // nothing to fit

        const scale = Math.min(fullWidth / width, fullHeight / height) * 0.9;
        const transform = d3.zoomIdentity
            .translate(fullWidth / 2 - midX * scale, fullHeight / 2 - midY * scale)
            .scale(scale);
        
        svg.transition().duration(750).call(zoom.transform, transform);
    }
}