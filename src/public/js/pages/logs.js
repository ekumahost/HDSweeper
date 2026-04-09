// Logs page - global transaction log viewer
var LogsPage = {
    render: async function () {
        var stats = {};
        try { stats = await API.get("/api/logs/stats"); } catch (e) {}
        var byStatus = {};
        (stats.byStatus || []).forEach(function (s) { byStatus[s._id] = s.count; });

        return '<div class="card"><div class="stats-row">' +
            '<div class="stat-box"><div class="value" style="color:var(--green)">' + formatNumber(byStatus.success || 0) + '</div><div class="label">Success</div></div>' +
            '<div class="stat-box"><div class="value" style="color:var(--red)">' + formatNumber(byStatus.failed || 0) + '</div><div class="label">Failed</div></div>' +
            '<div class="stat-box"><div class="value" style="color:var(--orange)">' + formatNumber(byStatus.skipped || 0) + '</div><div class="label">Skipped</div></div>' +
            '<div class="stat-box"><div class="value">' + (stats.totalValueSwept ? Number(stats.totalValueSwept).toFixed(4) : "0") + '</div><div class="label">Total Value</div></div>' +
        "</div></div>" +
        '<div class="card"><h2>Filters</h2>' +
            '<div class="form-row">' +
                '<div class="form-group"><label>Status</label><select id="logFilterStatus"><option value="">All</option><option value="success">Success</option><option value="failed">Failed</option><option value="skipped">Skipped</option></select></div>' +
                '<div class="form-group"><label>Type</label><select id="logFilterType"><option value="">All</option><option value="gas_fund">Gas Fund</option><option value="erc20_sweep">ERC20 Sweep</option><option value="native_sweep">Native Sweep</option><option value="funder_sweep">Funder Sweep</option></select></div>' +
            "</div>" +
            '<div class="form-row">' +
                '<div class="form-group"><label>Chain ID</label><input id="logFilterChain" type="number" placeholder="e.g. 56" /></div>' +
                '<div class="form-group"><label>Wallet Address</label><input id="logFilterWallet" placeholder="0x..." /></div>' +
            "</div>" +
            '<div class="btn-group">' +
                '<button class="btn btn-primary" onclick="LogsPage.search()">Search</button>' +
                '<button class="btn" onclick="LogsPage.exportLogs()">Export JSON</button>' +
            "</div>" +
        "</div>" +
        '<div id="logsTable"></div>';
    },

    afterRender: async function () {
        await LogsPage.search();
    },

    search: async function (page) {
        page = page || 1;
        var params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "100");
        var s = document.getElementById("logFilterStatus");
        var t = document.getElementById("logFilterType");
        var c = document.getElementById("logFilterChain");
        var wa = document.getElementById("logFilterWallet");
        if (s && s.value) params.set("status", s.value);
        if (t && t.value) params.set("type", t.value);
        if (c && c.value) params.set("chainId", c.value);
        if (wa && wa.value) params.set("walletAddress", wa.value);
        try {
            var data = await API.get("/api/logs?" + params.toString());
            var logs = data.logs || [];
            var rows = "";
            logs.forEach(function (l) {
                rows += "<tr>" +
                    '<td style="white-space:nowrap">' + new Date(l.createdAt).toLocaleString() + "</td>" +
                    "<td>" + l.type + "</td>" +
                    "<td>" + l.chainId + "</td>" +
                    '<td title="' + l.walletAddress + '">' + truncAddr(l.walletAddress) + "</td>" +
                    "<td>" + (l.tokenSymbol || "Native") + "</td>" +
                    "<td>" + (l.amountFormatted || "\u2014") + "</td>" +
                    "<td>" + statusBadge(l.status) + "</td>" +
                    '<td title="' + (l.txHash || "") + '">' + (l.txHash ? truncAddr(l.txHash) : "\u2014") + "</td>" +
                    '<td style="color:var(--red);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">' + (l.error || "") + "</td>" +
                "</tr>";
            });
            var el = document.getElementById("logsTable");
            if (el) {
                el.innerHTML = '<div class="card"><h2>Transaction Logs (' + formatNumber(data.total) + " total)</h2>" +
                    '<div class="table-wrap"><table>' +
                        "<thead><tr><th>Time</th><th>Type</th><th>Chain</th><th>Wallet</th><th>Token</th><th>Amount</th><th>Status</th><th>Tx</th><th>Error</th></tr></thead>" +
                        "<tbody>" + (rows || '<tr><td colspan="9">' + emptyState("No logs found") + "</td></tr>") + "</tbody>" +
                    "</table></div>" +
                    pagination(data.page, data.pages, "LogsPage.search") +
                "</div>";
            }
        } catch (e) { toast("Failed to load logs", "error"); }
    },

    exportLogs: function () {
        var s = document.getElementById("logFilterStatus");
        var params = new URLSearchParams();
        if (s && s.value) params.set("status", s.value);
        window.open("/api/logs/export?" + params.toString(), "_blank");
    },
};
