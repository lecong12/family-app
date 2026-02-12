(function () {
  'use strict';

  class FamilyTreeRenderer {
    constructor(containerId = 'tree-canvas') {
      this.containerId = containerId;
      this.nodeW = 120;
      this.nodeH = 60;
      this.gap = 20;       // Khoảng cách giữa vợ/chồng trong 1 cụm
      this.levelGap = 150; // Khoảng cách giữa các thế hệ
      this.svg = null;
      this.g = null;
      this.zoom = null;
      this.globalRootD3 = null;
    }

    // --- Khởi tạo D3 ---
    initD3() {
      const container = d3.select(`#${this.containerId}`);
      if (container.empty()) return false;
      container.selectAll("*").remove();

      this.zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => this.g.attr("transform", e.transform));
      this.svg = container.append("svg").attr("width", "100%").attr("height", "100%").call(this.zoom);
      this.g = this.svg.append("g");
      return true;
    }

    async renderFullTree() {
      if (!this.initD3()) return;
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(window.location.origin + '/api/family-tree', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (!json.success) return;

        this.drawTree(json.data.members);
      } catch (e) { console.error("Lỗi tải cây:", e); }
    }

    drawTree(data) {
      if (!data || data.length === 0) return;
      this.g.selectAll("*").remove();

      // 1. CHUẨN HÓA & GOM NHÓM (Gộp Chồng + Các Vợ vào 1 Node)
      const memberMap = new Map(data.map(d => [String(d.id), d]));
      const processed = new Set();
      const displayNodes = [];
      const memberToNode = new Map();

      data.forEach(m => {
        const id = String(m.id);
        if (processed.has(id)) return;

        // Logic tìm "Chủ hộ" (Head) - Ưu tiên Nam
        let head = m;
        if (m.gender === 'Nữ' || m.gender === 'female') {
            const husbandId = (m.pids || []).find(pid => memberMap.get(String(pid))?.gender === 'Nam');
            if (husbandId) head = memberMap.get(String(husbandId));
        }

        if (processed.has(String(head.id))) return;

        // Tập hợp Gia đình: [Chồng, Vợ 1, Vợ 2...]
        const spouses = (head.pids || []).map(pid => memberMap.get(String(pid))).filter(Boolean)
                         .sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const familyMembers = [head, ...spouses];
        familyMembers.forEach(fm => processed.add(String(fm.id)));

        const node = {
          id: `fam-${head.id}`,
          members: familyMembers,
          children: [],
          representative: head // Dùng để xác định cha mẹ
        };

        familyMembers.forEach(fm => memberToNode.set(String(fm.id), node));
        displayNodes.push(node);
      });

      // 2. XÂY DỰNG HIERARCHY (Nối con vào Gia đình của Cha Mẹ)
      const roots = [];
      displayNodes.forEach(node => {
        const rep = node.members.find(m => m.fid || m.mid) || node.representative;
        const parentId = String(rep.fid || rep.mid);
        const parentNode = memberToNode.get(parentId);

        if (parentNode && parentNode !== node) {
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      });

      // 3. LAYOUT
      const superRoot = { id: 'super-root', children: roots };
      const rootD3 = d3.hierarchy(superRoot, d => d.children);
      
      const treeLayout = d3.tree().nodeSize([280, this.levelGap]);
      treeLayout(rootD3);

      // Căn chỉnh Y theo Generation (nếu có)
      rootD3.each(d => {
        if (d.data.representative?.generation) {
          d.y = (d.data.representative.generation - 1) * this.levelGap;
        }
      });

      // 4. VẼ ĐƯỜNG NỐI (Orthogonal - Vuông góc)
      const linksG = this.g.append("g").attr("fill", "none").attr("stroke", "#94a3b8");
      
      rootD3.links().forEach(link => {
        if (link.source.data.id === 'super-root') return;

        const parentFam = link.source.data;
        const childMain = link.target.data.members[0];

        // Tìm vị trí X chính xác của mẹ nếu con có Mid
        let sourceX = link.source.x;
        if (childMain.mid) {
          const mIdx = parentFam.members.findIndex(m => String(m.id) === String(childMain.mid));
          if (mIdx !== -1) {
             const totalW = parentFam.members.length * this.nodeW + (parentFam.members.length - 1) * this.gap;
             sourceX = link.source.x - (totalW/2) + mIdx * (this.nodeW + this.gap) + (this.nodeW/2);
          }
        }

        const targetX = link.target.x;
        const midY = link.source.y + (link.target.y - link.source.y) / 2;

        linksG.append("path")
          .attr("d", `M${sourceX},${link.source.y + this.nodeH} V${midY} H${targetX} V${link.target.y}`)
          .attr("stroke-width", 1.5);
      });

      // 5. VẼ BOX THÀNH VIÊN
      const nodeG = this.g.append("g").selectAll("g")
        .data(rootD3.descendants().filter(d => d.data.id !== 'super-root'))
        .enter().append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`);

      nodeG.each(function(d) {
        const group = d3.select(this);
        const members = d.data.members;
        const totalW = members.length * 120 + (members.length - 1) * 20;
        let startX = -(totalW / 2);

        members.forEach((m, i) => {
          const x = startX + i * (120 + 20);
          const isNam = m.gender === 'Nam';
          
          const box = group.append("g").attr("transform", `translate(${x},0)`);
          
          box.append("rect")
            .attr("width", 120).attr("height", 60).attr("rx", 8)
            .attr("fill", isNam ? "#eff6ff" : "#fff1f2")
            .attr("stroke", isNam ? "#3b82f6" : "#ec4899").attr("stroke-width", 2);

          box.append("text")
            .attr("x", 60).attr("y", 35).attr("text-anchor", "middle")
            .style("font-size", "12px").style("font-weight", "bold").text(m.full_name);

          // Đường nối hôn nhân (nếu có người tiếp theo)
          if (i < members.length - 1) {
            group.append("line")
              .attr("x1", x + 120).attr("y1", 30).attr("x2", x + 120 + 20).attr("y2", 30)
              .attr("stroke", "#f472b6").attr("stroke-width", 2);
          }
        });
      });

      this.autoCenter();
    }

    autoCenter() {
      const bbox = this.g.node().getBBox();
      const scale = Math.min(0.8, (window.innerWidth - 100) / bbox.width);
      this.svg.transition().duration(800).call(
        this.zoom.transform,
        d3.zoomIdentity.translate(window.innerWidth / 2 - (bbox.x + bbox.width / 2) * scale, 50).scale(scale)
      );
    }
  }

  window.FamilyTreeRenderer = FamilyTreeRenderer;
})();
