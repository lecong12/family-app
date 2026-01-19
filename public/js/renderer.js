// Component hiển thị cây gia phả dùng D3
// Gán vào window để main.js có thể nhìn thấy (do dùng Babel standalone)
window.FamilyTree = ({ members }) => {
    const svgRef = React.useRef(null);

    React.useEffect(() => {
        if (!members || members.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Xóa nội dung cũ khi data thay đổi

        const g = svg.append("g");
        
        // Zoom
        svg.call(d3.zoom().on("zoom", (e) => g.attr("transform", e.transform)));

        // Deep copy để không làm biến đổi props
        const data = JSON.parse(JSON.stringify(members));

        data.forEach(d => {
            const gen = d.generation || 1;
            const ord = d.order || 1;
            d.y = gen * 180;
            d.x = (hashBranch(d.branch) * 400) + (ord * 60);
        });

        // Vẽ đường nối
        g.selectAll(".link").data(data.filter(d => d.fid)).enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 2)
            .attr("d", d => {
                const f = data.find(p => p.id === d.fid);
                if (!f) return "";
                return `M${f.x},${f.y} L${d.x},${d.y}`;
            });

        // Vẽ Node
        const nodes = g.selectAll(".node").data(data).enter().append("g")
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .style("cursor", "pointer");

        nodes.append("circle")
            .attr("r", 20)
            .attr("fill", d => d.gender === "Nam" ? "#3498db" : "#e74c3c")
            .attr("stroke", "white")
            .attr("stroke-width", 2);

        nodes.append("text")
            .text(d => d.full_name)
            .attr("y", 35)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#333");

    }, [members]); // Chạy lại khi danh sách thành viên thay đổi

    function hashBranch(s) { 
        const str = String(s || "Gốc"); 
        return Math.abs(str.split("").reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)) % 5; 
    }

    return (
        <svg ref={svgRef} width="100%" height="100vh" style={{background: "#fff"}}></svg>
    );
};
